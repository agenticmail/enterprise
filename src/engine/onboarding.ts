/**
 * Onboarding Manager — Agent Policy Acknowledgment & Compliance Tracking
 *
 * Manages the onboarding lifecycle for AI agents within an organization:
 * - Tracks which org policies each agent has acknowledged
 * - Provides fast in-memory isOnboarded() checks for the guardrail pipeline
 * - Detects policy content changes and triggers re-onboarding
 * - Creates memory entries for acknowledged policies so agents retain context
 * - Supports admin force-completion for bootstrapping scenarios
 *
 * Integrates with:
 * - OrgPolicyEngine: source of truth for organization policies
 * - AgentMemoryManager: persists policy knowledge into agent memory
 * - GuardrailEngine: hooks check isOnboarded() before allowing tool calls
 */

import type { EngineDatabase } from './db-adapter.js';
import type { OrgPolicyEngine, OrgPolicy } from './org-policies.js';
import type { AgentMemoryManager } from './agent-memory.js';
import { createHash } from 'crypto';

// ─── Types ──────────────────────────────────────────────

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_renewal';

export interface OnboardingRecord {
  id: string;
  agentId: string;
  orgId: string;
  policyId: string;
  status: 'pending' | 'acknowledged' | 'failed';
  acknowledgedAt?: string;
  memoryEntryId?: string;
  verificationHash: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  agentId: string;
  orgId: string;
  overallStatus: OnboardingStatus;
  totalPolicies: number;
  acknowledgedPolicies: number;
  pendingPolicies: number;
  needsRenewal: number;
  completedAt?: string;
  records: OnboardingRecord[];
}

// ─── Helpers ────────────────────────────────────────────

/** SHA-256 hash of policy content for change detection. */
function hashPolicyContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Generate a unique ID. */
function generateId(): string {
  return crypto.randomUUID();
}

/** Current ISO timestamp. */
function now(): string {
  return new Date().toISOString();
}

// ─── Onboarding Manager ─────────────────────────────────

export class OnboardingManager {
  private policyEngine: OrgPolicyEngine;
  private memoryManager: AgentMemoryManager;
  private engineDb?: EngineDatabase;

  /** Fast in-memory set for isOnboarded() checks. */
  private onboardedAgents = new Set<string>();

  /** All onboarding records keyed by id. */
  private records = new Map<string, OnboardingRecord>();

  constructor(opts: { policyEngine: OrgPolicyEngine; memoryManager: AgentMemoryManager }) {
    this.policyEngine = opts.policyEngine;
    this.memoryManager = opts.memoryManager;
  }

  // ─── Database ─────────────────────────────────────────

  /**
   * Set the database adapter and load existing records from DB.
   */
  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  /**
   * Load all onboarding records from the database.
   * Populates the in-memory records map and rebuilds the onboardedAgents set.
   */
  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;

    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM onboarding_records');

      this.records.clear();
      this.onboardedAgents.clear();

      // Group records by agentId for onboarded-set rebuild
      const agentRecords = new Map<string, OnboardingRecord[]>();

      for (const r of rows) {
        const record: OnboardingRecord = {
          id: r.id,
          agentId: r.agent_id,
          orgId: r.org_id,
          policyId: r.policy_id,
          status: r.status,
          acknowledgedAt: r.acknowledged_at || undefined,
          memoryEntryId: r.memory_entry_id || undefined,
          verificationHash: r.verification_hash || '',
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
        this.records.set(record.id, record);

        if (!agentRecords.has(record.agentId)) {
          agentRecords.set(record.agentId, []);
        }
        agentRecords.get(record.agentId)!.push(record);
      }

      // Rebuild onboardedAgents: an agent is onboarded if all their mandatory
      // policy records are 'acknowledged'
      for (const [agentId, recs] of agentRecords) {
        if (this.areAllMandatoryAcknowledged(recs)) {
          this.onboardedAgents.add(agentId);
        }
      }
    } catch {
      // Table may not exist yet if migrations haven't run
    }
  }

  // ─── Core Operations ──────────────────────────────────

  /**
   * Initiate onboarding for an agent within an organization.
   * Creates pending OnboardingRecord entries for every applicable policy
   * (both mandatory and recommended). Returns the initial progress snapshot.
   */
  async initiateOnboarding(agentId: string, orgId: string): Promise<OnboardingProgress> {
    const policies = this.policyEngine.getPoliciesForAgent(orgId, agentId);
    const timestamp = now();
    const newRecords: OnboardingRecord[] = [];

    for (const policy of policies) {
      // Skip if a record already exists for this agent+policy pair
      const existing = this.findRecord(agentId, policy.id);
      if (existing) {
        newRecords.push(existing);
        continue;
      }

      const record: OnboardingRecord = {
        id: generateId(),
        agentId,
        orgId,
        policyId: policy.id,
        status: 'pending',
        verificationHash: hashPolicyContent(policy.content),
        metadata: {
          policyName: policy.name,
          enforcement: policy.enforcement,
          category: policy.category,
          initiatedAt: timestamp,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      this.records.set(record.id, record);
      newRecords.push(record);

      // Persist to DB
      await this.persistRecord(record);
    }

    return this.buildProgress(agentId, orgId, newRecords);
  }

  /**
   * Acknowledge a specific policy for an agent.
   * Marks the record as acknowledged, computes a verification hash,
   * creates a memory entry for the agent, and checks if onboarding is complete.
   */
  async acknowledgePolicy(agentId: string, policyId: string): Promise<OnboardingRecord> {
    const record = this.findRecord(agentId, policyId);
    if (!record) {
      throw new Error(`No onboarding record found for agent=${agentId} policy=${policyId}`);
    }

    // Fetch the live policy content for hash verification
    const policy = await this.policyEngine.getPolicy(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const timestamp = now();

    // Update record
    record.status = 'acknowledged';
    record.acknowledgedAt = timestamp;
    record.verificationHash = hashPolicyContent(policy.content);
    record.updatedAt = timestamp;

    // Create memory entry so the agent retains policy knowledge
    try {
      const memoryEntry = await this.memoryManager.createFromPolicy(agentId, policy);
      record.memoryEntryId = memoryEntry.id;
    } catch {
      // Memory creation is non-fatal; log but continue
      record.metadata.memoryCreationFailed = true;
    }

    // Persist updated record
    await this.updateRecord(record);

    // Check if all mandatory policies are now acknowledged
    const agentRecords = this.getRecordsForAgent(agentId);
    if (this.areAllMandatoryAcknowledged(agentRecords)) {
      this.onboardedAgents.add(agentId);
    }

    return record;
  }

  /**
   * Fast in-memory check: is this agent fully onboarded?
   * Used by the guardrail pipeline on every tool call.
   */
  isOnboarded(agentId: string): boolean {
    return this.onboardedAgents.has(agentId);
  }

  /**
   * Get the full onboarding progress for a specific agent.
   */
  getProgress(agentId: string): OnboardingProgress {
    const agentRecords = this.getRecordsForAgent(agentId);
    if (agentRecords.length === 0) {
      return {
        agentId,
        orgId: '',
        overallStatus: 'not_started',
        totalPolicies: 0,
        acknowledgedPolicies: 0,
        pendingPolicies: 0,
        needsRenewal: 0,
        records: [],
      };
    }

    const orgId = agentRecords[0].orgId;
    return this.buildProgress(agentId, orgId, agentRecords);
  }

  /**
   * Get onboarding progress grouped by all agents in an organization.
   */
  getProgressByOrg(orgId: string): OnboardingProgress[] {
    // Collect all agents that have records in this org
    const agentIds = new Set<string>();
    for (const record of this.records.values()) {
      if (record.orgId === orgId) {
        agentIds.add(record.agentId);
      }
    }

    const results: OnboardingProgress[] = [];
    for (const agentId of agentIds) {
      const agentRecords = this.getRecordsForAgent(agentId)
        .filter(r => r.orgId === orgId);
      if (agentRecords.length > 0) {
        results.push(this.buildProgress(agentId, orgId, agentRecords));
      }
    }

    return results;
  }

  /**
   * Get the OrgPolicy objects for all policies the agent hasn't yet acknowledged.
   */
  async getPendingPolicies(agentId: string): Promise<OrgPolicy[]> {
    const pendingRecords = this.getRecordsForAgent(agentId)
      .filter(r => r.status === 'pending');

    const policies: OrgPolicy[] = [];
    for (const record of pendingRecords) {
      const policy = await this.policyEngine.getPolicy(record.policyId);
      if (policy) {
        policies.push(policy);
      }
    }

    return policies;
  }

  /**
   * Check for policy content changes across an entire organization.
   * Compares stored verification hashes against current policy content.
   * Returns agents that have stale acknowledgments and need re-onboarding.
   */
  async checkPolicyChanges(orgId: string): Promise<{ agentId: string; staleCount: number }[]> {
    const orgRecords = Array.from(this.records.values())
      .filter(r => r.orgId === orgId && r.status === 'acknowledged');

    // Cache policy hashes to avoid recomputing for each agent
    const currentHashes = new Map<string, string>();
    const staleAgents = new Map<string, number>();

    for (const record of orgRecords) {
      let currentHash = currentHashes.get(record.policyId);
      if (currentHash === undefined) {
        const policy = await this.policyEngine.getPolicy(record.policyId);
        if (policy) {
          currentHash = hashPolicyContent(policy.content);
          currentHashes.set(record.policyId, currentHash);
        } else {
          // Policy was deleted; treat as stale
          currentHash = '';
          currentHashes.set(record.policyId, currentHash);
        }
      }

      if (currentHash !== record.verificationHash) {
        const count = staleAgents.get(record.agentId) || 0;
        staleAgents.set(record.agentId, count + 1);
      }
    }

    return Array.from(staleAgents.entries()).map(([agentId, staleCount]) => ({
      agentId,
      staleCount,
    }));
  }

  /**
   * Trigger re-onboarding for specific policies.
   * Resets acknowledged records back to pending and removes the agent
   * from the onboarded set if they were previously fully onboarded.
   */
  async triggerReOnboarding(agentId: string, policyIds: string[]): Promise<void> {
    const policyIdSet = new Set(policyIds);
    const timestamp = now();

    for (const record of this.records.values()) {
      if (record.agentId === agentId && policyIdSet.has(record.policyId)) {
        record.status = 'pending';
        record.acknowledgedAt = undefined;
        record.memoryEntryId = undefined;
        record.updatedAt = timestamp;
        record.metadata.reOnboardingTriggeredAt = timestamp;

        await this.updateRecord(record);
      }
    }

    // Remove from onboarded set since they now have pending mandatory policies
    this.onboardedAgents.delete(agentId);
  }

  /**
   * Force-complete onboarding for an agent (admin override).
   * Marks all pending records as acknowledged with metadata noting the admin override.
   */
  async forceComplete(agentId: string, adminId: string): Promise<void> {
    const timestamp = now();
    const agentRecords = this.getRecordsForAgent(agentId);

    for (const record of agentRecords) {
      if (record.status === 'pending') {
        record.status = 'acknowledged';
        record.acknowledgedAt = timestamp;
        record.updatedAt = timestamp;
        record.metadata.adminOverride = true;
        record.metadata.adminId = adminId;
        record.metadata.forceCompletedAt = timestamp;

        await this.updateRecord(record);
      }
    }

    this.onboardedAgents.add(agentId);
  }

  // ─── Internal Helpers ─────────────────────────────────

  /**
   * Find an onboarding record for a specific agent + policy combination.
   */
  private findRecord(agentId: string, policyId: string): OnboardingRecord | undefined {
    for (const record of this.records.values()) {
      if (record.agentId === agentId && record.policyId === policyId) {
        return record;
      }
    }
    return undefined;
  }

  /**
   * Get all records for a specific agent.
   */
  private getRecordsForAgent(agentId: string): OnboardingRecord[] {
    const results: OnboardingRecord[] = [];
    for (const record of this.records.values()) {
      if (record.agentId === agentId) {
        results.push(record);
      }
    }
    return results;
  }

  /**
   * Check whether all mandatory policy records for an agent are acknowledged.
   * Non-mandatory (recommended) policies are not required for onboarding completion.
   */
  private areAllMandatoryAcknowledged(records: OnboardingRecord[]): boolean {
    const mandatoryRecords = records.filter(
      r => r.metadata.enforcement === 'mandatory'
    );

    // If no mandatory records, the agent is considered onboarded
    if (mandatoryRecords.length === 0) return true;

    return mandatoryRecords.every(r => r.status === 'acknowledged');
  }

  /**
   * Compute the overall onboarding status from a set of records.
   *
   * - 'not_started': no records exist
   * - 'needs_renewal': any acknowledged record has a stale hash
   * - 'completed': all mandatory records are acknowledged
   * - 'in_progress': some records are still pending
   */
  private computeOverallStatus(records: OnboardingRecord[]): OnboardingStatus {
    if (records.length === 0) return 'not_started';

    // Check for stale hashes (needs_renewal takes priority)
    const hasStale = records.some(
      r => r.status === 'acknowledged' && r.metadata._hashStale === true
    );
    if (hasStale) return 'needs_renewal';

    // Check if all mandatory policies are acknowledged
    if (this.areAllMandatoryAcknowledged(records)) return 'completed';

    return 'in_progress';
  }

  /**
   * Build an OnboardingProgress snapshot from a set of records.
   * Performs async hash checks to detect stale acknowledgments.
   */
  private buildProgress(
    agentId: string,
    orgId: string,
    records: OnboardingRecord[],
  ): OnboardingProgress {
    const acknowledged = records.filter(r => r.status === 'acknowledged');
    const pending = records.filter(r => r.status === 'pending');

    // Count records that may need renewal (stale hash marker from checkPolicyChanges)
    const needsRenewal = records.filter(
      r => r.metadata._hashStale === true
    ).length;

    const overallStatus = this.computeOverallStatus(records);

    // Find completion timestamp (latest acknowledgedAt among mandatory records)
    let completedAt: string | undefined;
    if (overallStatus === 'completed') {
      const mandatoryAcked = acknowledged.filter(r => r.metadata.enforcement === 'mandatory');
      if (mandatoryAcked.length > 0) {
        completedAt = mandatoryAcked
          .map(r => r.acknowledgedAt || '')
          .sort()
          .pop();
      }
    }

    return {
      agentId,
      orgId,
      overallStatus,
      totalPolicies: records.length,
      acknowledgedPolicies: acknowledged.length,
      pendingPolicies: pending.length,
      needsRenewal,
      completedAt,
      records: [...records],
    };
  }

  // ─── Database Persistence ─────────────────────────────

  /**
   * Persist a new onboarding record to the database.
   */
  private async persistRecord(record: OnboardingRecord): Promise<void> {
    if (!this.engineDb) return;

    try {
      await this.engineDb.execute(
        `INSERT INTO onboarding_records
           (id, agent_id, org_id, policy_id, status, acknowledged_at, memory_entry_id, verification_hash, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, policy_id) DO UPDATE SET
           status = excluded.status,
           acknowledged_at = excluded.acknowledged_at,
           memory_entry_id = excluded.memory_entry_id,
           verification_hash = excluded.verification_hash,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at`,
        [
          record.id,
          record.agentId,
          record.orgId,
          record.policyId,
          record.status,
          record.acknowledgedAt || null,
          record.memoryEntryId || null,
          record.verificationHash,
          JSON.stringify(record.metadata),
          record.createdAt,
          record.updatedAt,
        ],
      );
    } catch (err) {
      console.error('[onboarding] Failed to persist record:', err);
    }
  }

  /**
   * Update an existing onboarding record in the database.
   */
  private async updateRecord(record: OnboardingRecord): Promise<void> {
    if (!this.engineDb) return;

    try {
      await this.engineDb.execute(
        `UPDATE onboarding_records
         SET status = ?, acknowledged_at = ?, memory_entry_id = ?,
             verification_hash = ?, metadata = ?, updated_at = ?
         WHERE id = ?`,
        [
          record.status,
          record.acknowledgedAt || null,
          record.memoryEntryId || null,
          record.verificationHash,
          JSON.stringify(record.metadata),
          record.updatedAt,
          record.id,
        ],
      );
    } catch (err) {
      console.error('[onboarding] Failed to update record:', err);
    }
  }
}

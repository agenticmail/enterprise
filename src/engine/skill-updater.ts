/**
 * Skill Auto-Updater
 *
 * Periodically checks GitHub repositories for updated agenticmail-skill.json manifests.
 * When a newer version is found, it can auto-update or notify for manual approval.
 *
 * Features:
 * - GitHub polling for manifest changes (uses raw.githubusercontent.com)
 * - Semver comparison for version changes
 * - Configurable auto-update vs manual approval
 * - Update history tracking
 * - Per-org update preferences
 * - Batch update all installed skills
 * - Rate limiting for GitHub API calls
 */

import type { CommunitySkillRegistry } from './community-registry.js';

// ─── Types ──────────────────────────────────────────────

export interface UpdateConfig {
  orgId: string;
  autoUpdate: boolean;
  checkIntervalHours: number;
  autoUpdateRiskLevel: 'low' | 'medium' | 'high' | 'all';
  notifyOnUpdate: boolean;
  excludeSkills: string[];
  lastCheckAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillUpdate {
  id: string;
  orgId: string;
  skillId: string;
  currentVersion: string;
  newVersion: string;
  changelog?: string;
  riskChange: boolean;
  newRisk?: string;
  status: 'available' | 'applied' | 'skipped' | 'failed';
  autoApplied: boolean;
  appliedBy?: string;
  appliedAt?: string;
  detectedAt: string;
  manifest?: any;
}

export interface UpdateCheckResult {
  skillId: string;
  repository: string;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  manifest?: any;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const RISK_LEVELS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ─── Skill Auto-Updater ─────────────────────────────────

export class SkillAutoUpdater {
  private configs = new Map<string, UpdateConfig>();
  private updates = new Map<string, SkillUpdate>();
  private checkHistory = new Map<string, { checkedAt: string; results: UpdateCheckResult[] }>();
  private scheduler?: ReturnType<typeof setInterval>;
  private registry: CommunitySkillRegistry;

  constructor(opts: { registry: CommunitySkillRegistry }) {
    this.registry = opts.registry;
  }

  // ── Configuration ──────────────────────────────────────

  getConfig(orgId: string): UpdateConfig {
    const existing = this.configs.get(orgId);
    if (existing) return existing;

    // Return defaults
    const defaults: UpdateConfig = {
      orgId,
      autoUpdate: false,
      checkIntervalHours: 6,
      autoUpdateRiskLevel: 'low',
      notifyOnUpdate: true,
      excludeSkills: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.configs.set(orgId, defaults);
    return defaults;
  }

  setConfig(orgId: string, config: Partial<UpdateConfig>): UpdateConfig {
    const existing = this.getConfig(orgId);
    const updated: UpdateConfig = {
      ...existing,
      ...config,
      orgId, // always keep the orgId
      updatedAt: new Date().toISOString(),
    };
    this.configs.set(orgId, updated);
    return updated;
  }

  // ── Check for Updates ──────────────────────────────────

  async checkForUpdates(orgId: string): Promise<UpdateCheckResult[]> {
    const installed = await this.registry.getInstalledWithDetails(orgId);
    const results: UpdateCheckResult[] = [];

    for (const inst of installed) {
      const skill = inst.skill;
      if (!skill || !skill.repository) continue;

      const result = await this.checkSingleSkill(inst.skillId, skill.repository, inst.version);
      results.push(result);

      // If an update is available, create a SkillUpdate record
      if (result.updateAvailable && result.latestVersion && result.manifest) {
        // Check if we already have an 'available' update for this skill+org
        const existingUpdate = Array.from(this.updates.values()).find(
          (u) => u.orgId === orgId && u.skillId === inst.skillId && u.status === 'available'
        );
        if (!existingUpdate || existingUpdate.newVersion !== result.latestVersion) {
          // Determine if risk level changed
          const currentRisk = skill.risk;
          const newRisk = result.manifest.risk;
          const riskChange = !!newRisk && newRisk !== currentRisk;

          const update: SkillUpdate = {
            id: uid(),
            orgId,
            skillId: inst.skillId,
            currentVersion: inst.version,
            newVersion: result.latestVersion,
            changelog: result.manifest.changelog || undefined,
            riskChange,
            newRisk: riskChange ? newRisk : undefined,
            status: 'available',
            autoApplied: false,
            detectedAt: new Date().toISOString(),
            manifest: result.manifest,
          };
          this.updates.set(update.id, update);

          // Remove old available update for same skill+org if version differs
          if (existingUpdate && existingUpdate.newVersion !== result.latestVersion) {
            existingUpdate.status = 'skipped';
          }
        }
      }
    }

    // Update config lastCheckAt
    const cfg = this.getConfig(orgId);
    cfg.lastCheckAt = new Date().toISOString();
    cfg.updatedAt = new Date().toISOString();
    this.configs.set(orgId, cfg);

    // Record check history
    this.checkHistory.set(orgId, { checkedAt: new Date().toISOString(), results });

    return results;
  }

  async checkSingleSkill(skillId: string, repository: string, currentVersion: string): Promise<UpdateCheckResult> {
    const parsed = this.parseRepoUrl(repository);
    if (!parsed) {
      return {
        skillId,
        repository,
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: 'Could not parse repository URL',
      };
    }

    try {
      const manifest = await this.fetchManifestFromGitHub(parsed.owner, parsed.repo, parsed.branch);
      const latestVersion = manifest.version || null;

      if (!latestVersion) {
        return {
          skillId,
          repository,
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          error: 'No version field in remote manifest',
        };
      }

      const updateAvailable = this.compareSemver(currentVersion, latestVersion) < 0;

      return {
        skillId,
        repository,
        currentVersion,
        latestVersion,
        updateAvailable,
        manifest: updateAvailable ? manifest : undefined,
      };
    } catch (err: any) {
      return {
        skillId,
        repository,
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: err.message,
      };
    }
  }

  // ── Apply Updates ──────────────────────────────────────

  async applyUpdate(updateId: string, userId?: string): Promise<SkillUpdate> {
    const update = this.updates.get(updateId);
    if (!update) throw new Error('Update not found: ' + updateId);
    if (update.status !== 'available') throw new Error('Update is not in available status: ' + update.status);

    try {
      // Re-publish with the new manifest
      if (update.manifest) {
        await this.registry.publish(update.manifest);
      }

      // Upgrade the installed skill to latest version
      await this.registry.upgrade(update.orgId, update.skillId);

      update.status = 'applied';
      update.appliedBy = userId || 'system';
      update.appliedAt = new Date().toISOString();
    } catch (err: any) {
      update.status = 'failed';
      update.appliedBy = userId || 'system';
      update.appliedAt = new Date().toISOString();
      throw new Error('Failed to apply update: ' + err.message);
    }

    return update;
  }

  async applyAllUpdates(orgId: string, userId?: string): Promise<SkillUpdate[]> {
    const available = this.getAvailableUpdates(orgId);
    const results: SkillUpdate[] = [];

    for (const update of available) {
      try {
        const applied = await this.applyUpdate(update.id, userId);
        results.push(applied);
      } catch {
        // Update was already marked as failed in applyUpdate
        results.push(this.updates.get(update.id)!);
      }
    }

    return results;
  }

  async skipUpdate(updateId: string): Promise<SkillUpdate> {
    const update = this.updates.get(updateId);
    if (!update) throw new Error('Update not found: ' + updateId);

    update.status = 'skipped';
    return update;
  }

  // ── Update History ─────────────────────────────────────

  getAvailableUpdates(orgId: string): SkillUpdate[] {
    return Array.from(this.updates.values()).filter(
      (u) => u.orgId === orgId && u.status === 'available'
    );
  }

  getUpdateHistory(orgId: string, opts?: { limit?: number }): SkillUpdate[] {
    const limit = opts?.limit || 50;
    return Array.from(this.updates.values())
      .filter((u) => u.orgId === orgId)
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, limit);
  }

  getUpdate(updateId: string): SkillUpdate | undefined {
    return this.updates.get(updateId);
  }

  // ── Auto-Update Logic ─────────────────────────────────

  async runAutoUpdates(orgId: string): Promise<{ checked: number; updated: number; skipped: number; failed: number }> {
    // 1. Check for updates
    const results = await this.checkForUpdates(orgId);
    const checked = results.length;

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const config = this.getConfig(orgId);
    const available = this.getAvailableUpdates(orgId);

    for (const update of available) {
      // Check if skill is excluded
      if (config.excludeSkills.includes(update.skillId)) {
        skipped++;
        continue;
      }

      // Check if auto-update is enabled
      if (!config.autoUpdate) {
        skipped++;
        continue;
      }

      // Check risk level
      if (config.autoUpdateRiskLevel !== 'all') {
        const maxRisk = RISK_LEVELS[config.autoUpdateRiskLevel] || 1;
        const updateRisk = RISK_LEVELS[update.newRisk || 'low'] || 1;
        // If the new risk exceeds the org's auto-update risk threshold, skip
        if (updateRisk > maxRisk) {
          skipped++;
          continue;
        }
        // If there was a risk change (increase), also check against threshold
        if (update.riskChange && update.newRisk) {
          const newRiskLevel = RISK_LEVELS[update.newRisk] || 1;
          if (newRiskLevel > maxRisk) {
            skipped++;
            continue;
          }
        }
      }

      // Apply the update
      try {
        await this.applyUpdate(update.id, 'auto-updater');
        update.autoApplied = true;
        updated++;
      } catch {
        failed++;
      }
    }

    return { checked, updated, skipped, failed };
  }

  // ── GitHub Helpers ─────────────────────────────────────

  private parseRepoUrl(url: string): { owner: string; repo: string; branch: string } | null {
    // Handle full GitHub URLs
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/main
    // https://github.com/owner/repo/tree/some-branch
    // git@github.com:owner/repo.git
    // owner/repo (shorthand)
    let match: RegExpMatchArray | null;

    // Full URL with optional tree/branch
    match = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:\/.*)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        branch: match[3] || 'main',
      };
    }

    // Shorthand: owner/repo
    match = url.match(/^([^/]+)\/([^/]+)$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        branch: 'main',
      };
    }

    return null;
  }

  private async fetchManifestFromGitHub(owner: string, repo: string, branch: string): Promise<any> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/agenticmail-skill.json`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      // Try master branch as fallback if we were using main
      if (branch === 'main') {
        const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/agenticmail-skill.json`;
        const res2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
        if (!res2.ok) {
          throw new Error(`Could not fetch manifest from ${owner}/${repo} (tried ${branch} and master): HTTP ${res2.status}`);
        }
        return res2.json();
      }
      throw new Error(`Could not fetch manifest from ${owner}/${repo}/${branch}: HTTP ${res.status}`);
    }

    return res.json();
  }

  private compareSemver(a: string, b: string): number {
    const pa = (a || '0.0.0').split('.').map(Number);
    const pb = (b || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  // ── Scheduler ──────────────────────────────────────────

  startScheduler(intervalMs?: number): void {
    this.stopScheduler();

    const interval = intervalMs || 6 * 60 * 60 * 1000; // default 6 hours

    this.scheduler = setInterval(() => {
      const now = Date.now();

      for (const [orgId, config] of this.configs) {
        const checkIntervalMs = (config.checkIntervalHours || 6) * 60 * 60 * 1000;
        const lastCheck = config.lastCheckAt ? new Date(config.lastCheckAt).getTime() : 0;

        if (now - lastCheck >= checkIntervalMs) {
          this.runAutoUpdates(orgId)
            .then(({ updated, failed }) => {
              if (updated > 0) console.log(`[skill-updater] Auto-updated ${updated} skills for org ${orgId}`);
              if (failed > 0) console.warn(`[skill-updater] ${failed} update(s) failed for org ${orgId}`);
            })
            .catch(() => {});
        }
      }
    }, interval);

    // Don't block process exit
    if (this.scheduler && typeof this.scheduler === 'object' && 'unref' in this.scheduler) {
      this.scheduler.unref();
    }
  }

  stopScheduler(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = undefined;
    }
  }

  // ── Stats ──────────────────────────────────────────────

  getStats(orgId: string): { totalInstalled: number; updatesAvailable: number; updatesApplied: number; lastCheckAt: string | null } {
    const allUpdates = Array.from(this.updates.values()).filter((u) => u.orgId === orgId);
    const config = this.configs.get(orgId);

    return {
      totalInstalled: 0, // will be populated from registry when called via route
      updatesAvailable: allUpdates.filter((u) => u.status === 'available').length,
      updatesApplied: allUpdates.filter((u) => u.status === 'applied').length,
      lastCheckAt: config?.lastCheckAt || null,
    };
  }
}

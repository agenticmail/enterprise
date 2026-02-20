/**
 * Community Skill Registry — Marketplace for Community-Contributed Skills
 *
 * Full DB-backed registry that replaces the in-memory stub from skills.ts.
 * Handles publishing, installing, reviewing, and importing community skills.
 *
 * Skills are described by an `agenticmail-skill.json` manifest and can be
 * imported from any public GitHub repo containing that file.
 */

import type { EngineDatabase } from './db-adapter.js';
import type { PermissionEngine, SkillDefinition } from './skills.js';
import { validateSkillManifest, collectCommunityToolIds, VALID_CATEGORIES, type ManifestValidationResult as _MVR } from './skill-validator.js';

// ─── Types ──────────────────────────────────────────────

export interface CommunitySkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  repository: string;
  license: string;
  category?: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  icon?: string;
  tags?: string[];
  tools: Array<{
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, any>;
    riskLevel?: string;
  }>;
  configSchema?: Record<string, any>;
  minEngineVersion?: string;
  homepage?: string;
}

export interface IndexedCommunitySkill extends CommunitySkillManifest {
  downloads: number;
  rating: number;
  ratingCount: number;
  verified: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledCommunitySkill {
  id: string;
  orgId: string;
  skillId: string;
  version: string;
  enabled: boolean;
  config: Record<string, any>;
  installedBy: string;
  installedAt: string;
  updatedAt: string;
}

export interface CommunitySkillReview {
  id: string;
  skillId: string;
  userId: string;
  userName?: string;
  rating: number;
  reviewText?: string;
  createdAt: string;
}

export type { ManifestValidationResult } from './skill-validator.js';

// ─── Helpers ─────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

import type { ManifestValidationResult } from './skill-validator.js';

// ─── Community Skill Registry ─────────────────────────────

// ─── Remote Registry Config ──────────────────────────────

const DEFAULT_REGISTRY_REPO = 'agenticmail/enterprise';
const DEFAULT_REGISTRY_BRANCH = 'main';
const DEFAULT_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class CommunitySkillRegistry {
  private engineDb?: EngineDatabase;
  private permissions: PermissionEngine;
  private index = new Map<string, IndexedCommunitySkill>();
  private installed = new Map<string, InstalledCommunitySkill>();
  private syncTimer?: ReturnType<typeof setInterval>;
  private registryRepo: string;
  private registryBranch: string;
  private lastSyncAt?: string;

  constructor(opts: { permissions: PermissionEngine; registryRepo?: string; registryBranch?: string }) {
    this.permissions = opts.permissions;
    this.registryRepo = opts.registryRepo || DEFAULT_REGISTRY_REPO;
    this.registryBranch = opts.registryBranch || DEFAULT_REGISTRY_BRANCH;
  }

  // ── DB Wiring ─────────────────────────────────────────

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;

    // Load global index
    const { skills } = await this.engineDb.getAllCommunitySkills({ limit: 10000 });
    this.index.clear();
    for (const s of skills) this.index.set(s.id, s);

    // Seed example skills (upserts — safe to run repeatedly, ensures icons/metadata stay current)
    await this.seedIndex();

    // Load all installed skills and re-register enabled ones
    // For simplicity, load installed for all orgs
    // (in production this would be per-org on request)
    try {
      const rows = await this.engineDb.getInstalledSkillsByOrg('*').catch(() => [] as any[]);
      // Actually load per-org when requested; for startup, just clear
      this.installed.clear();
    } catch {
      // noop — table may not exist yet during first run
    }
  }

  // ── Publishing ────────────────────────────────────────

  async publish(manifest: CommunitySkillManifest): Promise<IndexedCommunitySkill> {
    const validation = this.validateManifest(manifest);
    if (!validation.valid) throw new Error('Invalid manifest: ' + validation.errors.join(', '));

    const existing = this.index.get(manifest.id);
    const skill: IndexedCommunitySkill = {
      ...manifest,
      downloads: existing?.downloads || 0,
      rating: existing?.rating || 0,
      ratingCount: existing?.ratingCount || 0,
      verified: existing?.verified || false,
      featured: existing?.featured || false,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.index.set(skill.id, skill);
    if (this.engineDb) await this.engineDb.upsertCommunitySkill(skill);
    return skill;
  }

  async unpublish(skillId: string): Promise<void> {
    this.index.delete(skillId);
    if (this.engineDb) await this.engineDb.deleteCommunitySkill(skillId);
  }

  async setVerified(skillId: string, verified: boolean): Promise<void> {
    const skill = this.index.get(skillId);
    if (!skill) throw new Error('Skill not found: ' + skillId);
    skill.verified = verified;
    skill.updatedAt = new Date().toISOString();
    if (this.engineDb) await this.engineDb.upsertCommunitySkill(skill);
  }

  async setFeatured(skillId: string, featured: boolean): Promise<void> {
    const skill = this.index.get(skillId);
    if (!skill) throw new Error('Skill not found: ' + skillId);
    skill.featured = featured;
    skill.updatedAt = new Date().toISOString();
    if (this.engineDb) await this.engineDb.upsertCommunitySkill(skill);
  }

  // ── Install / Uninstall ───────────────────────────────

  async install(orgId: string, skillId: string, installedBy: string, config?: Record<string, any>): Promise<InstalledCommunitySkill> {
    const skill = this.index.get(skillId);
    if (!skill) throw new Error('Skill not found: ' + skillId);

    const id = `${orgId}:${skillId}`;
    const inst: InstalledCommunitySkill = {
      id,
      orgId,
      skillId,
      version: skill.version,
      enabled: true,
      config: config || {},
      installedBy,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.installed.set(id, inst);
    if (this.engineDb) {
      await this.engineDb.upsertInstalledSkill(inst);
      await this.engineDb.incrementDownloads(skillId);
    }
    skill.downloads = (skill.downloads || 0) + 1;

    // Register skill tools with PermissionEngine
    this.registerWithPermissions(skill);

    return inst;
  }

  async uninstall(orgId: string, skillId: string): Promise<void> {
    const id = `${orgId}:${skillId}`;
    this.installed.delete(id);
    if (this.engineDb) await this.engineDb.deleteInstalledSkill(orgId, skillId);
  }

  async enable(orgId: string, skillId: string): Promise<void> {
    const id = `${orgId}:${skillId}`;
    const inst = this.installed.get(id);
    if (!inst) throw new Error('Skill not installed');
    inst.enabled = true;
    inst.updatedAt = new Date().toISOString();
    if (this.engineDb) await this.engineDb.upsertInstalledSkill(inst);

    const skill = this.index.get(skillId);
    if (skill) this.registerWithPermissions(skill);
  }

  async disable(orgId: string, skillId: string): Promise<void> {
    const id = `${orgId}:${skillId}`;
    const inst = this.installed.get(id);
    if (!inst) throw new Error('Skill not installed');
    inst.enabled = false;
    inst.updatedAt = new Date().toISOString();
    if (this.engineDb) await this.engineDb.upsertInstalledSkill(inst);
  }

  async updateConfig(orgId: string, skillId: string, config: Record<string, any>): Promise<void> {
    const id = `${orgId}:${skillId}`;
    const inst = this.installed.get(id);
    if (!inst) throw new Error('Skill not installed');
    inst.config = { ...inst.config, ...config };
    inst.updatedAt = new Date().toISOString();
    if (this.engineDb) await this.engineDb.upsertInstalledSkill(inst);
  }

  async upgrade(orgId: string, skillId: string): Promise<InstalledCommunitySkill> {
    const id = `${orgId}:${skillId}`;
    const inst = this.installed.get(id);
    if (!inst) throw new Error('Skill not installed');

    const skill = this.index.get(skillId);
    if (!skill) throw new Error('Skill not found in index');

    inst.version = skill.version;
    inst.updatedAt = new Date().toISOString();
    if (this.engineDb) await this.engineDb.upsertInstalledSkill(inst);
    return inst;
  }

  // ── Queries ───────────────────────────────────────────

  async search(opts?: {
    query?: string; category?: string; risk?: string; tag?: string;
    verified?: boolean; featured?: boolean;
    sortBy?: string; order?: string;
    limit?: number; offset?: number;
  }): Promise<{ skills: IndexedCommunitySkill[]; total: number }> {
    if (this.engineDb) {
      return this.engineDb.getAllCommunitySkills({
        search: opts?.query,
        category: opts?.category,
        risk: opts?.risk,
        tag: opts?.tag,
        verified: opts?.verified,
        featured: opts?.featured,
        sortBy: opts?.sortBy,
        order: opts?.order,
        limit: opts?.limit || 50,
        offset: opts?.offset || 0,
      });
    }

    // Fallback to in-memory
    let results = Array.from(this.index.values());
    if (opts?.query) {
      const q = opts.query.toLowerCase();
      results = results.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    if (opts?.category) results = results.filter(s => s.category === opts.category);
    if (opts?.risk) results = results.filter(s => s.risk === opts.risk);
    if (opts?.verified !== undefined) results = results.filter(s => s.verified === opts.verified);
    if (opts?.featured !== undefined) results = results.filter(s => s.featured === opts.featured);

    const total = results.length;
    const offset = opts?.offset || 0;
    const limit = opts?.limit || 50;
    return { skills: results.slice(offset, offset + limit), total };
  }

  getIndex(): IndexedCommunitySkill[] {
    return Array.from(this.index.values());
  }

  getSkill(skillId: string): IndexedCommunitySkill | undefined {
    return this.index.get(skillId);
  }

  async getFeatured(): Promise<IndexedCommunitySkill[]> {
    if (this.engineDb) {
      const { skills } = await this.engineDb.getAllCommunitySkills({ featured: true, limit: 20 });
      return skills;
    }
    return Array.from(this.index.values()).filter(s => s.featured);
  }

  async getPopular(limit: number = 10): Promise<IndexedCommunitySkill[]> {
    if (this.engineDb) {
      const { skills } = await this.engineDb.getAllCommunitySkills({ sortBy: 'popular', limit });
      return skills;
    }
    return Array.from(this.index.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  getCategories(): readonly string[] {
    return VALID_CATEGORIES;
  }

  async getInstalled(orgId: string): Promise<InstalledCommunitySkill[]> {
    if (this.engineDb) {
      return this.engineDb.getInstalledSkillsByOrg(orgId);
    }
    return Array.from(this.installed.values()).filter(s => s.orgId === orgId);
  }

  async getInstalledWithDetails(orgId: string): Promise<Array<InstalledCommunitySkill & { skill?: IndexedCommunitySkill }>> {
    const installs = await this.getInstalled(orgId);
    return installs.map(inst => ({
      ...inst,
      skill: this.index.get(inst.skillId),
    }));
  }

  // ── Reviews ───────────────────────────────────────────

  async submitReview(review: { skillId: string; userId: string; userName?: string; rating: number; reviewText?: string }): Promise<CommunitySkillReview> {
    if (review.rating < 1 || review.rating > 5) throw new Error('Rating must be 1-5');

    const entry: CommunitySkillReview = {
      id: uid(),
      skillId: review.skillId,
      userId: review.userId,
      userName: review.userName,
      rating: review.rating,
      reviewText: review.reviewText,
      createdAt: new Date().toISOString(),
    };

    if (this.engineDb) {
      await this.engineDb.insertReview(entry);
      // Update aggregate rating on the skill
      const { avg, count } = await this.engineDb.getAverageRating(review.skillId);
      const skill = this.index.get(review.skillId);
      if (skill) {
        skill.rating = Math.round(avg * 10) / 10;
        skill.ratingCount = count;
        await this.engineDb.upsertCommunitySkill(skill);
      }
    }

    return entry;
  }

  async getReviews(skillId: string, limit: number = 50): Promise<CommunitySkillReview[]> {
    if (this.engineDb) return this.engineDb.getReviews(skillId, limit);
    return [];
  }

  // ── Validation ────────────────────────────────────────

  validateManifest(manifest: Partial<CommunitySkillManifest>): ManifestValidationResult {
    return validateSkillManifest(manifest);
  }

  // ── Load from Directory (git-repo-as-marketplace) ────

  async loadFromDirectory(dirPath: string): Promise<{
    loaded: number;
    errors: Array<{ skillId: string; errors: string[] }>;
  }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return { loaded: 0, errors: [] };
    }

    let loaded = 0;
    const loadErrors: Array<{ skillId: string; errors: string[] }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const manifestPath = path.join(dirPath, entry.name, 'agenticmail-skill.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw) as CommunitySkillManifest;

        const validation = validateSkillManifest(manifest);
        if (!validation.valid) {
          loadErrors.push({ skillId: entry.name, errors: validation.errors });
          continue;
        }

        await this.publish(manifest);
        loaded++;
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          loadErrors.push({ skillId: entry.name, errors: [err.message] });
        }
      }
    }

    return { loaded, errors: loadErrors };
  }

  // ── GitHub Import ─────────────────────────────────────

  async importFromGitHub(repoUrl: string): Promise<IndexedCommunitySkill> {
    // Parse GitHub URL: https://github.com/user/repo or user/repo
    const match = repoUrl.match(/(?:github\.com\/)?([^/]+\/[^/]+)/);
    if (!match) throw new Error('Invalid GitHub URL or slug');

    const slug = match[1].replace(/\.git$/, '');
    const rawUrl = `https://raw.githubusercontent.com/${slug}/main/agenticmail-skill.json`;

    let manifest: CommunitySkillManifest;
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) {
        // Try master branch
        const res2 = await fetch(rawUrl.replace('/main/', '/master/'));
        if (!res2.ok) throw new Error(`Could not fetch manifest from ${slug} (tried main and master branches)`);
        manifest = await res2.json() as CommunitySkillManifest;
      } else {
        manifest = await res.json() as CommunitySkillManifest;
      }
    } catch (err: any) {
      throw new Error(`Failed to fetch manifest: ${err.message}`);
    }

    // Ensure repository is set
    manifest.repository = manifest.repository || `https://github.com/${slug}`;

    return this.publish(manifest);
  }

  // ── Remote Registry Sync ─────────────────────────────

  /**
   * Sync skills from the central GitHub repo (agenticmail/enterprise).
   * Fetches community-skills/index.json which lists all available skills,
   * then fetches each skill's manifest and publishes it locally.
   *
   * This is how deployed instances get new community skills without
   * needing an npm update or server restart.
   */
  async syncFromRemote(): Promise<{
    synced: number;
    errors: Array<{ skillId: string; error: string }>;
  }> {
    const baseUrl = `https://raw.githubusercontent.com/${this.registryRepo}/${this.registryBranch}`;
    const indexUrl = `${baseUrl}/community-skills/index.json`;

    let skillIds: string[];
    try {
      const res = await fetch(indexUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { skills: Array<{ id: string; version: string }> };
      skillIds = (data.skills || []).map((s: any) => s.id);
    } catch (err: any) {
      // If no index.json exists yet, nothing to sync
      return { synced: 0, errors: [{ skillId: '_index', error: `Cannot fetch index: ${err.message}` }] };
    }

    let synced = 0;
    const errors: Array<{ skillId: string; error: string }> = [];

    for (const skillId of skillIds) {
      try {
        // Check if we already have this skill at the same or newer version
        const existing = this.index.get(skillId);
        const manifestUrl = `${baseUrl}/community-skills/${skillId}/agenticmail-skill.json`;

        const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          errors.push({ skillId, error: `HTTP ${res.status}` });
          continue;
        }

        const manifest = await res.json() as CommunitySkillManifest;

        // Skip if we already have the same version
        if (existing && existing.version === manifest.version) continue;

        const validation = validateSkillManifest(manifest);
        if (!validation.valid) {
          errors.push({ skillId, error: validation.errors.join('; ') });
          continue;
        }

        await this.publish(manifest);
        synced++;
      } catch (err: any) {
        errors.push({ skillId, error: err.message });
      }
    }

    this.lastSyncAt = new Date().toISOString();
    return { synced, errors };
  }

  /**
   * Start periodic background sync from the remote registry.
   * Default: every 6 hours.
   */
  startPeriodicSync(intervalMs: number = DEFAULT_SYNC_INTERVAL_MS): void {
    this.stopPeriodicSync();
    // Do an initial sync after a short delay (let the server finish booting)
    setTimeout(() => {
      this.syncFromRemote().then(({ synced, errors }) => {
        if (synced > 0) console.log(`[community] Remote sync: ${synced} new skills`);
        if (errors.length > 0 && errors[0]?.skillId !== '_index') {
          console.warn(`[community] Remote sync: ${errors.length} errors`);
        }
      }).catch(() => {});
    }, 15000);

    this.syncTimer = setInterval(() => {
      this.syncFromRemote().then(({ synced }) => {
        if (synced > 0) console.log(`[community] Periodic sync: ${synced} new skills`);
      }).catch(() => {});
    }, intervalMs);

    // Don't block process exit
    if (this.syncTimer && typeof this.syncTimer === 'object' && 'unref' in this.syncTimer) {
      this.syncTimer.unref();
    }
  }

  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  getLastSyncAt(): string | undefined {
    return this.lastSyncAt;
  }

  // ── Stats ─────────────────────────────────────────────

  getStats(): { totalSkills: number; verified: number; featured: number; categories: number; totalDownloads: number; lastSyncAt?: string; registryRepo: string } {
    const all = Array.from(this.index.values());
    const categories = new Set(all.map(s => s.category).filter(Boolean));
    return {
      totalSkills: all.length,
      verified: all.filter(s => s.verified).length,
      featured: all.filter(s => s.featured).length,
      categories: categories.size,
      totalDownloads: all.reduce((sum, s) => sum + (s.downloads || 0), 0),
      lastSyncAt: this.lastSyncAt,
      registryRepo: this.registryRepo,
    };
  }

  // ── Permission Engine Integration ─────────────────────

  private registerWithPermissions(skill: IndexedCommunitySkill): void {
    const def: SkillDefinition = {
      id: `community:${skill.id}`,
      name: skill.name,
      description: skill.description,
      category: (skill.category || 'custom') as any,
      risk: (skill.risk || 'medium') as any,
      tools: skill.tools.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: (skill.category || 'custom') as any,
        risk: (t.riskLevel || skill.risk || 'medium') as any,
        skillId: `community:${skill.id}`,
        parameters: t.parameters || {},
        sideEffects: [],
      })),
      configSchema: {},
    };
    this.permissions.registerSkill(def);
  }

  // ── Seed Data ─────────────────────────────────────────

  private async seedIndex(): Promise<void> {
    const seeds: CommunitySkillManifest[] = [
      {
        id: 'github-issues',
        name: 'GitHub Issues Manager',
        description: 'Create, update, close, and triage GitHub issues. Supports labels, milestones, and assignees.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/github-issues',
        license: 'MIT',
        category: 'development',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/github/white',
        tags: ['github', 'issues', 'project-management'],
        tools: [
          { id: 'github_create_issue', name: 'Create Issue', description: 'Create a new GitHub issue' },
          { id: 'github_update_issue', name: 'Update Issue', description: 'Update an existing issue' },
          { id: 'github_close_issue', name: 'Close Issue', description: 'Close a GitHub issue' },
          { id: 'github_list_issues', name: 'List Issues', description: 'List issues with filters' },
        ],
      },
      {
        id: 'slack-notifications',
        name: 'Slack Notifications',
        description: 'Send messages, create channels, and manage notifications in Slack workspaces.',
        version: '2.0.1',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/slack',
        license: 'MIT',
        category: 'communication',
        risk: 'medium',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%234A154B'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3ES%3C/text%3E%3C/svg%3E",
        tags: ['slack', 'notifications', 'messaging'],
        tools: [
          { id: 'slack_send_message', name: 'Send Message', description: 'Send a message to a Slack channel' },
          { id: 'slack_create_channel', name: 'Create Channel', description: 'Create a new Slack channel' },
          { id: 'slack_list_channels', name: 'List Channels', description: 'List available channels' },
        ],
      },
      {
        id: 'jira-integration',
        name: 'Jira Integration',
        description: 'Full Jira integration for creating tickets, managing sprints, and tracking progress.',
        version: '1.5.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/jira',
        license: 'MIT',
        category: 'productivity',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/jira/0052CC',
        tags: ['jira', 'project-management', 'agile'],
        tools: [
          { id: 'jira_create_ticket', name: 'Create Ticket', description: 'Create a Jira ticket' },
          { id: 'jira_update_ticket', name: 'Update Ticket', description: 'Update an existing ticket' },
          { id: 'jira_transition', name: 'Transition Issue', description: 'Move issue to new status' },
          { id: 'jira_search', name: 'Search Issues', description: 'Search Jira issues with JQL' },
        ],
      },
      {
        id: 'stripe-billing',
        name: 'Stripe Billing',
        description: 'Manage Stripe customers, subscriptions, invoices, and payment methods.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/stripe',
        license: 'MIT',
        category: 'finance',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/stripe/635BFF',
        tags: ['stripe', 'billing', 'payments'],
        tools: [
          { id: 'stripe_create_customer', name: 'Create Customer', description: 'Create a Stripe customer' },
          { id: 'stripe_create_invoice', name: 'Create Invoice', description: 'Generate an invoice' },
          { id: 'stripe_list_subscriptions', name: 'List Subscriptions', description: 'List active subscriptions' },
        ],
      },
      {
        id: 'notion-sync',
        name: 'Notion Sync',
        description: 'Read, create, and update Notion pages and databases. Supports rich content blocks.',
        version: '1.1.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/notion',
        license: 'Apache-2.0',
        category: 'productivity',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/notion/white',
        tags: ['notion', 'wiki', 'documentation'],
        tools: [
          { id: 'notion_read_page', name: 'Read Page', description: 'Read a Notion page' },
          { id: 'notion_create_page', name: 'Create Page', description: 'Create a new page' },
          { id: 'notion_update_page', name: 'Update Page', description: 'Update page content' },
          { id: 'notion_query_database', name: 'Query Database', description: 'Query a Notion database' },
        ],
      },
      {
        id: 'salesforce-crm',
        name: 'Salesforce CRM',
        description: 'Manage Salesforce records, opportunities, contacts, and run SOQL queries.',
        version: '1.3.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/salesforce',
        license: 'MIT',
        category: 'sales',
        risk: 'high',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300A1E0'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='12'%3ESF%3C/text%3E%3C/svg%3E",
        tags: ['salesforce', 'crm', 'sales'],
        tools: [
          { id: 'sf_create_record', name: 'Create Record', description: 'Create a Salesforce record' },
          { id: 'sf_update_record', name: 'Update Record', description: 'Update a Salesforce record' },
          { id: 'sf_query', name: 'SOQL Query', description: 'Run a SOQL query' },
          { id: 'sf_list_opportunities', name: 'List Opportunities', description: 'List open opportunities' },
        ],
      },

      // ── Communication ─────────────────────────────────────
      {
        id: 'microsoft-teams',
        name: 'Microsoft Teams',
        description: 'Send messages, manage channels, and schedule meetings in Microsoft Teams.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/microsoft-teams',
        license: 'MIT',
        category: 'communication',
        risk: 'medium',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%236264A7'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3ET%3C/text%3E%3C/svg%3E",
        tags: ['teams', 'microsoft', 'messaging', 'meetings'],
        tools: [
          { id: 'teams_send_message', name: 'Send Message', description: 'Send a message to a Teams channel or chat' },
          { id: 'teams_create_channel', name: 'Create Channel', description: 'Create a new channel in a team' },
          { id: 'teams_schedule_meeting', name: 'Schedule Meeting', description: 'Schedule a Teams meeting with attendees' },
          { id: 'teams_list_channels', name: 'List Channels', description: 'List channels in a team' },
        ],
      },
      {
        id: 'discord-bot',
        name: 'Discord Bot',
        description: 'Send messages, manage servers, and moderate channels in Discord.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/discord',
        license: 'MIT',
        category: 'communication',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/discord/5865F2',
        tags: ['discord', 'chat', 'community', 'moderation'],
        tools: [
          { id: 'discord_send_message', name: 'Send Message', description: 'Send a message to a Discord channel' },
          { id: 'discord_create_channel', name: 'Create Channel', description: 'Create a new channel in a server' },
          { id: 'discord_manage_roles', name: 'Manage Roles', description: 'Assign or remove roles from members' },
        ],
      },
      {
        id: 'zoom-meetings',
        name: 'Zoom Meetings',
        description: 'Create, update, and manage Zoom meetings and webinars. Retrieve recordings and participant lists.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/zoom',
        license: 'MIT',
        category: 'communication',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/zoom/0B5CFF',
        tags: ['zoom', 'meetings', 'video', 'webinar'],
        tools: [
          { id: 'zoom_create_meeting', name: 'Create Meeting', description: 'Create a new Zoom meeting' },
          { id: 'zoom_list_meetings', name: 'List Meetings', description: 'List upcoming meetings' },
          { id: 'zoom_get_recording', name: 'Get Recording', description: 'Retrieve a meeting recording' },
          { id: 'zoom_list_participants', name: 'List Participants', description: 'List participants of a meeting' },
        ],
      },
      {
        id: 'twilio-sms',
        name: 'Twilio SMS & Voice',
        description: 'Send SMS messages, make voice calls, and manage phone numbers with Twilio.',
        version: '1.0.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/twilio',
        license: 'MIT',
        category: 'communication',
        risk: 'high',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23F22F46'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3ET%3C/text%3E%3C/svg%3E",
        tags: ['twilio', 'sms', 'voice', 'phone'],
        tools: [
          { id: 'twilio_send_sms', name: 'Send SMS', description: 'Send an SMS message to a phone number' },
          { id: 'twilio_make_call', name: 'Make Call', description: 'Initiate an outbound voice call' },
          { id: 'twilio_list_messages', name: 'List Messages', description: 'List recent SMS messages' },
        ],
      },
      {
        id: 'sendgrid-email',
        name: 'SendGrid Email',
        description: 'Send transactional and marketing emails via SendGrid. Manage contacts and templates.',
        version: '1.1.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/sendgrid',
        license: 'MIT',
        category: 'communication',
        risk: 'medium',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%231A82E2'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='12'%3ESG%3C/text%3E%3C/svg%3E",
        tags: ['sendgrid', 'email', 'transactional', 'marketing'],
        tools: [
          { id: 'sendgrid_send_email', name: 'Send Email', description: 'Send an email via SendGrid' },
          { id: 'sendgrid_create_template', name: 'Create Template', description: 'Create a dynamic email template' },
          { id: 'sendgrid_add_contact', name: 'Add Contact', description: 'Add a contact to a mailing list' },
          { id: 'sendgrid_get_stats', name: 'Get Stats', description: 'Retrieve email delivery statistics' },
        ],
      },

      // ── Development ───────────────────────────────────────
      {
        id: 'gitlab-ci',
        name: 'GitLab CI/CD',
        description: 'Manage GitLab merge requests, pipelines, and issues. Trigger CI/CD jobs and view logs.',
        version: '1.3.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/gitlab',
        license: 'MIT',
        category: 'development',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/gitlab/FC6D26',
        tags: ['gitlab', 'ci-cd', 'merge-requests', 'pipelines'],
        tools: [
          { id: 'gitlab_create_mr', name: 'Create Merge Request', description: 'Create a new merge request' },
          { id: 'gitlab_trigger_pipeline', name: 'Trigger Pipeline', description: 'Trigger a CI/CD pipeline' },
          { id: 'gitlab_list_issues', name: 'List Issues', description: 'List project issues with filters' },
          { id: 'gitlab_get_pipeline_status', name: 'Pipeline Status', description: 'Get status of a pipeline run' },
        ],
      },
      {
        id: 'bitbucket-repos',
        name: 'Bitbucket Repos',
        description: 'Manage Bitbucket repositories, pull requests, and branch permissions.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/bitbucket',
        license: 'Apache-2.0',
        category: 'development',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/bitbucket/0052CC',
        tags: ['bitbucket', 'git', 'pull-requests', 'code-review'],
        tools: [
          { id: 'bitbucket_create_pr', name: 'Create Pull Request', description: 'Create a new pull request' },
          { id: 'bitbucket_list_repos', name: 'List Repositories', description: 'List repositories in a workspace' },
          { id: 'bitbucket_merge_pr', name: 'Merge Pull Request', description: 'Merge an approved pull request' },
        ],
      },
      {
        id: 'linear-tracker',
        name: 'Linear Issue Tracker',
        description: 'Create and manage Linear issues, projects, and cycles. Streamline engineering workflows.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/linear',
        license: 'MIT',
        category: 'development',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/linear/5E6AD2',
        tags: ['linear', 'issues', 'project-management', 'engineering'],
        tools: [
          { id: 'linear_create_issue', name: 'Create Issue', description: 'Create a new Linear issue' },
          { id: 'linear_update_issue', name: 'Update Issue', description: 'Update issue status, assignee, or priority' },
          { id: 'linear_list_projects', name: 'List Projects', description: 'List all projects in a team' },
          { id: 'linear_search_issues', name: 'Search Issues', description: 'Search issues with filters' },
        ],
      },
      {
        id: 'circleci-pipelines',
        name: 'CircleCI Pipelines',
        description: 'Trigger builds, view pipeline status, and manage CircleCI workflows.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/circleci',
        license: 'MIT',
        category: 'development',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/circleci/343434',
        tags: ['circleci', 'ci-cd', 'builds', 'automation'],
        tools: [
          { id: 'circleci_trigger_pipeline', name: 'Trigger Pipeline', description: 'Trigger a new pipeline run' },
          { id: 'circleci_get_status', name: 'Get Pipeline Status', description: 'Check status of a pipeline' },
          { id: 'circleci_list_artifacts', name: 'List Artifacts', description: 'List build artifacts' },
        ],
      },
      {
        id: 'vercel-deployments',
        name: 'Vercel Deployments',
        description: 'Deploy projects, manage domains, and monitor deployments on Vercel.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/vercel',
        license: 'MIT',
        category: 'development',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/vercel/white',
        tags: ['vercel', 'deployments', 'hosting', 'serverless'],
        tools: [
          { id: 'vercel_create_deployment', name: 'Create Deployment', description: 'Deploy a project to Vercel' },
          { id: 'vercel_list_deployments', name: 'List Deployments', description: 'List recent deployments' },
          { id: 'vercel_manage_domains', name: 'Manage Domains', description: 'Add or remove custom domains' },
          { id: 'vercel_get_logs', name: 'Get Logs', description: 'Retrieve deployment and function logs' },
        ],
      },
      {
        id: 'github-actions',
        name: 'GitHub Actions',
        description: 'Trigger workflows, view run status, and manage GitHub Actions across repositories.',
        version: '1.0.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/github-actions',
        license: 'MIT',
        category: 'development',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/githubactions/2088FF',
        tags: ['github', 'actions', 'ci-cd', 'workflows'],
        tools: [
          { id: 'gha_trigger_workflow', name: 'Trigger Workflow', description: 'Trigger a GitHub Actions workflow' },
          { id: 'gha_list_runs', name: 'List Runs', description: 'List recent workflow runs' },
          { id: 'gha_get_run_status', name: 'Get Run Status', description: 'Get status of a specific run' },
          { id: 'gha_download_artifacts', name: 'Download Artifacts', description: 'Download artifacts from a run' },
        ],
      },

      // ── Productivity ──────────────────────────────────────
      {
        id: 'asana-tasks',
        name: 'Asana Tasks',
        description: 'Create, assign, and track tasks in Asana. Manage projects, sections, and due dates.',
        version: '1.4.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/asana',
        license: 'MIT',
        category: 'productivity',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/asana/F06A6A',
        tags: ['asana', 'tasks', 'project-management', 'collaboration'],
        tools: [
          { id: 'asana_create_task', name: 'Create Task', description: 'Create a new task in a project' },
          { id: 'asana_update_task', name: 'Update Task', description: 'Update task details, assignee, or due date' },
          { id: 'asana_list_tasks', name: 'List Tasks', description: 'List tasks in a project or section' },
          { id: 'asana_complete_task', name: 'Complete Task', description: 'Mark a task as completed' },
        ],
      },
      {
        id: 'monday-boards',
        name: 'Monday.com Boards',
        description: 'Manage boards, items, and columns in Monday.com. Automate status updates and notifications.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/monday',
        license: 'MIT',
        category: 'productivity',
        risk: 'low',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%236C5CE7'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3EM%3C/text%3E%3C/svg%3E",
        tags: ['monday', 'boards', 'project-management', 'workflow'],
        tools: [
          { id: 'monday_create_item', name: 'Create Item', description: 'Create a new item on a board' },
          { id: 'monday_update_item', name: 'Update Item', description: 'Update column values of an item' },
          { id: 'monday_list_boards', name: 'List Boards', description: 'List all boards in the workspace' },
        ],
      },
      {
        id: 'trello-cards',
        name: 'Trello Cards',
        description: 'Create and manage Trello cards, lists, and boards. Move cards across lists and add labels.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/trello',
        license: 'MIT',
        category: 'productivity',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/trello/0052CC',
        tags: ['trello', 'kanban', 'cards', 'project-management'],
        tools: [
          { id: 'trello_create_card', name: 'Create Card', description: 'Create a new card on a list' },
          { id: 'trello_move_card', name: 'Move Card', description: 'Move a card to another list' },
          { id: 'trello_add_label', name: 'Add Label', description: 'Add a label to a card' },
          { id: 'trello_list_boards', name: 'List Boards', description: 'List all boards for a member' },
        ],
      },
      {
        id: 'confluence-wiki',
        name: 'Confluence Wiki',
        description: 'Create, edit, and search Confluence pages and spaces. Manage documentation and knowledge bases.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/confluence',
        license: 'MIT',
        category: 'productivity',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/confluence/172B4D',
        tags: ['confluence', 'wiki', 'documentation', 'knowledge-base'],
        tools: [
          { id: 'confluence_create_page', name: 'Create Page', description: 'Create a new Confluence page' },
          { id: 'confluence_update_page', name: 'Update Page', description: 'Update an existing page' },
          { id: 'confluence_search', name: 'Search Pages', description: 'Search pages using CQL' },
          { id: 'confluence_list_spaces', name: 'List Spaces', description: 'List all Confluence spaces' },
        ],
      },
      {
        id: 'airtable-bases',
        name: 'Airtable Bases',
        description: 'Read, create, and update records in Airtable bases. Query views and manage field configurations.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/airtable',
        license: 'MIT',
        category: 'productivity',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/airtable/18BFFF',
        tags: ['airtable', 'database', 'spreadsheet', 'no-code'],
        tools: [
          { id: 'airtable_list_records', name: 'List Records', description: 'List records from a table with optional filters' },
          { id: 'airtable_create_record', name: 'Create Record', description: 'Create a new record in a table' },
          { id: 'airtable_update_record', name: 'Update Record', description: 'Update fields on an existing record' },
        ],
      },
      {
        id: 'todoist-tasks',
        name: 'Todoist Tasks',
        description: 'Create, complete, and organize tasks in Todoist. Manage projects, labels, and due dates.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/todoist',
        license: 'MIT',
        category: 'productivity',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/todoist/E44332',
        tags: ['todoist', 'tasks', 'to-do', 'personal-productivity'],
        tools: [
          { id: 'todoist_create_task', name: 'Create Task', description: 'Create a new task in Todoist' },
          { id: 'todoist_complete_task', name: 'Complete Task', description: 'Mark a task as completed' },
          { id: 'todoist_list_tasks', name: 'List Tasks', description: 'List tasks with filters' },
          { id: 'todoist_list_projects', name: 'List Projects', description: 'List all projects' },
        ],
      },

      // ── Analytics & Data ──────────────────────────────────
      {
        id: 'google-analytics',
        name: 'Google Analytics',
        description: 'Retrieve website analytics data from Google Analytics 4. Query reports, metrics, and dimensions.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/google-analytics',
        license: 'MIT',
        category: 'analytics',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/googleanalytics/E37400',
        tags: ['google', 'analytics', 'web-analytics', 'reporting'],
        tools: [
          { id: 'ga_run_report', name: 'Run Report', description: 'Run an analytics report with metrics and dimensions' },
          { id: 'ga_get_realtime', name: 'Get Realtime Data', description: 'Get real-time active users and events' },
          { id: 'ga_list_properties', name: 'List Properties', description: 'List all GA4 properties' },
        ],
      },
      {
        id: 'mixpanel-analytics',
        name: 'Mixpanel Analytics',
        description: 'Query Mixpanel events, funnels, and user cohorts. Track product analytics and retention.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/mixpanel',
        license: 'MIT',
        category: 'analytics',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/mixpanel/7856FF',
        tags: ['mixpanel', 'analytics', 'product-analytics', 'events'],
        tools: [
          { id: 'mixpanel_query_events', name: 'Query Events', description: 'Query event data with filters and breakdowns' },
          { id: 'mixpanel_get_funnel', name: 'Get Funnel', description: 'Retrieve funnel conversion data' },
          { id: 'mixpanel_get_retention', name: 'Get Retention', description: 'Get user retention cohort data' },
        ],
      },
      {
        id: 'segment-cdp',
        name: 'Segment CDP',
        description: 'Manage Segment sources, destinations, and tracking plans. Send events and manage user profiles.',
        version: '1.0.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/segment',
        license: 'MIT',
        category: 'data',
        risk: 'medium',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2352BD94'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3ES%3C/text%3E%3C/svg%3E",
        tags: ['segment', 'cdp', 'data-pipeline', 'tracking'],
        tools: [
          { id: 'segment_track_event', name: 'Track Event', description: 'Send a track event to Segment' },
          { id: 'segment_identify_user', name: 'Identify User', description: 'Identify a user with traits' },
          { id: 'segment_list_sources', name: 'List Sources', description: 'List all configured sources' },
          { id: 'segment_list_destinations', name: 'List Destinations', description: 'List all configured destinations' },
        ],
      },
      {
        id: 'datadog-monitoring',
        name: 'Datadog Monitoring',
        description: 'Query metrics, create monitors, and manage alerts in Datadog. Search logs and APM traces.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/datadog',
        license: 'MIT',
        category: 'analytics',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/datadog/632CA6',
        tags: ['datadog', 'monitoring', 'observability', 'alerts'],
        tools: [
          { id: 'datadog_get_metrics', name: 'Get Metrics', description: 'Query time-series metrics data' },
          { id: 'datadog_create_monitor', name: 'Create Monitor', description: 'Create a new alerting monitor' },
          { id: 'datadog_list_alerts', name: 'List Alerts', description: 'List currently triggered alerts' },
          { id: 'datadog_search_logs', name: 'Search Logs', description: 'Search logs with query filters' },
        ],
      },
      {
        id: 'snowflake-warehouse',
        name: 'Snowflake Data Warehouse',
        description: 'Run SQL queries, manage warehouses, and list databases in Snowflake.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/snowflake',
        license: 'Apache-2.0',
        category: 'data',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/snowflake/29B5E8',
        tags: ['snowflake', 'data-warehouse', 'sql', 'analytics'],
        tools: [
          { id: 'snowflake_run_query', name: 'Run Query', description: 'Execute a SQL query on Snowflake' },
          { id: 'snowflake_list_databases', name: 'List Databases', description: 'List available databases and schemas' },
          { id: 'snowflake_get_query_history', name: 'Query History', description: 'View recent query execution history' },
        ],
      },

      // ── Cloud & Infrastructure ────────────────────────────
      {
        id: 'aws-services',
        name: 'AWS Services',
        description: 'Manage AWS resources including S3 buckets, Lambda functions, and EC2 instances.',
        version: '1.3.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/aws',
        license: 'Apache-2.0',
        category: 'cloud',
        risk: 'critical',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23FF9900'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3EA%3C/text%3E%3C/svg%3E",
        tags: ['aws', 'cloud', 's3', 'lambda'],
        tools: [
          { id: 'aws_list_s3_buckets', name: 'List S3 Buckets', description: 'List all S3 buckets in the account' },
          { id: 'aws_invoke_lambda', name: 'Invoke Lambda', description: 'Invoke a Lambda function' },
          { id: 'aws_list_ec2', name: 'List EC2 Instances', description: 'List running EC2 instances' },
          { id: 'aws_get_cloudwatch_metrics', name: 'CloudWatch Metrics', description: 'Retrieve CloudWatch metrics' },
        ],
      },
      {
        id: 'google-cloud',
        name: 'Google Cloud Platform',
        description: 'Manage GCP resources including Cloud Storage, Compute Engine, and BigQuery.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/gcp',
        license: 'Apache-2.0',
        category: 'cloud',
        risk: 'critical',
        icon: 'https://cdn.simpleicons.org/googlecloud/4285F4',
        tags: ['gcp', 'cloud', 'bigquery', 'compute'],
        tools: [
          { id: 'gcp_list_buckets', name: 'List Buckets', description: 'List Cloud Storage buckets' },
          { id: 'gcp_run_bigquery', name: 'Run BigQuery', description: 'Execute a BigQuery SQL query' },
          { id: 'gcp_list_instances', name: 'List Instances', description: 'List Compute Engine instances' },
        ],
      },
      {
        id: 'cloudflare-cdn',
        name: 'Cloudflare',
        description: 'Manage Cloudflare DNS records, firewall rules, and Workers. Purge cache and view analytics.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/cloudflare',
        license: 'MIT',
        category: 'cloud',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/cloudflare/F38020',
        tags: ['cloudflare', 'cdn', 'dns', 'workers'],
        tools: [
          { id: 'cf_list_dns_records', name: 'List DNS Records', description: 'List DNS records for a zone' },
          { id: 'cf_create_dns_record', name: 'Create DNS Record', description: 'Create a new DNS record' },
          { id: 'cf_purge_cache', name: 'Purge Cache', description: 'Purge cached content for a zone' },
          { id: 'cf_list_workers', name: 'List Workers', description: 'List deployed Cloudflare Workers' },
        ],
      },
      {
        id: 'docker-containers',
        name: 'Docker Containers',
        description: 'Manage Docker containers, images, and volumes. Start, stop, and inspect running containers.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/docker',
        license: 'Apache-2.0',
        category: 'cloud',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/docker/2496ED',
        tags: ['docker', 'containers', 'devops', 'images'],
        tools: [
          { id: 'docker_list_containers', name: 'List Containers', description: 'List running and stopped containers' },
          { id: 'docker_start_container', name: 'Start Container', description: 'Start a stopped container' },
          { id: 'docker_stop_container', name: 'Stop Container', description: 'Stop a running container' },
          { id: 'docker_inspect', name: 'Inspect Container', description: 'Get detailed container information' },
        ],
      },
      {
        id: 'kubernetes-cluster',
        name: 'Kubernetes Cluster',
        description: 'Manage Kubernetes pods, deployments, and services. Scale workloads and view cluster status.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/kubernetes',
        license: 'Apache-2.0',
        category: 'cloud',
        risk: 'critical',
        icon: 'https://cdn.simpleicons.org/kubernetes/326CE5',
        tags: ['kubernetes', 'k8s', 'orchestration', 'containers'],
        tools: [
          { id: 'k8s_list_pods', name: 'List Pods', description: 'List pods in a namespace' },
          { id: 'k8s_scale_deployment', name: 'Scale Deployment', description: 'Scale a deployment up or down' },
          { id: 'k8s_get_logs', name: 'Get Pod Logs', description: 'Retrieve logs from a pod' },
          { id: 'k8s_list_services', name: 'List Services', description: 'List services in a namespace' },
        ],
      },
      {
        id: 'terraform-iac',
        name: 'Terraform IaC',
        description: 'Plan, apply, and manage Terraform infrastructure. View state and manage workspaces.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/terraform',
        license: 'Apache-2.0',
        category: 'cloud',
        risk: 'critical',
        icon: 'https://cdn.simpleicons.org/terraform/844FBA',
        tags: ['terraform', 'iac', 'infrastructure', 'devops'],
        tools: [
          { id: 'tf_plan', name: 'Terraform Plan', description: 'Generate and show an execution plan' },
          { id: 'tf_apply', name: 'Terraform Apply', description: 'Apply the planned changes to infrastructure' },
          { id: 'tf_list_state', name: 'List State', description: 'List resources in the current state' },
        ],
      },

      // ── CRM & Sales ───────────────────────────────────────
      {
        id: 'hubspot-crm',
        name: 'HubSpot CRM',
        description: 'Manage HubSpot contacts, deals, companies, and tickets. Automate sales and marketing workflows.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/hubspot',
        license: 'MIT',
        category: 'sales',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/hubspot/FF7A59',
        tags: ['hubspot', 'crm', 'sales', 'marketing'],
        tools: [
          { id: 'hubspot_create_contact', name: 'Create Contact', description: 'Create a new contact in HubSpot' },
          { id: 'hubspot_update_deal', name: 'Update Deal', description: 'Update a deal stage or properties' },
          { id: 'hubspot_list_companies', name: 'List Companies', description: 'List companies with filters' },
          { id: 'hubspot_search_contacts', name: 'Search Contacts', description: 'Search contacts by name, email, or properties' },
        ],
      },
      {
        id: 'pipedrive-deals',
        name: 'Pipedrive Deals',
        description: 'Manage Pipedrive deals, contacts, and organizations. Track sales pipeline and activities.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/pipedrive',
        license: 'MIT',
        category: 'sales',
        risk: 'medium',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23017737'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3EP%3C/text%3E%3C/svg%3E",
        tags: ['pipedrive', 'crm', 'sales', 'pipeline'],
        tools: [
          { id: 'pipedrive_create_deal', name: 'Create Deal', description: 'Create a new deal in Pipedrive' },
          { id: 'pipedrive_update_deal', name: 'Update Deal', description: 'Update deal stage or value' },
          { id: 'pipedrive_list_activities', name: 'List Activities', description: 'List scheduled and completed activities' },
        ],
      },
      {
        id: 'intercom-support',
        name: 'Intercom Messenger',
        description: 'Manage Intercom conversations, contacts, and articles. Automate customer communication.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/intercom',
        license: 'MIT',
        category: 'customer-support',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/intercom/6AFDEF',
        tags: ['intercom', 'support', 'messaging', 'customer-success'],
        tools: [
          { id: 'intercom_reply_conversation', name: 'Reply to Conversation', description: 'Send a reply in an Intercom conversation' },
          { id: 'intercom_create_contact', name: 'Create Contact', description: 'Create a new lead or user contact' },
          { id: 'intercom_search_articles', name: 'Search Articles', description: 'Search help center articles' },
          { id: 'intercom_list_conversations', name: 'List Conversations', description: 'List open conversations' },
        ],
      },
      {
        id: 'zendesk-tickets',
        name: 'Zendesk Tickets',
        description: 'Create, update, and resolve Zendesk support tickets. Manage users, organizations, and macros.',
        version: '1.3.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/zendesk',
        license: 'MIT',
        category: 'customer-support',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/zendesk/03363D',
        tags: ['zendesk', 'support', 'tickets', 'helpdesk'],
        tools: [
          { id: 'zendesk_create_ticket', name: 'Create Ticket', description: 'Create a new support ticket' },
          { id: 'zendesk_update_ticket', name: 'Update Ticket', description: 'Update ticket status, priority, or assignee' },
          { id: 'zendesk_search_tickets', name: 'Search Tickets', description: 'Search tickets with filters' },
          { id: 'zendesk_list_users', name: 'List Users', description: 'List end users and agents' },
        ],
      },

      // ── Marketing ─────────────────────────────────────────
      {
        id: 'mailchimp-campaigns',
        name: 'Mailchimp Campaigns',
        description: 'Create and send Mailchimp email campaigns. Manage audiences, segments, and templates.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/mailchimp',
        license: 'MIT',
        category: 'marketing',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/mailchimp/FFE01B',
        tags: ['mailchimp', 'email-marketing', 'campaigns', 'newsletters'],
        tools: [
          { id: 'mailchimp_create_campaign', name: 'Create Campaign', description: 'Create a new email campaign' },
          { id: 'mailchimp_send_campaign', name: 'Send Campaign', description: 'Send a campaign to an audience' },
          { id: 'mailchimp_add_subscriber', name: 'Add Subscriber', description: 'Add a subscriber to an audience' },
          { id: 'mailchimp_get_report', name: 'Get Report', description: 'Get campaign performance report' },
        ],
      },
      {
        id: 'google-ads',
        name: 'Google Ads',
        description: 'Manage Google Ads campaigns, ad groups, and keywords. Retrieve performance reports and metrics.',
        version: '1.0.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/google-ads',
        license: 'MIT',
        category: 'marketing',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/googleads/4285F4',
        tags: ['google-ads', 'advertising', 'ppc', 'sem'],
        tools: [
          { id: 'gads_list_campaigns', name: 'List Campaigns', description: 'List all campaigns in the account' },
          { id: 'gads_get_performance', name: 'Get Performance', description: 'Get campaign performance metrics' },
          { id: 'gads_update_budget', name: 'Update Budget', description: 'Update a campaign budget' },
        ],
      },

      // ── Finance ───────────────────────────────────────────
      {
        id: 'quickbooks-accounting',
        name: 'QuickBooks Accounting',
        description: 'Manage QuickBooks invoices, expenses, and customers. Generate financial reports and summaries.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/quickbooks',
        license: 'MIT',
        category: 'finance',
        risk: 'high',
        icon: 'https://cdn.simpleicons.org/quickbooks/2CA01C',
        tags: ['quickbooks', 'accounting', 'invoices', 'finance'],
        tools: [
          { id: 'qb_create_invoice', name: 'Create Invoice', description: 'Create a new invoice for a customer' },
          { id: 'qb_list_expenses', name: 'List Expenses', description: 'List recent expenses and purchases' },
          { id: 'qb_get_report', name: 'Get Report', description: 'Generate a financial report (P&L, balance sheet)' },
          { id: 'qb_list_customers', name: 'List Customers', description: 'List all customers' },
        ],
      },

      // ── Design ────────────────────────────────────────────
      {
        id: 'figma-design',
        name: 'Figma Design',
        description: 'Export assets, list files, and retrieve comments from Figma projects. Manage design components.',
        version: '1.1.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/figma',
        license: 'MIT',
        category: 'design',
        risk: 'low',
        icon: 'https://cdn.simpleicons.org/figma/F24E1E',
        tags: ['figma', 'design', 'assets', 'components'],
        tools: [
          { id: 'figma_export_assets', name: 'Export Assets', description: 'Export images and assets from a Figma file' },
          { id: 'figma_list_files', name: 'List Files', description: 'List files in a Figma project' },
          { id: 'figma_get_comments', name: 'Get Comments', description: 'Retrieve comments on a Figma file' },
          { id: 'figma_create_component', name: 'Create Component', description: 'Create a reusable design component' },
        ],
      },
      {
        id: 'canva-design',
        name: 'Canva Design',
        description: 'Create designs, manage templates, and export assets from Canva. Automate social media graphics.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/canva',
        license: 'MIT',
        category: 'design',
        risk: 'low',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300C4CC'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3EC%3C/text%3E%3C/svg%3E",
        tags: ['canva', 'design', 'graphics', 'templates'],
        tools: [
          { id: 'canva_create_design', name: 'Create Design', description: 'Create a new design from a template' },
          { id: 'canva_export_design', name: 'Export Design', description: 'Export a design as PNG, PDF, or SVG' },
          { id: 'canva_list_templates', name: 'List Templates', description: 'List available design templates' },
        ],
      },

      // ── Storage & Docs ────────────────────────────────────
      {
        id: 'dropbox-storage',
        name: 'Dropbox Storage',
        description: 'Upload, download, and manage files in Dropbox. Share folders and create file requests.',
        version: '1.0.0',
        author: 'community',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/dropbox',
        license: 'MIT',
        category: 'productivity',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/dropbox/0061FF',
        tags: ['dropbox', 'storage', 'files', 'sharing'],
        tools: [
          { id: 'dropbox_upload_file', name: 'Upload File', description: 'Upload a file to Dropbox' },
          { id: 'dropbox_download_file', name: 'Download File', description: 'Download a file from Dropbox' },
          { id: 'dropbox_list_files', name: 'List Files', description: 'List files in a folder' },
          { id: 'dropbox_share_folder', name: 'Share Folder', description: 'Share a folder with collaborators' },
        ],
      },
      {
        id: 'google-drive',
        name: 'Google Drive',
        description: 'Upload, download, and organize files in Google Drive. Manage sharing permissions and folders.',
        version: '1.2.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/google-drive',
        license: 'MIT',
        category: 'productivity',
        risk: 'medium',
        icon: 'https://cdn.simpleicons.org/googledrive/4285F4',
        tags: ['google-drive', 'storage', 'files', 'collaboration'],
        tools: [
          { id: 'gdrive_upload_file', name: 'Upload File', description: 'Upload a file to Google Drive' },
          { id: 'gdrive_list_files', name: 'List Files', description: 'List files and folders' },
          { id: 'gdrive_share_file', name: 'Share File', description: 'Share a file or folder with users' },
          { id: 'gdrive_search_files', name: 'Search Files', description: 'Search files by name or content' },
        ],
      },
      {
        id: 'docusign-esign',
        name: 'DocuSign eSignature',
        description: 'Send documents for electronic signature, track envelope status, and manage templates.',
        version: '1.0.0',
        author: 'agenticmail',
        repository: 'https://github.com/agenticmail/enterprise/tree/main/community-skills/docusign',
        license: 'MIT',
        category: 'legal',
        risk: 'high',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23FFCD00'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='700' font-size='16'%3ED%3C/text%3E%3C/svg%3E",
        tags: ['docusign', 'esignature', 'contracts', 'legal'],
        tools: [
          { id: 'docusign_send_envelope', name: 'Send Envelope', description: 'Send a document for electronic signature' },
          { id: 'docusign_get_status', name: 'Get Envelope Status', description: 'Check the status of a sent envelope' },
          { id: 'docusign_list_templates', name: 'List Templates', description: 'List available signing templates' },
        ],
      },
    ];

    for (const seed of seeds) {
      const existing = this.index.get(seed.id);
      const skill: IndexedCommunitySkill = {
        ...(existing || {}),
        ...seed,
        downloads: existing?.downloads ?? (Math.floor(Math.random() * 500) + 50),
        rating: existing?.rating ?? (Math.round((3.5 + Math.random() * 1.5) * 10) / 10),
        ratingCount: existing?.ratingCount ?? (Math.floor(Math.random() * 30) + 5),
        verified: seed.author === 'agenticmail',
        featured: ['github-issues', 'slack-notifications', 'hubspot-crm', 'datadog-monitoring', 'asana-tasks'].includes(seed.id),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.index.set(skill.id, skill);
      if (this.engineDb) await this.engineDb.upsertCommunitySkill(skill);
    }
  }
}

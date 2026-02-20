/**
 * Knowledge Contribution System
 *
 * Agents contribute knowledge from their memory to shared knowledge bases,
 * categorized by role and domain. Future agents in the same role get
 * bootstrapped with this collective knowledge.
 *
 * - Weekly scheduled contribution cycles
 * - Role-based knowledge bases (support, sales, engineering, etc.)
 * - Category taxonomy within each base
 * - Quality scoring, deduplication, and decay
 * - Contribution approval workflow (optional)
 */

// ─── Types ──────────────────────────────────────────────

export type KnowledgeRole =
  | 'support'
  | 'sales'
  | 'engineering'
  | 'operations'
  | 'hr'
  | 'finance'
  | 'legal'
  | 'marketing'
  | 'research'
  | 'security'
  | 'executive'
  | 'general';

export interface KnowledgeBase {
  id: string;
  orgId: string;
  name: string;
  description: string;
  role: KnowledgeRole;
  categories: KnowledgeCategory[];
  contributorCount: number;
  entryCount: number;
  lastContributionAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  entryCount: number;
}

export interface KnowledgeEntry {
  id: string;
  baseId: string;
  orgId: string;
  categoryId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  sourceAgentId: string;
  sourceMemoryId?: string;
  confidence: number;
  qualityScore: number;
  useCount: number;
  voteUp: number;
  voteDown: number;
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface ContributionSchedule {
  id: string;
  orgId: string;
  agentId: string;
  baseId: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  lastRunAt?: string;
  nextRunAt: string;
  enabled: boolean;
  filters: {
    minConfidence: number;
    categories?: string[];
    minImportance?: string;
  };
  createdAt: string;
}

export interface ContributionCycle {
  id: string;
  orgId: string;
  agentId: string;
  baseId: string;
  scheduleId: string;
  status: 'running' | 'completed' | 'failed';
  memoriesScanned: number;
  entriesContributed: number;
  duplicatesSkipped: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Compute a simple Jaccard-like similarity between two strings based on word-level token overlap. */
function contentSimilarity(a: string, b: string): number {
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>();
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length > 2) tokens.add(w);
    }
    return tokens;
  };

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/** Compute a quality score from votes, usage, and freshness. */
function computeQualityScore(entry: {
  voteUp: number;
  voteDown: number;
  useCount: number;
  confidence: number;
  createdAt: string;
}): number {
  // Vote component: net votes (capped at reasonable range)
  const netVotes = entry.voteUp - entry.voteDown;
  const voteScore = Math.min(1, Math.max(0, (netVotes + 5) / 10)); // -5..+5 -> 0..1

  // Usage component: logarithmic usage
  const usageScore = Math.min(1, Math.log1p(entry.useCount) / Math.log1p(50)); // 0..50 -> 0..1

  // Freshness component: decay over 180 days
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  const ageDays = ageMs / 86_400_000;
  const freshnessScore = Math.max(0.1, 1 - (ageDays / 180));

  // Weighted combination
  const quality = (
    entry.confidence * 0.3 +
    voteScore * 0.25 +
    usageScore * 0.25 +
    freshnessScore * 0.2
  );

  return parseFloat(Math.min(1, Math.max(0, quality)).toFixed(4));
}

/** Compute the next run timestamp from a frequency and optional dayOfWeek. */
function computeNextRunAt(frequency: ContributionSchedule['frequency'], dayOfWeek?: number): string {
  const now = new Date();
  let next: Date;

  switch (frequency) {
    case 'daily':
      next = new Date(now.getTime() + 86_400_000);
      break;
    case 'weekly': {
      next = new Date(now.getTime());
      const targetDay = dayOfWeek ?? 1; // default Monday
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      next.setHours(2, 0, 0, 0); // 2 AM
      break;
    }
    case 'biweekly': {
      next = new Date(now.getTime());
      const targetDay2 = dayOfWeek ?? 1;
      const currentDay2 = now.getDay();
      let daysUntil2 = targetDay2 - currentDay2;
      if (daysUntil2 <= 0) daysUntil2 += 7;
      next.setDate(next.getDate() + daysUntil2 + 7);
      next.setHours(2, 0, 0, 0);
      break;
    }
    case 'monthly':
      next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 2, 0, 0, 0);
      break;
    default:
      next = new Date(now.getTime() + 7 * 86_400_000);
  }

  return next.toISOString();
}

// ─── Available Roles ────────────────────────────────────

const AVAILABLE_ROLES: Array<{ id: KnowledgeRole; name: string; description: string }> = [
  { id: 'support', name: 'Support', description: 'Customer support and success teams' },
  { id: 'sales', name: 'Sales', description: 'Sales and business development teams' },
  { id: 'engineering', name: 'Engineering', description: 'Software engineering and development teams' },
  { id: 'operations', name: 'Operations', description: 'Business operations teams' },
  { id: 'hr', name: 'Human Resources', description: 'HR and people operations teams' },
  { id: 'finance', name: 'Finance', description: 'Finance and accounting teams' },
  { id: 'legal', name: 'Legal', description: 'Legal and compliance teams' },
  { id: 'marketing', name: 'Marketing', description: 'Marketing and growth teams' },
  { id: 'research', name: 'Research', description: 'Research and data science teams' },
  { id: 'security', name: 'Security', description: 'Information security teams' },
  { id: 'executive', name: 'Executive', description: 'Executive leadership and strategy' },
  { id: 'general', name: 'General', description: 'Cross-functional shared knowledge' },
];

// ─── Default Category Taxonomy ──────────────────────────

const ROLE_CATEGORIES: Record<string, Omit<KnowledgeCategory, 'entryCount'>[]> = {
  support: [
    { id: 'troubleshooting', name: 'Troubleshooting', description: 'Common issues and solutions' },
    { id: 'product-knowledge', name: 'Product Knowledge', description: 'Product features, limitations, and workarounds' },
    { id: 'customer-patterns', name: 'Customer Patterns', description: 'Common customer behaviors and needs' },
    { id: 'escalation-playbooks', name: 'Escalation Playbooks', description: 'When and how to escalate issues' },
    { id: 'faq-responses', name: 'FAQ Responses', description: 'Frequently asked questions and best responses' },
    { id: 'tools-integrations', name: 'Tools & Integrations', description: 'How to use support tools effectively' },
  ],
  sales: [
    { id: 'objection-handling', name: 'Objection Handling', description: 'Responses to common objections' },
    { id: 'competitor-intel', name: 'Competitor Intelligence', description: 'Competitor strengths, weaknesses, positioning' },
    { id: 'pricing-strategies', name: 'Pricing Strategies', description: 'Effective pricing and discount approaches' },
    { id: 'qualification-criteria', name: 'Qualification Criteria', description: 'Lead qualification patterns' },
    { id: 'pitch-templates', name: 'Pitch Templates', description: 'Effective pitch structures and talking points' },
    { id: 'deal-patterns', name: 'Deal Patterns', description: 'Successful deal closure patterns' },
  ],
  engineering: [
    { id: 'architecture-decisions', name: 'Architecture Decisions', description: 'ADRs and design rationale' },
    { id: 'debugging-patterns', name: 'Debugging Patterns', description: 'Common bugs and debugging approaches' },
    { id: 'code-standards', name: 'Code Standards', description: 'Coding conventions and best practices' },
    { id: 'infrastructure', name: 'Infrastructure', description: 'Infrastructure setup and operations knowledge' },
    { id: 'incident-learnings', name: 'Incident Learnings', description: 'Post-mortem insights and prevention' },
    { id: 'tool-configs', name: 'Tool Configurations', description: 'Development tool setups and configs' },
  ],
  operations: [
    { id: 'process-docs', name: 'Process Documentation', description: 'Standard operating procedures' },
    { id: 'vendor-management', name: 'Vendor Management', description: 'Vendor relationships and negotiations' },
    { id: 'compliance-notes', name: 'Compliance Notes', description: 'Regulatory compliance knowledge' },
    { id: 'efficiency-tips', name: 'Efficiency Tips', description: 'Process optimization insights' },
  ],
  hr: [
    { id: 'policy-interpretations', name: 'Policy Interpretations', description: 'HR policy applications and edge cases' },
    { id: 'interview-guides', name: 'Interview Guides', description: 'Interview questions and evaluation criteria' },
    { id: 'onboarding-tips', name: 'Onboarding Tips', description: 'Employee onboarding best practices' },
    { id: 'benefits-faq', name: 'Benefits FAQ', description: 'Benefits questions and answers' },
  ],
  finance: [
    { id: 'accounting-procedures', name: 'Accounting Procedures', description: 'Standard accounting workflows' },
    { id: 'tax-knowledge', name: 'Tax Knowledge', description: 'Tax rules and compliance notes' },
    { id: 'budget-templates', name: 'Budget Templates', description: 'Budget planning templates and guides' },
    { id: 'audit-prep', name: 'Audit Preparation', description: 'Audit preparation checklists and tips' },
  ],
  legal: [
    { id: 'contract-templates', name: 'Contract Templates', description: 'Standard contract clauses and templates' },
    { id: 'regulatory-updates', name: 'Regulatory Updates', description: 'Regulatory changes and implications' },
    { id: 'risk-assessments', name: 'Risk Assessments', description: 'Legal risk evaluation patterns' },
  ],
  marketing: [
    { id: 'campaign-playbooks', name: 'Campaign Playbooks', description: 'Successful campaign strategies' },
    { id: 'content-guidelines', name: 'Content Guidelines', description: 'Brand voice and content standards' },
    { id: 'channel-strategies', name: 'Channel Strategies', description: 'Channel-specific marketing approaches' },
    { id: 'analytics-insights', name: 'Analytics Insights', description: 'Marketing analytics patterns' },
  ],
  research: [
    { id: 'methodologies', name: 'Research Methodologies', description: 'Research methods and frameworks' },
    { id: 'data-sources', name: 'Data Sources', description: 'Useful data sources and APIs' },
    { id: 'findings-library', name: 'Findings Library', description: 'Key research findings and insights' },
  ],
  security: [
    { id: 'threat-intel', name: 'Threat Intelligence', description: 'Known threats and attack patterns' },
    { id: 'incident-response', name: 'Incident Response', description: 'IR procedures and playbooks' },
    { id: 'security-configs', name: 'Security Configurations', description: 'Hardening guides and configs' },
  ],
  executive: [
    { id: 'strategy-frameworks', name: 'Strategy Frameworks', description: 'Strategic planning frameworks' },
    { id: 'market-analysis', name: 'Market Analysis', description: 'Market trends and analysis' },
    { id: 'decision-frameworks', name: 'Decision Frameworks', description: 'Decision-making frameworks and criteria' },
  ],
  general: [
    { id: 'best-practices', name: 'Best Practices', description: 'Cross-functional best practices' },
    { id: 'tools-guides', name: 'Tools & Guides', description: 'Tool usage guides and tips' },
    { id: 'lessons-learned', name: 'Lessons Learned', description: 'Cross-team lessons learned' },
    { id: 'templates', name: 'Templates', description: 'Reusable templates and frameworks' },
  ],
};

// ─── Memory Callback Type ───────────────────────────────

export type MemoryCallback = (agentId: string) => Promise<MemoryItem[]>;

/** Shape of a memory item returned by the memory callback. */
export interface MemoryItem {
  id: string;
  agentId: string;
  orgId: string;
  category: string;
  title: string;
  content: string;
  source: string;
  importance: string;
  confidence: number;
  tags: string[];
  createdAt: string;
}

// ─── Knowledge Contribution Manager ────────────────────

export class KnowledgeContributionManager {
  private bases = new Map<string, KnowledgeBase>();
  private entries = new Map<string, KnowledgeEntry>();
  private schedules = new Map<string, ContributionSchedule>();
  private cycles = new Map<string, ContributionCycle>();
  private memoryCallback?: MemoryCallback;
  private schedulerTimer?: ReturnType<typeof setInterval>;

  /** Per-base index: baseId -> Set of entry IDs for O(1) base lookups */
  private baseEntryIndex = new Map<string, Set<string>>();
  /** Per-agent index: agentId -> Set of entry IDs */
  private agentEntryIndex = new Map<string, Set<string>>();
  /** Per-agent schedule index: agentId -> scheduleId */
  private agentScheduleIndex = new Map<string, string>();
  /** Contributor tracking: baseId -> Set of agent IDs that contributed */
  private baseContributors = new Map<string, Set<string>>();

  constructor(opts?: { memoryCallback?: MemoryCallback }) {
    this.memoryCallback = opts?.memoryCallback;
  }

  // ─── Index Helpers ──────────────────────────────────

  private indexEntryAdd(entry: KnowledgeEntry): void {
    // Base index
    let baseSet = this.baseEntryIndex.get(entry.baseId);
    if (!baseSet) { baseSet = new Set(); this.baseEntryIndex.set(entry.baseId, baseSet); }
    baseSet.add(entry.id);

    // Agent index
    let agentSet = this.agentEntryIndex.get(entry.sourceAgentId);
    if (!agentSet) { agentSet = new Set(); this.agentEntryIndex.set(entry.sourceAgentId, agentSet); }
    agentSet.add(entry.id);

    // Contributor tracking
    let contributors = this.baseContributors.get(entry.baseId);
    if (!contributors) { contributors = new Set(); this.baseContributors.set(entry.baseId, contributors); }
    contributors.add(entry.sourceAgentId);
  }

  private indexEntryRemove(entry: KnowledgeEntry): void {
    const baseSet = this.baseEntryIndex.get(entry.baseId);
    if (baseSet) { baseSet.delete(entry.id); if (baseSet.size === 0) this.baseEntryIndex.delete(entry.baseId); }

    const agentSet = this.agentEntryIndex.get(entry.sourceAgentId);
    if (agentSet) { agentSet.delete(entry.id); if (agentSet.size === 0) this.agentEntryIndex.delete(entry.sourceAgentId); }
  }

  private getEntriesForBase(baseId: string): KnowledgeEntry[] {
    const ids = this.baseEntryIndex.get(baseId);
    if (!ids || ids.size === 0) return [];
    const result: KnowledgeEntry[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) result.push(entry);
    }
    return result;
  }

  private getEntriesForAgent(agentId: string): KnowledgeEntry[] {
    const ids = this.agentEntryIndex.get(agentId);
    if (!ids || ids.size === 0) return [];
    const result: KnowledgeEntry[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) result.push(entry);
    }
    return result;
  }

  // ─── Knowledge Base CRUD ────────────────────────────

  /**
   * Create a knowledge base.
   * Accepts either (orgId, { name, description, role }) positional args
   * or a single object { orgId, name, description, role, createdBy? }.
   */
  createBase(
    orgIdOrOpts: string | { orgId: string; name: string; description: string; role: string; createdBy?: string },
    opts?: { name: string; description: string; role: string },
  ): KnowledgeBase {
    let orgId: string;
    let name: string;
    let description: string;
    let role: string;

    if (typeof orgIdOrOpts === 'object') {
      orgId = orgIdOrOpts.orgId;
      name = orgIdOrOpts.name;
      description = orgIdOrOpts.description;
      role = orgIdOrOpts.role;
    } else {
      orgId = orgIdOrOpts;
      if (!opts) throw new Error('Options required when orgId is a string');
      name = opts.name;
      description = opts.description;
      role = opts.role;
    }

    const now = new Date().toISOString();
    const roleCategories = ROLE_CATEGORIES[role] || ROLE_CATEGORIES.general;
    const categories: KnowledgeCategory[] = roleCategories.map(c => ({
      ...c,
      entryCount: 0,
    }));

    const base: KnowledgeBase = {
      id: uid(),
      orgId,
      name,
      description,
      role: role as KnowledgeRole,
      categories,
      contributorCount: 0,
      entryCount: 0,
      lastContributionAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.bases.set(base.id, base);
    return base;
  }

  getBase(baseId: string): KnowledgeBase | undefined {
    return this.bases.get(baseId);
  }

  /**
   * List knowledge bases for an org.
   * The second argument can be a string (role name) or { role? } filter object.
   */
  listBases(orgId: string, filters?: string | { role?: KnowledgeRole }): KnowledgeBase[] {
    let results = Array.from(this.bases.values()).filter(b => b.orgId === orgId);

    const roleFilter = typeof filters === 'string' ? filters : filters?.role;
    if (roleFilter) {
      results = results.filter(b => b.role === roleFilter);
    }

    return results;
  }

  /**
   * Delete a knowledge base and all associated entries, schedules, and contributor tracking.
   */
  deleteBase(baseId: string, _userId?: string): void {
    const base = this.bases.get(baseId);
    if (!base) return;

    // Remove all entries for this base
    const entryIds = this.baseEntryIndex.get(baseId);
    if (entryIds) {
      for (const id of entryIds) {
        const entry = this.entries.get(id);
        if (entry) {
          const agentSet = this.agentEntryIndex.get(entry.sourceAgentId);
          if (agentSet) { agentSet.delete(id); if (agentSet.size === 0) this.agentEntryIndex.delete(entry.sourceAgentId); }
        }
        this.entries.delete(id);
      }
      this.baseEntryIndex.delete(baseId);
    }

    // Remove contributor tracking
    this.baseContributors.delete(baseId);

    // Remove schedules targeting this base
    for (const [scheduleId, schedule] of Array.from(this.schedules.entries())) {
      if (schedule.baseId === baseId) {
        this.agentScheduleIndex.delete(schedule.agentId);
        this.schedules.delete(scheduleId);
      }
    }

    this.bases.delete(baseId);
  }

  // ─── Roles ──────────────────────────────────────────

  /** List all available roles with metadata. */
  listRoles(): Array<{ id: KnowledgeRole; name: string; description: string; categoryCount: number }> {
    return AVAILABLE_ROLES.map(r => ({
      ...r,
      categoryCount: (ROLE_CATEGORIES[r.id] || []).length,
    }));
  }

  // ─── Category Management ────────────────────────────

  addCategory(baseId: string, category: { id?: string; name: string; description: string; parentId?: string }): KnowledgeCategory {
    const base = this.bases.get(baseId);
    if (!base) throw new Error(`Knowledge base ${baseId} not found`);

    const cat: KnowledgeCategory = {
      id: category.id || uid(),
      name: category.name,
      description: category.description,
      parentId: category.parentId,
      entryCount: 0,
    };

    // Check for duplicate ID
    const existing = base.categories.find(c => c.id === cat.id);
    if (existing) throw new Error(`Category ${cat.id} already exists in base ${baseId}`);

    base.categories.push(cat);
    base.updatedAt = new Date().toISOString();
    return cat;
  }

  removeCategory(baseId: string, categoryId: string): void {
    const base = this.bases.get(baseId);
    if (!base) throw new Error(`Knowledge base ${baseId} not found`);

    const idx = base.categories.findIndex(c => c.id === categoryId);
    if (idx < 0) throw new Error(`Category ${categoryId} not found in base ${baseId}`);

    base.categories.splice(idx, 1);
    base.updatedAt = new Date().toISOString();
  }

  getCategoriesForRole(role: string): KnowledgeCategory[] {
    const defs = ROLE_CATEGORIES[role] || ROLE_CATEGORIES.general;
    return defs.map(d => ({ ...d, entryCount: 0 }));
  }

  // ─── Entries ────────────────────────────────────────

  /**
   * Low-level contribute: all fields provided explicitly including baseId and orgId.
   * Used internally by contribution cycles.
   */
  contribute(opts: {
    baseId: string;
    orgId: string;
    categoryId: string;
    title: string;
    content: string;
    summary: string;
    tags: string[];
    sourceAgentId: string;
    sourceMemoryId?: string;
    confidence: number;
  }): KnowledgeEntry {
    const base = this.bases.get(opts.baseId);
    if (!base) throw new Error(`Knowledge base ${opts.baseId} not found`);

    // Validate category exists in the base
    const category = base.categories.find(c => c.id === opts.categoryId);
    if (!category) throw new Error(`Category ${opts.categoryId} not found in base ${opts.baseId}`);

    const now = new Date().toISOString();

    const entry: KnowledgeEntry = {
      id: uid(),
      baseId: opts.baseId,
      orgId: opts.orgId,
      categoryId: opts.categoryId,
      title: opts.title,
      content: opts.content,
      summary: opts.summary,
      tags: [...opts.tags],
      sourceAgentId: opts.sourceAgentId,
      sourceMemoryId: opts.sourceMemoryId,
      confidence: Math.min(1, Math.max(0, opts.confidence)),
      qualityScore: 0,
      useCount: 0,
      voteUp: 0,
      voteDown: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    // Compute initial quality score
    entry.qualityScore = computeQualityScore(entry);

    this.entries.set(entry.id, entry);
    this.indexEntryAdd(entry);

    // Update base stats
    base.entryCount = (this.baseEntryIndex.get(opts.baseId)?.size) || 0;
    base.contributorCount = (this.baseContributors.get(opts.baseId)?.size) || 0;
    base.lastContributionAt = now;
    base.updatedAt = now;

    // Update category entry count
    category.entryCount = this.getEntriesForBase(opts.baseId)
      .filter(e => e.categoryId === opts.categoryId).length;

    return entry;
  }

  /**
   * Route-friendly contribute: baseId as first arg, entry fields as second arg.
   * Resolves orgId from the base.
   */
  contributeEntry(baseId: string, opts: {
    categoryId: string;
    title: string;
    content: string;
    summary?: string;
    tags?: string[];
    sourceAgentId?: string;
    sourceMemoryId?: string;
    confidence?: number;
    contributedBy?: string;
  }): KnowledgeEntry {
    const base = this.bases.get(baseId);
    if (!base) throw new Error(`Knowledge base ${baseId} not found`);

    return this.contribute({
      baseId,
      orgId: base.orgId,
      categoryId: opts.categoryId,
      title: opts.title,
      content: opts.content,
      summary: opts.summary || '',
      tags: opts.tags || [],
      sourceAgentId: opts.sourceAgentId || opts.contributedBy || 'unknown',
      sourceMemoryId: opts.sourceMemoryId,
      confidence: opts.confidence ?? 1.0,
    });
  }

  getEntry(entryId: string): KnowledgeEntry | undefined {
    return this.entries.get(entryId);
  }

  listEntries(baseId: string, filters?: {
    categoryId?: string;
    status?: KnowledgeEntry['status'];
    minQuality?: number;
    search?: string;
    limit?: number;
    offset?: number;
  }): { entries: KnowledgeEntry[]; total: number } {
    let results = this.getEntriesForBase(baseId);

    if (filters?.categoryId) {
      results = results.filter(e => e.categoryId === filters.categoryId);
    }

    if (filters?.status) {
      results = results.filter(e => e.status === filters.status);
    }

    if (filters?.minQuality !== undefined) {
      results = results.filter(e => e.qualityScore >= filters.minQuality!);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort by quality score descending
    results.sort((a, b) => b.qualityScore - a.qualityScore);

    const total = results.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const paged = results.slice(offset, offset + limit);

    return { entries: paged, total };
  }

  approveEntry(entryId: string, _userId?: string): KnowledgeEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry) return undefined;
    entry.status = 'approved';
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  rejectEntry(entryId: string, _userId?: string): KnowledgeEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry) return undefined;
    entry.status = 'rejected';
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  archiveEntry(entryId: string, _userId?: string): KnowledgeEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry) return undefined;
    entry.status = 'archived';
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  /**
   * Vote on an entry. Accepts either (entryId, direction) or (entryId, userId, direction).
   */
  vote(entryId: string, userIdOrDirection: string, directionArg?: 'up' | 'down'): KnowledgeEntry | undefined {
    const entry = this.entries.get(entryId);
    if (!entry) return undefined;

    const direction: 'up' | 'down' = directionArg ?? (userIdOrDirection as 'up' | 'down');

    if (direction === 'up') {
      entry.voteUp++;
    } else {
      entry.voteDown++;
    }

    entry.qualityScore = computeQualityScore(entry);
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  /** Legacy alias for vote(). */
  voteEntry(entryId: string, direction: 'up' | 'down'): void {
    this.vote(entryId, direction);
  }

  recordUsage(entryId: string, _agentId?: string): void {
    const entry = this.entries.get(entryId);
    if (!entry) return;

    entry.useCount++;
    entry.qualityScore = computeQualityScore(entry);
    entry.updatedAt = new Date().toISOString();
  }

  // ─── Deduplication ──────────────────────────────────

  findSimilar(baseId: string, content: string, threshold: number = 0.6): KnowledgeEntry[] {
    const baseEntries = this.getEntriesForBase(baseId);
    const matches: Array<{ entry: KnowledgeEntry; similarity: number }> = [];

    for (const entry of baseEntries) {
      if (entry.status === 'rejected' || entry.status === 'archived') continue;

      const similarity = contentSimilarity(content, entry.content);
      if (similarity >= threshold) {
        matches.push({ entry, similarity });
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.map(m => m.entry);
  }

  // ─── Schedules ──────────────────────────────────────

  /**
   * Create a contribution schedule.
   * Accepts filters with defaults for minConfidence.
   */
  createSchedule(opts: {
    orgId: string;
    agentId: string;
    baseId: string;
    frequency: ContributionSchedule['frequency'];
    dayOfWeek?: number;
    filters?: Partial<ContributionSchedule['filters']>;
    createdBy?: string;
  }): ContributionSchedule {
    // Validate base exists
    const base = this.bases.get(opts.baseId);
    if (!base) throw new Error(`Knowledge base ${opts.baseId} not found`);

    // Validate dayOfWeek range
    if (opts.dayOfWeek !== undefined && (opts.dayOfWeek < 0 || opts.dayOfWeek > 6)) {
      throw new Error('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
    }

    const filters = opts.filters || {};

    const schedule: ContributionSchedule = {
      id: uid(),
      orgId: opts.orgId,
      agentId: opts.agentId,
      baseId: opts.baseId,
      frequency: opts.frequency,
      dayOfWeek: opts.dayOfWeek,
      nextRunAt: computeNextRunAt(opts.frequency, opts.dayOfWeek),
      enabled: true,
      filters: {
        minConfidence: filters.minConfidence ?? 0.5,
        categories: filters.categories,
        minImportance: filters.minImportance,
      },
      createdAt: new Date().toISOString(),
    };

    this.schedules.set(schedule.id, schedule);
    this.agentScheduleIndex.set(opts.agentId, schedule.id);

    return schedule;
  }

  /** Get a schedule by agent ID. */
  getSchedule(agentId: string): ContributionSchedule | undefined {
    const scheduleId = this.agentScheduleIndex.get(agentId);
    if (!scheduleId) return undefined;
    return this.schedules.get(scheduleId);
  }

  /** Alias used by routes. */
  getScheduleForAgent(agentId: string): ContributionSchedule | undefined {
    return this.getSchedule(agentId);
  }

  listSchedules(orgId: string): ContributionSchedule[] {
    return Array.from(this.schedules.values()).filter(s => s.orgId === orgId);
  }

  updateSchedule(
    scheduleId: string,
    updates: Partial<Pick<ContributionSchedule, 'frequency' | 'dayOfWeek' | 'enabled' | 'filters'>>,
    _userId?: string,
  ): ContributionSchedule | undefined {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return undefined;

    if (updates.frequency !== undefined) {
      schedule.frequency = updates.frequency;
      schedule.nextRunAt = computeNextRunAt(updates.frequency, updates.dayOfWeek ?? schedule.dayOfWeek);
    }

    if (updates.dayOfWeek !== undefined) {
      if (updates.dayOfWeek < 0 || updates.dayOfWeek > 6) {
        throw new Error('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
      }
      schedule.dayOfWeek = updates.dayOfWeek;
    }

    if (updates.enabled !== undefined) {
      schedule.enabled = updates.enabled;
    }

    if (updates.filters !== undefined) {
      schedule.filters = { ...schedule.filters, ...updates.filters };
    }

    return schedule;
  }

  deleteSchedule(scheduleId: string, _userId?: string): void {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return;

    this.agentScheduleIndex.delete(schedule.agentId);
    this.schedules.delete(scheduleId);
  }

  // ─── Contribution Cycles ────────────────────────────

  async runContributionCycle(agentId: string): Promise<ContributionCycle> {
    const schedule = this.getSchedule(agentId);
    if (!schedule) throw new Error(`No contribution schedule found for agent ${agentId}`);

    const base = this.bases.get(schedule.baseId);
    if (!base) throw new Error(`Knowledge base ${schedule.baseId} not found`);

    const now = new Date().toISOString();
    const cycle: ContributionCycle = {
      id: uid(),
      orgId: schedule.orgId,
      agentId,
      baseId: schedule.baseId,
      scheduleId: schedule.id,
      status: 'running',
      memoriesScanned: 0,
      entriesContributed: 0,
      duplicatesSkipped: 0,
      startedAt: now,
    };

    this.cycles.set(cycle.id, cycle);

    try {
      // Fetch memories via callback
      if (!this.memoryCallback) {
        throw new Error('No memory callback configured — cannot fetch agent memories');
      }

      const memories = await this.memoryCallback(agentId);
      cycle.memoriesScanned = memories.length;

      // Filter memories based on schedule criteria
      let filtered = memories.filter(m => m.confidence >= schedule.filters.minConfidence);

      if (schedule.filters.minImportance) {
        const importanceLevels: Record<string, number> = {
          low: 1,
          normal: 2,
          high: 3,
          critical: 4,
        };
        const minLevel = importanceLevels[schedule.filters.minImportance] || 0;
        filtered = filtered.filter(m => (importanceLevels[m.importance] || 0) >= minLevel);
      }

      if (schedule.filters.categories && schedule.filters.categories.length > 0) {
        filtered = filtered.filter(m => schedule.filters.categories!.includes(m.category));
      }

      // Process each filtered memory
      for (const memory of filtered) {
        // Check for duplicates via content similarity
        const similars = this.findSimilar(schedule.baseId, memory.content, 0.6);
        if (similars.length > 0) {
          cycle.duplicatesSkipped++;
          continue;
        }

        // Determine best category match from the base categories
        const categoryId = this.matchCategory(memory, base.categories);

        // Generate a summary from the content (first 200 chars or full content if shorter)
        const summary = memory.content.length > 200
          ? memory.content.slice(0, 200).replace(/\s+\S*$/, '') + '...'
          : memory.content;

        try {
          this.contribute({
            baseId: schedule.baseId,
            orgId: schedule.orgId,
            categoryId,
            title: memory.title,
            content: memory.content,
            summary,
            tags: memory.tags || [],
            sourceAgentId: agentId,
            sourceMemoryId: memory.id,
            confidence: memory.confidence,
          });

          cycle.entriesContributed++;
        } catch (err: any) {
          // Log but continue with remaining memories
          console.error(`[knowledge-contribution] Failed to contribute memory ${memory.id}:`, err.message);
        }
      }

      cycle.status = 'completed';
      cycle.completedAt = new Date().toISOString();

      // Update schedule timestamps
      schedule.lastRunAt = now;
      schedule.nextRunAt = computeNextRunAt(schedule.frequency, schedule.dayOfWeek);

    } catch (err: any) {
      cycle.status = 'failed';
      cycle.error = err.message;
      cycle.completedAt = new Date().toISOString();
    }

    return cycle;
  }

  /** Alias used by routes: trigger a contribution cycle for an agent. */
  async triggerContribution(agentId: string, _userId?: string): Promise<ContributionCycle> {
    return this.runContributionCycle(agentId);
  }

  /** Find the best-matching category in a base for a given memory item. */
  private matchCategory(memory: MemoryItem, categories: KnowledgeCategory[]): string {
    if (categories.length === 0) return 'general';

    // Try matching memory category/tags against base category IDs and names
    const memCat = memory.category.toLowerCase();
    const memTitle = memory.title.toLowerCase();
    const memTags = memory.tags.map(t => t.toLowerCase());

    let bestMatch: string | undefined;
    let bestScore = 0;

    for (const cat of categories) {
      let score = 0;
      const catId = cat.id.toLowerCase();
      const catName = cat.name.toLowerCase();
      const catDesc = cat.description.toLowerCase();

      // Direct category match
      if (memCat.includes(catId) || catId.includes(memCat)) score += 3;

      // Title overlap
      if (memTitle.includes(catId) || memTitle.includes(catName)) score += 2;

      // Tag matches
      for (const tag of memTags) {
        if (catId.includes(tag) || catName.includes(tag) || tag.includes(catId)) score += 1;
      }

      // Description keyword overlap
      const descWords = catDesc.split(/\s+/).filter(w => w.length > 3);
      for (const word of descWords) {
        if (memTitle.includes(word) || memory.content.toLowerCase().includes(word)) score += 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat.id;
      }
    }

    // Fall back to the first category if no meaningful match found
    return bestMatch || categories[0].id;
  }

  checkDueSchedules(): ContributionSchedule[] {
    const now = new Date().toISOString();
    return Array.from(this.schedules.values()).filter(s =>
      s.enabled && s.nextRunAt <= now
    );
  }

  async runDueContributions(): Promise<ContributionCycle[]> {
    const due = this.checkDueSchedules();
    const results: ContributionCycle[] = [];

    for (const schedule of due) {
      try {
        const cycle = await this.runContributionCycle(schedule.agentId);
        results.push(cycle);
      } catch (err: any) {
        console.error(`[knowledge-contribution] Failed contribution cycle for agent ${schedule.agentId}:`, err.message);
        const failedCycle: ContributionCycle = {
          id: uid(),
          orgId: schedule.orgId,
          agentId: schedule.agentId,
          baseId: schedule.baseId,
          scheduleId: schedule.id,
          status: 'failed',
          memoriesScanned: 0,
          entriesContributed: 0,
          duplicatesSkipped: 0,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          error: err.message,
        };
        this.cycles.set(failedCycle.id, failedCycle);
        results.push(failedCycle);
      }
    }

    return results;
  }

  /** Alias used by routes. */
  async runDueCycles(_userId?: string): Promise<{ cyclesRun: number; completed: number; failed: number; cycles: ContributionCycle[] }> {
    const cycles = await this.runDueContributions();
    return {
      cyclesRun: cycles.length,
      completed: cycles.filter(c => c.status === 'completed').length,
      failed: cycles.filter(c => c.status === 'failed').length,
      cycles,
    };
  }

  /** List contribution cycles with optional filters. */
  listCycles(opts?: { orgId?: string; agentId?: string; limit?: number }): ContributionCycle[] {
    let results = Array.from(this.cycles.values());

    if (opts?.orgId) {
      results = results.filter(c => c.orgId === opts.orgId);
    }
    if (opts?.agentId) {
      results = results.filter(c => c.agentId === opts.agentId);
    }

    // Sort by startedAt descending (most recent first)
    results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const limit = opts?.limit || 50;
    return results.slice(0, limit);
  }

  // ─── Bootstrap ──────────────────────────────────────

  getBootstrapKnowledge(role: string, opts?: {
    categories?: string[];
    minQuality?: number;
    limit?: number;
  }): KnowledgeEntry[] {
    const minQuality = opts?.minQuality ?? 0.4;
    const limit = opts?.limit ?? 50;

    // Find all bases matching the role across all orgs
    const matchingBases = Array.from(this.bases.values()).filter(b => b.role === role);

    let entries: KnowledgeEntry[] = [];
    for (const base of matchingBases) {
      const baseEntries = this.getEntriesForBase(base.id);
      entries.push(...baseEntries);
    }

    // Filter to approved/pending entries with sufficient quality
    entries = entries.filter(e =>
      (e.status === 'approved' || e.status === 'pending') &&
      e.qualityScore >= minQuality
    );

    // Filter by categories if specified
    if (opts?.categories && opts.categories.length > 0) {
      entries = entries.filter(e => opts.categories!.includes(e.categoryId));
    }

    // Sort by quality score descending
    entries.sort((a, b) => b.qualityScore - a.qualityScore);

    return entries.slice(0, limit);
  }

  // ─── Stats ──────────────────────────────────────────

  getStats(orgId?: string): {
    totalBases: number;
    totalEntries: number;
    totalContributors: number;
    topCategories: Array<{ categoryId: string; count: number }>;
    recentContributions: KnowledgeEntry[];
  } {
    // If no orgId, aggregate across all orgs
    const allBases = orgId
      ? Array.from(this.bases.values()).filter(b => b.orgId === orgId)
      : Array.from(this.bases.values());
    const baseIds = new Set(allBases.map(b => b.id));

    // Collect all entries
    const allEntries: KnowledgeEntry[] = [];
    for (const baseId of baseIds) {
      allEntries.push(...this.getEntriesForBase(baseId));
    }

    // Count unique contributors
    const contributors = new Set<string>();
    for (const baseId of baseIds) {
      const c = this.baseContributors.get(baseId);
      if (c) for (const agentId of c) contributors.add(agentId);
    }

    // Top categories
    const categoryCounts = new Map<string, number>();
    for (const entry of allEntries) {
      categoryCounts.set(entry.categoryId, (categoryCounts.get(entry.categoryId) || 0) + 1);
    }
    const topCategories = Array.from(categoryCounts.entries())
      .map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent contributions (last 20)
    const recentContributions = [...allEntries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);

    return {
      totalBases: allBases.length,
      totalEntries: allEntries.length,
      totalContributors: contributors.size,
      topCategories,
      recentContributions,
    };
  }

  getAgentContributions(agentId: string): {
    totalContributed: number;
    totalUsed: number;
    avgQuality: number;
    categories: Array<{ categoryId: string; count: number }>;
  } {
    const entries = this.getEntriesForAgent(agentId);

    const totalUsed = entries.reduce((sum, e) => sum + e.useCount, 0);
    const avgQuality = entries.length > 0
      ? parseFloat((entries.reduce((sum, e) => sum + e.qualityScore, 0) / entries.length).toFixed(4))
      : 0;

    const categoryCounts = new Map<string, number>();
    for (const entry of entries) {
      categoryCounts.set(entry.categoryId, (categoryCounts.get(entry.categoryId) || 0) + 1);
    }
    const categories = Array.from(categoryCounts.entries())
      .map(([categoryId, count]) => ({ categoryId, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalContributed: entries.length,
      totalUsed,
      avgQuality,
      categories,
    };
  }

  /** Alias used by routes. */
  getAgentStats(agentId: string): {
    totalContributed: number;
    totalUsed: number;
    avgQuality: number;
    categories: Array<{ categoryId: string; count: number }>;
  } {
    return this.getAgentContributions(agentId);
  }

  // ─── Maintenance ────────────────────────────────────

  decayQuality(): { entriesDecayed: number } {
    const now = Date.now();
    let entriesDecayed = 0;

    for (const entry of this.entries.values()) {
      // Skip recently updated entries (less than 30 days old)
      const ageMs = now - new Date(entry.updatedAt).getTime();
      const ageDays = ageMs / 86_400_000;
      if (ageDays < 30) continue;

      // Skip entries that are actively used
      const usageRate = entry.useCount / Math.max(1, ageDays / 7); // uses per week
      if (usageRate >= 1) continue;

      // Decay: reduce quality score by a small amount
      const decayFactor = 0.95; // 5% decay per maintenance cycle
      const newQuality = parseFloat((entry.qualityScore * decayFactor).toFixed(4));

      if (newQuality !== entry.qualityScore) {
        entry.qualityScore = newQuality;
        entry.updatedAt = new Date().toISOString();
        entriesDecayed++;
      }
    }

    return { entriesDecayed };
  }

  /** Alias used by routes. */
  runQualityDecay(_userId?: string): { entriesDecayed: number } {
    return this.decayQuality();
  }

  archiveStale(maxAgeDays: number = 365): number {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    let archived = 0;

    for (const entry of this.entries.values()) {
      if (entry.status === 'archived' || entry.status === 'rejected') continue;

      // Archive if older than threshold AND low quality AND low usage
      if (entry.createdAt < cutoff && entry.qualityScore < 0.2 && entry.useCount < 3) {
        entry.status = 'archived';
        entry.updatedAt = new Date().toISOString();
        archived++;
      }
    }

    return archived;
  }

  /** Alias used by routes. */
  archiveStaleEntries(maxAgeDays: number = 90, _userId?: string): { entriesArchived: number } {
    const count = this.archiveStale(maxAgeDays);
    return { entriesArchived: count };
  }

  // ─── Scheduler ──────────────────────────────────────

  startScheduler(intervalMs: number = 60_000): void {
    this.stopScheduler();

    this.schedulerTimer = setInterval(() => {
      this.runDueContributions().then(cycles => {
        if (cycles.length > 0) {
          const succeeded = cycles.filter(c => c.status === 'completed').length;
          const failed = cycles.filter(c => c.status === 'failed').length;
          console.log(`[knowledge-contribution] Ran ${cycles.length} contribution cycles: ${succeeded} completed, ${failed} failed`);
        }
      }).catch(err => {
        console.error('[knowledge-contribution] Scheduler error:', err.message);
      });
    }, intervalMs);

    // Don't block process exit
    if (this.schedulerTimer && typeof this.schedulerTimer === 'object' && 'unref' in this.schedulerTimer) {
      this.schedulerTimer.unref();
    }
  }

  stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }
}

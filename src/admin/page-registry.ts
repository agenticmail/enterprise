/**
 * Page & Tab Registry — Canonical map of all dashboard pages and their tabs.
 * Used for access control, permission management, and frontend rendering.
 *
 * Structure:
 *   pageId → { label, section, tabs?: { tabId → label } }
 *
 * Pages without tabs just have the page-level permission.
 * Pages with tabs support granular tab-level control.
 */

export interface PageDef {
  label: string;
  section: 'overview' | 'management' | 'administration';
  description?: string;
  tabs?: Record<string, string>;  // tabId → label
}

export const PAGE_REGISTRY: Record<string, PageDef> = {
  // ─── Overview ────────────────────────────────────
  dashboard: {
    label: 'Dashboard',
    section: 'overview',
    description: 'Main dashboard with key metrics and activity feed',
  },

  // ─── Management ──────────────────────────────────
  agents: {
    label: 'Agents',
    section: 'management',
    description: 'View and manage AI agents',
    tabs: {
      overview: 'Overview',
      personal: 'Personal Details',
      email: 'Email',
      whatsapp: 'WhatsApp',
      channels: 'Channels',
      configuration: 'Configuration',
      manager: 'Manager',
      tools: 'Tools',
      skills: 'Skills',
      permissions: 'Permissions',
      activity: 'Activity',
      communication: 'Communication',
      workforce: 'Workforce',
      memory: 'Memory',
      guardrails: 'Guardrails',
      autonomy: 'Autonomy',
      budget: 'Budget',
      security: 'Security',
      'tool-security': 'Tool Security',
      deployment: 'Deployment',
    },
  },
  skills: {
    label: 'Skills',
    section: 'management',
    description: 'Manage agent skill packs',
  },
  'community-skills': {
    label: 'Community Skills',
    section: 'management',
    description: 'Browse and install community skill marketplace',
  },
  'skill-connections': {
    label: 'Integrations & MCP',
    section: 'management',
    description: 'MCP servers, built-in integrations, and community skills',
  },
  'database-access': {
    label: 'Database Access',
    section: 'management',
    description: 'Manage database connections and agent access',
    tabs: {
      connections: 'Connections',
      access: 'Agent Access',
      audit: 'Audit Log',
    },
  },
  knowledge: {
    label: 'Knowledge Bases',
    section: 'management',
    description: 'Manage knowledge base documents and collections',
  },
  'knowledge-contributions': {
    label: 'Knowledge Hub',
    section: 'management',
    description: 'Agent contributions to shared knowledge',
  },
  approvals: {
    label: 'Approvals',
    section: 'management',
    description: 'Review and approve pending agent actions',
  },
  'org-chart': {
    label: 'Org Chart',
    section: 'management',
    description: 'Visual agent hierarchy and reporting structure',
  },
  'task-pipeline': {
    label: 'Task Pipeline',
    section: 'management',
    description: 'Track task lifecycle from creation to completion',
  },
  workforce: {
    label: 'Workforce',
    section: 'management',
    description: 'Agent scheduling, workload, and availability',
  },
  messages: {
    label: 'Messages',
    section: 'management',
    description: 'Inter-agent and external message logs',
  },
  guardrails: {
    label: 'Guardrails',
    section: 'management',
    description: 'Global safety policies and content filters',
  },
  journal: {
    label: 'Journal',
    section: 'management',
    description: 'System event journal and decision log',
  },

  // ─── Administration ──────────────────────────────
  dlp: {
    label: 'DLP',
    section: 'administration',
    description: 'Data loss prevention policies and alerts',
  },
  compliance: {
    label: 'Compliance',
    section: 'administration',
    description: 'Regulatory compliance settings and reports',
  },
  'domain-status': {
    label: 'Domain',
    section: 'administration',
    description: 'Domain configuration and deployment status',
  },
  users: {
    label: 'Users',
    section: 'administration',
    description: 'Manage dashboard users, roles, and permissions',
  },
  vault: {
    label: 'Vault',
    section: 'administration',
    description: 'Encrypted credential storage',
  },
  audit: {
    label: 'Audit Log',
    section: 'administration',
    description: 'Full audit trail of all system actions',
  },
  settings: {
    label: 'Settings',
    section: 'administration',
    description: 'Global platform configuration and branding',
  },
};

/** Get all page IDs */
export function getAllPageIds(): string[] {
  return Object.keys(PAGE_REGISTRY);
}

/** Get all tab IDs for a page (empty array if page has no tabs) */
export function getPageTabs(pageId: string): string[] {
  const page = PAGE_REGISTRY[pageId];
  return page?.tabs ? Object.keys(page.tabs) : [];
}

/**
 * Permission grant structure stored per user.
 * If '*', user has access to everything (owner/admin default).
 * Otherwise, object with:
 *   pages: { pageId → true (all tabs) | string[] (specific tabs) }
 *   allowedAgents: '*' | string[] (agent IDs the user can see/manage)
 *
 * Legacy format (flat object without _allowedAgents) is still supported.
 */
export type PermissionGrant = '*' | (Record<string, true | string[] | '*'> & {
  _allowedAgents?: '*' | string[];
});

/** Check if a user has access to a specific page */
export function hasPageAccess(grants: PermissionGrant, pageId: string): boolean {
  if (grants === '*') return true;
  return pageId in grants;
}

/** Check if a user has access to a specific tab within a page */
export function hasTabAccess(grants: PermissionGrant, pageId: string, tabId: string): boolean {
  if (grants === '*') return true;
  const pageGrant = grants[pageId];
  if (!pageGrant) return false;
  if (pageGrant === true) return true; // all tabs
  return pageGrant.includes(tabId);
}

/** Get accessible tab IDs for a page */
export function getAccessibleTabs(grants: PermissionGrant, pageId: string): string[] | 'all' {
  if (grants === '*') return 'all';
  const pageGrant = grants[pageId];
  if (!pageGrant) return [];
  if (pageGrant === true || pageGrant === '*') return 'all';
  return Array.isArray(pageGrant) ? pageGrant : [];
}

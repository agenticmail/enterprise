/**
 * Skill & Tool Registry + Permission Engine
 *
 * This is the core of enterprise: companies control exactly what their
 * AI agents can and cannot do. Every skill and tool is cataloged,
 * categorized, and gated behind permissions.
 */

// ─── Types ──────────────────────────────────────────────

export interface SkillDefinition {
  id: string;                    // e.g. "github", "imsg", "browser"
  name: string;                  // Human-readable: "GitHub"
  description: string;           // What it does
  category: SkillCategory;
  risk: RiskLevel;               // How dangerous is this skill
  tools: ToolDefinition[];       // Tools this skill provides
  requires?: string[];           // System requirements (e.g. "macos", "docker", "node")
  configSchema?: Record<string, ConfigField>;  // Skill-specific config fields
  icon?: string;                 // Emoji or icon URL
  source?: 'builtin' | 'clawhub' | 'custom';
  version?: string;
  author?: string;
}

export interface ToolDefinition {
  id?: string;                   // e.g. "exec", "web_search", "agenticmail_send" — auto-derived from name if absent
  name: string;
  description: string;
  category?: ToolCategory;
  risk?: RiskLevel;
  skillId?: string;               // Parent skill
  parameters?: Record<string, any>;
  input_schema?: Record<string, any>;  // MCP-style schema (alias for parameters)
  sideEffects?: SideEffect[];     // What external effects can this tool cause
  execute?: (toolCallId: string, params: any) => Promise<any>;  // Runtime executor
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: { label: string; value: string }[];  // For select type
}

export type SkillCategory =
  | 'communication'         // Email, SMS, messaging
  | 'development'           // GitHub, coding, git
  | 'productivity'          // Calendar, notes, reminders, tasks
  | 'research'              // Web search, web fetch, summarize
  | 'media'                 // Image gen, TTS, video, audio
  | 'automation'            // Browser, shell, scripting
  | 'smart-home'            // Hue, Sonos, cameras, Eight Sleep
  | 'data'                  // Files, databases, storage
  | 'security'              // 1Password, healthcheck, IAM
  | 'social'                // Twitter/X, LinkedIn, social media
  | 'platform'              // Core AgenticMail platform internals
  | 'collaboration'         // Slack, Teams, Zoom, chat
  | 'crm'                   // Salesforce, HubSpot, Dynamics
  | 'project-management'    // Jira, Asana, Monday, Linear
  | 'cloud-infrastructure'  // AWS, Azure, GCP
  | 'devops'                // Docker, K8s, Terraform, CI/CD
  | 'finance'               // Stripe, QuickBooks, Xero
  | 'analytics'             // Tableau, Power BI, Mixpanel
  | 'design'                // Figma, Canva, Adobe
  | 'ecommerce'             // Shopify, WooCommerce
  | 'marketing'             // Mailchimp, SendGrid, ads
  | 'hr'                    // BambooHR, Workday, Gusto
  | 'legal'                 // DocuSign, compliance
  | 'customer-support'      // Zendesk, Intercom, Freshdesk
  | 'storage'               // Dropbox, Box, OneDrive
  | 'database'              // MongoDB, Redis, Snowflake
  | 'monitoring'            // Datadog, PagerDuty, Sentry
  | 'utility'              // General-purpose tools
  | 'local'                // Local system tools (filesystem, shell)
  | 'messaging'            // WhatsApp, Telegram, iMessage
  | 'memory';              // Memory, knowledge, recall

export type ToolCategory =
  | 'read'             // Read-only, no side effects
  | 'write'            // Creates or modifies data
  | 'execute'          // Runs code/commands
  | 'communicate'      // Sends messages externally
  | 'destroy'          // Deletes data
  | 'memory'           // Memory read/write
  | 'utility';         // General-purpose utility

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SideEffect =
  | 'sends-email'
  | 'sends-message'
  | 'sends-sms'
  | 'posts-social'
  | 'runs-code'
  | 'modifies-files'
  | 'deletes-data'
  | 'network-request'
  | 'controls-device'
  | 'accesses-secrets'
  | 'financial'
  | 'executes-code'
  | 'uploads-file'
  | 'writes-file'
  | 'storage'
  | 'spawns-agent'
  | 'writes-data'
  | 'creates-account'
  | 'configures-email'
  | 'database_write'
  | 'external_api'
  | 'terminates-process'
  | 'installs-software'
  | 'uninstalls-software'
  | 'installs-packages'
  | 'starts-process'
  | 'cpu-intensive'
  | 'on-chain transaction'
  | 'token swap';

// ─── Individual Skill File Imports ──────────────────────
import { Emoji } from './emoji.js';
import { M365_SKILL_DEFS, GWS_SKILL_DEFS, ENTERPRISE_SKILL_DEFS, AGENTICMAIL_SKILL_DEFS, SYSTEM_SKILL_DEFS } from './skills/index.js';

// ─── Agent Permission Profile ───────────────────────────

export interface AgentPermissionProfile {
  id: string;
  name: string;                  // e.g. "Customer Support Agent", "Research Agent"
  description?: string;
  
  // Skill-level controls
  skills: {
    mode: 'allowlist' | 'blocklist';   // Allow only listed, or allow all except listed
    list: string[];                     // Skill IDs
  };
  
  // Tool-level overrides (more granular than skill-level)
  tools: {
    blocked: string[];                 // Always block these tools even if skill is allowed
    allowed: string[];                 // Always allow these tools even if skill is blocked
  };
  
  // Risk threshold — auto-block tools above this level
  maxRiskLevel: RiskLevel;
  
  // Side-effect restrictions
  blockedSideEffects: SideEffect[];    // Block any tool with these side effects
  
  // Approval workflows
  requireApproval: {
    enabled: boolean;
    forRiskLevels: RiskLevel[];        // Which risk levels need human approval
    forSideEffects: SideEffect[];      // Which side effects need approval
    approvers: string[];               // User IDs who can approve
    timeoutMinutes: number;            // Auto-deny after timeout
  };
  
  // Rate limits
  rateLimits: {
    toolCallsPerMinute: number;
    toolCallsPerHour: number;
    toolCallsPerDay: number;
    externalActionsPerHour: number;    // Actions with side effects
  };
  
  // Execution constraints
  constraints: {
    maxConcurrentTasks: number;
    maxSessionDurationMinutes: number;
    allowedWorkingHours?: { start: string; end: string; timezone: string };
    allowedIPs?: string[];             // Restrict to specific networks
    sandboxMode: boolean;              // If true, all external actions are simulated
  };

  // Dependency & package installation policy
  dependencyPolicy?: {
    /** 'auto' = install without asking, 'ask_manager' = notify manager, 'deny' = never install */
    mode: 'auto' | 'ask_manager' | 'deny';
    /** Allow global installs (brew/apt/choco) — if false, only local npm/pip */
    allowGlobalInstalls: boolean;
    /** Allow elevated privilege installs (sudo/doas on Unix, admin on Windows) */
    allowElevated: boolean;
    /** System/computer password for sudo/doas (piped via stdin, never in args or logs). Not needed on Windows. */
    sudoPassword?: string;
    /** Allowed package managers: brew, apt, npm, pip, choco, winget, pacman, dnf, snap */
    allowedManagers: string[];
    /** Specific packages to never install */
    blockedPackages: string[];
    /** Auto-cleanup installed packages when session ends */
    autoCleanup: boolean;
  };

  createdAt: string;
  updatedAt: string;
}

// ─── Skill Suites ──────────────────────────────────────
// Suites are meta-groupings: selecting "Microsoft 365" auto-adds all M365 skills.

export interface SkillSuite {
  id: string;
  name: string;
  description: string;
  icon: string;
  skills: string[];           // Skill IDs included in this suite
}

export const SKILL_SUITES: SkillSuite[] = [
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    description: 'Complete Microsoft 365 suite — Outlook, Teams, SharePoint, OneDrive, Word, Excel, PowerPoint, OneNote, Planner, Power BI, Power Automate, Forms, To Do, Bookings, Whiteboard, Admin Center, Copilot.',
    icon: Emoji.building,
    skills: [
      'm365-outlook', 'm365-teams', 'm365-sharepoint', 'm365-onedrive',
      'm365-word', 'm365-excel', 'm365-powerpoint', 'm365-onenote',
      'm365-planner', 'm365-power-bi', 'm365-power-automate', 'm365-forms',
      'm365-todo', 'm365-bookings', 'm365-whiteboard', 'm365-admin', 'm365-copilot',
    ],
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Complete Google Workspace suite — Gmail, Calendar, Drive, Docs, Sheets, Slides, Meet, Chat, Forms, Sites, Keep, Admin Console, Vault, Groups.',
    icon: Emoji.blueCircle,
    skills: [
      'gws-gmail', 'gws-calendar', 'gws-drive', 'gws-docs', 'gws-sheets',
      'gws-slides', 'gws-meet', 'gws-chat', 'gws-forms', 'gws-sites',
      'gws-keep', 'gws-admin', 'gws-vault', 'gws-groups',
    ],
  },
  {
    id: 'atlassian',
    name: 'Atlassian Suite',
    description: 'Jira, Confluence, Bitbucket, Trello, Statuspage, and Opsgenie.',
    icon: Emoji.blueDiamond,
    skills: ['jira', 'confluence', 'bitbucket', 'trello', 'statuspage', 'opsgenie'],
  },
  {
    id: 'aws',
    name: 'Amazon Web Services',
    description: 'AWS cloud infrastructure — S3, EC2, Lambda, RDS, CloudWatch, IAM, SES, SNS, SQS, DynamoDB, CloudFormation.',
    icon: Emoji.cloud,
    skills: ['aws-s3', 'aws-ec2', 'aws-lambda', 'aws-rds', 'aws-cloudwatch', 'aws-iam', 'aws-ses', 'aws-sns', 'aws-sqs', 'aws-dynamodb', 'aws-cloudformation'],
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    description: 'Azure cloud infrastructure — VMs, App Service, Functions, Storage, SQL, CosmosDB, DevOps, Active Directory.',
    icon: Emoji.partlyCloudy,
    skills: ['azure-vms', 'azure-app-service', 'azure-functions', 'azure-storage', 'azure-sql', 'azure-cosmosdb', 'azure-devops', 'azure-ad'],
  },
  {
    id: 'gcp',
    name: 'Google Cloud Platform',
    description: 'GCP cloud infrastructure — Compute Engine, Cloud Functions, Cloud Storage, BigQuery, Cloud Run, Pub/Sub, Firestore.',
    icon: Emoji.sunCloud,
    skills: ['gcp-compute', 'gcp-functions', 'gcp-storage', 'gcp-bigquery', 'gcp-run', 'gcp-pubsub', 'gcp-firestore'],
  },
  {
    id: 'salesforce-suite',
    name: 'Salesforce Suite',
    description: 'Salesforce CRM, Service Cloud, Marketing Cloud, and Commerce Cloud.',
    icon: Emoji.cloud,
    skills: ['salesforce', 'salesforce-service', 'salesforce-marketing', 'salesforce-commerce'],
  },
  {
    id: 'hubspot-suite',
    name: 'HubSpot Suite',
    description: 'HubSpot CRM, Marketing Hub, Sales Hub, Service Hub, and CMS.',
    icon: Emoji.orangeCircle,
    skills: ['hubspot-crm', 'hubspot-marketing', 'hubspot-sales', 'hubspot-service'],
  },
  {
    id: 'adobe-creative',
    name: 'Adobe Creative Cloud',
    description: 'Adobe Photoshop, Illustrator, Premiere Pro, After Effects, InDesign, and XD.',
    icon: Emoji.art,
    skills: ['adobe-photoshop', 'adobe-illustrator', 'adobe-premiere', 'adobe-after-effects', 'adobe-indesign', 'adobe-xd'],
  },
  {
    id: 'enterprise-utility',
    name: 'Enterprise Utility Tools',
    description: 'Built-in enterprise productivity tools — database queries, spreadsheets, documents, calendar, knowledge search, web research, translation, logs, workflow, notifications, finance, HTTP, security scanning, code sandbox, diff, and vision.',
    icon: Emoji.construction,
    skills: [
      'enterprise-database', 'enterprise-spreadsheet', 'enterprise-documents', 'enterprise-http',
      'enterprise-security-scan', 'enterprise-code-sandbox', 'enterprise-diff',
    ],
  },
];

// ─── Preset Permission Profiles ─────────────────────────

export const PRESET_PROFILES: Omit<AgentPermissionProfile, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Research Assistant',
    description: 'Can search the web, read files, and summarize content. Cannot send messages, run code, or modify anything.',
    skills: { mode: 'allowlist', list: ['research', 'summarize', 'data-read'] },
    tools: { blocked: ['exec', 'write', 'edit'], allowed: ['web_search', 'web_fetch', 'read', 'memory_search', 'memory_get'] },
    maxRiskLevel: 'low',
    blockedSideEffects: ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'runs-code', 'modifies-files', 'deletes-data', 'controls-device', 'financial'],
    requireApproval: { enabled: false, forRiskLevels: [], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 30, toolCallsPerHour: 500, toolCallsPerDay: 5000, externalActionsPerHour: 0 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Customer Support Agent',
    description: 'Can read/send emails, search knowledge base, and manage tickets. Cannot run code or access files.',
    skills: { mode: 'allowlist', list: ['communication', 'research', 'agenticmail', 'm365-outlook', 'm365-teams', 'gws-gmail', 'gws-calendar', 'zendesk', 'intercom'] },
    tools: { blocked: ['exec', 'browser', 'write', 'edit'], allowed: ['agenticmail_send', 'agenticmail_reply', 'agenticmail_inbox', 'agenticmail_read', 'agenticmail_search', 'web_search', 'web_fetch'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'modifies-files', 'deletes-data', 'controls-device', 'financial', 'posts-social'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['sends-email'], approvers: [], timeoutMinutes: 60 },
    rateLimits: { toolCallsPerMinute: 20, toolCallsPerHour: 300, toolCallsPerDay: 3000, externalActionsPerHour: 50 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Developer Assistant',
    description: 'Full development capabilities: code, git, GitHub, shell. Cannot send external messages or access smart home.',
    skills: { mode: 'allowlist', list: ['development', 'github', 'coding-agent', 'research', 'data', 'docker', 'github-actions', 'jira', 'linear', 'slack'] },
    tools: { blocked: ['agenticmail_send', 'message', 'tts', 'nodes'], allowed: ['exec', 'read', 'write', 'edit', 'web_search', 'web_fetch', 'browser'] },
    maxRiskLevel: 'high',
    blockedSideEffects: ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'controls-device', 'financial'],
    requireApproval: { enabled: true, forRiskLevels: ['critical'], forSideEffects: [], approvers: [], timeoutMinutes: 15 },
    rateLimits: { toolCallsPerMinute: 60, toolCallsPerHour: 1000, toolCallsPerDay: 10000, externalActionsPerHour: 100 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 720, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: true, allowElevated: false, allowedManagers: ['brew', 'apt', 'npm', 'pip', 'choco', 'winget'], blockedPackages: [], autoCleanup: false },
  },
  {
    name: 'Full Access (Owner)',
    description: 'Unrestricted access to all skills and tools. Full system access including sudo, global installs, and all package managers.',
    skills: { mode: 'blocklist', list: [] },
    tools: { blocked: [], allowed: [] },
    maxRiskLevel: 'critical',
    blockedSideEffects: [],
    requireApproval: { enabled: false, forRiskLevels: [], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 120, toolCallsPerHour: 5000, toolCallsPerDay: 50000, externalActionsPerHour: 500 },
    constraints: { maxConcurrentTasks: 10, maxSessionDurationMinutes: 1440, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: true, allowElevated: true, allowedManagers: ['brew', 'apt', 'npm', 'pip', 'choco', 'winget', 'pacman', 'dnf', 'snap', 'scoop'], blockedPackages: [], autoCleanup: false },
  },
  {
    name: 'Sandbox (Testing)',
    description: 'All tools available but in simulation mode. No real external actions are taken.',
    skills: { mode: 'blocklist', list: [] },
    tools: { blocked: [], allowed: [] },
    maxRiskLevel: 'critical',
    blockedSideEffects: [],
    requireApproval: { enabled: false, forRiskLevels: [], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 60, toolCallsPerHour: 1000, toolCallsPerDay: 10000, externalActionsPerHour: 500 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: true },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: false, allowElevated: false, allowedManagers: ['npm', 'pip'], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Polymarket Trader',
    description: 'Full Polymarket trading capabilities with wallet access, order execution, market analysis, and portfolio management.',
    skills: { mode: 'allowlist', list: ['polymarket', 'polymarket-quant', 'polymarket-analytics', 'polymarket-feeds', 'polymarket-social', 'polymarket-onchain', 'polymarket-counterintel', 'polymarket-portfolio', 'polymarket-pipeline', 'polymarket-execution', 'polymarket-watcher', 'research'] },
    tools: { blocked: [], allowed: ['web_search', 'web_fetch', 'read', 'write', 'exec', 'browser'] },
    maxRiskLevel: 'high',
    blockedSideEffects: ['sends-email', 'posts-social', 'controls-device'],
    requireApproval: { enabled: false, forRiskLevels: ['critical'], forSideEffects: ['financial'], approvers: [], timeoutMinutes: 15 },
    rateLimits: { toolCallsPerMinute: 60, toolCallsPerHour: 2000, toolCallsPerDay: 20000, externalActionsPerHour: 200 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 1440, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: false, allowElevated: false, allowedManagers: ['npm', 'pip'], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Sales & Outreach',
    description: 'Email, CRM, and communication tools for sales workflows. Can send emails and messages with approval on high-risk actions.',
    skills: { mode: 'allowlist', list: ['communication', 'agenticmail', 'research', 'gws-gmail', 'gws-calendar', 'gws-contacts', 'm365-outlook', 'm365-teams', 'salesforce', 'hubspot'] },
    tools: { blocked: ['exec', 'write', 'edit'], allowed: ['web_search', 'web_fetch', 'read', 'agenticmail_send', 'agenticmail_reply', 'agenticmail_search', 'message'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'modifies-files', 'deletes-data', 'controls-device', 'financial'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['sends-email', 'sends-message'], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 30, toolCallsPerHour: 500, toolCallsPerDay: 5000, externalActionsPerHour: 100 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Content Creator',
    description: 'Writing, media creation, and social posting capabilities. Can generate content and post to social platforms with approval.',
    skills: { mode: 'allowlist', list: ['research', 'communication', 'writing', 'media', 'social', 'agenticmail'] },
    tools: { blocked: [], allowed: ['web_search', 'web_fetch', 'read', 'write', 'edit', 'exec', 'browser', 'image', 'tts'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['deletes-data', 'controls-device', 'financial'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['posts-social', 'sends-email'], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 40, toolCallsPerHour: 800, toolCallsPerDay: 8000, externalActionsPerHour: 50 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: false, allowElevated: false, allowedManagers: ['npm', 'pip'], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Data Analyst',
    description: 'Can query databases, run code, create visualizations, and export reports. No external communications.',
    skills: { mode: 'allowlist', list: ['data', 'research', 'development', 'database-access', 'gws-sheets', 'm365-excel'] },
    tools: { blocked: ['agenticmail_send', 'message', 'tts', 'nodes'], allowed: ['exec', 'read', 'write', 'edit', 'web_search', 'web_fetch', 'browser'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'controls-device', 'financial'],
    requireApproval: { enabled: false, forRiskLevels: ['critical'], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 60, toolCallsPerHour: 1000, toolCallsPerDay: 10000, externalActionsPerHour: 0 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 720, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: false, allowElevated: false, allowedManagers: ['npm', 'pip'], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Meeting Assistant',
    description: 'Can join meetings, take notes, manage calendar, and send follow-ups. Limited file access.',
    skills: { mode: 'allowlist', list: ['communication', 'meeting', 'gws-calendar', 'gws-gmail', 'gws-meet', 'm365-teams', 'm365-outlook', 'agenticmail'] },
    tools: { blocked: ['exec'], allowed: ['web_search', 'web_fetch', 'read', 'write', 'browser', 'agenticmail_send', 'agenticmail_reply'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'deletes-data', 'controls-device', 'financial', 'posts-social'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['sends-email'], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 30, toolCallsPerHour: 500, toolCallsPerDay: 5000, externalActionsPerHour: 50 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Finance & Accounting',
    description: 'Financial tools, spreadsheets, and reporting. Approval required for any financial transactions.',
    skills: { mode: 'allowlist', list: ['data', 'research', 'agenticmail', 'gws-sheets', 'm365-excel', 'm365-powerbi', 'database-access'] },
    tools: { blocked: ['exec'], allowed: ['web_search', 'web_fetch', 'read', 'write', 'edit', 'browser'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'controls-device', 'posts-social'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['financial', 'sends-email', 'deletes-data'], approvers: [], timeoutMinutes: 60 },
    rateLimits: { toolCallsPerMinute: 30, toolCallsPerHour: 500, toolCallsPerDay: 5000, externalActionsPerHour: 30 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'HR & Recruitment',
    description: 'Email, calendar, document management, and candidate tracking. Can communicate externally with approval.',
    skills: { mode: 'allowlist', list: ['communication', 'agenticmail', 'research', 'gws-gmail', 'gws-calendar', 'gws-drive', 'gws-docs', 'm365-outlook', 'm365-teams'] },
    tools: { blocked: ['exec'], allowed: ['web_search', 'web_fetch', 'read', 'write', 'browser', 'agenticmail_send', 'agenticmail_reply'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'controls-device', 'financial', 'deletes-data'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['sends-email', 'posts-social'], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 30, toolCallsPerHour: 500, toolCallsPerDay: 5000, externalActionsPerHour: 50 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Marketing Manager',
    description: 'Social media, content, email campaigns, and analytics. Can post to social with approval.',
    skills: { mode: 'allowlist', list: ['communication', 'research', 'agenticmail', 'social', 'media', 'gws-gmail', 'gws-sheets', 'gws-analytics'] },
    tools: { blocked: [], allowed: ['web_search', 'web_fetch', 'read', 'write', 'edit', 'exec', 'browser', 'image', 'agenticmail_send', 'message'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['controls-device', 'financial', 'deletes-data'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: ['posts-social', 'sends-email'], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 40, toolCallsPerHour: 800, toolCallsPerDay: 8000, externalActionsPerHour: 100 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: false, allowElevated: false, allowedManagers: ['npm', 'pip'], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Project Manager',
    description: 'Task tracking, team communication, calendar management, and reporting. Can send messages and manage workflows.',
    skills: { mode: 'allowlist', list: ['communication', 'management', 'research', 'agenticmail', 'gws-calendar', 'gws-gmail', 'gws-sheets', 'm365-teams', 'm365-planner', 'jira', 'linear', 'slack', 'asana'] },
    tools: { blocked: ['exec'], allowed: ['web_search', 'web_fetch', 'read', 'write', 'browser', 'agenticmail_send', 'agenticmail_reply', 'message'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'controls-device', 'financial', 'deletes-data'],
    requireApproval: { enabled: true, forRiskLevels: ['critical'], forSideEffects: ['sends-email'], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 40, toolCallsPerHour: 600, toolCallsPerDay: 6000, externalActionsPerHour: 80 },
    constraints: { maxConcurrentTasks: 8, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'IT Administrator',
    description: 'Full system access with code execution, DevOps tools, and monitoring. Can install packages and manage infrastructure.',
    skills: { mode: 'blocklist', list: [] },
    tools: { blocked: [], allowed: [] },
    maxRiskLevel: 'critical',
    blockedSideEffects: ['posts-social'],
    requireApproval: { enabled: true, forRiskLevels: ['critical'], forSideEffects: [], approvers: [], timeoutMinutes: 15 },
    rateLimits: { toolCallsPerMinute: 120, toolCallsPerHour: 3000, toolCallsPerDay: 30000, externalActionsPerHour: 300 },
    constraints: { maxConcurrentTasks: 8, maxSessionDurationMinutes: 1440, sandboxMode: false },
    dependencyPolicy: { mode: 'auto', allowGlobalInstalls: true, allowElevated: true, allowedManagers: ['brew', 'apt', 'npm', 'pip', 'choco', 'winget', 'pacman', 'dnf', 'snap', 'scoop'], blockedPackages: [], autoCleanup: false },
  },
  {
    name: 'Legal & Compliance',
    description: 'Document review, email, and research. High security — approval required for all external communications.',
    skills: { mode: 'allowlist', list: ['research', 'agenticmail', 'gws-gmail', 'gws-drive', 'gws-docs', 'm365-outlook', 'm365-sharepoint'] },
    tools: { blocked: ['exec'], allowed: ['web_search', 'web_fetch', 'read', 'browser'] },
    maxRiskLevel: 'low',
    blockedSideEffects: ['runs-code', 'modifies-files', 'controls-device', 'financial', 'posts-social'],
    requireApproval: { enabled: true, forRiskLevels: ['medium', 'high', 'critical'], forSideEffects: ['sends-email', 'sends-message', 'deletes-data'], approvers: [], timeoutMinutes: 60 },
    rateLimits: { toolCallsPerMinute: 20, toolCallsPerHour: 300, toolCallsPerDay: 3000, externalActionsPerHour: 20 },
    constraints: { maxConcurrentTasks: 3, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Executive Assistant',
    description: 'Full communication, calendar, and scheduling capabilities. Can send emails and messages on behalf of the executive.',
    skills: { mode: 'allowlist', list: ['communication', 'agenticmail', 'research', 'gws-gmail', 'gws-calendar', 'gws-contacts', 'gws-drive', 'm365-outlook', 'm365-teams', 'm365-todo'] },
    tools: { blocked: ['exec'], allowed: ['web_search', 'web_fetch', 'read', 'write', 'browser', 'agenticmail_send', 'agenticmail_reply', 'message'] },
    maxRiskLevel: 'medium',
    blockedSideEffects: ['runs-code', 'controls-device', 'financial', 'deletes-data'],
    requireApproval: { enabled: true, forRiskLevels: ['high', 'critical'], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 40, toolCallsPerHour: 600, toolCallsPerDay: 6000, externalActionsPerHour: 100 },
    constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
  {
    name: 'Restrictive (Read-Only)',
    description: 'Minimum permissions. Can only read files and search. Cannot write, execute, or communicate externally.',
    skills: { mode: 'allowlist', list: ['research'] },
    tools: { blocked: ['exec', 'write', 'edit', 'agenticmail_send', 'message', 'browser'], allowed: ['web_search', 'web_fetch', 'read', 'memory_search', 'memory_get'] },
    maxRiskLevel: 'low',
    blockedSideEffects: ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'runs-code', 'modifies-files', 'deletes-data', 'controls-device', 'financial'],
    requireApproval: { enabled: false, forRiskLevels: [], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 20, toolCallsPerHour: 200, toolCallsPerDay: 2000, externalActionsPerHour: 0 },
    constraints: { maxConcurrentTasks: 2, maxSessionDurationMinutes: 240, sandboxMode: false },
    dependencyPolicy: { mode: 'deny', allowGlobalInstalls: false, allowElevated: false, allowedManagers: [], blockedPackages: [], autoCleanup: true },
  },
];

// ─── Built-in Skill Catalog ─────────────────────────────

export const BUILTIN_SKILLS: Omit<SkillDefinition, 'tools'>[] = [
  // ═══ AgenticMail — Core Product (always available) ═══
  ...AGENTICMAIL_SKILL_DEFS,

  // ═══ Microsoft 365 Suite ═══
  ...M365_SKILL_DEFS,

  // ═══ Google Workspace Suite ═══
  ...GWS_SKILL_DEFS,

  // ═══ Enterprise Utility Tools ═══
  ...ENTERPRISE_SKILL_DEFS,

  // ═══ System / Core ═══
  ...SYSTEM_SKILL_DEFS,
];

// ─── Permission Engine ──────────────────────────────────

export class PermissionEngine {
  private skills: Map<string, SkillDefinition> = new Map();
  private profiles: Map<string, AgentPermissionProfile> = new Map();
  private engineDb?: import('./db-adapter.js').EngineDatabase;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private _onRefreshCallbacks: Array<(profiles: Map<string, AgentPermissionProfile>) => void> = [];

  constructor(skills?: SkillDefinition[]) {
    if (skills) {
      for (const s of skills) this.skills.set(s.id, s);
    }
  }

  /**
   * Refresh all permission profiles from DB.
   * Called periodically so dashboard changes take effect without agent restart.
   */
  async refreshProfiles(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const profiles = await this.engineDb.getAllPermissionProfiles();
      for (const profile of profiles) {
        if (profile && profile.id) {
          this.profiles.set(profile.id, profile);
        }
      }
      // Notify listeners (e.g., dependency manager policy sync)
      for (const cb of this._onRefreshCallbacks) {
        try { cb(this.profiles); } catch {}
      }
    } catch { /* table may not exist yet */ }
  }

  /** Register a callback to run after profiles refresh (e.g., sync dependency policy) */
  onRefresh(callback: (profiles: Map<string, AgentPermissionProfile>) => void): void {
    this._onRefreshCallbacks.push(callback);
  }

  /**
   * Start periodic profile refresh (default: every 30s).
   * Call after setDb() to keep profiles in sync with dashboard changes.
   */
  startAutoRefresh(intervalMs = 30_000): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      this.refreshProfiles().catch(() => {});
    }, intervalMs);
    // Don't block process exit
    if (this.refreshTimer?.unref) this.refreshTimer.unref();
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Set the database adapter and load existing profiles from DB
   */
  async setDb(db: import('./db-adapter.js').EngineDatabase): Promise<void> {
    this.engineDb = db;
    // Load persisted permission profiles from DB
    try {
      const profiles = await db.getAllPermissionProfiles();
      for (const profile of profiles) {
        if (profile && profile.id) {
          this.profiles.set(profile.id, profile);
        }
      }
      if (profiles.length > 0) console.log(`[permissions] Loaded ${profiles.length} permission profiles from DB`);
    } catch { /* table may not exist yet */ }
  }

  registerSkill(skill: SkillDefinition) {
    this.skills.set(skill.id, skill);
  }

  /**
   * Register tools dynamically at runtime (e.g., MCP bridge tools loaded after init).
   * Merges into an existing skill definition or creates a new one.
   */
  registerDynamicTools(skillId: string, tools: ToolDefinition[]) {
    const existing = this.skills.get(skillId);
    if (existing) {
      // Merge — add tools that aren't already registered
      const existingIds = new Set(existing.tools.map(t => t.id));
      const newTools = tools.filter(t => !existingIds.has(t.id));
      existing.tools = [...existing.tools, ...newTools];
    } else {
      this.skills.set(skillId, {
        id: skillId,
        name: `Dynamic: ${skillId}`,
        description: 'Dynamically registered tools',
        category: 'integration' as any,
        risk: 'medium' as any,
        tools,
        source: 'builtin',
      });
    }
  }

  setProfile(agentId: string, profile: AgentPermissionProfile, orgId?: string) {
    this.profiles.set(agentId, profile);
    if (this.engineDb && orgId) {
      this.engineDb.upsertPermissionProfile(orgId, profile).catch((err) => {
        console.error(`[permissions] Failed to persist profile for agent ${agentId}:`, err);
      });
    }
    // Push to standalone agent in real-time
    import('./agent-notify.js').then(({ notifyAgent }) => notifyAgent(agentId, 'permissions')).catch(() => {});
  }

  getProfile(agentId: string): AgentPermissionProfile | undefined {
    return this.profiles.get(agentId);
  }

  /**
   * Core permission check: Can this agent use this tool right now?
   * Returns { allowed, reason, requiresApproval }
   */
  checkPermission(
    agentId: string,
    toolId: string,
    context?: { timestamp?: Date; ip?: string }
  ): PermissionResult {
    const profile = this.profiles.get(agentId);
    if (!profile) {
      return { allowed: false, reason: 'No permission profile assigned', requiresApproval: false };
    }

    // 1. Check sandbox mode
    if (profile.constraints.sandboxMode) {
      return { allowed: true, reason: 'Sandbox mode — action will be simulated', requiresApproval: false, sandbox: true };
    }

    // 2. Check working hours
    if (profile.constraints.allowedWorkingHours) {
      const now = context?.timestamp || new Date();
      const { start, end, timezone } = profile.constraints.allowedWorkingHours;
      const hour = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now));
      const startHour = parseInt(start.split(':')[0]);
      const endHour = parseInt(end.split(':')[0]);
      if (hour < startHour || hour >= endHour) {
        return { allowed: false, reason: `Outside working hours (${start}-${end} ${timezone})`, requiresApproval: false };
      }
    }

    // 3. Check IP restrictions
    if (profile.constraints.allowedIPs?.length && context?.ip) {
      if (!profile.constraints.allowedIPs.includes(context.ip)) {
        return { allowed: false, reason: `IP ${context.ip} not in allowlist`, requiresApproval: false };
      }
    }

    // 4. Tool-level explicit overrides (highest priority)
    const blockedTools = profile.tools?.blocked || [];
    const allowedTools = profile.tools?.allowed || [];
    if (blockedTools.includes(toolId)) {
      return { allowed: false, reason: `Tool "${toolId}" is explicitly blocked`, requiresApproval: false };
    }
    if (allowedTools.includes(toolId)) {
      // Explicitly allowed — skip skill checks, but still check approval requirements
      return this._checkApproval(profile, toolId);
    }

    // 5. Find which skill this tool belongs to
    const tool = this._findTool(toolId);
    if (!tool) {
      // Unknown tool — block by default
      return { allowed: false, reason: `Unknown tool "${toolId}"`, requiresApproval: false };
    }

    // 6. Skill-level check
    const skillsMode = profile.skills?.mode || 'blocklist';
    const skillsList = profile.skills?.list || [];
    const skillAllowed = skillsMode === 'allowlist'
      ? skillsList.includes(tool.skillId || '')
      : !skillsList.includes(tool.skillId || '');

    if (!skillAllowed) {
      return { allowed: false, reason: `Skill "${tool.skillId}" is not permitted`, requiresApproval: false };
    }

    // 7. Risk level check
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const toolRiskIdx = riskOrder.indexOf(tool.risk || 'low');
    const maxRiskIdx = riskOrder.indexOf(profile.maxRiskLevel);
    if (toolRiskIdx > maxRiskIdx) {
      return { allowed: false, reason: `Tool risk "${tool.risk}" exceeds max allowed "${profile.maxRiskLevel}"`, requiresApproval: false };
    }

    // 8. Side-effect restrictions
    for (const effect of (tool.sideEffects || [])) {
      if (profile.blockedSideEffects.includes(effect)) {
        return { allowed: false, reason: `Side effect "${effect}" is blocked`, requiresApproval: false };
      }
    }

    // 9. Check if approval is required
    return this._checkApproval(profile, toolId, tool);
  }

  private _checkApproval(profile: AgentPermissionProfile, _toolId: string, tool?: ToolDefinition): PermissionResult {
    if (!profile.requireApproval.enabled) {
      return { allowed: true, reason: 'Permitted', requiresApproval: false };
    }

    if (tool) {
      // Check risk-level approval
      if (profile.requireApproval.forRiskLevels.includes(tool.risk || 'low')) {
        return { allowed: true, reason: 'Requires human approval (risk level)', requiresApproval: true };
      }
      // Check side-effect approval
      for (const effect of (tool.sideEffects || [])) {
        if (profile.requireApproval.forSideEffects.includes(effect)) {
          return { allowed: true, reason: `Requires human approval (${effect})`, requiresApproval: true };
        }
      }
    }

    return { allowed: true, reason: 'Permitted', requiresApproval: false };
  }

  private _findTool(toolId: string): ToolDefinition | undefined {
    // Check registered skills first
    for (const skill of this.skills.values()) {
      const tool = skill.tools.find(t => t.id === toolId);
      if (tool) return tool;
    }
    // Fall back to global tool index (all registered AgenticMail tools)
    try {
      const { TOOL_INDEX } = require('./tool-catalog.js');
      return TOOL_INDEX.get(toolId);
    } catch {
      return undefined;
    }
  }

  /**
   * Get the full resolved tool list for an agent — what they can actually use
   */
  getAvailableTools(agentId: string): { tool: ToolDefinition; status: 'allowed' | 'approval-required' | 'sandbox' }[] {
    const result: { tool: ToolDefinition; status: 'allowed' | 'approval-required' | 'sandbox' }[] = [];

    for (const skill of this.skills.values()) {
      for (const tool of skill.tools) {
        const perm = this.checkPermission(agentId, tool.id || tool.name);
        if (perm.allowed) {
          result.push({
            tool,
            status: perm.sandbox ? 'sandbox' : perm.requiresApproval ? 'approval-required' : 'allowed',
          });
        }
      }
    }

    return result;
  }

  /**
   * Generate the tool policy config for an agent based on their profile
   */
  generateToolPolicy(agentId: string): {
    allowedTools: string[];
    blockedTools: string[];
    approvalRequired: string[];
    rateLimits: AgentPermissionProfile['rateLimits'];
  } {
    const profile = this.profiles.get(agentId);
    if (!profile) return { allowedTools: [], blockedTools: [], approvalRequired: [], rateLimits: { toolCallsPerMinute: 10, toolCallsPerHour: 100, toolCallsPerDay: 1000, externalActionsPerHour: 10 } };

    const allowed: string[] = [];
    const blocked: string[] = [];
    const approval: string[] = [];

    for (const skill of this.skills.values()) {
      for (const tool of skill.tools) {
        const perm = this.checkPermission(agentId, tool.id || tool.name);
        if (perm.allowed) {
          allowed.push(tool.id || tool.name);
          if (perm.requiresApproval) approval.push(tool.id || tool.name);
        } else {
          blocked.push(tool.id || tool.name);
        }
      }
    }

    return { allowedTools: allowed, blockedTools: blocked, approvalRequired: approval, rateLimits: profile.rateLimits };
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkillsByCategory(): Record<SkillCategory, SkillDefinition[]> {
    const result = {} as Record<SkillCategory, SkillDefinition[]>;
    for (const skill of this.skills.values()) {
      if (!result[skill.category]) result[skill.category] = [];
      result[skill.category].push(skill);
    }
    return result;
  }
}

// ─── Community Skill Registry ──────────────────────────
// Moved to community-registry.ts — full DB-backed marketplace implementation

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  sandbox?: boolean;
}

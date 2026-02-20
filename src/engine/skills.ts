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
  id: string;                    // e.g. "exec", "web_search", "agenticmail_send"
  name: string;
  description: string;
  category: ToolCategory;
  risk: RiskLevel;
  skillId: string;               // Parent skill
  parameters?: Record<string, any>;
  sideEffects: SideEffect[];     // What external effects can this tool cause
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
  | 'monitoring';           // Datadog, PagerDuty, Sentry

export type ToolCategory =
  | 'read'             // Read-only, no side effects
  | 'write'            // Creates or modifies data
  | 'execute'          // Runs code/commands
  | 'communicate'      // Sends messages externally
  | 'destroy';         // Deletes data

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
  | 'financial';

// ─── Individual Skill File Imports ──────────────────────
import { M365_SKILL_DEFS, GWS_SKILL_DEFS, ENTERPRISE_SKILL_DEFS } from './skills/index.js';

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
    icon: '🏢',
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
    icon: '🔵',
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
    icon: '🔷',
    skills: ['jira', 'confluence', 'bitbucket', 'trello', 'statuspage', 'opsgenie'],
  },
  {
    id: 'aws',
    name: 'Amazon Web Services',
    description: 'AWS cloud infrastructure — S3, EC2, Lambda, RDS, CloudWatch, IAM, SES, SNS, SQS, DynamoDB, CloudFormation.',
    icon: '☁️',
    skills: ['aws-s3', 'aws-ec2', 'aws-lambda', 'aws-rds', 'aws-cloudwatch', 'aws-iam', 'aws-ses', 'aws-sns', 'aws-sqs', 'aws-dynamodb', 'aws-cloudformation'],
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    description: 'Azure cloud infrastructure — VMs, App Service, Functions, Storage, SQL, CosmosDB, DevOps, Active Directory.',
    icon: '⛅',
    skills: ['azure-vms', 'azure-app-service', 'azure-functions', 'azure-storage', 'azure-sql', 'azure-cosmosdb', 'azure-devops', 'azure-ad'],
  },
  {
    id: 'gcp',
    name: 'Google Cloud Platform',
    description: 'GCP cloud infrastructure — Compute Engine, Cloud Functions, Cloud Storage, BigQuery, Cloud Run, Pub/Sub, Firestore.',
    icon: '🌤️',
    skills: ['gcp-compute', 'gcp-functions', 'gcp-storage', 'gcp-bigquery', 'gcp-run', 'gcp-pubsub', 'gcp-firestore'],
  },
  {
    id: 'salesforce-suite',
    name: 'Salesforce Suite',
    description: 'Salesforce CRM, Service Cloud, Marketing Cloud, and Commerce Cloud.',
    icon: '☁',
    skills: ['salesforce', 'salesforce-service', 'salesforce-marketing', 'salesforce-commerce'],
  },
  {
    id: 'hubspot-suite',
    name: 'HubSpot Suite',
    description: 'HubSpot CRM, Marketing Hub, Sales Hub, Service Hub, and CMS.',
    icon: '🟠',
    skills: ['hubspot-crm', 'hubspot-marketing', 'hubspot-sales', 'hubspot-service'],
  },
  {
    id: 'adobe-creative',
    name: 'Adobe Creative Cloud',
    description: 'Adobe Photoshop, Illustrator, Premiere Pro, After Effects, InDesign, and XD.',
    icon: '🎨',
    skills: ['adobe-photoshop', 'adobe-illustrator', 'adobe-premiere', 'adobe-after-effects', 'adobe-indesign', 'adobe-xd'],
  },
  {
    id: 'enterprise-utility',
    name: 'Enterprise Utility Tools',
    description: 'Built-in enterprise productivity tools — database queries, spreadsheets, documents, calendar, knowledge search, web research, translation, logs, workflow, notifications, finance, HTTP, security scanning, code sandbox, diff, and vision.',
    icon: '🏗️',
    skills: [
      'enterprise-database', 'enterprise-spreadsheet', 'enterprise-documents', 'enterprise-calendar',
      'enterprise-knowledge-search', 'enterprise-web-research', 'enterprise-translation', 'enterprise-logs',
      'enterprise-workflow', 'enterprise-notifications', 'enterprise-finance', 'enterprise-http',
      'enterprise-security-scan', 'enterprise-code-sandbox', 'enterprise-diff', 'enterprise-vision',
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
  },
  {
    name: 'Full Access (Owner)',
    description: 'Unrestricted access to all skills and tools. Use with caution.',
    skills: { mode: 'blocklist', list: [] },
    tools: { blocked: [], allowed: [] },
    maxRiskLevel: 'critical',
    blockedSideEffects: [],
    requireApproval: { enabled: false, forRiskLevels: [], forSideEffects: [], approvers: [], timeoutMinutes: 30 },
    rateLimits: { toolCallsPerMinute: 120, toolCallsPerHour: 5000, toolCallsPerDay: 50000, externalActionsPerHour: 500 },
    constraints: { maxConcurrentTasks: 10, maxSessionDurationMinutes: 1440, sandboxMode: false },
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
  },
];

// ─── Built-in Skill Catalog ─────────────────────────────

export const BUILTIN_SKILLS: Omit<SkillDefinition, 'tools'>[] = [
  // Communication
  { id: 'agenticmail', name: 'AgenticMail', description: 'Full email system — send, receive, organize, search, forward, reply. Agent-to-agent messaging and task delegation.', category: 'communication', risk: 'medium', icon: '📧', source: 'builtin' },
  { id: 'imsg', name: 'iMessage', description: 'Send and receive iMessages and SMS via macOS.', category: 'communication', risk: 'high', icon: '💬', source: 'builtin', requires: ['macos'] },
  { id: 'wacli', name: 'WhatsApp', description: 'Send WhatsApp messages and search chat history.', category: 'communication', risk: 'high', icon: '📱', source: 'builtin' },

  // Development
  { id: 'github', name: 'GitHub', description: 'Manage issues, PRs, CI runs, and repositories via gh CLI.', category: 'development', risk: 'medium', icon: '🐙', source: 'builtin' },
  { id: 'coding-agent', name: 'Coding Agent', description: 'Run Codex CLI, Claude Code, or other coding agents as background processes.', category: 'development', risk: 'high', icon: '💻', source: 'builtin' },

  // Productivity
  { id: 'gog', name: 'Google Workspace', description: 'Gmail, Calendar, Drive, Contacts, Sheets, and Docs.', category: 'productivity', risk: 'medium', icon: '📅', source: 'builtin' },
  { id: 'apple-notes', name: 'Apple Notes', description: 'Create, search, edit, and manage Apple Notes.', category: 'productivity', risk: 'low', icon: '📝', source: 'builtin', requires: ['macos'] },
  { id: 'apple-reminders', name: 'Apple Reminders', description: 'Manage Apple Reminders lists and items.', category: 'productivity', risk: 'low', icon: '✅', source: 'builtin', requires: ['macos'] },
  { id: 'bear-notes', name: 'Bear Notes', description: 'Create, search, and manage Bear notes.', category: 'productivity', risk: 'low', icon: '🐻', source: 'builtin', requires: ['macos'] },
  { id: 'obsidian', name: 'Obsidian', description: 'Work with Obsidian vaults and automate via CLI.', category: 'productivity', risk: 'low', icon: '💎', source: 'builtin' },
  { id: 'things-mac', name: 'Things 3', description: 'Manage tasks and projects in Things 3.', category: 'productivity', risk: 'low', icon: '☑️', source: 'builtin', requires: ['macos'] },

  // Research
  { id: 'web-search', name: 'Web Search', description: 'Search the web via Brave Search API.', category: 'research', risk: 'low', icon: '🔍', source: 'builtin' },
  { id: 'web-fetch', name: 'Web Fetch', description: 'Fetch and extract readable content from URLs.', category: 'research', risk: 'low', icon: '🌐', source: 'builtin' },
  { id: 'summarize', name: 'Summarize', description: 'Summarize or transcribe URLs, podcasts, and files.', category: 'research', risk: 'low', icon: '📄', source: 'builtin' },
  { id: 'blogwatcher', name: 'Blog Watcher', description: 'Monitor blogs and RSS/Atom feeds for updates.', category: 'research', risk: 'low', icon: '📡', source: 'builtin' },

  // Media
  { id: 'openai-image-gen', name: 'Image Generation', description: 'Generate images via OpenAI Images API.', category: 'media', risk: 'low', icon: '🎨', source: 'builtin' },
  { id: 'nano-banana-pro', name: 'Gemini Image', description: 'Generate or edit images via Gemini 3 Pro.', category: 'media', risk: 'low', icon: '🖼️', source: 'builtin' },
  { id: 'tts', name: 'Text-to-Speech', description: 'Convert text to speech audio.', category: 'media', risk: 'low', icon: '🔊', source: 'builtin' },
  { id: 'openai-whisper', name: 'Whisper Transcription', description: 'Transcribe audio via OpenAI Whisper API.', category: 'media', risk: 'low', icon: '🎙️', source: 'builtin' },
  { id: 'video-frames', name: 'Video Frames', description: 'Extract frames or clips from videos.', category: 'media', risk: 'low', icon: '🎬', source: 'builtin' },
  { id: 'gifgrep', name: 'GIF Search', description: 'Search and download GIFs.', category: 'media', risk: 'low', icon: '🎭', source: 'builtin' },

  // Automation
  { id: 'browser', name: 'Browser Control', description: 'Automate web browsers — navigate, click, type, screenshot.', category: 'automation', risk: 'high', icon: '🌍', source: 'builtin' },
  { id: 'exec', name: 'Shell Commands', description: 'Execute shell commands on the host machine.', category: 'automation', risk: 'critical', icon: '⚡', source: 'builtin' },
  { id: 'peekaboo', name: 'macOS UI Automation', description: 'Capture and automate macOS UI with Peekaboo.', category: 'automation', risk: 'high', icon: '👁️', source: 'builtin', requires: ['macos'] },
  { id: 'cron', name: 'Scheduled Tasks', description: 'Create and manage cron jobs and reminders.', category: 'automation', risk: 'medium', icon: '⏰', source: 'builtin' },

  // Smart Home
  { id: 'openhue', name: 'Philips Hue', description: 'Control Hue lights and scenes.', category: 'smart-home', risk: 'low', icon: '💡', source: 'builtin' },
  { id: 'sonoscli', name: 'Sonos', description: 'Control Sonos speakers.', category: 'smart-home', risk: 'low', icon: '🔈', source: 'builtin' },
  { id: 'blucli', name: 'BluOS', description: 'Control BluOS speakers.', category: 'smart-home', risk: 'low', icon: '🎵', source: 'builtin' },
  { id: 'eightctl', name: 'Eight Sleep', description: 'Control Eight Sleep pod temperature and alarms.', category: 'smart-home', risk: 'low', icon: '🛏️', source: 'builtin' },
  { id: 'camsnap', name: 'IP Cameras', description: 'Capture frames from RTSP/ONVIF cameras.', category: 'smart-home', risk: 'medium', icon: '📷', source: 'builtin' },

  // Data
  { id: 'files', name: 'File System', description: 'Read, write, and edit files on the host.', category: 'data', risk: 'medium', icon: '📁', source: 'builtin' },
  { id: 'memory', name: 'Agent Memory', description: 'Persistent memory search and storage.', category: 'data', risk: 'low', icon: '🧠', source: 'builtin' },

  // Security
  { id: '1password', name: '1Password', description: 'Read and manage secrets via 1Password CLI.', category: 'security', risk: 'critical', icon: '🔐', source: 'builtin' },
  { id: 'healthcheck', name: 'Security Audit', description: 'Host security hardening and risk checks.', category: 'security', risk: 'medium', icon: '🛡️', source: 'builtin' },

  // Social
  { id: 'twitter', name: 'Twitter/X', description: 'Post tweets, read timeline, manage social presence.', category: 'social', risk: 'high', icon: '🐦', source: 'builtin' },

  // Platform
  { id: 'gateway', name: 'Agent Runtime Gateway', description: 'Restart, configure, and update the agent runtime gateway.', category: 'platform', risk: 'critical', icon: '⚙️', source: 'builtin' },
  { id: 'sessions', name: 'Session Management', description: 'Spawn sub-agents, list sessions, send messages between sessions.', category: 'platform', risk: 'medium', icon: '🔄', source: 'builtin' },
  { id: 'nodes', name: 'Node Control', description: 'Discover and control paired devices (camera, screen, location).', category: 'platform', risk: 'high', icon: '📡', source: 'builtin' },

  // ─── Microsoft 365 (from individual skill files) ────────
  ...M365_SKILL_DEFS,

  // ─── Google Workspace (from individual skill files) ─────
  ...GWS_SKILL_DEFS,

  // ─── Collaboration ──────────────────────────────────────
  { id: 'slack', name: 'Slack', description: 'Messaging, channels, threads, apps, workflows, and Slack Connect.', category: 'collaboration', risk: 'medium', icon: '💬', source: 'builtin' },
  { id: 'zoom', name: 'Zoom', description: 'Video meetings, webinars, recordings, scheduling, and Zoom Phone.', category: 'collaboration', risk: 'medium', icon: '📹', source: 'builtin' },
  { id: 'discord', name: 'Discord', description: 'Messaging, voice channels, bots, and server management.', category: 'collaboration', risk: 'medium', icon: '🎮', source: 'builtin' },
  { id: 'webex', name: 'Webex', description: 'Cisco Webex meetings, messaging, calling, and device management.', category: 'collaboration', risk: 'medium', icon: '📞', source: 'builtin' },
  { id: 'mattermost', name: 'Mattermost', description: 'Open-source team messaging, channels, and integrations.', category: 'collaboration', risk: 'medium', icon: '💭', source: 'builtin' },

  // ─── CRM ────────────────────────────────────────────────
  { id: 'salesforce', name: 'Salesforce CRM', description: 'Leads, contacts, opportunities, accounts, cases, and custom objects.', category: 'crm', risk: 'medium', icon: '☁️', source: 'builtin' },
  { id: 'salesforce-service', name: 'Salesforce Service Cloud', description: 'Case management, knowledge base, service console, and omni-channel routing.', category: 'customer-support', risk: 'medium', icon: '🎧', source: 'builtin' },
  { id: 'salesforce-marketing', name: 'Salesforce Marketing Cloud', description: 'Email campaigns, journeys, audiences, and marketing automation.', category: 'marketing', risk: 'medium', icon: '📣', source: 'builtin' },
  { id: 'salesforce-commerce', name: 'Salesforce Commerce Cloud', description: 'Online storefronts, product catalogs, orders, and customer data.', category: 'ecommerce', risk: 'medium', icon: '🛒', source: 'builtin' },
  { id: 'hubspot-crm', name: 'HubSpot CRM', description: 'Contacts, deals, companies, tickets, and pipeline management.', category: 'crm', risk: 'medium', icon: '🟠', source: 'builtin' },
  { id: 'hubspot-marketing', name: 'HubSpot Marketing', description: 'Email marketing, landing pages, forms, workflows, and analytics.', category: 'marketing', risk: 'medium', icon: '📧', source: 'builtin' },
  { id: 'hubspot-sales', name: 'HubSpot Sales', description: 'Sales pipeline, sequences, meetings, quotes, and call tracking.', category: 'crm', risk: 'medium', icon: '💰', source: 'builtin' },
  { id: 'hubspot-service', name: 'HubSpot Service', description: 'Help desk, tickets, knowledge base, customer feedback, and live chat.', category: 'customer-support', risk: 'medium', icon: '🎯', source: 'builtin' },
  { id: 'pipedrive', name: 'Pipedrive', description: 'Sales CRM — deals, contacts, activities, and pipeline visualization.', category: 'crm', risk: 'medium', icon: '🔗', source: 'builtin' },
  { id: 'zoho-crm', name: 'Zoho CRM', description: 'Leads, contacts, deals, workflows, and custom modules.', category: 'crm', risk: 'medium', icon: '🟡', source: 'builtin' },

  // ─── Project Management ─────────────────────────────────
  { id: 'jira', name: 'Jira', description: 'Issues, sprints, boards, backlogs, epics, and agile project management.', category: 'project-management', risk: 'medium', icon: '🔷', source: 'builtin' },
  { id: 'confluence', name: 'Confluence', description: 'Wiki pages, spaces, templates, comments, and knowledge management.', category: 'project-management', risk: 'medium', icon: '📖', source: 'builtin' },
  { id: 'asana', name: 'Asana', description: 'Tasks, projects, timelines, portfolios, and workload management.', category: 'project-management', risk: 'medium', icon: '🔴', source: 'builtin' },
  { id: 'monday', name: 'Monday.com', description: 'Boards, items, automations, dashboards, and work management.', category: 'project-management', risk: 'medium', icon: '🟣', source: 'builtin' },
  { id: 'notion', name: 'Notion', description: 'Pages, databases, wikis, templates, and all-in-one workspace.', category: 'project-management', risk: 'medium', icon: '📓', source: 'builtin' },
  { id: 'linear', name: 'Linear', description: 'Issue tracking, cycles, projects, roadmaps, and triage.', category: 'project-management', risk: 'medium', icon: '🟪', source: 'builtin' },
  { id: 'trello', name: 'Trello', description: 'Boards, cards, lists, checklists, and power-ups.', category: 'project-management', risk: 'low', icon: '📌', source: 'builtin' },
  { id: 'clickup', name: 'ClickUp', description: 'Tasks, docs, whiteboards, goals, and time tracking.', category: 'project-management', risk: 'medium', icon: '⬆️', source: 'builtin' },
  { id: 'basecamp', name: 'Basecamp', description: 'Projects, message boards, to-dos, schedules, and campfires.', category: 'project-management', risk: 'low', icon: '🏕️', source: 'builtin' },
  { id: 'airtable', name: 'Airtable', description: 'Spreadsheet-database hybrid with views, automations, and apps.', category: 'project-management', risk: 'medium', icon: '🗃️', source: 'builtin' },

  // ─── Customer Support ───────────────────────────────────
  { id: 'zendesk', name: 'Zendesk', description: 'Tickets, help center, chat, talk, and customer analytics.', category: 'customer-support', risk: 'medium', icon: '🎧', source: 'builtin' },
  { id: 'intercom', name: 'Intercom', description: 'Live chat, inbox, help center, bots, and product tours.', category: 'customer-support', risk: 'medium', icon: '💬', source: 'builtin' },
  { id: 'freshdesk', name: 'Freshdesk', description: 'Tickets, automations, SLA management, and customer portal.', category: 'customer-support', risk: 'medium', icon: '🟢', source: 'builtin' },
  { id: 'servicenow', name: 'ServiceNow', description: 'IT service management, incidents, changes, assets, and workflows.', category: 'customer-support', risk: 'high', icon: '🔧', source: 'builtin' },
  { id: 'front', name: 'Front', description: 'Shared inbox, assignments, SLAs, tags, and team collaboration.', category: 'customer-support', risk: 'medium', icon: '📮', source: 'builtin' },

  // ─── Cloud Infrastructure — AWS ─────────────────────────
  { id: 'aws-s3', name: 'AWS S3', description: 'Object storage — buckets, objects, permissions, lifecycle policies.', category: 'cloud-infrastructure', risk: 'medium', icon: '🪣', source: 'builtin' },
  { id: 'aws-ec2', name: 'AWS EC2', description: 'Virtual machines — instances, AMIs, security groups, EBS volumes.', category: 'cloud-infrastructure', risk: 'high', icon: '🖥️', source: 'builtin' },
  { id: 'aws-lambda', name: 'AWS Lambda', description: 'Serverless functions — deployment, invocation, layers, event triggers.', category: 'cloud-infrastructure', risk: 'high', icon: 'λ', source: 'builtin' },
  { id: 'aws-rds', name: 'AWS RDS', description: 'Managed databases — instances, snapshots, parameter groups, and read replicas.', category: 'database', risk: 'high', icon: '🗄️', source: 'builtin' },
  { id: 'aws-cloudwatch', name: 'AWS CloudWatch', description: 'Monitoring, logs, alarms, dashboards, and metrics.', category: 'monitoring', risk: 'low', icon: '👁️', source: 'builtin' },
  { id: 'aws-iam', name: 'AWS IAM', description: 'Identity and access management — users, roles, policies, and MFA.', category: 'security', risk: 'critical', icon: '🔑', source: 'builtin' },
  { id: 'aws-ses', name: 'AWS SES', description: 'Simple Email Service — send, receive, templates, and domain verification.', category: 'communication', risk: 'medium', icon: '📧', source: 'builtin' },
  { id: 'aws-sns', name: 'AWS SNS', description: 'Simple Notification Service — topics, subscriptions, push notifications.', category: 'communication', risk: 'medium', icon: '🔔', source: 'builtin' },
  { id: 'aws-sqs', name: 'AWS SQS', description: 'Simple Queue Service — queues, messages, dead letter queues.', category: 'cloud-infrastructure', risk: 'medium', icon: '📨', source: 'builtin' },
  { id: 'aws-dynamodb', name: 'AWS DynamoDB', description: 'NoSQL database — tables, items, indexes, and streams.', category: 'database', risk: 'medium', icon: '⚡', source: 'builtin' },
  { id: 'aws-cloudformation', name: 'AWS CloudFormation', description: 'Infrastructure as code — stacks, templates, change sets.', category: 'devops', risk: 'high', icon: '🏗️', source: 'builtin' },

  // ─── Cloud Infrastructure — Azure ───────────────────────
  { id: 'azure-vms', name: 'Azure VMs', description: 'Virtual machines, scale sets, images, and managed disks.', category: 'cloud-infrastructure', risk: 'high', icon: '🖥️', source: 'builtin' },
  { id: 'azure-app-service', name: 'Azure App Service', description: 'Web apps, APIs, mobile backends, and deployment slots.', category: 'cloud-infrastructure', risk: 'medium', icon: '🌐', source: 'builtin' },
  { id: 'azure-functions', name: 'Azure Functions', description: 'Serverless compute — triggers, bindings, and durable functions.', category: 'cloud-infrastructure', risk: 'high', icon: 'ƒ', source: 'builtin' },
  { id: 'azure-storage', name: 'Azure Storage', description: 'Blobs, files, queues, tables, and data lake storage.', category: 'storage', risk: 'medium', icon: '💾', source: 'builtin' },
  { id: 'azure-sql', name: 'Azure SQL', description: 'Managed SQL databases, elastic pools, and server management.', category: 'database', risk: 'high', icon: '🗄️', source: 'builtin' },
  { id: 'azure-cosmosdb', name: 'Azure Cosmos DB', description: 'Globally distributed NoSQL database with multiple APIs.', category: 'database', risk: 'medium', icon: '🌍', source: 'builtin' },
  { id: 'azure-devops', name: 'Azure DevOps', description: 'Boards, repos, pipelines, test plans, and artifacts.', category: 'devops', risk: 'medium', icon: '🔷', source: 'builtin' },
  { id: 'azure-ad', name: 'Azure Active Directory', description: 'Identity management, SSO, conditional access, and app registrations.', category: 'security', risk: 'critical', icon: '🔐', source: 'builtin' },

  // ─── Cloud Infrastructure — GCP ─────────────────────────
  { id: 'gcp-compute', name: 'GCP Compute Engine', description: 'Virtual machines, instance groups, and persistent disks.', category: 'cloud-infrastructure', risk: 'high', icon: '🖥️', source: 'builtin' },
  { id: 'gcp-functions', name: 'GCP Cloud Functions', description: 'Serverless functions with event triggers.', category: 'cloud-infrastructure', risk: 'high', icon: 'ƒ', source: 'builtin' },
  { id: 'gcp-storage', name: 'GCP Cloud Storage', description: 'Object storage buckets, objects, and lifecycle management.', category: 'storage', risk: 'medium', icon: '🪣', source: 'builtin' },
  { id: 'gcp-bigquery', name: 'BigQuery', description: 'Data warehouse — SQL queries, datasets, tables, and ML models.', category: 'analytics', risk: 'medium', icon: '📊', source: 'builtin' },
  { id: 'gcp-run', name: 'GCP Cloud Run', description: 'Serverless containers — deploy, manage, and auto-scale.', category: 'cloud-infrastructure', risk: 'high', icon: '🏃', source: 'builtin' },
  { id: 'gcp-pubsub', name: 'GCP Pub/Sub', description: 'Messaging and event streaming — topics and subscriptions.', category: 'cloud-infrastructure', risk: 'medium', icon: '📨', source: 'builtin' },
  { id: 'gcp-firestore', name: 'Firestore', description: 'NoSQL document database with real-time sync.', category: 'database', risk: 'medium', icon: '🔥', source: 'builtin' },

  // ─── DevOps & CI/CD ─────────────────────────────────────
  { id: 'docker', name: 'Docker', description: 'Container management — images, containers, compose, and registries.', category: 'devops', risk: 'high', icon: '🐳', source: 'builtin' },
  { id: 'kubernetes', name: 'Kubernetes', description: 'Container orchestration — pods, deployments, services, and helm charts.', category: 'devops', risk: 'high', icon: '☸️', source: 'builtin' },
  { id: 'terraform', name: 'Terraform', description: 'Infrastructure as code — plan, apply, state management, and modules.', category: 'devops', risk: 'high', icon: '🏗️', source: 'builtin' },
  { id: 'ansible', name: 'Ansible', description: 'Configuration management — playbooks, roles, and inventories.', category: 'devops', risk: 'high', icon: '📜', source: 'builtin' },
  { id: 'github-actions', name: 'GitHub Actions', description: 'CI/CD workflows, actions marketplace, and secrets management.', category: 'devops', risk: 'medium', icon: '⚙️', source: 'builtin' },
  { id: 'gitlab-ci', name: 'GitLab CI/CD', description: 'Pipelines, runners, artifacts, environments, and deployments.', category: 'devops', risk: 'medium', icon: '🦊', source: 'builtin' },
  { id: 'jenkins', name: 'Jenkins', description: 'Build automation — jobs, pipelines, plugins, and agents.', category: 'devops', risk: 'medium', icon: '🏗️', source: 'builtin' },
  { id: 'circleci', name: 'CircleCI', description: 'CI/CD pipelines, orbs, caching, and test splitting.', category: 'devops', risk: 'medium', icon: '⭕', source: 'builtin' },
  { id: 'bitbucket', name: 'Bitbucket', description: 'Git repositories, pull requests, code review, and pipelines.', category: 'development', risk: 'medium', icon: '🔵', source: 'builtin' },
  { id: 'gitlab', name: 'GitLab', description: 'Repositories, merge requests, issues, and DevSecOps platform.', category: 'development', risk: 'medium', icon: '🦊', source: 'builtin' },
  { id: 'vercel', name: 'Vercel', description: 'Frontend deployment, serverless functions, edge config, and analytics.', category: 'devops', risk: 'medium', icon: '▲', source: 'builtin' },
  { id: 'netlify', name: 'Netlify', description: 'Web deployment, forms, identity, functions, and edge handlers.', category: 'devops', risk: 'medium', icon: '🌐', source: 'builtin' },

  // ─── Finance & Payments ─────────────────────────────────
  { id: 'stripe', name: 'Stripe', description: 'Payments, subscriptions, invoices, customers, and financial reports.', category: 'finance', risk: 'high', icon: '💳', source: 'builtin' },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Accounting — invoices, expenses, reports, payroll, and bank reconciliation.', category: 'finance', risk: 'high', icon: '📒', source: 'builtin' },
  { id: 'xero', name: 'Xero', description: 'Cloud accounting — invoicing, bank feeds, reporting, and payroll.', category: 'finance', risk: 'high', icon: '📗', source: 'builtin' },
  { id: 'freshbooks', name: 'FreshBooks', description: 'Invoicing, time tracking, expenses, and financial reports.', category: 'finance', risk: 'medium', icon: '📘', source: 'builtin' },
  { id: 'paypal', name: 'PayPal', description: 'Payments, invoices, subscriptions, and disputes.', category: 'finance', risk: 'high', icon: '💰', source: 'builtin' },
  { id: 'wise', name: 'Wise', description: 'International transfers, multi-currency accounts, and batch payments.', category: 'finance', risk: 'high', icon: '🌍', source: 'builtin' },
  { id: 'plaid', name: 'Plaid', description: 'Bank connections, account data, transactions, and identity verification.', category: 'finance', risk: 'critical', icon: '🏦', source: 'builtin' },

  // ─── Analytics & BI ─────────────────────────────────────
  { id: 'tableau', name: 'Tableau', description: 'Data visualization, dashboards, workbooks, and data sources.', category: 'analytics', risk: 'medium', icon: '📊', source: 'builtin' },
  { id: 'looker', name: 'Looker', description: 'Business intelligence — explores, dashboards, LookML, and scheduling.', category: 'analytics', risk: 'medium', icon: '🔍', source: 'builtin' },
  { id: 'mixpanel', name: 'Mixpanel', description: 'Product analytics — events, funnels, retention, and user profiles.', category: 'analytics', risk: 'low', icon: '📈', source: 'builtin' },
  { id: 'amplitude', name: 'Amplitude', description: 'Product analytics — behavioral data, cohorts, experiments, and segments.', category: 'analytics', risk: 'low', icon: '📉', source: 'builtin' },
  { id: 'segment', name: 'Segment', description: 'Customer data platform — sources, destinations, protocols, and personas.', category: 'analytics', risk: 'medium', icon: '🟢', source: 'builtin' },
  { id: 'google-analytics', name: 'Google Analytics', description: 'Web analytics — pageviews, events, conversions, audiences, and reports.', category: 'analytics', risk: 'low', icon: '📊', source: 'builtin' },
  { id: 'hotjar', name: 'Hotjar', description: 'Heatmaps, session recordings, surveys, and user feedback.', category: 'analytics', risk: 'low', icon: '🔥', source: 'builtin' },

  // ─── Design ─────────────────────────────────────────────
  { id: 'figma', name: 'Figma', description: 'UI/UX design — files, components, prototypes, and design tokens.', category: 'design', risk: 'low', icon: '🎨', source: 'builtin' },
  { id: 'canva', name: 'Canva', description: 'Graphic design — templates, brand kit, team designs, and media library.', category: 'design', risk: 'low', icon: '🖼️', source: 'builtin' },
  { id: 'miro', name: 'Miro', description: 'Online whiteboard — boards, frames, sticky notes, and templates.', category: 'design', risk: 'low', icon: '🟡', source: 'builtin' },
  { id: 'adobe-photoshop', name: 'Adobe Photoshop', description: 'Image editing, compositing, and batch processing.', category: 'design', risk: 'low', icon: '🎨', source: 'builtin' },
  { id: 'adobe-illustrator', name: 'Adobe Illustrator', description: 'Vector graphics, logos, icons, and illustrations.', category: 'design', risk: 'low', icon: '✒️', source: 'builtin' },
  { id: 'adobe-premiere', name: 'Adobe Premiere Pro', description: 'Video editing, color grading, audio mixing, and export.', category: 'media', risk: 'low', icon: '🎬', source: 'builtin' },
  { id: 'adobe-after-effects', name: 'Adobe After Effects', description: 'Motion graphics, visual effects, and compositing.', category: 'media', risk: 'low', icon: '✨', source: 'builtin' },
  { id: 'adobe-indesign', name: 'Adobe InDesign', description: 'Page layout, publishing, and document design.', category: 'design', risk: 'low', icon: '📄', source: 'builtin' },
  { id: 'adobe-xd', name: 'Adobe XD', description: 'UI/UX design, prototyping, and design systems.', category: 'design', risk: 'low', icon: '🎯', source: 'builtin' },

  // ─── Marketing ──────────────────────────────────────────
  { id: 'mailchimp', name: 'Mailchimp', description: 'Email campaigns, audiences, automations, templates, and analytics.', category: 'marketing', risk: 'medium', icon: '🐵', source: 'builtin' },
  { id: 'sendgrid', name: 'SendGrid', description: 'Transactional and marketing email — templates, stats, and deliverability.', category: 'marketing', risk: 'medium', icon: '📧', source: 'builtin' },
  { id: 'google-ads', name: 'Google Ads', description: 'Search, display, video, and shopping campaigns. Bidding and reporting.', category: 'marketing', risk: 'high', icon: '📢', source: 'builtin' },
  { id: 'meta-ads', name: 'Meta Ads', description: 'Facebook and Instagram advertising — campaigns, audiences, and creatives.', category: 'marketing', risk: 'high', icon: '📱', source: 'builtin' },
  { id: 'linkedin-marketing', name: 'LinkedIn Marketing', description: 'Sponsored content, InMail campaigns, and lead gen forms.', category: 'marketing', risk: 'high', icon: '🔗', source: 'builtin' },
  { id: 'activecampaign', name: 'ActiveCampaign', description: 'Email automation, CRM, site messaging, and machine learning.', category: 'marketing', risk: 'medium', icon: '📬', source: 'builtin' },
  { id: 'buffer', name: 'Buffer', description: 'Social media scheduling, analytics, and team collaboration.', category: 'social', risk: 'medium', icon: '📋', source: 'builtin' },
  { id: 'hootsuite', name: 'Hootsuite', description: 'Social media management — scheduling, monitoring, and reporting.', category: 'social', risk: 'medium', icon: '🦉', source: 'builtin' },

  // ─── E-Commerce ─────────────────────────────────────────
  { id: 'shopify', name: 'Shopify', description: 'Online store — products, orders, customers, inventory, and shipping.', category: 'ecommerce', risk: 'medium', icon: '🛍️', source: 'builtin' },
  { id: 'woocommerce', name: 'WooCommerce', description: 'WordPress ecommerce — products, orders, coupons, and shipping.', category: 'ecommerce', risk: 'medium', icon: '🛒', source: 'builtin' },
  { id: 'bigcommerce', name: 'BigCommerce', description: 'Enterprise ecommerce — catalog, orders, customers, and channels.', category: 'ecommerce', risk: 'medium', icon: '🏬', source: 'builtin' },
  { id: 'magento', name: 'Magento', description: 'Adobe Commerce — products, categories, orders, and customer segments.', category: 'ecommerce', risk: 'medium', icon: '🧲', source: 'builtin' },

  // ─── HR & People ────────────────────────────────────────
  { id: 'bamboohr', name: 'BambooHR', description: 'Employee records, time-off, onboarding, performance, and reporting.', category: 'hr', risk: 'high', icon: '🎋', source: 'builtin' },
  { id: 'workday', name: 'Workday', description: 'HCM, payroll, time tracking, benefits, and talent management.', category: 'hr', risk: 'high', icon: '🏢', source: 'builtin' },
  { id: 'gusto', name: 'Gusto', description: 'Payroll, benefits, HR, and compliance for small businesses.', category: 'hr', risk: 'high', icon: '💚', source: 'builtin' },
  { id: 'rippling', name: 'Rippling', description: 'Unified HR, IT, and Finance — payroll, devices, apps, and benefits.', category: 'hr', risk: 'high', icon: '🌊', source: 'builtin' },
  { id: 'lever', name: 'Lever', description: 'Recruiting — job postings, candidates, interviews, and offer letters.', category: 'hr', risk: 'medium', icon: '🔧', source: 'builtin' },
  { id: 'greenhouse', name: 'Greenhouse', description: 'Talent acquisition — requisitions, scorecards, scheduling, and reports.', category: 'hr', risk: 'medium', icon: '🌱', source: 'builtin' },

  // ─── Legal & Compliance ─────────────────────────────────
  { id: 'docusign', name: 'DocuSign', description: 'Electronic signatures, envelopes, templates, and agreement workflows.', category: 'legal', risk: 'high', icon: '✍️', source: 'builtin' },
  { id: 'pandadoc', name: 'PandaDoc', description: 'Document automation — proposals, quotes, contracts, and e-signatures.', category: 'legal', risk: 'medium', icon: '🐼', source: 'builtin' },
  { id: 'clio', name: 'Clio', description: 'Legal practice management — matters, time entries, billing, and documents.', category: 'legal', risk: 'high', icon: '⚖️', source: 'builtin' },

  // ─── Storage & File Sharing ─────────────────────────────
  { id: 'dropbox', name: 'Dropbox', description: 'Cloud storage, file sharing, Paper docs, and team spaces.', category: 'storage', risk: 'medium', icon: '📦', source: 'builtin' },
  { id: 'box', name: 'Box', description: 'Enterprise content management — files, folders, metadata, and workflows.', category: 'storage', risk: 'medium', icon: '📁', source: 'builtin' },

  // ─── Database ───────────────────────────────────────────
  { id: 'mongodb-atlas', name: 'MongoDB Atlas', description: 'Cloud MongoDB — clusters, collections, indexes, and aggregations.', category: 'database', risk: 'high', icon: '🍃', source: 'builtin' },
  { id: 'redis-cloud', name: 'Redis Cloud', description: 'Managed Redis — databases, keys, streams, and pub/sub.', category: 'database', risk: 'medium', icon: '🔴', source: 'builtin' },
  { id: 'elasticsearch', name: 'Elasticsearch', description: 'Search and analytics — indexes, queries, aggregations, and mappings.', category: 'database', risk: 'medium', icon: '🔎', source: 'builtin' },
  { id: 'snowflake', name: 'Snowflake', description: 'Cloud data warehouse — SQL queries, warehouses, stages, and shares.', category: 'database', risk: 'high', icon: '❄️', source: 'builtin' },
  { id: 'supabase', name: 'Supabase', description: 'Open-source Firebase — Postgres, auth, storage, realtime, and edge functions.', category: 'database', risk: 'medium', icon: '⚡', source: 'builtin' },
  { id: 'planetscale', name: 'PlanetScale', description: 'Serverless MySQL — branches, deploy requests, and schema management.', category: 'database', risk: 'medium', icon: '🌐', source: 'builtin' },

  // ─── Monitoring & Observability ─────────────────────────
  { id: 'datadog', name: 'Datadog', description: 'APM, logs, metrics, dashboards, monitors, and synthetics.', category: 'monitoring', risk: 'medium', icon: '🐶', source: 'builtin' },
  { id: 'pagerduty', name: 'PagerDuty', description: 'Incident management — alerts, escalations, schedules, and on-call.', category: 'monitoring', risk: 'medium', icon: '🚨', source: 'builtin' },
  { id: 'sentry', name: 'Sentry', description: 'Error tracking — issues, releases, performance, and session replay.', category: 'monitoring', risk: 'low', icon: '🪲', source: 'builtin' },
  { id: 'newrelic', name: 'New Relic', description: 'Full-stack observability — APM, infrastructure, logs, and dashboards.', category: 'monitoring', risk: 'medium', icon: '🔭', source: 'builtin' },
  { id: 'grafana', name: 'Grafana', description: 'Dashboards, alerting, and data source visualization.', category: 'monitoring', risk: 'low', icon: '📊', source: 'builtin' },
  { id: 'statuspage', name: 'Statuspage', description: 'Public and private status pages, incidents, and maintenance windows.', category: 'monitoring', risk: 'medium', icon: '🟢', source: 'builtin' },
  { id: 'opsgenie', name: 'Opsgenie', description: 'Alert management, on-call schedules, escalations, and incident response.', category: 'monitoring', risk: 'medium', icon: '🔔', source: 'builtin' },

  // ─── Security & Identity ────────────────────────────────
  { id: 'okta', name: 'Okta', description: 'Identity management — SSO, MFA, user lifecycle, and API access management.', category: 'security', risk: 'critical', icon: '🔐', source: 'builtin' },
  { id: 'auth0', name: 'Auth0', description: 'Authentication — login flows, social connections, roles, and organizations.', category: 'security', risk: 'high', icon: '🔓', source: 'builtin' },
  { id: 'vault-hashicorp', name: 'HashiCorp Vault', description: 'Secrets management — KV store, dynamic credentials, encryption, and PKI.', category: 'security', risk: 'critical', icon: '🗝️', source: 'builtin' },
  { id: 'crowdstrike', name: 'CrowdStrike', description: 'Endpoint security — detections, incidents, IoCs, and threat intelligence.', category: 'security', risk: 'high', icon: '🦅', source: 'builtin' },
  { id: 'snyk', name: 'Snyk', description: 'Developer security — vulnerability scanning, license compliance, and SBOM.', category: 'security', risk: 'medium', icon: '🔍', source: 'builtin' },

  // ─── Social Media (expanded) ────────────────────────────
  { id: 'linkedin', name: 'LinkedIn', description: 'Professional networking — posts, connections, company pages, and messaging.', category: 'social', risk: 'high', icon: '🔗', source: 'builtin' },
  { id: 'instagram', name: 'Instagram', description: 'Photo/video sharing — posts, stories, reels, and insights.', category: 'social', risk: 'high', icon: '📸', source: 'builtin' },
  { id: 'facebook', name: 'Facebook Pages', description: 'Page management — posts, comments, insights, and messenger.', category: 'social', risk: 'high', icon: '📘', source: 'builtin' },
  { id: 'youtube', name: 'YouTube', description: 'Video platform — uploads, playlists, analytics, comments, and live streams.', category: 'social', risk: 'high', icon: '▶️', source: 'builtin' },
  { id: 'tiktok', name: 'TikTok Business', description: 'Short-form video — uploads, analytics, and business tools.', category: 'social', risk: 'high', icon: '🎵', source: 'builtin' },
  { id: 'reddit', name: 'Reddit', description: 'Posts, comments, subreddits, and moderation.', category: 'social', risk: 'medium', icon: '🔴', source: 'builtin' },

  // ─── Communication (expanded) ───────────────────────────
  { id: 'twilio', name: 'Twilio', description: 'Programmable voice, SMS, video, and messaging APIs.', category: 'communication', risk: 'high', icon: '📞', source: 'builtin' },
  { id: 'vonage', name: 'Vonage', description: 'Communication APIs — SMS, voice, video, and verification.', category: 'communication', risk: 'high', icon: '📱', source: 'builtin' },
  { id: 'ringcentral', name: 'RingCentral', description: 'Cloud phone system — calls, messages, video, and fax.', category: 'communication', risk: 'medium', icon: '📞', source: 'builtin' },

  // ─── Automation (expanded) ──────────────────────────────
  { id: 'zapier', name: 'Zapier', description: 'No-code automation — zaps, triggers, actions, and multi-step workflows.', category: 'automation', risk: 'medium', icon: '⚡', source: 'builtin' },
  { id: 'make', name: 'Make (Integromat)', description: 'Visual automation — scenarios, modules, and data routing.', category: 'automation', risk: 'medium', icon: '🔀', source: 'builtin' },
  { id: 'n8n', name: 'n8n', description: 'Open-source workflow automation — nodes, triggers, and custom functions.', category: 'automation', risk: 'medium', icon: '🔄', source: 'builtin' },

  // ─── Infrastructure ─────────────────────────────────────
  { id: 'cloudflare', name: 'Cloudflare', description: 'CDN, DNS, Workers, Pages, security, and zero trust.', category: 'cloud-infrastructure', risk: 'high', icon: '🔶', source: 'builtin' },
  { id: 'digitalocean', name: 'DigitalOcean', description: 'Cloud infrastructure — droplets, databases, spaces, and app platform.', category: 'cloud-infrastructure', risk: 'high', icon: '🌊', source: 'builtin' },
  { id: 'heroku', name: 'Heroku', description: 'Cloud platform — apps, dynos, add-ons, and pipelines.', category: 'cloud-infrastructure', risk: 'medium', icon: '🟣', source: 'builtin' },
  { id: 'fly-io', name: 'Fly.io', description: 'Edge deployment — machines, volumes, secrets, and global routing.', category: 'cloud-infrastructure', risk: 'medium', icon: '🪁', source: 'builtin' },

  // ─── Enterprise Utility Skills (from individual skill files) ─
  ...ENTERPRISE_SKILL_DEFS,
];

// ─── Permission Engine ──────────────────────────────────

export class PermissionEngine {
  private skills: Map<string, SkillDefinition> = new Map();
  private profiles: Map<string, AgentPermissionProfile> = new Map();
  private engineDb?: import('./db-adapter.js').EngineDatabase;

  constructor(skills?: SkillDefinition[]) {
    if (skills) {
      for (const s of skills) this.skills.set(s.id, s);
    }
  }

  /**
   * Set the database adapter and load existing profiles from DB
   */
  async setDb(db: import('./db-adapter.js').EngineDatabase): Promise<void> {
    this.engineDb = db;
  }

  registerSkill(skill: SkillDefinition) {
    this.skills.set(skill.id, skill);
  }

  setProfile(agentId: string, profile: AgentPermissionProfile, orgId?: string) {
    this.profiles.set(agentId, profile);
    if (this.engineDb && orgId) {
      this.engineDb.upsertPermissionProfile(orgId, profile).catch((err) => {
        console.error(`[permissions] Failed to persist profile for agent ${agentId}:`, err);
      });
    }
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
    if (profile.tools.blocked.includes(toolId)) {
      return { allowed: false, reason: `Tool "${toolId}" is explicitly blocked`, requiresApproval: false };
    }
    if (profile.tools.allowed.includes(toolId)) {
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
    const skillAllowed = profile.skills.mode === 'allowlist'
      ? profile.skills.list.includes(tool.skillId)
      : !profile.skills.list.includes(tool.skillId);

    if (!skillAllowed) {
      return { allowed: false, reason: `Skill "${tool.skillId}" is not permitted`, requiresApproval: false };
    }

    // 7. Risk level check
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const toolRiskIdx = riskOrder.indexOf(tool.risk);
    const maxRiskIdx = riskOrder.indexOf(profile.maxRiskLevel);
    if (toolRiskIdx > maxRiskIdx) {
      return { allowed: false, reason: `Tool risk "${tool.risk}" exceeds max allowed "${profile.maxRiskLevel}"`, requiresApproval: false };
    }

    // 8. Side-effect restrictions
    for (const effect of tool.sideEffects) {
      if (profile.blockedSideEffects.includes(effect)) {
        return { allowed: false, reason: `Side effect "${effect}" is blocked`, requiresApproval: false };
      }
    }

    // 9. Check if approval is required
    return this._checkApproval(profile, toolId, tool);
  }

  private _checkApproval(profile: AgentPermissionProfile, toolId: string, tool?: ToolDefinition): PermissionResult {
    if (!profile.requireApproval.enabled) {
      return { allowed: true, reason: 'Permitted', requiresApproval: false };
    }

    if (tool) {
      // Check risk-level approval
      if (profile.requireApproval.forRiskLevels.includes(tool.risk)) {
        return { allowed: true, reason: 'Requires human approval (risk level)', requiresApproval: true };
      }
      // Check side-effect approval
      for (const effect of tool.sideEffects) {
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
        const perm = this.checkPermission(agentId, tool.id);
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
        const perm = this.checkPermission(agentId, tool.id);
        if (perm.allowed) {
          allowed.push(tool.id);
          if (perm.requiresApproval) approval.push(tool.id);
        } else {
          blocked.push(tool.id);
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

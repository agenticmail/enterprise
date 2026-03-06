/**
 * CLI: npx @agenticmail/enterprise build-skill
 *
 * Interactive AI-assisted skill scaffolding. Prompts for the target
 * application/service, generates a production-quality agenticmail-skill.json
 * manifest with rich tool parameters, proper descriptions, authentication
 * config, rate limiting, and comprehensive README.
 *
 * Generation priority:
 *   1. Direct LLM API call (Anthropic/OpenAI key from env)
 *   2. Local agent runtime (/api/chat)
 *   3. Intelligent template-based generation
 */

import { validateSkillManifest, VALID_CATEGORIES, VALID_RISK_LEVELS, VALID_SIDE_EFFECTS, VALID_TOOL_CATEGORIES } from './skill-validator.js';

// ─── Well-Known Service Database ──────────────────────

interface ServiceInfo {
  description: string;
  category: string;
  authType: 'api-key' | 'oauth2' | 'basic' | 'token' | 'custom';
  authLabel: string;
  authDescription: string;
  baseUrl?: string;
  docsUrl?: string;
  rateLimits?: { requests: number; window: string };
  scopes?: string[];
  suggestedOps: OperationTemplate[];
}

interface OperationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'read' | 'write' | 'execute' | 'communicate' | 'destroy';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  sideEffects: string[];
  parameters: Record<string, ParameterDef>;
}

interface ParameterDef {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  items?: { type: string };
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  example?: any;
}

const WELL_KNOWN_SERVICES: Record<string, ServiceInfo> = {
  notion: {
    description: 'Connect to Notion workspaces to manage pages, databases, blocks, and comments. Full CRUD on structured data with rich content support.',
    category: 'productivity',
    authType: 'token',
    authLabel: 'Integration Token',
    authDescription: 'Notion internal integration token from https://www.notion.so/my-integrations',
    baseUrl: 'https://api.notion.com/v1',
    docsUrl: 'https://developers.notion.com',
    rateLimits: { requests: 3, window: 'second' },
    suggestedOps: [
      {
        id: 'notion_search', name: 'Search', description: 'Search across all pages and databases in the workspace by title or content',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          query: { type: 'string', description: 'Search query text', required: true, example: 'Q3 roadmap' },
          filter: { type: 'string', description: 'Filter results by object type', enum: ['page', 'database'] },
          sort_direction: { type: 'string', description: 'Sort order by last edited time', enum: ['ascending', 'descending'], default: 'descending' },
          page_size: { type: 'number', description: 'Number of results to return (max 100)', minimum: 1, maximum: 100, default: 10 },
        },
      },
      {
        id: 'notion_get_page', name: 'Get Page', description: 'Retrieve a page and its properties by ID',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          page_id: { type: 'string', description: 'Notion page ID or URL', required: true, example: 'a1b2c3d4-e5f6-...' },
          include_content: { type: 'boolean', description: 'Also retrieve all block children (page content)', default: false },
        },
      },
      {
        id: 'notion_create_page', name: 'Create Page', description: 'Create a new page in a database or as a child of another page',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          parent_id: { type: 'string', description: 'Parent page ID or database ID', required: true },
          parent_type: { type: 'string', description: 'Type of parent', required: true, enum: ['page', 'database'] },
          title: { type: 'string', description: 'Page title', required: true, maxLength: 2000 },
          properties: { type: 'object', description: 'Database properties (key-value pairs matching the database schema)' },
          content: { type: 'string', description: 'Page body content in markdown (converted to Notion blocks)' },
          icon: { type: 'string', description: 'Page icon (emoji or external URL)', example: '📋' },
          cover: { type: 'string', description: 'Cover image URL' },
        },
      },
      {
        id: 'notion_update_page', name: 'Update Page', description: 'Update a page\'s properties, icon, cover, or archive status',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          page_id: { type: 'string', description: 'Page ID to update', required: true },
          properties: { type: 'object', description: 'Properties to update (key-value pairs)' },
          icon: { type: 'string', description: 'New icon (emoji or URL)' },
          cover: { type: 'string', description: 'New cover image URL' },
          archived: { type: 'boolean', description: 'Set to true to archive/trash the page' },
        },
      },
      {
        id: 'notion_query_database', name: 'Query Database', description: 'Query a Notion database with filters, sorts, and pagination',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          database_id: { type: 'string', description: 'Database ID to query', required: true },
          filter: { type: 'object', description: 'Notion filter object (see API docs for schema)' },
          sorts: { type: 'array', description: 'Array of sort objects: [{property, direction}]', items: { type: 'object' } },
          page_size: { type: 'number', description: 'Results per page (max 100)', minimum: 1, maximum: 100, default: 25 },
          start_cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        },
      },
      {
        id: 'notion_list_databases', name: 'List Databases', description: 'List all databases the integration has access to',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          page_size: { type: 'number', description: 'Number of results (max 100)', minimum: 1, maximum: 100, default: 25 },
        },
      },
      {
        id: 'notion_append_blocks', name: 'Append Content', description: 'Append new content blocks to an existing page',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          page_id: { type: 'string', description: 'Page ID to append content to', required: true },
          content: { type: 'string', description: 'Content in markdown format to append', required: true },
          after: { type: 'string', description: 'Block ID to insert after (appends to end if omitted)' },
        },
      },
      {
        id: 'notion_delete_block', name: 'Delete Block', description: 'Delete (archive) a specific content block from a page',
        category: 'destroy', riskLevel: 'high', sideEffects: ['deletes-data', 'network-request'],
        parameters: {
          block_id: { type: 'string', description: 'Block ID to delete', required: true },
        },
      },
      {
        id: 'notion_add_comment', name: 'Add Comment', description: 'Add a comment to a page or discussion thread',
        category: 'communicate', riskLevel: 'medium', sideEffects: ['sends-message', 'network-request'],
        parameters: {
          page_id: { type: 'string', description: 'Page ID to comment on', required: true },
          content: { type: 'string', description: 'Comment text in rich text format', required: true, maxLength: 2000 },
          discussion_id: { type: 'string', description: 'Reply to a specific discussion thread' },
        },
      },
      {
        id: 'notion_get_comments', name: 'Get Comments', description: 'Retrieve all comments on a page or block',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          block_id: { type: 'string', description: 'Page or block ID to get comments for', required: true },
          page_size: { type: 'number', description: 'Results per page (max 100)', minimum: 1, maximum: 100, default: 25 },
        },
      },
    ],
  },
  slack: {
    description: 'Integrate with Slack workspaces to send messages, manage channels, search history, upload files, and handle reactions.',
    category: 'communication',
    authType: 'oauth2',
    authLabel: 'Bot Token',
    authDescription: 'Slack Bot User OAuth Token (xoxb-...) from https://api.slack.com/apps',
    baseUrl: 'https://slack.com/api',
    docsUrl: 'https://api.slack.com/methods',
    rateLimits: { requests: 50, window: 'minute' },
    scopes: ['channels:read', 'channels:write', 'chat:write', 'files:read', 'files:write', 'reactions:read', 'reactions:write', 'search:read', 'users:read'],
    suggestedOps: [
      {
        id: 'slack_send_message', name: 'Send Message', description: 'Post a message to a Slack channel or DM',
        category: 'communicate', riskLevel: 'medium', sideEffects: ['sends-message', 'network-request'],
        parameters: {
          channel: { type: 'string', description: 'Channel ID or name (e.g. #general or C01234)', required: true },
          text: { type: 'string', description: 'Message text (supports mrkdwn formatting)', required: true, maxLength: 40000 },
          thread_ts: { type: 'string', description: 'Thread timestamp to reply in a thread' },
          unfurl_links: { type: 'boolean', description: 'Enable link previews', default: true },
          blocks: { type: 'array', description: 'Block Kit blocks for rich layout', items: { type: 'object' } },
        },
      },
      {
        id: 'slack_list_channels', name: 'List Channels', description: 'List public and private channels in the workspace',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          types: { type: 'string', description: 'Comma-separated channel types', default: 'public_channel,private_channel', enum: ['public_channel', 'private_channel', 'mpim', 'im'] },
          limit: { type: 'number', description: 'Max channels to return', minimum: 1, maximum: 1000, default: 100 },
          exclude_archived: { type: 'boolean', description: 'Exclude archived channels', default: true },
        },
      },
      {
        id: 'slack_search', name: 'Search Messages', description: 'Search for messages across the workspace',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          query: { type: 'string', description: 'Search query (supports Slack search modifiers)', required: true, example: 'from:@alice in:#engineering after:2024-01-01' },
          sort: { type: 'string', description: 'Sort order', enum: ['score', 'timestamp'], default: 'score' },
          count: { type: 'number', description: 'Number of results', minimum: 1, maximum: 100, default: 20 },
        },
      },
      {
        id: 'slack_get_history', name: 'Channel History', description: 'Fetch message history from a channel',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          channel: { type: 'string', description: 'Channel ID', required: true },
          limit: { type: 'number', description: 'Number of messages', minimum: 1, maximum: 1000, default: 50 },
          oldest: { type: 'string', description: 'Start of time range (Unix timestamp)' },
          latest: { type: 'string', description: 'End of time range (Unix timestamp)' },
        },
      },
      {
        id: 'slack_upload_file', name: 'Upload File', description: 'Upload a file to a channel',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request', 'modifies-files'],
        parameters: {
          channel: { type: 'string', description: 'Channel to share file in', required: true },
          content: { type: 'string', description: 'File content (for text files)' },
          file_path: { type: 'string', description: 'Local file path to upload' },
          filename: { type: 'string', description: 'Filename to display', required: true },
          title: { type: 'string', description: 'File title' },
          initial_comment: { type: 'string', description: 'Message to include with the file' },
        },
      },
      {
        id: 'slack_react', name: 'Add Reaction', description: 'Add an emoji reaction to a message',
        category: 'communicate', riskLevel: 'low', sideEffects: ['network-request'],
        parameters: {
          channel: { type: 'string', description: 'Channel containing the message', required: true },
          timestamp: { type: 'string', description: 'Message timestamp to react to', required: true },
          name: { type: 'string', description: 'Emoji name without colons (e.g. thumbsup)', required: true },
        },
      },
      {
        id: 'slack_set_topic', name: 'Set Topic', description: 'Set the topic of a channel',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          channel: { type: 'string', description: 'Channel ID', required: true },
          topic: { type: 'string', description: 'New channel topic', required: true, maxLength: 250 },
        },
      },
      {
        id: 'slack_list_users', name: 'List Users', description: 'List all users in the workspace',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          limit: { type: 'number', description: 'Max users to return', minimum: 1, maximum: 1000, default: 200 },
          include_locale: { type: 'boolean', description: 'Include locale data', default: false },
        },
      },
    ],
  },
  airtable: {
    description: 'Connect to Airtable bases to query, create, update, and delete records, manage views, and upload attachments.',
    category: 'database',
    authType: 'token',
    authLabel: 'Personal Access Token',
    authDescription: 'Airtable personal access token from https://airtable.com/create/tokens',
    baseUrl: 'https://api.airtable.com/v0',
    docsUrl: 'https://airtable.com/developers/web/api',
    rateLimits: { requests: 5, window: 'second' },
    suggestedOps: [
      {
        id: 'airtable_list_records', name: 'List Records', description: 'List records from a table with optional filtering, sorting, and field selection',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          base_id: { type: 'string', description: 'Airtable base ID (starts with app...)', required: true },
          table: { type: 'string', description: 'Table name or ID', required: true },
          view: { type: 'string', description: 'View name or ID to use for default filtering/sorting' },
          filter_formula: { type: 'string', description: 'Airtable formula to filter records', example: '{Status} = "Active"' },
          sort: { type: 'array', description: 'Sort specification: [{field, direction}]', items: { type: 'object' } },
          fields: { type: 'array', description: 'Specific field names to return', items: { type: 'string' } },
          max_records: { type: 'number', description: 'Maximum records to return', minimum: 1, maximum: 100, default: 25 },
          page_size: { type: 'number', description: 'Records per page', minimum: 1, maximum: 100, default: 25 },
          offset: { type: 'string', description: 'Pagination offset from previous response' },
        },
      },
      {
        id: 'airtable_get_record', name: 'Get Record', description: 'Retrieve a single record by ID',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          base_id: { type: 'string', description: 'Base ID', required: true },
          table: { type: 'string', description: 'Table name or ID', required: true },
          record_id: { type: 'string', description: 'Record ID (starts with rec...)', required: true },
        },
      },
      {
        id: 'airtable_create_records', name: 'Create Records', description: 'Create one or more records in a table (max 10 per request)',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          base_id: { type: 'string', description: 'Base ID', required: true },
          table: { type: 'string', description: 'Table name or ID', required: true },
          records: { type: 'array', description: 'Array of record objects with fields property', required: true, items: { type: 'object' } },
          typecast: { type: 'boolean', description: 'Auto-convert string values to proper field types', default: false },
        },
      },
      {
        id: 'airtable_update_records', name: 'Update Records', description: 'Update one or more existing records (max 10 per request)',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          base_id: { type: 'string', description: 'Base ID', required: true },
          table: { type: 'string', description: 'Table name or ID', required: true },
          records: { type: 'array', description: 'Array of {id, fields} objects', required: true, items: { type: 'object' } },
          method: { type: 'string', description: 'Update method', enum: ['patch', 'put'], default: 'patch' },
          typecast: { type: 'boolean', description: 'Auto-convert values', default: false },
        },
      },
      {
        id: 'airtable_delete_records', name: 'Delete Records', description: 'Delete one or more records by ID (max 10 per request)',
        category: 'destroy', riskLevel: 'high', sideEffects: ['deletes-data', 'network-request'],
        parameters: {
          base_id: { type: 'string', description: 'Base ID', required: true },
          table: { type: 'string', description: 'Table name or ID', required: true },
          record_ids: { type: 'array', description: 'Record IDs to delete', required: true, items: { type: 'string' } },
        },
      },
      {
        id: 'airtable_list_bases', name: 'List Bases', description: 'List all accessible bases in the workspace',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          offset: { type: 'string', description: 'Pagination offset' },
        },
      },
      {
        id: 'airtable_get_schema', name: 'Get Table Schema', description: 'Get the schema (fields, types, options) of all tables in a base',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          base_id: { type: 'string', description: 'Base ID', required: true },
        },
      },
    ],
  },
  stripe: {
    description: 'Integrate with Stripe for payment processing, customer management, subscription handling, invoice management, and financial reporting.',
    category: 'finance',
    authType: 'api-key',
    authLabel: 'Secret Key',
    authDescription: 'Stripe secret API key (sk_live_... or sk_test_...) from https://dashboard.stripe.com/apikeys',
    baseUrl: 'https://api.stripe.com/v1',
    docsUrl: 'https://docs.stripe.com/api',
    rateLimits: { requests: 100, window: 'second' },
    suggestedOps: [
      {
        id: 'stripe_list_customers', name: 'List Customers', description: 'List customers with optional filtering by email, creation date, or metadata',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          email: { type: 'string', description: 'Filter by exact email address' },
          limit: { type: 'number', description: 'Number of results (max 100)', minimum: 1, maximum: 100, default: 25 },
          starting_after: { type: 'string', description: 'Cursor for pagination' },
          created_after: { type: 'string', description: 'Filter by creation date (ISO 8601)' },
        },
      },
      {
        id: 'stripe_create_customer', name: 'Create Customer', description: 'Create a new Stripe customer with email, name, and metadata',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          email: { type: 'string', description: 'Customer email address', required: true },
          name: { type: 'string', description: 'Customer full name' },
          description: { type: 'string', description: 'Internal description' },
          metadata: { type: 'object', description: 'Key-value metadata pairs' },
          payment_method: { type: 'string', description: 'Default payment method ID to attach' },
        },
      },
      {
        id: 'stripe_create_invoice', name: 'Create Invoice', description: 'Create and optionally finalize/send an invoice',
        category: 'write', riskLevel: 'high', sideEffects: ['network-request', 'financial'],
        parameters: {
          customer: { type: 'string', description: 'Customer ID (cus_...)', required: true },
          items: { type: 'array', description: 'Line items: [{description, amount, quantity}]', required: true, items: { type: 'object' } },
          auto_advance: { type: 'boolean', description: 'Auto-finalize and send', default: false },
          collection_method: { type: 'string', description: 'How to collect payment', enum: ['charge_automatically', 'send_invoice'], default: 'send_invoice' },
          days_until_due: { type: 'number', description: 'Days until invoice is due', default: 30 },
          memo: { type: 'string', description: 'Internal memo (not shown to customer)' },
        },
      },
      {
        id: 'stripe_list_payments', name: 'List Payments', description: 'List payment intents with status and amount filtering',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          customer: { type: 'string', description: 'Filter by customer ID' },
          status: { type: 'string', description: 'Filter by status', enum: ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'succeeded', 'canceled'] },
          limit: { type: 'number', description: 'Number of results', minimum: 1, maximum: 100, default: 25 },
          created_after: { type: 'string', description: 'Filter by creation date (ISO 8601)' },
        },
      },
      {
        id: 'stripe_get_balance', name: 'Get Balance', description: 'Retrieve the current account balance (available, pending, connect reserved)',
        category: 'read', riskLevel: 'medium', sideEffects: [],
        parameters: {},
      },
      {
        id: 'stripe_refund', name: 'Create Refund', description: 'Refund a payment (full or partial)',
        category: 'write', riskLevel: 'critical', sideEffects: ['financial', 'network-request'],
        parameters: {
          payment_intent: { type: 'string', description: 'Payment Intent ID (pi_...)', required: true },
          amount: { type: 'number', description: 'Amount to refund in cents (omit for full refund)' },
          reason: { type: 'string', description: 'Refund reason', enum: ['duplicate', 'fraudulent', 'requested_by_customer'] },
        },
      },
    ],
  },
  github: {
    description: 'Connect to GitHub for repository management, issue tracking, pull request workflows, code search, and Actions CI/CD.',
    category: 'development',
    authType: 'token',
    authLabel: 'Personal Access Token',
    authDescription: 'GitHub personal access token (classic or fine-grained) from https://github.com/settings/tokens',
    baseUrl: 'https://api.github.com',
    docsUrl: 'https://docs.github.com/rest',
    rateLimits: { requests: 5000, window: 'hour' },
    suggestedOps: [
      {
        id: 'github_list_repos', name: 'List Repositories', description: 'List repositories for the authenticated user or an organization',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          owner: { type: 'string', description: 'User or org name (omit for authenticated user)' },
          type: { type: 'string', description: 'Repository type filter', enum: ['all', 'owner', 'public', 'private', 'member'], default: 'all' },
          sort: { type: 'string', description: 'Sort field', enum: ['created', 'updated', 'pushed', 'full_name'], default: 'updated' },
          per_page: { type: 'number', description: 'Results per page', minimum: 1, maximum: 100, default: 30 },
        },
      },
      {
        id: 'github_create_issue', name: 'Create Issue', description: 'Create a new issue in a repository',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          owner: { type: 'string', description: 'Repository owner', required: true },
          repo: { type: 'string', description: 'Repository name', required: true },
          title: { type: 'string', description: 'Issue title', required: true, maxLength: 256 },
          body: { type: 'string', description: 'Issue body (Markdown supported)', maxLength: 65536 },
          labels: { type: 'array', description: 'Label names to apply', items: { type: 'string' } },
          assignees: { type: 'array', description: 'Usernames to assign', items: { type: 'string' } },
          milestone: { type: 'number', description: 'Milestone number to associate' },
        },
      },
      {
        id: 'github_list_issues', name: 'List Issues', description: 'List and filter issues for a repository',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          owner: { type: 'string', description: 'Repository owner', required: true },
          repo: { type: 'string', description: 'Repository name', required: true },
          state: { type: 'string', description: 'Issue state', enum: ['open', 'closed', 'all'], default: 'open' },
          labels: { type: 'string', description: 'Comma-separated label names' },
          assignee: { type: 'string', description: 'Filter by assignee username' },
          sort: { type: 'string', description: 'Sort field', enum: ['created', 'updated', 'comments'], default: 'created' },
          per_page: { type: 'number', description: 'Results per page', minimum: 1, maximum: 100, default: 30 },
        },
      },
      {
        id: 'github_create_pr', name: 'Create Pull Request', description: 'Create a pull request from one branch to another',
        category: 'write', riskLevel: 'high', sideEffects: ['network-request'],
        parameters: {
          owner: { type: 'string', description: 'Repository owner', required: true },
          repo: { type: 'string', description: 'Repository name', required: true },
          title: { type: 'string', description: 'PR title', required: true },
          head: { type: 'string', description: 'Source branch (or fork:branch)', required: true },
          base: { type: 'string', description: 'Target branch', required: true, default: 'main' },
          body: { type: 'string', description: 'PR description (Markdown)' },
          draft: { type: 'boolean', description: 'Create as draft PR', default: false },
        },
      },
      {
        id: 'github_search_code', name: 'Search Code', description: 'Search for code across GitHub repositories',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          query: { type: 'string', description: 'Search query (supports GitHub code search syntax)', required: true, example: 'addClass repo:jquery/jquery language:js' },
          per_page: { type: 'number', description: 'Results per page', minimum: 1, maximum: 100, default: 30 },
        },
      },
      {
        id: 'github_get_file', name: 'Get File Contents', description: 'Get the contents of a file from a repository',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          owner: { type: 'string', description: 'Repository owner', required: true },
          repo: { type: 'string', description: 'Repository name', required: true },
          path: { type: 'string', description: 'File path in repo', required: true },
          ref: { type: 'string', description: 'Branch, tag, or commit SHA', default: 'main' },
        },
      },
      {
        id: 'github_list_workflows', name: 'List Workflow Runs', description: 'List recent GitHub Actions workflow runs',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          owner: { type: 'string', description: 'Repository owner', required: true },
          repo: { type: 'string', description: 'Repository name', required: true },
          status: { type: 'string', description: 'Filter by status', enum: ['completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 'requested', 'waiting'] },
          per_page: { type: 'number', description: 'Results per page', minimum: 1, maximum: 100, default: 10 },
        },
      },
    ],
  },
  linear: {
    description: 'Connect to Linear for issue tracking, project management, cycle planning, and team workflow automation.',
    category: 'project-management',
    authType: 'api-key',
    authLabel: 'API Key',
    authDescription: 'Linear API key from https://linear.app/settings/api',
    baseUrl: 'https://api.linear.app/graphql',
    docsUrl: 'https://developers.linear.app',
    rateLimits: { requests: 1500, window: 'hour' },
    suggestedOps: [
      {
        id: 'linear_search_issues', name: 'Search Issues', description: 'Search and filter issues across teams and projects',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          query: { type: 'string', description: 'Search query text' },
          team: { type: 'string', description: 'Team key or ID to filter by' },
          status: { type: 'string', description: 'Status name to filter by (e.g. In Progress, Done)' },
          assignee: { type: 'string', description: 'Assignee email or display name' },
          label: { type: 'string', description: 'Label name to filter by' },
          project: { type: 'string', description: 'Project name or ID' },
          limit: { type: 'number', description: 'Max results', minimum: 1, maximum: 250, default: 50 },
        },
      },
      {
        id: 'linear_create_issue', name: 'Create Issue', description: 'Create a new issue with title, description, assignee, labels, and priority',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          title: { type: 'string', description: 'Issue title', required: true, maxLength: 500 },
          team: { type: 'string', description: 'Team key (e.g. ENG)', required: true },
          description: { type: 'string', description: 'Issue description (Markdown)' },
          assignee: { type: 'string', description: 'Assignee email or ID' },
          priority: { type: 'number', description: 'Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)', minimum: 0, maximum: 4 },
          labels: { type: 'array', description: 'Label names to apply', items: { type: 'string' } },
          project: { type: 'string', description: 'Project name or ID' },
          cycle: { type: 'string', description: 'Cycle name or ID' },
          estimate: { type: 'number', description: 'Story point estimate' },
        },
      },
      {
        id: 'linear_update_issue', name: 'Update Issue', description: 'Update an existing issue\'s properties',
        category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
        parameters: {
          issue_id: { type: 'string', description: 'Issue ID or identifier (e.g. ENG-123)', required: true },
          title: { type: 'string', description: 'New title' },
          status: { type: 'string', description: 'New status name' },
          assignee: { type: 'string', description: 'New assignee' },
          priority: { type: 'number', description: 'New priority (0-4)' },
          description: { type: 'string', description: 'New description' },
        },
      },
      {
        id: 'linear_add_comment', name: 'Add Comment', description: 'Add a comment to an issue',
        category: 'communicate', riskLevel: 'medium', sideEffects: ['sends-message', 'network-request'],
        parameters: {
          issue_id: { type: 'string', description: 'Issue ID or identifier', required: true },
          body: { type: 'string', description: 'Comment body (Markdown)', required: true },
        },
      },
      {
        id: 'linear_list_teams', name: 'List Teams', description: 'List all teams in the workspace',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {},
      },
      {
        id: 'linear_list_projects', name: 'List Projects', description: 'List projects with optional team and status filtering',
        category: 'read', riskLevel: 'low', sideEffects: [],
        parameters: {
          team: { type: 'string', description: 'Filter by team key' },
          status: { type: 'string', description: 'Filter by status', enum: ['planned', 'started', 'paused', 'completed', 'canceled'] },
        },
      },
    ],
  },
};

// ─── Intelligent Operation Templates ────────────────────

interface OperationBlueprint {
  keywords: string[];
  category: 'read' | 'write' | 'execute' | 'communicate' | 'destroy';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  sideEffects: string[];
  descriptionTemplate: string;
  parameterTemplates: Record<string, ParameterDef>;
}

const OPERATION_BLUEPRINTS: OperationBlueprint[] = [
  {
    keywords: ['list', 'browse', 'index'],
    category: 'read', riskLevel: 'low', sideEffects: [],
    descriptionTemplate: 'List {resource} from {app} with optional filtering and pagination',
    parameterTemplates: {
      filter: { type: 'string', description: 'Filter expression or search query' },
      limit: { type: 'number', description: 'Maximum number of results to return', minimum: 1, maximum: 100, default: 25 },
      offset: { type: 'string', description: 'Pagination cursor or offset' },
      sort_by: { type: 'string', description: 'Field to sort results by' },
      sort_order: { type: 'string', description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
  {
    keywords: ['read', 'get', 'fetch', 'retrieve', 'view', 'show'],
    category: 'read', riskLevel: 'low', sideEffects: [],
    descriptionTemplate: 'Retrieve a specific {resource} from {app} by ID',
    parameterTemplates: {
      id: { type: 'string', description: 'Unique identifier of the {resource}', required: true },
      include: { type: 'array', description: 'Additional related data to include', items: { type: 'string' } },
    },
  },
  {
    keywords: ['search', 'query', 'find', 'lookup'],
    category: 'read', riskLevel: 'low', sideEffects: [],
    descriptionTemplate: 'Search for {resource} in {app} using filters and queries',
    parameterTemplates: {
      query: { type: 'string', description: 'Search query text', required: true },
      filters: { type: 'object', description: 'Additional filter criteria' },
      limit: { type: 'number', description: 'Maximum results to return', minimum: 1, maximum: 100, default: 25 },
    },
  },
  {
    keywords: ['create', 'add', 'new', 'insert', 'post'],
    category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
    descriptionTemplate: 'Create a new {resource} in {app}',
    parameterTemplates: {
      name: { type: 'string', description: 'Name or title of the new {resource}', required: true, maxLength: 500 },
      description: { type: 'string', description: 'Description or body content' },
      metadata: { type: 'object', description: 'Additional properties as key-value pairs' },
    },
  },
  {
    keywords: ['update', 'edit', 'modify', 'patch', 'change'],
    category: 'write', riskLevel: 'medium', sideEffects: ['network-request'],
    descriptionTemplate: 'Update an existing {resource} in {app}',
    parameterTemplates: {
      id: { type: 'string', description: 'ID of the {resource} to update', required: true },
      fields: { type: 'object', description: 'Fields to update (key-value pairs)', required: true },
    },
  },
  {
    keywords: ['delete', 'remove', 'destroy', 'trash', 'archive'],
    category: 'destroy', riskLevel: 'high', sideEffects: ['deletes-data', 'network-request'],
    descriptionTemplate: 'Delete or archive a {resource} in {app}',
    parameterTemplates: {
      id: { type: 'string', description: 'ID of the {resource} to delete', required: true },
      permanent: { type: 'boolean', description: 'Permanently delete instead of archiving/trashing', default: false },
    },
  },
  {
    keywords: ['send', 'notify', 'message', 'post', 'publish', 'share'],
    category: 'communicate', riskLevel: 'medium', sideEffects: ['sends-message', 'network-request'],
    descriptionTemplate: 'Send or publish a {resource} via {app}',
    parameterTemplates: {
      to: { type: 'string', description: 'Recipient or destination', required: true },
      content: { type: 'string', description: 'Message or content body', required: true, maxLength: 10000 },
      subject: { type: 'string', description: 'Subject line or title' },
    },
  },
  {
    keywords: ['upload', 'import', 'attach'],
    category: 'write', riskLevel: 'medium', sideEffects: ['network-request', 'modifies-files'],
    descriptionTemplate: 'Upload or import a file/resource to {app}',
    parameterTemplates: {
      file_path: { type: 'string', description: 'Local file path to upload', required: true },
      destination: { type: 'string', description: 'Target location or folder in {app}' },
      filename: { type: 'string', description: 'Override filename' },
    },
  },
  {
    keywords: ['download', 'export', 'extract'],
    category: 'read', riskLevel: 'low', sideEffects: ['modifies-files'],
    descriptionTemplate: 'Download or export a {resource} from {app}',
    parameterTemplates: {
      id: { type: 'string', description: 'ID of the resource to download', required: true },
      format: { type: 'string', description: 'Export format', enum: ['json', 'csv', 'pdf', 'html'] },
      output_path: { type: 'string', description: 'Local path to save the file' },
    },
  },
  {
    keywords: ['run', 'execute', 'trigger', 'start', 'launch'],
    category: 'execute', riskLevel: 'high', sideEffects: ['runs-code', 'network-request'],
    descriptionTemplate: 'Execute or trigger a {resource} in {app}',
    parameterTemplates: {
      target: { type: 'string', description: 'ID or name of the resource to execute', required: true },
      params: { type: 'object', description: 'Execution parameters' },
      async: { type: 'boolean', description: 'Run asynchronously and return immediately', default: false },
    },
  },
];

// ─── Main Builder ──────────────────────────────────────

export async function runBuildSkill(_args: string[]) {
  const chalk = (await import('chalk')).default;
  const ora = (await import('ora')).default;
  const inquirer = (await import('inquirer')).default;
  const fs = await import('fs/promises');
  const path = await import('path');

  console.log('');
  console.log(chalk.bold('🛠️  AgenticMail Enterprise Skill Builder'));
  console.log(chalk.dim('  Generate production-quality skill manifests with rich tool definitions'));
  console.log('');

  // ── Step 1: Application ──────────────────────────

  const { application } = await inquirer.prompt([{
    type: 'input',
    name: 'application',
    message: 'What application or service should this skill integrate with?',
    validate: (v: string) => v.trim().length > 0 || 'Application name is required',
  }]);

  const appKey = application.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const knownService = WELL_KNOWN_SERVICES[appKey] || WELL_KNOWN_SERVICES[application.toLowerCase()];

  // ── Step 2: Operations (with smart defaults) ─────

  let operations: string[];
  let useKnownOps = false;

  if (knownService) {
    console.log(chalk.green(`\n  ✔ Recognized "${application}" — loading enterprise template with ${knownService.suggestedOps.length} pre-built tools\n`));

    const { usePrebuilt } = await inquirer.prompt([{
      type: 'confirm',
      name: 'usePrebuilt',
      message: `Use pre-built ${application} tool definitions? (${knownService.suggestedOps.length} tools with full parameters)`,
      default: true,
    }]);

    if (usePrebuilt) {
      // Let user select which operations to include
      const { selectedOps } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedOps',
        message: 'Select tools to include:',
        choices: knownService.suggestedOps.map(op => ({
          name: `${op.name} — ${op.description} [${op.riskLevel}]`,
          value: op.id,
          checked: true,
        })),
        validate: (v: string[]) => v.length > 0 || 'Select at least one tool',
      }]);

      operations = selectedOps;
      useKnownOps = true;
    } else {
      const { ops } = await inquirer.prompt([{
        type: 'input',
        name: 'ops',
        message: 'What operations should it support? (comma-separated)',
        default: 'search, get, create, update, delete, list',
      }]);
      operations = ops.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  } else {
    const { ops } = await inquirer.prompt([{
      type: 'input',
      name: 'ops',
      message: 'What operations should it support? (comma-separated)',
      default: 'search, get, create, update, delete, list',
    }]);
    operations = ops.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  // ── Step 3: Category & Risk ──────────────────────

  const defaults = knownService
    ? { category: knownService.category, risk: 'medium' }
    : { category: 'productivity', risk: 'medium' };

  const { category, risk } = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: 'Category:',
      choices: [...VALID_CATEGORIES],
      default: defaults.category,
    },
    {
      type: 'list',
      name: 'risk',
      message: 'Overall risk level:',
      choices: [...VALID_RISK_LEVELS],
      default: defaults.risk,
    },
  ]);

  // ── Step 4: Authentication ───────────────────────

  let authConfig: { type: string; label: string; description: string; envVar?: string; scopes?: string[] };

  if (knownService) {
    authConfig = {
      type: knownService.authType,
      label: knownService.authLabel,
      description: knownService.authDescription,
      scopes: knownService.scopes,
    };
    console.log(chalk.dim(`\n  Auth: ${knownService.authType} (${knownService.authLabel})`));
  } else {
    const { authType } = await inquirer.prompt([{
      type: 'list',
      name: 'authType',
      message: 'Authentication method:',
      choices: [
        { name: 'API Key — Simple secret key', value: 'api-key' },
        { name: 'OAuth 2.0 — Token-based with scopes', value: 'oauth2' },
        { name: 'Bearer Token — Static auth token', value: 'token' },
        { name: 'Basic Auth — Username + password', value: 'basic' },
        { name: 'Custom — Manual configuration', value: 'custom' },
      ],
    }]);

    const authLabels: Record<string, string> = {
      'api-key': 'API Key',
      'oauth2': 'OAuth Token',
      'token': 'Bearer Token',
      'basic': 'Username/Password',
      'custom': 'Credentials',
    };

    authConfig = {
      type: authType,
      label: authLabels[authType] || 'Credentials',
      description: `${application} ${authLabels[authType] || 'credentials'} for authentication`,
    };
  }

  // ── Step 5: Author & Output ──────────────────────

  const { author, outputDir, addRateLimits } = await inquirer.prompt([
    {
      type: 'input',
      name: 'author',
      message: 'Your GitHub username:',
      validate: (v: string) => /^[a-zA-Z0-9_-]+$/.test(v.trim()) || 'Must be a valid GitHub username',
    },
    {
      type: 'input',
      name: 'outputDir',
      message: 'Output directory:',
      default: `./community-skills/${appKey}`,
    },
    {
      type: 'confirm',
      name: 'addRateLimits',
      message: 'Include rate limiting configuration?',
      default: !!knownService?.rateLimits,
    },
  ]);

  // ── Generate manifest ────────────────────────────

  const appSlug = appKey;
  const toolPrefix = appSlug.replace(/-/g, '_');

  const spinner = ora('Generating enterprise skill manifest...').start();

  let manifest: any = null;

  // Priority 1: Direct LLM API call if key is available and not using known service
  if (!useKnownOps) {
    manifest = await tryDirectLLMGeneration(spinner, application, operations, category, risk, author, appSlug, toolPrefix, authConfig);
  }

  // Priority 2: Local agent runtime
  if (!manifest && !useKnownOps) {
    manifest = await tryLocalRuntime(spinner, application, operations, category, risk, author, appSlug, toolPrefix);
  }

  // Priority 3: Known service template or intelligent template
  if (!manifest) {
    if (useKnownOps && knownService) {
      spinner.text = 'Building from enterprise template...';
      const selectedTools = knownService.suggestedOps.filter(op => operations.includes(op.id));
      manifest = buildKnownServiceManifest(application, knownService, selectedTools, category, risk, author, appSlug, addRateLimits);
    } else {
      spinner.text = 'Generating intelligent template...';
      manifest = generateIntelligentTemplate(application, operations, category, risk, author, appSlug, toolPrefix, authConfig, addRateLimits, knownService);
    }
  }

  // Ensure auth config is set
  if (!manifest.configSchema) manifest.configSchema = {};
  if (!manifest.configSchema.apiKey && !manifest.configSchema.token && !manifest.configSchema.clientId) {
    const configKey = authConfig.type === 'oauth2' ? 'clientId' : authConfig.type === 'basic' ? 'username' : 'apiKey';
    manifest.configSchema[configKey] = {
      type: 'secret',
      label: authConfig.label,
      description: authConfig.description,
      required: true,
    };
    if (authConfig.type === 'basic') {
      manifest.configSchema.password = {
        type: 'secret',
        label: 'Password',
        description: `${application} password`,
        required: true,
      };
    }
    if (authConfig.type === 'oauth2') {
      manifest.configSchema.clientSecret = {
        type: 'secret',
        label: 'Client Secret',
        description: `${application} OAuth client secret`,
        required: true,
      };
      if (authConfig.scopes?.length) {
        manifest.configSchema.scopes = {
          type: 'string',
          label: 'OAuth Scopes',
          description: `Required scopes: ${authConfig.scopes.join(', ')}`,
          default: authConfig.scopes.join(' '),
        };
      }
    }
  }

  spinner.succeed('Enterprise skill manifest generated');

  // ── Validate ──────────────────────────────────────

  const validation = validateSkillManifest(manifest);
  if (!validation.valid) {
    console.log(chalk.yellow('\n  Auto-fixing validation issues...'));
    if (!manifest.category) manifest.category = category;
    if (!manifest.risk) manifest.risk = risk;
    if (!manifest.license) manifest.license = 'MIT';
    if (!manifest.description || manifest.description.length < 20) {
      manifest.description = `Integrates with ${application} to ${operations.slice(0, 3).join(', ')} and more. Community-contributed skill for AgenticMail agents.`;
    }
  }

  // ── Write files ───────────────────────────────────

  const outDir = path.resolve(outputDir);
  await fs.mkdir(outDir, { recursive: true });

  const manifestPath = path.join(outDir, 'agenticmail-skill.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(chalk.green('  ✔') + ` Written: ${manifestPath}`);

  const readmePath = path.join(outDir, 'README.md');
  await fs.writeFile(readmePath, generateEnterpriseReadme(manifest, authConfig, knownService));
  console.log(chalk.green('  ✔') + ` Written: ${readmePath}`);

  // Write a TypeScript types file for tool parameters
  const typesPath = path.join(outDir, 'types.d.ts');
  await fs.writeFile(typesPath, generateTypeDefinitions(manifest));
  console.log(chalk.green('  ✔') + ` Written: ${typesPath}`);

  // Final validation
  const finalCheck = validateSkillManifest(manifest);
  if (finalCheck.valid) {
    console.log(chalk.green('\n  ✔ Manifest is valid!'));
  } else {
    console.log(chalk.yellow('\n  ⚠ Manifest has issues:'));
    for (const err of finalCheck.errors) console.log(chalk.red('    ' + err));
  }
  for (const warn of finalCheck.warnings) console.log(chalk.yellow('    ⚠ ' + warn));

  // Summary
  const toolCount = manifest.tools?.length || 0;
  const paramCount = (manifest.tools || []).reduce((sum: number, t: any) => sum + Object.keys(t.parameters || {}).length, 0);
  console.log('');
  console.log(chalk.bold('  📊 Summary'));
  console.log(`     Tools: ${chalk.cyan(toolCount)}`);
  console.log(`     Parameters: ${chalk.cyan(paramCount)} total across all tools`);
  console.log(`     Category: ${chalk.cyan(category)}`);
  console.log(`     Risk: ${chalk.cyan(risk)}`);
  console.log(`     Auth: ${chalk.cyan(authConfig.type)}`);
  if (manifest.rateLimits) {
    console.log(`     Rate limit: ${chalk.cyan(`${manifest.rateLimits.requests}/${manifest.rateLimits.window}`)}`);
  }

  // ── Offer submission ──────────────────────────────

  console.log('');
  const { submit } = await inquirer.prompt([{
    type: 'confirm',
    name: 'submit',
    message: 'Submit this skill as a PR to agenticmail/enterprise?',
    default: false,
  }]);

  if (submit) {
    const { runSubmitSkill } = await import('./cli-submit-skill.js');
    await runSubmitSkill([outDir]);
  } else {
    console.log(chalk.dim('\n  To submit later: npx @agenticmail/enterprise submit-skill ' + outputDir));
    console.log(chalk.dim('  To validate:     npx @agenticmail/enterprise validate ' + outputDir));
  }
}

// ─── Direct LLM Generation ──────────────────────────────

async function tryDirectLLMGeneration(
  spinner: any, app: string, operations: string[], category: string, risk: string,
  author: string, slug: string, prefix: string, authConfig: any,
): Promise<any | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) return null;

  try {
    spinner.text = 'Using AI to generate rich tool definitions...';
    const prompt = buildEnterpriseAIPrompt(app, operations, category, risk, author, slug, prefix, authConfig);

    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const content = data.content?.[0]?.text || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      }
    } else if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a skill manifest generator. Output ONLY valid JSON.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 8192,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      }
    }
  } catch {
    // AI generation failed — fall through
  }
  return null;
}

async function tryLocalRuntime(
  spinner: any, app: string, operations: string[], category: string, risk: string,
  author: string, slug: string, prefix: string,
): Promise<any | null> {
  try {
    const res = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    spinner.text = 'Agent runtime detected — using AI to generate manifest...';
    const aiRes = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: buildEnterpriseAIPrompt(app, operations, category, risk, author, slug, prefix, {}),
        system: 'You are a skill manifest generator. Respond with ONLY valid JSON, no markdown, no explanation.',
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (aiRes.ok) {
      const aiData = await aiRes.json() as any;
      const content = aiData.response || aiData.message || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
  } catch { /* fall through */ }
  return null;
}

// ─── Enterprise AI Prompt ────────────────────────────────

function buildEnterpriseAIPrompt(
  app: string, operations: string[], category: string, risk: string,
  author: string, slug: string, prefix: string, authConfig: any,
): string {
  return `Generate a production-quality agenticmail-skill.json manifest for "${app}".

CRITICAL: Each tool MUST have detailed parameters with proper JSON Schema. Generic tools without parameters are NOT acceptable.

Requirements:
- id: "${slug}"
- name: "${app}"
- Operations to create tools for: ${operations.join(', ')}
- category: "${category}"
- risk: "${risk}"
- author: "${author}"
- repository: "https://github.com/${author}/${slug}"
- license: "MIT"
- version: "1.0.0"
- minEngineVersion: "0.3.0"
- description: 20-500 chars, specific to what the integration does

Each tool object needs:
- id: "${prefix}_<action>" (lowercase, underscores)
- name: Human-readable name
- description: Specific, detailed description of what this tool does (not generic)
- category: one of [read, write, execute, communicate, destroy]
- riskLevel: one of [low, medium, high, critical]
- sideEffects: array of valid effects [sends-email, sends-message, sends-sms, posts-social, runs-code, modifies-files, deletes-data, network-request, controls-device, accesses-secrets, financial]
- parameters: Object where each key is a parameter name and value is: { type: "string"|"number"|"boolean"|"array"|"object", description: "...", required?: boolean, default?: any, enum?: [...], minimum?: number, maximum?: number, maxLength?: number, items?: {type: "..."}, example?: any }

IMPORTANT: Every tool must have meaningful parameters based on the real ${app} API. For example:
- A "list" tool should have: limit, offset/cursor, filter, sort parameters
- A "create" tool should have: all required fields for that resource
- A "search" tool should have: query, filters, result count
- A "delete" tool should have: id, permanent/force flag

Include a configSchema with authentication configuration.
${authConfig.type ? `Auth type: ${authConfig.type}` : ''}
Include tags array with relevant keywords (lowercase, hyphenated).

Output ONLY the JSON object, no markdown fences, no explanation.`;
}

// ─── Known Service Manifest Builder ──────────────────────

function buildKnownServiceManifest(
  app: string, service: ServiceInfo, selectedTools: OperationTemplate[],
  category: string, risk: string, author: string, slug: string, addRateLimits: boolean,
): any {
  const manifest: any = {
    id: slug,
    name: app,
    description: service.description,
    version: '1.0.0',
    author,
    repository: `https://github.com/${author}/${slug}`,
    license: 'MIT',
    category,
    risk,
    tags: [slug, category, ...extraTags(category)],
    tools: selectedTools.map(op => ({
      id: op.id,
      name: op.name,
      description: op.description,
      category: op.category,
      riskLevel: op.riskLevel,
      sideEffects: op.sideEffects,
      parameters: op.parameters,
    })),
    configSchema: {},
    minEngineVersion: '0.3.0',
    homepage: service.docsUrl || `https://github.com/${author}/${slug}`,
  };

  if (service.baseUrl) manifest.baseUrl = service.baseUrl;
  if (addRateLimits && service.rateLimits) manifest.rateLimits = service.rateLimits;

  return manifest;
}

// ─── Intelligent Template Generator ─────────────────────

function generateIntelligentTemplate(
  app: string, operations: string[], category: string, risk: string,
  author: string, slug: string, prefix: string, authConfig: any,
  addRateLimits: boolean, knownService?: ServiceInfo | null,
): any {
  const tools = operations.map(op => {
    const opLower = op.toLowerCase().trim();
    const opSlug = opLower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Find the best matching blueprint
    const blueprint = OPERATION_BLUEPRINTS.find(bp =>
      bp.keywords.some(kw => opLower.includes(kw))
    ) || OPERATION_BLUEPRINTS[0]; // default to list-like

    // Build description from template
    const description = blueprint.descriptionTemplate
      .replace('{resource}', pluralize(opSlug, app))
      .replace('{app}', app);

    // Build parameters from blueprint, replacing {resource}
    const parameters: Record<string, any> = {};
    for (const [key, param] of Object.entries(blueprint.parameterTemplates)) {
      parameters[key] = {
        ...param,
        description: param.description.replace('{resource}', 'resource'),
      };
    }

    return {
      id: `${prefix}_${opSlug}`,
      name: op.charAt(0).toUpperCase() + op.slice(1).trim(),
      description,
      category: blueprint.category,
      riskLevel: blueprint.riskLevel,
      sideEffects: [...blueprint.sideEffects],
      parameters,
    };
  });

  const manifest: any = {
    id: slug,
    name: app,
    description: `Integrates with ${app} to ${operations.slice(0, 3).join(', ')}${operations.length > 3 ? ', and more' : ''}. Community-contributed skill for AgenticMail Enterprise agents.`,
    version: '1.0.0',
    author,
    repository: `https://github.com/${author}/${slug}`,
    license: 'MIT',
    category,
    risk,
    tags: [slug, category, ...extraTags(category)],
    tools,
    configSchema: {},
    minEngineVersion: '0.3.0',
    homepage: `https://github.com/${author}/${slug}`,
  };

  if (addRateLimits) {
    manifest.rateLimits = { requests: 60, window: 'minute' };
  }

  return manifest;
}

function pluralize(op: string, app: string): string {
  // Try to infer the resource name from context
  const readOps = ['list', 'search', 'query', 'browse', 'index'];
  if (readOps.some(r => op.includes(r))) return 'resources';
  return 'a resource';
}

function extraTags(category: string): string[] {
  const tagMap: Record<string, string[]> = {
    'productivity': ['workflow', 'automation'],
    'communication': ['messaging', 'chat'],
    'development': ['dev-tools', 'engineering'],
    'finance': ['payments', 'billing'],
    'project-management': ['tasks', 'agile'],
    'database': ['data', 'storage'],
    'marketing': ['campaigns', 'analytics'],
    'crm': ['sales', 'contacts'],
    'customer-support': ['helpdesk', 'tickets'],
  };
  return tagMap[category] || [];
}

// ─── Enterprise README Generator ─────────────────────────

function generateEnterpriseReadme(manifest: any, authConfig: any, knownService?: ServiceInfo | null): string {
  const toolRows = (manifest.tools || []).map((t: any) => {
    const paramCount = Object.keys(t.parameters || {}).length;
    const sideEffectBadges = (t.sideEffects || []).map((se: string) => `\`${se}\``).join(' ');
    return `| \`${t.id}\` | ${t.name} | ${t.description} | ${t.riskLevel || 'medium'} | ${paramCount} | ${sideEffectBadges || '—'} |`;
  }).join('\n');

  const configSection = manifest.configSchema
    ? Object.entries(manifest.configSchema).map(([k, v]: [string, any]) =>
      `| \`${k}\` | ${v.type || 'string'} | ${v.description || k} | ${v.required ? '✅' : '—'} | ${v.default || '—'} |`
    ).join('\n')
    : '';

  // Tool parameter details
  const toolDetails = (manifest.tools || []).map((t: any) => {
    const params = t.parameters || {};
    if (Object.keys(params).length === 0) return '';
    const paramRows = Object.entries(params).map(([name, p]: [string, any]) => {
      const flags: string[] = [];
      if (p.required) flags.push('**required**');
      if (p.default !== undefined) flags.push(`default: \`${p.default}\``);
      if (p.enum) flags.push(`enum: ${p.enum.map((e: string) => `\`${e}\``).join(', ')}`);
      if (p.minimum !== undefined) flags.push(`min: ${p.minimum}`);
      if (p.maximum !== undefined) flags.push(`max: ${p.maximum}`);
      if (p.maxLength !== undefined) flags.push(`maxLength: ${p.maxLength}`);
      return `| \`${name}\` | \`${p.type}\` | ${p.description || '—'} | ${flags.join(', ') || '—'} |`;
    }).join('\n');

    return `### \`${t.id}\` — ${t.name}

${t.description}

| Parameter | Type | Description | Constraints |
|-----------|------|-------------|-------------|
${paramRows}`;
  }).filter(Boolean).join('\n\n');

  let readme = `# ${manifest.name}

${manifest.description}

${knownService?.docsUrl ? `**API Documentation:** ${knownService.docsUrl}` : ''}
${manifest.baseUrl ? `**Base URL:** \`${manifest.baseUrl}\`` : ''}

---

## Tools Overview

| ID | Name | Description | Risk | Params | Side Effects |
|----|------|-------------|------|--------|-------------|
${toolRows}

---

## Tool Reference

${toolDetails}

---

## Configuration

| Key | Type | Description | Required | Default |
|-----|------|-------------|----------|---------|
${configSection}

${authConfig.type === 'oauth2' ? `
### OAuth 2.0 Setup

1. Create an OAuth app in your ${manifest.name} developer settings
2. Set the redirect URI to your AgenticMail dashboard URL + \`/api/engine/oauth/callback\`
3. Copy the Client ID and Client Secret into the skill configuration
${authConfig.scopes ? `4. Required scopes: \`${authConfig.scopes.join('`, `')}\`` : ''}
` : ''}
${authConfig.type === 'api-key' || authConfig.type === 'token' ? `
### API Key Setup

1. Go to your ${manifest.name} account settings
${knownService?.authDescription ? `2. ${knownService.authDescription.replace(/^.*from /, 'Navigate to ')}` : '2. Generate a new API key'}
3. Copy the key into the skill configuration in the dashboard
` : ''}
`;

  if (manifest.rateLimits) {
    readme += `
## Rate Limits

This skill respects ${manifest.name}'s API rate limits: **${manifest.rateLimits.requests} requests per ${manifest.rateLimits.window}**.

AgenticMail automatically handles rate limiting with exponential backoff and retry.

`;
  }

  readme += `---

## Installation

### From the Dashboard

1. Go to **Community Skills** in the sidebar
2. Search for "${manifest.name}"
3. Click **Install**
4. Configure credentials in **Skill Connections**

### Via API

\`\`\`bash
curl -X POST /api/engine/community/skills/${manifest.id}/install \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"orgId": "your-org-id"}'
\`\`\`

### Assign to an Agent

\`\`\`bash
curl -X POST /api/engine/agents/<agent-id>/skills \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"skillId": "${manifest.id}"}'
\`\`\`

---

## Development

\`\`\`bash
# Validate manifest
npx @agenticmail/enterprise validate ./

# Submit to marketplace
npx @agenticmail/enterprise submit-skill ./
\`\`\`

## License

${manifest.license || 'MIT'}
`;

  return readme;
}

// ─── TypeScript Type Generator ──────────────────────────

function generateTypeDefinitions(manifest: any): string {
  let types = `/**
 * Auto-generated type definitions for ${manifest.name} skill
 * Generated by AgenticMail Enterprise Skill Builder
 */

`;

  for (const tool of (manifest.tools || [])) {
    const interfaceName = tool.id.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('') + 'Params';
    const params = tool.parameters || {};
    const entries = Object.entries(params);

    if (entries.length === 0) {
      types += `/** ${tool.description} */\nexport type ${interfaceName} = Record<string, never>;\n\n`;
      continue;
    }

    types += `/** ${tool.description} */\nexport interface ${interfaceName} {\n`;
    for (const [name, param] of entries as [string, any][]) {
      const tsType = paramToTsType(param);
      const optional = !param.required ? '?' : '';
      const doc = param.description || '';
      const extra: string[] = [];
      if (param.default !== undefined) extra.push(`@default ${JSON.stringify(param.default)}`);
      if (param.enum) extra.push(`@enum ${JSON.stringify(param.enum)}`);
      if (param.example !== undefined) extra.push(`@example ${JSON.stringify(param.example)}`);

      types += `  /** ${doc}${extra.length ? ' ' + extra.join(' ') : ''} */\n`;
      types += `  ${name}${optional}: ${tsType};\n`;
    }
    types += `}\n\n`;
  }

  // Config type
  const configEntries = Object.entries(manifest.configSchema || {});
  if (configEntries.length > 0) {
    types += `/** Skill configuration */\nexport interface ${manifest.id.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Config {\n`;
    for (const [name, param] of configEntries as [string, any][]) {
      const optional = !param.required ? '?' : '';
      types += `  /** ${param.description || name} */\n`;
      types += `  ${name}${optional}: string;\n`;
    }
    types += `}\n`;
  }

  return types;
}

function paramToTsType(param: any): string {
  if (param.enum) return param.enum.map((e: any) => JSON.stringify(e)).join(' | ');
  switch (param.type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array':
      if (param.items?.type === 'string') return 'string[]';
      if (param.items?.type === 'number') return 'number[]';
      if (param.items?.type === 'object') return 'Record<string, unknown>[]';
      return 'unknown[]';
    case 'object': return 'Record<string, unknown>';
    default: return 'unknown';
  }
}

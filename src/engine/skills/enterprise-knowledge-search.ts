import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-knowledge-search',
  name: 'Internal Knowledge Search',
  description: 'Semantic search across company knowledge bases, wikis, documentation, Confluence, SharePoint, and Google Drive. Uses vector embeddings for intelligent matching beyond keyword search. Supports filtering by source, date, author, and content type.',
  category: 'research',
  risk: 'low',
  icon: '🔍',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_kb_search',
    name: 'Search Knowledge Base',
    description: 'Semantic search across all connected knowledge sources. Returns relevant documents ranked by relevance with highlighted matching passages.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-knowledge-search',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        sources: { type: 'array', items: { type: 'string', enum: ['confluence', 'sharepoint', 'google-drive', 'notion', 'internal-wiki', 'all'] }, description: 'Knowledge sources to search', default: ['all'] },
        contentType: { type: 'string', enum: ['all', 'document', 'page', 'spreadsheet', 'presentation', 'pdf'], default: 'all' },
        dateRange: { type: 'object', properties: { after: { type: 'string' }, before: { type: 'string' } } },
        author: { type: 'string', description: 'Filter by author name or email' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    id: 'ent_kb_get_document',
    name: 'Get Document Content',
    description: 'Retrieve the full content of a specific document by ID or URL. Returns document text, metadata, and comments.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-knowledge-search',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document ID or URL' },
        source: { type: 'string', enum: ['confluence', 'sharepoint', 'google-drive', 'notion'], description: 'Source system' },
        includeComments: { type: 'boolean', default: false },
        format: { type: 'string', enum: ['markdown', 'text', 'html'], default: 'markdown' },
      },
      required: ['documentId'],
    },
  },
  {
    id: 'ent_kb_list_spaces',
    name: 'List Knowledge Spaces',
    description: 'List available knowledge base spaces, sites, or drives that this agent has access to.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-knowledge-search',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['confluence', 'sharepoint', 'google-drive', 'notion', 'all'], default: 'all' },
      },
    },
  },
  {
    id: 'ent_kb_recent_updates',
    name: 'Recent Knowledge Updates',
    description: 'List recently created or modified documents across knowledge sources. Useful for staying current on company policies, procedures, and announcements.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-knowledge-search',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        sources: { type: 'array', items: { type: 'string' }, default: ['all'] },
        since: { type: 'string', description: 'ISO date to fetch updates since (default: 7 days ago)' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    id: 'ent_kb_ask',
    name: 'Ask Knowledge Base',
    description: 'Ask a natural language question and get a synthesized answer from multiple knowledge sources with citations. Uses RAG (Retrieval-Augmented Generation) to find relevant passages and compose an answer.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-knowledge-search',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural language question' },
        sources: { type: 'array', items: { type: 'string' }, default: ['all'] },
        includeCitations: { type: 'boolean', description: 'Include source citations in answer', default: true },
      },
      required: ['question'],
    },
  },
];

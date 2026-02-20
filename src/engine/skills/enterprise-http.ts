import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-http',
  name: 'HTTP API Client',
  description: 'Make authenticated HTTP requests to any internal or external API. Supports Bearer tokens, API keys, OAuth, mutual TLS, and custom authentication. Includes request/response logging, retry logic, and rate limiting.',
  category: 'automation',
  risk: 'high',
  icon: '🔗',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_http_request',
    name: 'HTTP Request',
    description: 'Make an HTTP request to any URL with full control over method, headers, body, and authentication. Response includes status code, headers, and parsed body.',
    category: 'write',
    risk: 'high',
    skillId: 'enterprise-http',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to request' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], default: 'GET' },
        headers: { type: 'object', description: 'HTTP headers as key-value pairs' },
        body: { type: ['object', 'string'], description: 'Request body (auto-serialized to JSON if object)' },
        auth: { type: 'object', properties: { type: { type: 'string', enum: ['bearer', 'api-key', 'basic', 'oauth2', 'vault'] }, token: { type: 'string' }, vaultSecret: { type: 'string', description: 'Vault secret name for credentials' }, headerName: { type: 'string', description: 'Header name for API key auth' } } },
        timeout: { type: 'number', description: 'Timeout in milliseconds', default: 30000 },
        followRedirects: { type: 'boolean', default: true },
        parseResponse: { type: 'string', enum: ['json', 'text', 'binary'], default: 'json' },
      },
      required: ['url'],
    },
  },
  {
    id: 'ent_http_graphql',
    name: 'GraphQL Query',
    description: 'Execute a GraphQL query or mutation against an endpoint. Supports variables and operation names.',
    category: 'write',
    risk: 'high',
    skillId: 'enterprise-http',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'GraphQL endpoint URL' },
        query: { type: 'string', description: 'GraphQL query or mutation string' },
        variables: { type: 'object', description: 'Query variables' },
        operationName: { type: 'string' },
        auth: { type: 'object', properties: { type: { type: 'string', enum: ['bearer', 'api-key', 'vault'] }, token: { type: 'string' }, vaultSecret: { type: 'string' } } },
      },
      required: ['endpoint', 'query'],
    },
  },
  {
    id: 'ent_http_batch',
    name: 'Batch HTTP Requests',
    description: 'Execute multiple HTTP requests in parallel or sequence. Returns all responses. Supports concurrency limits and error handling modes.',
    category: 'write',
    risk: 'high',
    skillId: 'enterprise-http',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        requests: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' }, body: { type: 'object' } } } },
        concurrency: { type: 'number', description: 'Max concurrent requests', default: 5 },
        mode: { type: 'string', enum: ['parallel', 'sequential'], default: 'parallel' },
        stopOnError: { type: 'boolean', default: false },
        auth: { type: 'object', description: 'Shared auth applied to all requests' },
      },
      required: ['requests'],
    },
  },
  {
    id: 'ent_http_download',
    name: 'Download File',
    description: 'Download a file from a URL and save it locally. Supports large files with streaming, progress tracking, and resume.',
    category: 'write',
    risk: 'medium',
    skillId: 'enterprise-http',
    sideEffects: ['network-request', 'modifies-files'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'File URL to download' },
        outputPath: { type: 'string', description: 'Local path to save the file' },
        auth: { type: 'object' },
        headers: { type: 'object' },
      },
      required: ['url', 'outputPath'],
    },
  },
];

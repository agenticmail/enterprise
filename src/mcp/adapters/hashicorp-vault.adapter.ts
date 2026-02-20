/**
 * MCP Skill Adapter — HashiCorp Vault
 *
 * Maps HashiCorp Vault HTTP API endpoints to MCP tool handlers.
 * Covers secret reading/writing, secret listing, mount management, and health checks.
 *
 * The Vault address is dynamic, resolved from ctx.skillConfig.vaultAddr.
 *
 * Vault API docs: https://developer.hashicorp.com/vault/api-docs
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Vault base URL from skill config. */
function vaultUrl(ctx: ToolExecutionContext): string {
  return (
    ctx.skillConfig.vaultAddr || 'https://vault.example.com'
  ).replace(/\/$/, '');
}

function vaultError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: string[] = data.errors || [];
      if (errors.length > 0) {
        return { content: `Vault API error: ${errors.join('; ')}`, isError: true };
      }
      const warnings: string[] = data.warnings || [];
      if (warnings.length > 0) {
        return { content: `Vault API warning: ${warnings.join('; ')}`, isError: true };
      }
    }
    return { content: `Vault API error: ${err.message}`, isError: true };
  }
  return { content: `Vault API error: ${String(err)}`, isError: true };
}

// ─── Tool: vault_read_secret ────────────────────────────

const readSecret: ToolHandler = {
  description:
    'Read a secret from HashiCorp Vault at a given path. Supports KV v1 and v2 engines. Returns secret key-value pairs.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The secret path (e.g. "secret/data/myapp/config" for KV v2 or "secret/myapp/config" for KV v1)',
      },
      version: {
        type: 'number',
        description: 'Secret version to read (KV v2 only, omit for latest)',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = vaultUrl(ctx);
      const query: Record<string, string> = {};
      if (params.version !== undefined) query.version = String(params.version);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/v1/${params.path}`,
        query,
      });

      // KV v2 nests data under data.data; KV v1 uses data directly
      const secretData = result.data?.data || result.data || {};
      const metadata = result.data?.metadata || {};

      const keys = Object.keys(secretData);
      if (keys.length === 0) {
        return {
          content: `No secret data found at path "${params.path}".`,
          metadata: { path: params.path, keyCount: 0 },
        };
      }

      const lines = keys.map((k: string) => {
        const value = secretData[k];
        const displayValue = typeof value === 'string' && value.length > 50
          ? `${value.substring(0, 50)}...`
          : JSON.stringify(value);
        return `  ${k}: ${displayValue}`;
      });

      const versionInfo = metadata.version ? ` (version ${metadata.version})` : '';

      const content = [
        `Secret at "${params.path}"${versionInfo}:`,
        ...lines,
      ].join('\n');

      return {
        content,
        metadata: {
          path: params.path,
          keyCount: keys.length,
          version: metadata.version,
          keys,
        },
      };
    } catch (err) {
      return vaultError(err);
    }
  },
};

// ─── Tool: vault_list_secrets ───────────────────────────

const listSecrets: ToolHandler = {
  description:
    'List secret keys at a given path in HashiCorp Vault. Returns a list of key names (not values).',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to list (e.g. "secret/metadata/" for KV v2 or "secret/" for KV v1)',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = vaultUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'LIST',
        url: `${baseUrl}/v1/${params.path}`,
      });

      const keys: string[] = result.data?.keys || [];

      if (keys.length === 0) {
        return {
          content: `No keys found at path "${params.path}".`,
          metadata: { path: params.path, keyCount: 0 },
        };
      }

      const lines = keys.map((k: string) => {
        const isDir = k.endsWith('/');
        return `• ${k}${isDir ? ' (directory)' : ''}`;
      });

      return {
        content: `Found ${keys.length} key(s) at "${params.path}":\n\n${lines.join('\n')}`,
        metadata: { path: params.path, keyCount: keys.length, keys },
      };
    } catch (err) {
      return vaultError(err);
    }
  },
};

// ─── Tool: vault_write_secret ───────────────────────────

const writeSecret: ToolHandler = {
  description:
    'Write a secret to HashiCorp Vault at a given path. Provide key-value pairs as the secret data.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The secret path to write to (e.g. "secret/data/myapp/config")',
      },
      data: {
        type: 'object',
        description: 'Key-value pairs to store as the secret',
      },
      cas: {
        type: 'number',
        description: 'Check-and-Set version (KV v2 only). Set to 0 to create new, or current version to update.',
      },
    },
    required: ['path', 'data'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = vaultUrl(ctx);
      const body: Record<string, any> = {
        data: params.data,
      };
      if (params.cas !== undefined) {
        body.options = { cas: params.cas };
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/v1/${params.path}`,
        body,
      });

      const metadata = result.data || {};
      const version = metadata.version || 'unknown';
      const keys = Object.keys(params.data);

      return {
        content: `Secret written to "${params.path}" (version: ${version}). Keys: ${keys.join(', ')}`,
        metadata: {
          path: params.path,
          version,
          keys,
        },
      };
    } catch (err) {
      return vaultError(err);
    }
  },
};

// ─── Tool: vault_list_mounts ────────────────────────────

const listMounts: ToolHandler = {
  description:
    'List all secret engine mounts in HashiCorp Vault. Returns mount paths, types, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = vaultUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/v1/sys/mounts`,
      });

      const mounts = result.data || result;
      const mountPaths = Object.keys(mounts).filter((k: string) => !k.startsWith('request_id'));

      if (mountPaths.length === 0) {
        return {
          content: 'No secret engine mounts found.',
          metadata: { mountCount: 0 },
        };
      }

      const lines = mountPaths.map((path: string) => {
        const mount = mounts[path] || {};
        const type = mount.type || 'unknown';
        const description = mount.description || 'no description';
        const version = mount.options?.version || '';
        const versionPart = version ? ` v${version}` : '';
        return `• ${path} — type: ${type}${versionPart}, description: ${description}`;
      });

      return {
        content: `Found ${mountPaths.length} secret engine mount(s):\n\n${lines.join('\n')}`,
        metadata: { mountCount: mountPaths.length },
      };
    } catch (err) {
      return vaultError(err);
    }
  },
};

// ─── Tool: vault_get_health ─────────────────────────────

const getHealth: ToolHandler = {
  description:
    'Check the health status of the HashiCorp Vault server. Returns initialization, seal status, and version info.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = vaultUrl(ctx);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/v1/sys/health`,
        query: { standbyok: 'true', sealedcode: '200', uninitcode: '200' },
      });

      const content = [
        `Vault Health Status:`,
        `  Initialized: ${result.initialized ? 'Yes' : 'No'}`,
        `  Sealed: ${result.sealed ? 'Yes' : 'No'}`,
        `  Standby: ${result.standby ? 'Yes' : 'No'}`,
        `  Performance Standby: ${result.performance_standby ? 'Yes' : 'No'}`,
        `  Version: ${result.version || 'unknown'}`,
        `  Cluster Name: ${result.cluster_name || 'N/A'}`,
        `  Cluster ID: ${result.cluster_id || 'N/A'}`,
        `  Server Time: ${result.server_time_utc ? new Date(result.server_time_utc * 1000).toLocaleString() : 'unknown'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          initialized: result.initialized,
          sealed: result.sealed,
          standby: result.standby,
          version: result.version,
        },
      };
    } catch (err) {
      return vaultError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const hashicorpVaultAdapter: SkillAdapter = {
  skillId: 'hashicorp-vault',
  name: 'HashiCorp Vault',
  // Base URL is dynamic from ctx.skillConfig.vaultAddr; tools use full URLs
  baseUrl: 'https://vault.example.com/v1',
  auth: {
    type: 'api_key',
    headerName: 'X-Vault-Token',
  },
  tools: {
    vault_read_secret: readSecret,
    vault_list_secrets: listSecrets,
    vault_write_secret: writeSecret,
    vault_list_mounts: listMounts,
    vault_get_health: getHealth,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
  configSchema: {
    vaultAddr: {
      type: 'string' as const,
      label: 'Vault Address',
      description: 'The HashiCorp Vault server address',
      required: true,
      placeholder: 'https://vault.example.com',
    },
  },
};

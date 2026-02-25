/**
 * MCP Skills Bridge — Converts MCP skill adapter tools into native agent tools.
 *
 * This bridges the MCP adapter framework (which has 140+ service integrations)
 * into the agent's native tool format. Skills are only loaded when their
 * credentials exist in the vault (set via Dashboard → Settings → Integrations).
 *
 * Flow: Vault credentials → MCP Framework init → getTools() → bridge to AnyAgentTool[]
 */

import type { AnyAgentTool } from '../types.js';
import { jsonResult, errorResult } from '../common.js';

export interface McpBridgeConfig {
  /** SecureVault instance for credential resolution */
  vault: any;
  /** Organization ID */
  orgId?: string;
  /** Agent ID */
  agentId?: string;
  /** Optional: only load these skill IDs (if empty/undefined, load all with credentials) */
  enabledSkills?: string[];
}

/**
 * Create agent tools from MCP skill adapters.
 * Only skills with valid vault credentials are initialized.
 * Returns empty array if no skills have credentials configured.
 */
export async function createMcpBridgeTools(config: McpBridgeConfig): Promise<AnyAgentTool[]> {
  try {
    // Pre-check: query vault for which skills have credentials before loading adapters
    const orgId = config.orgId || 'default';
    let credentialSkillIds: Set<string>;
    try {
      const entries = await config.vault.getSecretsByOrg(orgId, 'skill_credential');
      // Extract skill IDs from vault entry names (format: "skill:{skillId}:access_token")
      credentialSkillIds = new Set(
        entries
          .map((e: any) => e.name?.match(/^skill:([^:]+):/)?.[1])
          .filter(Boolean)
      );
    } catch {
      credentialSkillIds = new Set();
    }

    if (credentialSkillIds.size === 0) {
      console.log('[mcp-bridge] No integration credentials in vault — skipping adapter load');
      return [];
    }

    console.log(`[mcp-bridge] Found credentials for ${credentialSkillIds.size} integration(s): ${[...credentialSkillIds].join(', ')}`);

    const { SkillMcpFramework } = await import('../../mcp/framework/skill-mcp-framework.js');
    const { allAdapters } = await import('../../mcp/adapters/index.js');

    // Only load adapters that have credentials in the vault
    const adaptersWithCreds = allAdapters.filter(a => {
      if (config.enabledSkills?.length) {
        return config.enabledSkills.includes(a.skillId) && credentialSkillIds.has(a.skillId);
      }
      return credentialSkillIds.has(a.skillId);
    });

    if (adaptersWithCreds.length === 0) {
      console.log('[mcp-bridge] No adapters match vault credentials — skipping');
      return [];
    }

    const framework = new SkillMcpFramework({
      vault: config.vault,
      orgId,
      agentId: config.agentId || 'agent',
      skillConfigs: {},
    });

    framework.registerAll(adaptersWithCreds);

    // Initialize — resolve credentials and build executors
    const initialized = await framework.initialize();
    const totalTools = Array.from(initialized.values()).reduce((sum, t) => sum + t.length, 0);

    if (totalTools === 0) return [];

    console.log(`[mcp-bridge] Loaded ${initialized.size} integrations, ${totalTools} tools`);

    // Convert MCP tools to native agent tools
    const mcpTools = framework.getTools();
    return mcpTools.map(tool => ({
      name: tool.toolId,
      description: tool.description,
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
      async execute(_id: string, params: any) {
        try {
          const result = await tool.handler(params);
          if (result.isError) {
            return errorResult(result.content);
          }
          // Try to parse as JSON for structured output
          try {
            const parsed = JSON.parse(result.content);
            return jsonResult(parsed);
          } catch {
            return { content: [{ type: 'text' as const, text: result.content }] };
          }
        } catch (e: any) {
          return errorResult(`${tool.skillId} error: ${e.message}`);
        }
      },
    }));
  } catch (e: any) {
    console.warn(`[mcp-bridge] Failed to load MCP skills: ${e.message}`);
    return [];
  }
}

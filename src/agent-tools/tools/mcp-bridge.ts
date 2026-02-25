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
    const { SkillMcpFramework } = await import('../../mcp/framework/skill-mcp-framework.js');
    const { allAdapters } = await import('../../mcp/adapters/index.js');

    const framework = new SkillMcpFramework({
      vault: config.vault,
      orgId: config.orgId || 'default',
      agentId: config.agentId || 'agent',
      skillConfigs: {},
    });

    // Register adapters (optionally filtered)
    if (config.enabledSkills?.length) {
      const filtered = allAdapters.filter(a => config.enabledSkills!.includes(a.skillId));
      framework.registerAll(filtered);
    } else {
      framework.registerAll(allAdapters);
    }

    // Initialize — only skills with vault credentials will succeed
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

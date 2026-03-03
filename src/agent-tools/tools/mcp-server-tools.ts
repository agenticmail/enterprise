/**
 * MCP Server Tools Bridge
 *
 * Converts tools from external MCP servers (registered via Dashboard → Integrations & MCP)
 * into native AnyAgentTool[] that the agent loop can use directly.
 *
 * This bridges the McpProcessManager (which manages MCP server lifecycles)
 * to the agent's tool system. Each discovered MCP tool becomes a callable agent tool.
 *
 * Flow:
 *   McpProcessManager.getToolsForAgent(agentId)
 *   → McpDiscoveredTool[] (name, description, inputSchema, serverId)
 *   → createMcpServerTools() wraps each in AnyAgentTool with execute()
 *   → execute() calls McpProcessManager.callTool(name, args)
 *   → proxied to MCP server via stdio/HTTP → result returned to agent
 */

import type { AnyAgentTool } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import type { McpProcessManager } from '../../engine/mcp-process-manager.js';

export interface McpServerToolsConfig {
  mcpManager: McpProcessManager;
  agentId?: string;
  /** Optional permission engine for dynamic tool registration */
  permissionEngine?: any;
}

/**
 * Create agent tools from all connected MCP servers for a given agent.
 * Returns empty array if no MCP servers are connected or none assigned to this agent.
 */
export function createMcpServerTools(config: McpServerToolsConfig): AnyAgentTool[] {
  const { mcpManager, agentId } = config;
  const discoveredTools = mcpManager.getToolsForAgent(agentId);

  if (discoveredTools.length === 0) return [];

  console.log(`[mcp-server-tools] Creating ${discoveredTools.length} tools from MCP servers for agent ${agentId || 'all'}`);

  // Register with permission engine
  if (config.permissionEngine && discoveredTools.length > 0) {
    try {
      const toolDefs = discoveredTools.map(t => ({
        id: `mcp_${t.name}`,
        name: `mcp_${t.name}`,
        description: t.description || t.name,
        category: 'utility' as any,
        risk: 'medium' as any,
        skillId: 'mcp-servers',
        sideEffects: ['external_api'] as any[],
      }));
      config.permissionEngine.registerDynamicTools('mcp-servers', toolDefs);
    } catch (e: any) {
      console.warn(`[mcp-server-tools] Permission engine registration failed: ${e.message}`);
    }
  }

  return discoveredTools.map(tool => {
    // Prefix tool names with mcp_ to avoid collisions with built-in tools
    const toolName = `mcp_${tool.name}`;

    return {
      name: toolName,
      description: `[${tool.serverName}] ${tool.description || tool.name}`,
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: tool.inputSchema?.properties || {},
        required: tool.inputSchema?.required || [],
      },
      async execute(_callId: string, params: any) {
        try {
          const result = await mcpManager.callTool(tool.name, params, agentId);
          if (result.isError) {
            return errorResult(result.content);
          }
          // Try to parse JSON for structured output
          try {
            const parsed = JSON.parse(result.content);
            return jsonResult(parsed);
          } catch {
            return { content: [{ type: 'text' as const, text: result.content }] };
          }
        } catch (e: any) {
          return errorResult(`MCP tool ${tool.name} error: ${e.message}`);
        }
      },
    };
  });
}

/**
 * MCP Bridge Skill Definition
 *
 * Dynamic skill definition that registers all MCP adapter tools
 * with the permission engine.
 */

import type { SkillDefinition, ToolDefinition } from '../skills.js';

/**
 * Create a skill definition for MCP bridge tools at runtime.
 * Called after MCP bridge initialization with the actual tool names.
 */
export function createMcpBridgeSkillDef(toolIds: string[]): SkillDefinition {
  return {
    id: 'mcp-bridge',
    name: 'MCP Integration Bridge',
    description: 'Third-party service integrations (Slack, GitHub, Jira, Stripe, etc.)',
    category: 'integration' as any,
    risk: 'medium' as any,
    tools: toolIds.map(id => ({
      id,
      name: id,
      description: `MCP bridge tool: ${id}`,
      category: 'utility' as any,
      risk: 'medium' as any,
      skillId: 'mcp-bridge',
      sideEffects: ['external_api'] as any[],
    })),
    source: 'builtin',
  };
}

/**
 * Static fallback — empty tool list; tools are registered dynamically.
 */
export const MCP_BRIDGE_SKILL: SkillDefinition = {
  id: 'mcp-bridge',
  name: 'MCP Integration Bridge',
  description: 'Third-party service integrations via MCP adapters',
  category: 'integration' as any,
  risk: 'medium' as any,
  tools: [],
  source: 'builtin',
};

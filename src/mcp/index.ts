#!/usr/bin/env node
/**
 * AgenticMail Enterprise — Community Skills MCP Server
 *
 * Unified MCP server that serves all installed community skill tools.
 * Each skill has a thin adapter; the framework handles auth, retry,
 * circuit breaking, and credential management via the vault.
 *
 * Usage:
 *   AGENTICMAIL_ENGINE_URL=http://localhost:3200 \
 *   AGENTICMAIL_ORG_ID=default \
 *   AGENTICMAIL_AGENT_ID=agent-1 \
 *   AGENTICMAIL_VAULT_KEY=your-vault-key \
 *   node dist/mcp/index.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SecureVault } from '../engine/vault.js';
import { SkillMcpFramework } from './framework/skill-mcp-framework.js';
import { allAdapters } from './adapters/index.js';

const ORG_ID = process.env.AGENTICMAIL_ORG_ID ?? 'default';
const AGENT_ID = process.env.AGENTICMAIL_AGENT_ID ?? 'mcp-skills';

async function main() {
  // ─── Initialize vault ──────────────────────────────────
  const vault = new SecureVault();
  // Vault reads AGENTICMAIL_VAULT_KEY from env and decrypts in-memory

  // ─── Load installed skill configs ────────────────────────
  let skillConfigs: Record<string, Record<string, any>> = {};
  const engineUrl = process.env.AGENTICMAIL_ENGINE_URL;
  if (engineUrl) {
    try {
      const resp = await fetch(`${engineUrl}/api/engine/community/installed?orgId=${ORG_ID}`);
      if (resp.ok) {
        const data = await resp.json() as { installed?: Array<{ skillId: string; config?: Record<string, any> }> };
        for (const inst of data.installed || []) {
          if (inst.config && Object.keys(inst.config).length > 0) {
            skillConfigs[inst.skillId] = inst.config;
          }
        }
        console.error(`[mcp-skills] Loaded configs for ${Object.keys(skillConfigs).length} skill(s)`);
      }
    } catch (err: any) {
      console.error(`[mcp-skills] Could not load skill configs: ${err.message}`);
    }
  }

  // ─── Initialize framework ──────────────────────────────
  const framework = new SkillMcpFramework({
    vault,
    orgId: ORG_ID,
    agentId: AGENT_ID,
    skillConfigs,
  });

  // Register all available adapters
  framework.registerAll(allAdapters);

  // Initialize: resolve credentials, build executors
  const initialized = await framework.initialize();

  const totalTools = Array.from(initialized.values()).reduce((sum, t) => sum + t.length, 0);
  console.error(
    `[mcp-skills] Ready: ${initialized.size} skills, ${totalTools} tools`,
  );

  // ─── Create MCP server ─────────────────────────────────
  const server = new McpServer({
    name: 'AgenticMail Enterprise Skills',
    version: '0.3.2',
    description: 'Community skill integrations for AgenticMail AI agents',
  });

  // Register all initialized tools
  const tools = framework.getTools();
  for (const tool of tools) {
    server.tool(
      tool.toolId,
      tool.description,
      tool.inputSchema,
      async ({ arguments: args }: { arguments: Record<string, unknown> }) => {
        const result = await tool.handler(args as Record<string, any>);
        return {
          content: [{ type: 'text' as const, text: result.content }],
          isError: result.isError,
        };
      },
    );
  }

  // ─── Status resource ───────────────────────────────────
  server.resource(
    'skill-status',
    'agenticmail://skills/status',
    { description: 'Status of all registered community skill adapters', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'agenticmail://skills/status',
        text: JSON.stringify(framework.getStatus(), null, 2),
        mimeType: 'application/json',
      }],
    }),
  );

  // ─── Start stdio transport ─────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = async () => {
    try { await server.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[mcp-skills] Fatal:', err);
  process.exit(1);
});

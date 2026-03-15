/**
 * Agent Duplication — creates exact replicas of an existing agent
 * with new ID, name, and email but identical config, memory, and identity.
 */

import type { Hono } from 'hono';
import crypto from 'crypto';

interface DuplicateRequest {
  agents: Array<{ name: string; email: string }>;
}

export function registerDuplicateRoutes(
  api: Hono<any>,
  opts: {
    getAdminDb: () => any;
    getEngineDb: () => any;
    getLifecycle: () => any;
    getPermissions: () => any;
    requireRole: (role: any) => any;
  }
) {
  const { getAdminDb, getEngineDb, getLifecycle, getPermissions, requireRole } = opts;

  /**
   * POST /agents/:id/duplicate
   * Body: { agents: [{ name: "New Agent", email: "new@example.com" }, ...] }
   * Creates one or more exact duplicates of the source agent.
   */
  api.post('/agents/:id/duplicate', requireRole('owner'), async (c) => {
    try {
      const sourceId = c.req.param('id');
      const body: DuplicateRequest = await c.req.json();
      const actor = (c as any).get('userId') || 'system';

      if (!body.agents || !Array.isArray(body.agents) || body.agents.length === 0) {
        return c.json({ error: 'agents array is required with at least one { name, email } entry' }, 400);
      }

      // Validate all names and emails upfront
      for (const a of body.agents) {
        if (!a.name || a.name.length < 1 || a.name.length > 64) {
          return c.json({ error: `Invalid name: "${a.name}". Must be 1-64 characters.` }, 400);
        }
        if (!a.email || !a.email.includes('@')) {
          return c.json({ error: `Invalid email: "${a.email}".` }, 400);
        }
      }

      const adminDb = getAdminDb();
      const engineDb = getEngineDb();
      const lifecycle = getLifecycle();
      const permissions = getPermissions();

      // 1. Get source agent from admin DB
      const sourceAgent = adminDb ? await adminDb.getAgent(sourceId) : null;
      if (!sourceAgent) {
        return c.json({ error: 'Source agent not found' }, 404);
      }

      // 2. Get source agent engine config
      let sourceConfig: any = null;
      try {
        const edb = engineDb;
        if (edb) {
          const row = await edb.get(`SELECT * FROM managed_agents WHERE agent_id = ?`, [sourceId]);
          if (row) {
            sourceConfig = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
          }
        }
      } catch {}

      // 3. Get source agent permission profile
      let sourcePermissions: any = null;
      try {
        sourcePermissions = permissions?.getProfile?.(sourceId);
      } catch {}

      // 4. Get source agent memory (observations + index)
      let sourceMemory: any[] = [];
      let sourceMemoryIndex: any[] = [];
      try {
        const edb = engineDb;
        if (edb) {
          sourceMemory = await edb.all(`SELECT * FROM agent_observations WHERE agent_id = ?`, [sourceId]).catch(() => []) || [];
          sourceMemoryIndex = await edb.all(`SELECT * FROM agent_memory_index WHERE agent_id = ?`, [sourceId]).catch(() => []) || [];
        }
      } catch {}

      // 5. Create duplicates
      const created: any[] = [];
      const errors: any[] = [];

      for (const newAgent of body.agents) {
        const newId = crypto.randomUUID();
        try {
          // Check for duplicate name/email
          if (adminDb) {
            const existingName = await adminDb.getAgentByName?.(newAgent.name).catch(() => null);
            const existingEmail = await adminDb.getAgentByEmail?.(newAgent.email).catch(() => null);
            if (existingName) { errors.push({ name: newAgent.name, error: 'Name already exists' }); continue; }
            if (existingEmail) { errors.push({ name: newAgent.name, error: 'Email already exists' }); continue; }
          }

          // Build new config from source
          const newConfig = sourceConfig ? JSON.parse(JSON.stringify(sourceConfig)) : {};
          newConfig.id = newId;
          newConfig.name = newAgent.name;
          newConfig.displayName = newAgent.name;
          newConfig.email = newAgent.email;
          if (newConfig.identity) {
            newConfig.identity.name = newAgent.name;
            newConfig.identity.displayName = newAgent.name;
            newConfig.identity.email = newAgent.email;
          }

          // Create admin record
          if (adminDb) {
            await adminDb.createAgent({
              id: newId,
              name: newAgent.name,
              email: newAgent.email,
              role: sourceAgent.role || 'assistant',
              metadata: typeof sourceAgent.metadata === 'string'
                ? JSON.parse(sourceAgent.metadata)
                : sourceAgent.metadata || {},
              createdBy: actor,
            });
          }

          // Create engine managed agent
          if (lifecycle && sourceConfig) {
            const orgId = sourceConfig.orgId || (typeof sourceAgent.metadata === 'string' ? JSON.parse(sourceAgent.metadata) : sourceAgent.metadata)?.orgId || 'default';
            await lifecycle.createAgent(orgId, newConfig, actor);
          }

          // Copy permission profile
          if (sourcePermissions && permissions?.setProfile) {
            const newProfile = JSON.parse(JSON.stringify(sourcePermissions));
            newProfile.id = newId;
            newProfile.name = newAgent.name;
            const orgId = sourceConfig?.orgId || 'default';
            permissions.setProfile(newId, newProfile, orgId);
          }

          // Copy memory
          if (engineDb) {
            for (const mem of sourceMemory) {
              try {
                const memId = crypto.randomUUID();
                await engineDb.run(
                  `INSERT INTO agent_observations (id, agent_id, type, content, context, importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [memId, newId, mem.type, mem.content, mem.context, mem.importance, mem.created_at]
                ).catch(() => {});
              } catch {}
            }
            for (const idx of sourceMemoryIndex) {
              try {
                const idxId = crypto.randomUUID();
                await engineDb.run(
                  `INSERT INTO agent_memory_index (id, agent_id, key, value, category, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                  [idxId, newId, idx.key, idx.value, idx.category, idx.created_at]
                ).catch(() => {});
              } catch {}
            }
          }

          created.push({
            id: newId,
            name: newAgent.name,
            email: newAgent.email,
            duplicatedFrom: sourceId,
            sourceName: sourceAgent.name,
          });

          // Audit log
          try {
            await adminDb?.createAuditLog?.({
              userId: actor,
              action: 'agent.duplicated',
              resourceType: 'agent',
              resourceId: newId,
              details: { sourceId, sourceName: sourceAgent.name, newName: newAgent.name },
            });
          } catch {}

        } catch (err: any) {
          errors.push({ name: newAgent.name, error: err.message });
        }
      }

      return c.json({
        ok: true,
        created: created.length,
        failed: errors.length,
        agents: created,
        errors: errors.length > 0 ? errors : undefined,
      });

    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}

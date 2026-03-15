/**
 * Agent Duplication — creates EXACT replicas of an agent.
 * Copies: config, identity, personality, memory, skills, permissions, budget,
 * security, tool security, workforce, work schedule, onboarding.
 * Does NOT copy: activity logs, sessions, tool calls, channels (telegram/whatsapp/email).
 */

import type { Hono } from 'hono';
import crypto from 'crypto';

interface DuplicateEntry { name: string; email: string }
interface DuplicateRequest { agents: DuplicateEntry[] }

// Tables to copy with agent_id column
const COPY_TABLES = [
  // Core
  { table: 'agent_memory', idCol: 'agent_id', resetCols: {} },
  { table: 'work_schedules', idCol: 'agent_id', resetCols: {} },
  { table: 'task_queue', idCol: 'agent_id', resetCols: { status: 'pending' } },
  { table: 'conversations', idCol: 'agent_id', resetCols: {} },
  { table: 'agent_followups', idCol: 'agent_id', resetCols: {} },
  // Budget alerts (copy structure, reset counts)
  { table: 'budget_alerts', idCol: 'agent_id', resetCols: { triggered_count: 0 } },
];

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

  api.post('/agents/:id/duplicate', requireRole('owner'), async (c) => {
    try {
      const sourceId = c.req.param('id');
      const body: DuplicateRequest = await c.req.json();
      const actor = (c as any).get('userId') || 'system';

      if (!body.agents?.length) {
        return c.json({ error: 'agents array required with { name, email } entries' }, 400);
      }
      for (const a of body.agents) {
        if (!a.name?.trim() || a.name.length > 64) return c.json({ error: `Invalid name: "${a.name}"` }, 400);
        if (!a.email?.includes('@')) return c.json({ error: `Invalid email: "${a.email}"` }, 400);
      }

      const adminDb = getAdminDb();
      const engineDb = getEngineDb();
      const permissions = getPermissions();

      // ── Load source agent from admin DB ──
      const sourceAdmin = adminDb ? await adminDb.getAgent(sourceId) : null;
      if (!sourceAdmin) return c.json({ error: 'Source agent not found' }, 404);

      // ── Load source managed_agents record (engine) ──
      let sourceManaged: any = null;
      try {
        sourceManaged = await engineDb?.get(`SELECT * FROM managed_agents WHERE id = ?`, [sourceId]);
      } catch {}

      // ── Load source config ──
      let sourceConfig: any = {};
      if (sourceManaged?.config) {
        sourceConfig = typeof sourceManaged.config === 'string' ? JSON.parse(sourceManaged.config) : sourceManaged.config;
      }

      // ── Load budget config ──
      let budgetConfig: any = null;
      if (sourceManaged?.budget_config) {
        budgetConfig = typeof sourceManaged.budget_config === 'string' ? JSON.parse(sourceManaged.budget_config) : sourceManaged.budget_config;
        // Reset usage counters
        if (budgetConfig) {
          budgetConfig.tokensUsedToday = 0;
          budgetConfig.tokensUsedMonth = 0;
          budgetConfig.costToday = 0;
          budgetConfig.costMonth = 0;
        }
      }

      // ── Load security overrides ──
      let securityOverrides: any = null;
      if (sourceManaged?.security_overrides) {
        securityOverrides = typeof sourceManaged.security_overrides === 'string' ? JSON.parse(sourceManaged.security_overrides) : sourceManaged.security_overrides;
      }

      // ── Load permission profile ──
      let permProfile: any = null;
      try { permProfile = permissions?.getProfile?.(sourceId); } catch {}

      // ── Create duplicates ──
      const created: any[] = [];
      const errors: any[] = [];
      const totalSteps = body.agents.length;

      for (let i = 0; i < body.agents.length; i++) {
        const entry = body.agents[i];
        const newId = crypto.randomUUID();
        const steps: string[] = [];

        try {
          // Check uniqueness
          if (adminDb) {
            try {
              const existing = await adminDb.listAgents({ limit: 1000, offset: 0 });
              const agents = Array.isArray(existing?.agents) ? existing.agents : Array.isArray(existing) ? existing : [];
              if (agents.find((a: any) => a.name === entry.name)) { errors.push({ name: entry.name, error: 'Name already exists' }); continue; }
              if (agents.find((a: any) => a.email === entry.email)) { errors.push({ name: entry.name, error: 'Email already exists' }); continue; }
            } catch {}
          }

          // ── 1. Admin agent record ──
          if (adminDb) {
            const meta = typeof sourceAdmin.metadata === 'string' ? JSON.parse(sourceAdmin.metadata) : (sourceAdmin.metadata || {});
            await adminDb.createAgent({
              id: newId,
              name: entry.name,
              email: entry.email,
              role: sourceAdmin.role || 'assistant',
              metadata: { ...meta, duplicatedFrom: sourceId, duplicatedAt: new Date().toISOString() },
              createdBy: actor,
            });
            steps.push('admin record');
          }

          // ── 2. Engine managed_agents record ──
          if (engineDb && sourceManaged) {
            const newConfig = JSON.parse(JSON.stringify(sourceConfig));
            newConfig.id = newId;
            newConfig.name = entry.name;
            newConfig.displayName = entry.name;
            newConfig.email = entry.email;
            if (newConfig.identity) {
              newConfig.identity.name = entry.name;
              newConfig.identity.displayName = entry.name;
              newConfig.identity.email = entry.email;
            }

            await engineDb.run(
              `INSERT INTO managed_agents (id, org_id, name, display_name, state, config, budget_config, security_overrides, permission_profile_id, client_org_id, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [
                newId,
                sourceManaged.org_id,
                entry.name,
                entry.name,
                'idle',
                JSON.stringify(newConfig),
                budgetConfig ? JSON.stringify(budgetConfig) : null,
                securityOverrides ? JSON.stringify(securityOverrides) : null,
                sourceManaged.permission_profile_id || null,
                sourceManaged.client_org_id || null,
                actor,
              ]
            );
            steps.push('engine config + budget + security');
          }

          // ── 3. Permission profile ──
          if (permProfile && permissions?.setProfile) {
            const newProf = JSON.parse(JSON.stringify(permProfile));
            newProf.id = newId;
            newProf.name = entry.name;
            permissions.setProfile(newId, newProf, sourceManaged?.org_id || 'default');
            steps.push('permissions');
          }

          // ── 4. Copy all agent-specific tables ──
          if (engineDb) {
            for (const spec of COPY_TABLES) {
              try {
                const rows = await engineDb.all(`SELECT * FROM ${spec.table} WHERE ${spec.idCol} = ?`, [sourceId]);
                if (rows && rows.length > 0) {
                  let copied = 0;
                  for (const row of rows) {
                    const newRow = { ...row };
                    newRow[spec.idCol] = newId;
                    if (newRow.id) newRow.id = crypto.randomUUID();
                    // Apply resets
                    for (const [k, v] of Object.entries(spec.resetCols)) {
                      newRow[k] = v;
                    }
                    const cols = Object.keys(newRow);
                    const vals = cols.map(k => newRow[k]);
                    const placeholders = cols.map((_, j) => `?`).join(',');
                    await engineDb.run(`INSERT INTO ${spec.table} (${cols.join(',')}) VALUES (${placeholders})`, vals).catch(() => {});
                    copied++;
                  }
                  if (copied > 0) steps.push(`${spec.table} (${copied})`);
                }
              } catch {} // Table might not exist
            }

            // ── 5. Copy onboarding record (reset to current state) ──
            try {
              const onb = await engineDb.get(`SELECT * FROM onboarding_records WHERE agent_id = ?`, [sourceId]);
              if (onb) {
                await engineDb.run(
                  `INSERT INTO onboarding_records (agent_id, status, config_completed, identity_completed, skills_completed, deployment_completed, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                  [newId, 'completed', 1, 1, 1, 0, ] // deployment not completed — user must configure
                ).catch(() => {});
                steps.push('onboarding');
              }
            } catch {}
          }

          // ── 6. Audit log ──
          try {
            await adminDb?.createAuditLog?.({
              userId: actor,
              action: 'agent.duplicated',
              resourceType: 'agent',
              resourceId: newId,
              details: { sourceId, sourceName: sourceAdmin.name, newName: entry.name, steps },
            });
          } catch {}

          created.push({
            id: newId,
            name: entry.name,
            email: entry.email,
            duplicatedFrom: sourceId,
            sourceName: sourceAdmin.name,
            copiedSteps: steps,
            needsSetup: ['Deployment', 'Channels (Telegram/WhatsApp/Email)', 'Manager'],
          });

        } catch (err: any) {
          errors.push({ name: entry.name, error: err.message });
        }
      }

      return c.json({
        ok: true,
        created: created.length,
        failed: errors.length,
        agents: created,
        errors: errors.length > 0 ? errors : undefined,
        message: created.length > 0
          ? `${created.length} agent(s) duplicated. Go to each new agent and configure: Deployment, Channels, and Manager tabs.`
          : 'No agents were created.',
      });

    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}

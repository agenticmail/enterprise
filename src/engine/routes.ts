/**
 * Engine API Routes — Orchestrator
 *
 * Mounts domain-specific sub-routers on the engine Hono app.
 * Mounted at /api/engine/* on the enterprise server.
 *
 * Sub-apps handle domain-specific route groups:
 *   - dlp-routes.ts           → /dlp/*
 *   - guardrail-routes.ts     → /guardrails/*, /anomaly-rules/*
 *   - journal-routes.ts       → /journal/*
 *   - communication-routes.ts → /messages/*, /tasks/*
 *   - compliance-routes.ts    → /compliance/*
 *   - catalog-routes.ts       → /skills/*, /souls/*, /profiles/*, /permissions/*, /config/*
 *   - agent-routes.ts         → /agents/*, /usage/*, /budget/*, /bridge/*
 *   - knowledge-routes.ts     → /knowledge-bases/*
 *   - org-approval-routes.ts  → /orgs/*, /approvals/*, /escalation-chains/*
 *   - activity-routes.ts      → /activity/*, /stats/*
 *   - deploy-schema-routes.ts → /deploy-credentials/*, /schema/*
 *   - community-routes.ts    → /community/*
 *   - workforce-routes.ts    → /workforce/*
 *   - policy-routes.ts       → /policies/*
 *   - memory-routes.ts       → /memory/*
 *   - onboarding-routes.ts   → /onboarding/*
 *   - vault-routes.ts        → /vault/*
 *   - storage-routes.ts      → /storage/*
 *   - policy-import-routes.ts→ /policies/import/*
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types/hono-env.js';
import { PermissionEngine, BUILTIN_SKILLS, PRESET_PROFILES, SKILL_SUITES } from './skills.js';
import { FULL_SKILL_DEFINITIONS } from './skills/index.js';
import { AgentConfigGenerator } from './agent-config.js';
import { DeploymentEngine } from './deployer.js';
import { ApprovalEngine } from './approvals.js';
import { AgentLifecycleManager } from './lifecycle.js';
import { KnowledgeBaseEngine } from './knowledge.js';
import { TenantManager } from './tenant.js';
import { ActivityTracker } from './activity.js';
import { DLPEngine } from './dlp.js';
import { AgentCommunicationBus } from './communication.js';
import { GuardrailEngine } from './guardrails.js';
import { ActionJournal } from './journal.js';
import { ComplianceReporter } from './compliance.js';
import {
  getSoulTemplates,
  getSoulTemplatesByCategory,
  getSoulTemplate,
  searchSoulTemplates,
  SOUL_CATEGORIES,
} from './soul-library.js';
import { createDlpRoutes } from './dlp-routes.js';
import { createGuardrailRoutes, createAnomalyRoutes } from './guardrail-routes.js';
import { createJournalRoutes } from './journal-routes.js';
import { createCommunicationRoutes, createTaskRoutes } from './communication-routes.js';
import { createComplianceRoutes } from './compliance-routes.js';
import { createCatalogRoutes } from './catalog-routes.js';
import { createAgentRoutes } from './agent-routes.js';
import { createKnowledgeRoutes } from './knowledge-routes.js';
import { createOrgApprovalRoutes } from './org-approval-routes.js';
import { createActivityRoutes } from './activity-routes.js';
import { createDeploySchemaRoutes } from './deploy-schema-routes.js';
import { CommunitySkillRegistry } from './community-registry.js';
import { createCommunityRoutes } from './community-routes.js';
import { WorkforceManager } from './workforce.js';
import { createWorkforceRoutes } from './workforce-routes.js';
import { OrgPolicyEngine } from './org-policies.js';
import { AgentMemoryManager } from './agent-memory.js';
import { OnboardingManager } from './onboarding.js';
import { createPolicyRoutes } from './policy-routes.js';
import { KnowledgeContributionManager } from './knowledge-contribution.js';
import { createKnowledgeContributionRoutes } from './knowledge-contribution-routes.js';
import { SkillAutoUpdater } from './skill-updater.js';
import { createSkillUpdaterRoutes } from './skill-updater-routes.js';
import { KnowledgeImportManager, createKnowledgeImportRoutes } from './knowledge-import/index.js';
import { createMemoryRoutes } from './memory-routes.js';
import { createOnboardingRoutes } from './onboarding-routes.js';
import { SecureVault } from './vault.js';
import { StorageManager } from './storage-manager.js';
import { PolicyImporter } from './policy-import.js';
import { createVaultRoutes } from './vault-routes.js';
import { createStorageRoutes } from './storage-routes.js';
import { createPolicyImportRoutes } from './policy-import-routes.js';
import { createOAuthConnectRoutes } from './oauth-connect-routes.js';
import { createChatWebhookRoutes } from './chat-webhook-routes.js';
import { ChatPoller } from './chat-poller.js';
import { EmailPoller } from './email-poller.js';
import { MessagingPoller } from './messaging-poller.js';
import type { DatabaseAdapter } from '../db/adapter.js';

const engine = new Hono<AppEnv>();
let _engineApp: Hono<AppEnv> = engine;

// ─── Shared Instances ───────────────────────────────────

const permissionEngine = new PermissionEngine(FULL_SKILL_DEFINITIONS);
{
  const totalTools = FULL_SKILL_DEFINITIONS.reduce((s, sk) => s + sk.tools.length, 0);
  console.log(`[permissions] Registered ${FULL_SKILL_DEFINITIONS.length} skills, ${totalTools} tools`);
}
const configGen = new AgentConfigGenerator();
const deployer = new DeploymentEngine();
const approvals = new ApprovalEngine();
const lifecycle = new AgentLifecycleManager({ permissions: permissionEngine });
const knowledgeBase = new KnowledgeBaseEngine();
const tenants = new TenantManager();
const activity = new ActivityTracker();
import { AgentStatusTracker } from './agent-status.js';
const agentStatus = new AgentStatusTracker();
const dlp = new DLPEngine();
const commBus = new AgentCommunicationBus();
const guardrails = new GuardrailEngine({
  stopAgent: async (agentId, by, reason) => { await lifecycle.stop(agentId, by, reason); },
});
const journal = new ActionJournal();
const compliance = new ComplianceReporter();
const communityRegistry = new CommunitySkillRegistry({ permissions: permissionEngine });
const workforce = new WorkforceManager({ lifecycle, guardrails });
const policyEngine = new OrgPolicyEngine();
const memoryManager = new AgentMemoryManager();
const onboarding = new OnboardingManager({ policyEngine, memoryManager });
const vault = new SecureVault();
const storageManager = new StorageManager({ vault });
const policyImporter = new PolicyImporter({ policyEngine, storageManager });
const knowledgeContribution = new KnowledgeContributionManager({ memoryCallback: async (agentId: string) => memoryManager.queryMemories({ agentId }) });
const knowledgeImport = new KnowledgeImportManager({ knowledgeContribution });
const skillUpdater = new SkillAutoUpdater({ registry: communityRegistry });

// Wire onboarding into guardrails for onboarding gate checks
guardrails.setOnboardingManager(onboarding);

// Wire lifecycle events into activity tracker
lifecycle.onEvent((event) => {
  activity.record({
    agentId: event.agentId,
    orgId: event.orgId,
    type: event.type as any,
    data: event.data,
  });
});

// Wire lifecycle into communication bus for agent email registry
commBus.setLifecycle(lifecycle);

// Wire birthday automation — sends a birthday email to each agent on their DOB
lifecycle.setBirthdaySender(async (agent) => {
  const dob = agent.config?.identity?.dateOfBirth;
  if (!dob) return;
  const age = AgentConfigGenerator.deriveAge(dob);
  const name = agent.config.displayName || agent.config.name;
  const ordinal = age % 10 === 1 && age !== 11 ? 'st' : age % 10 === 2 && age !== 12 ? 'nd' : age % 10 === 3 && age !== 13 ? 'rd' : 'th';
  await commBus.sendMessage({
    orgId: agent.orgId,
    fromAgentId: 'system',
    toAgentId: agent.id,
    subject: `Happy Birthday, ${name}!`,
    content: `Happy ${age}${ordinal} birthday, ${name}! Wishing you a wonderful day full of great conversations and accomplishments. Here's to another year of excellence!`,
    priority: 'normal',
    metadata: { type: 'birthday', age, dateOfBirth: dob },
  });
});
lifecycle.startBirthdayScheduler();

// ─── Auth Context Extraction ────────────────────────────
// When engine routes are called via the server proxy, auth context
// is forwarded as custom headers. Extract into Hono context.
engine.use('*', async (c, next) => {
  const userId = c.req.header('X-User-Id');
  const userRole = c.req.header('X-User-Role');
  const authType = c.req.header('X-Auth-Type');
  const requestId = c.req.header('X-Request-Id');
  if (userId) c.set('userId', userId);
  if (userRole) c.set('userRole', userRole);
  if (authType) c.set('authType', authType);
  if (requestId) c.set('requestId', requestId);
  await next();
});

// ─── Mount Sub-Apps ─────────────────────────────────────

engine.route('/dlp', createDlpRoutes(dlp));
engine.route('/guardrails', createGuardrailRoutes(guardrails, {
  getWorkforceOffDuty: (agentId) => workforce.isOffDuty(agentId),
}));
engine.route('/anomaly-rules', createAnomalyRoutes(guardrails));
engine.route('/journal', createJournalRoutes(journal));
engine.route('/messages', createCommunicationRoutes(commBus));
engine.route('/tasks', createTaskRoutes(commBus));
engine.route('/compliance', createComplianceRoutes(compliance));

engine.route('/', createCatalogRoutes({
  skills: BUILTIN_SKILLS,
  presets: PRESET_PROFILES,
  permissions: permissionEngine,
  configGen,
  soulLib: { getSoulTemplates, getSoulTemplatesByCategory, getSoulTemplate, searchSoulTemplates, SOUL_CATEGORIES },
  suites: SKILL_SUITES,
  lifecycle,
}));

engine.route('/', createAgentRoutes({
  lifecycle,
  permissions: permissionEngine,
  getAdminDb: () => _adminDb,
}));

engine.route('/', createKnowledgeRoutes(knowledgeBase));

engine.route('/', createOrgApprovalRoutes({
  tenants,
  approvals,
}));

engine.route('/', createActivityRoutes({
  activity,
  tenants,
  lifecycle,
}));

engine.route('/', createDeploySchemaRoutes(() => _engineDb, () => vault));

// ─── Real-Time Agent Status ───────────────────────────
engine.get('/agent-status', (c) => {
  return c.json({ statuses: agentStatus.getAllStatuses() });
});

engine.get('/agent-status/:agentId', (c) => {
  return c.json(agentStatus.getStatus(c.req.param('agentId')));
});

engine.get('/agent-status-stream', (c) => {
  const filterAgent = c.req.query('agentId');
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
        catch { unsub(); }
      };

      // Send current state immediately
      if (filterAgent) {
        send(JSON.stringify({ type: 'status', ...agentStatus.getStatus(filterAgent) }));
      } else {
        for (const s of agentStatus.getAllStatuses()) {
          send(JSON.stringify({ type: 'status', ...s }));
        }
      }

      // Subscribe to updates
      const unsub = agentStatus.subscribe((agentId, snapshot) => {
        if (filterAgent && agentId !== filterAgent) return;
        send(JSON.stringify({ type: 'status', ...snapshot }));
      });

      // Keepalive
      const hb = setInterval(() => send(JSON.stringify({ type: 'heartbeat' })), 30_000);

      c.req.raw.signal.addEventListener('abort', () => { unsub(); clearInterval(hb); });
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
});

engine.route('/community', createCommunityRoutes(communityRegistry));
engine.route('/workforce', createWorkforceRoutes(workforce, { lifecycle }));
engine.route('/policies', createPolicyRoutes(policyEngine));
engine.route('/memory', createMemoryRoutes(memoryManager));
engine.route('/onboarding', createOnboardingRoutes(onboarding));
engine.route('/vault', createVaultRoutes(vault, dlp));
engine.route('/storage', createStorageRoutes(storageManager));
engine.route('/policies', createPolicyImportRoutes(policyImporter));
engine.route('/knowledge-contribution', createKnowledgeContributionRoutes(knowledgeContribution, { lifecycle }));
engine.route('/knowledge-import', createKnowledgeImportRoutes(knowledgeImport));
engine.route('/skill-updates', createSkillUpdaterRoutes(skillUpdater));
engine.route('/oauth', createOAuthConnectRoutes(vault, lifecycle));

// ─── Integration-specific proxy endpoints ───────────────
engine.get('/integrations/elevenlabs/voices', async (c) => {
  try {
    const orgId = c.req.query('orgId') || 'default';
    const entries = await vault.getSecretsByOrg(orgId);
    const match = entries.find((e: any) => e.name === 'skill:elevenlabs:access_token');
    if (!match) return c.json({ error: 'ElevenLabs not connected' }, 401);
    const secret = await vault.getSecret(match.id);
    if (!secret) return c.json({ error: 'Key not found' }, 401);
    const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': secret.decrypted },
    });
    if (!resp.ok) return c.json({ error: 'ElevenLabs API error: ' + resp.status }, resp.status as any);
    const data = await resp.json() as any;
    return c.json({ voices: data.voices || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
engine.route('/chat-webhook', createChatWebhookRoutes({
  lifecycle,
  getRuntime: () => _runtime,
  projectNumber: '927012824308',
  standaloneAgents: [
    { id: '3eecd57d-03ae-440d-8945-5b35f43a8d90', port: 3102 }, // Fola
    { id: '67ba24f1-c8af-40b4-9df5-c05b81fc1e7a', port: 3101 }, // John
  ],
}));

// ─── Chat Poller Management API ─────────────────────────
engine.get('/chat-poller/status', (c) => {
  const poller = _chatPoller;
  if (!poller) return c.json({ running: false, reason: 'not_started' });
  return c.json(poller.getStatus());
});

engine.get('/chat-poller/spaces', async (c) => {
  try {
    const db = _engineDb;
    if (!db) return c.json({ spaces: [] });
    const rows = await db.query(`SELECT key, value FROM engine_settings WHERE key = 'chat_spaces'`);
    const spaces = rows?.[0] ? JSON.parse((rows[0] as any).value) : [];
    return c.json({ spaces });
  } catch { return c.json({ spaces: [] }); }
});

engine.post('/chat-poller/spaces', async (c) => {
  try {
    const db = _engineDb;
    if (!db) return c.json({ error: 'Engine DB not ready' }, 500);
    const body = await c.req.json<{ spaces: Array<{ spaceId: string; displayName: string; agentIds: string[]; defaultAgentId?: string }> }>();
    if (!body.spaces || !Array.isArray(body.spaces)) return c.json({ error: 'spaces array required' }, 400);

    await db.execute(
      `INSERT INTO engine_settings (key, value) VALUES ('chat_spaces', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(body.spaces)]
    );

    // Update live poller
    const poller = _chatPoller;
    if (poller) {
      for (const s of body.spaces) {
        poller.addSpace({
          spaceId: s.spaceId,
          displayName: s.displayName,
          agentIds: s.agentIds,
          defaultAgentId: s.defaultAgentId,
        });
      }
    }

    return c.json({ ok: true, count: body.spaces.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Email Poller Management API ────────────────────────
engine.get('/email-poller/status', (c) => {
  const poller = _emailPoller;
  if (!poller) return c.json({ running: false, reason: 'not_started' });
  return c.json(poller.getStatus());
});

engine.post('/email-poller/rediscover', async (c) => {
  const poller = _emailPoller;
  if (!poller) return c.json({ error: 'Email poller not started' }, 500);
  await poller.rediscover();
  return c.json({ ok: true });
});

// ─── setEngineDb ────────────────────────────────────────

let _engineDb: import('./db-adapter.js').EngineDatabase | null = null;
let _adminDb: DatabaseAdapter | null = null;

export async function setEngineDb(
  db: import('./db-adapter.js').EngineDatabase,
  adminDb?: DatabaseAdapter,
) {
  _engineDb = db;
  if (adminDb) _adminDb = adminDb;

  // Cascade DB to all engine modules for persistent storage
  await Promise.all([
    lifecycle.setDb(db).then(() => lifecycle.setVault(vault)),
    approvals.setDb(db),
    knowledgeBase.setDb(db),
    activity.setDb(db),
    tenants.setDb(db),
    permissionEngine.setDb(db),
    dlp.setDb(db),
    commBus.setDb(db),
    guardrails.setDb(db),
    journal.setDb(db),
    compliance.setDb(db),
    communityRegistry.setDb(db),
    knowledgeContribution.setDb(db),
    (async () => { knowledgeImport.setDb(db?.db || db); knowledgeImport.setKnowledgeEngine(knowledgeBase); await knowledgeImport.loadJobs(); })(),
    workforce.setDb(db),
    policyEngine.setDb(db),
    memoryManager.setDb(db),
    onboarding.setDb(db),
    vault.setDb(db),
    storageManager.setDb(db),
    policyImporter.setDb(db),
  ]);
  guardrails.startAnomalyDetection();
  workforce.startScheduler();
  knowledgeContribution.startScheduler();

  // Auto-create contribution schedules for all agents if none exist
  try {
    const agents = lifecycle.getAllAgents();
    const orgId = agents[0]?.orgId;
    const allBases = orgId ? knowledgeContribution.listBases(orgId) : [];
    // Debug removed - schedules auto-create silently
    if (allBases.length > 0) {
      const base = allBases[0];
      for (const agent of agents) {
        const existing = knowledgeContribution.getSchedule(agent.id);
        if (!existing) {
          try {
            knowledgeContribution.createSchedule({
              orgId: agent.orgId || base.orgId,
              agentId: agent.id,
              baseId: base.id,
              frequency: 'daily',
              filters: { minConfidence: 0.6 },
            });
            console.log(`[knowledge-contribution] Auto-created daily schedule for ${agent.config?.identity?.name || agent.id}`);
          } catch { /* skip if base not found etc */ }
        }
      }
    }
  } catch (e: any) { console.log(`[knowledge-contribution] Auto-schedule setup: ${e.message}`); }

  skillUpdater.startScheduler();

  // Load community skills from the local community-skills/ directory (if running from git clone)
  import('path').then(async (path) => {
    const communityDir = path.resolve(import.meta.dirname || '.', '../../community-skills');
    const { loaded, errors } = await communityRegistry.loadFromDirectory(communityDir);
    if (loaded > 0) console.log(`[community] Loaded ${loaded} community skills from directory`);
    if (errors.length > 0) console.warn(`[community] ${errors.length} skills failed validation`);
  }).catch(() => { /* community-skills/ dir may not exist in npm installs */ });

  // Start periodic sync from the central GitHub repo (agenticmail/enterprise).
  // This is how npm-installed deployments get new community skills automatically
  // without needing an npm update or server restart. Syncs every 6 hours.
  communityRegistry.startPeriodicSync();

  // Ensure a default org exists for single-tenant / self-hosted deployments
  await tenants.createDefaultOrg().catch(() => {});

  // ─── Start Google Chat Poller ─────────────────────────
  // Guard: only start once (setEngineDb can be called multiple times)
  if (!_chatPoller) {
    startChatPoller(db).catch(err => console.error(`[chat-poller] Failed to start:`, err));
  }

  // ─── Start Gmail Email Poller ─────────────────────────
  if (!_emailPoller) {
    startEmailPoller(db).catch(err => console.error(`[email-poller] Failed to start:`, err));
  }

  // ─── Start Messaging Poller (WhatsApp, Telegram) ──
  if (!_messagingPoller) {
    startMessagingPoller(db).catch(err => console.error(`[messaging-poller] Failed to start:`, err));
  }
}

// ─── Chat Poller ────────────────────────────────────────

let _chatPoller: ChatPoller | null = null;

async function startChatPoller(engineDb: any): Promise<void> {
  console.log('[chat-poller] Initializing...');
  // Find agents with chat enabled + OAuth tokens for Chat API access
  const allAgents = lifecycle.getAllAgents();
  console.log(`[chat-poller] Found ${allAgents.length} agents total`);
  for (const a of allAgents) {
    const services = a.config?.enabledGoogleServices || [];
    const hasChat = services.includes('chat');
    const hasOAuth = !!a.config?.emailConfig?.oauthRefreshToken;
    const agentName = (a.config as any)?.displayName || (a.config as any)?.name || a.id;
    console.log(`[chat-poller]   ${agentName}: services=[${services.join(',')}] chat=${hasChat} oauth=${hasOAuth} state=${a.state}`);
  }
  const chatAgents = allAgents.filter(a => {
    const services = a.config?.enabledGoogleServices || [];
    return services.includes('chat') && a.config?.emailConfig?.oauthRefreshToken;
  });
  console.log(`[chat-poller] Chat-enabled agents: ${chatAgents.length} (${chatAgents.map(a => a.name).join(', ')})`);

  if (chatAgents.length === 0) {
    console.log('[chat-poller] No chat-enabled agents with OAuth tokens, skipping');
    return;
  }

  // Use the first chat-enabled agent's OAuth token for polling
  // (all agents in the same org share the same Google Workspace)
  const tokenAgent = chatAgents[0];
  const emailConfig = tokenAgent.config!.emailConfig!;

  const refreshToken = async (): Promise<string> => {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: emailConfig.oauthClientId,
        client_secret: emailConfig.oauthClientSecret,
        refresh_token: emailConfig.oauthRefreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json() as any;
    if (data.access_token) return data.access_token;
    throw new Error(`Token refresh failed: ${data.error || 'unknown'}`);
  };

  // Build agent endpoints from known standalone agents + lifecycle agents
  const standaloneAgentPorts: Record<string, number> = {};
  // Check chat-webhook config for known ports
  try {
    const rows = await engineDb.query(`SELECT key, value FROM engine_settings WHERE key = 'standalone_agents'`);
    if (rows?.[0]) {
      const sa = JSON.parse((rows[0] as any).value);
      for (const a of sa) standaloneAgentPorts[a.id] = a.port;
    }
  } catch {}

  const agentEndpoints = chatAgents.map(a => {
    const identity = a.config?.identity || {};
    const name = a.config?.name || a.name || 'agent';
    const displayName = a.config?.displayName || name;
    const email = a.config?.emailConfig?.email || a.config?.email?.address || '';
    // Known ports from standalone config, or fall back to well-known ports
    const port = standaloneAgentPorts[a.id] || 3100;

    return {
      id: a.id,
      name: name.toLowerCase(),
      displayName,
      email,
      port,
      host: 'localhost',
      roles: (identity as any).roles || [identity.role].filter(Boolean),
      keywords: (identity as any).keywords || [],
      enabled: a.state === 'running',
    };
  });

  _chatPoller = new ChatPoller({
    lifecycle,
    getToken: refreshToken,
    engineDb,
    agents: agentEndpoints,
    intervalMs: 30_000,
    workforce,
  });

  await _chatPoller.start();
}

export function getChatPoller(): ChatPoller | null {
  return _chatPoller;
}

// ─── Email Poller ───────────────────────────────────────

let _emailPoller: EmailPoller | null = null;

async function startEmailPoller(engineDb: any): Promise<void> {
  _emailPoller = new EmailPoller({
    engineDb,
    lifecycle,
    intervalMs: 30_000,
    workforce,
  });

  await _emailPoller.start();
}

export function getEmailPoller(): EmailPoller | null {
  return _emailPoller;
}

// ─── Messaging Poller (WhatsApp, Telegram) ─────────

let _messagingPoller: MessagingPoller | null = null;

async function startMessagingPoller(engineDb: any): Promise<void> {
  const allAgents = lifecycle.getAllAgents();
  const agents = allAgents.filter(a => a.state === 'running' || a.status === 'active').map(a => ({
    id: a.id, name: a.name || '', displayName: (a.config as any)?.displayName || a.name || a.id,
    status: 'active' as const, port: a.port || 3102,
  }));

  // Check platform capabilities via admin DB (has direct pool access)
  let capabilities: any = {};
  try {
    if (_adminDb && (_adminDb as any).pool) {
      const r = await (_adminDb as any).pool.query(`SELECT platform_capabilities FROM company_settings LIMIT 1`);
      capabilities = r.rows?.[0]?.platform_capabilities || {};
    } else {
      // Fallback: try getSettings if available
      const settings = await (_adminDb as any)?.getSettings?.();
      capabilities = settings?.platformCapabilities || {};
    }
  } catch (err: any) {
    console.log(`[messaging] Failed to read platform capabilities: ${err.message}`);
  }

  const hasAny = capabilities.whatsapp || capabilities.telegram;
  if (!hasAny) {
    console.log('[messaging-poller] No messaging channels enabled in Platform Capabilities');
    return;
  }

  // Detect public URL for webhook support (fly.io, VPS, tunnel, etc.)
  const publicUrl = process.env.PUBLIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : process.env.FLY_APP_NAME
    ? `https://${process.env.FLY_APP_NAME}.fly.dev` : process.env.RENDER_EXTERNAL_URL
    || undefined;

  _messagingPoller = new MessagingPoller({
    agents: agents as any,
    dataDir: process.env.DATA_DIR || '/tmp/agenticmail-data',
    publicUrl,
    app: _engineApp || undefined,
    engineDb,
    getCapability: (key: string) => !!capabilities[key],
    getAgentChannelConfig: (agentId: string) => {
      try {
        const a = lifecycle.getAgent(agentId);
        return a?.config?.messagingChannels || null;
      } catch { return null; }
    },
    getVaultKey: (name: string) => {
      try {
        const vault = lifecycle.getVault?.();
        return vault?.get?.(name) || null;
      } catch { return null; }
    },
  });
  await _messagingPoller.start();
}

export function getMessagingPoller(): MessagingPoller | null {
  return _messagingPoller;
}

// ─── Agent Runtime (optional — mounted when runtime is started) ──

let _runtimeApp: import('hono').Hono | null = null;
let _runtime: any = null;

export function mountRuntimeApp(app: import('hono').Hono): void {
  _runtimeApp = app;
  engine.route('/runtime', app);
}

export function setRuntime(runtime: any): void {
  _runtime = runtime;
}

export { engine as engineRoutes };
export { permissionEngine, configGen, deployer, approvals, lifecycle, knowledgeBase, tenants, activity, dlp, commBus, guardrails, journal, compliance, communityRegistry, workforce, policyEngine, memoryManager, onboarding, vault, storageManager, policyImporter, knowledgeContribution, skillUpdater, agentStatus };

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
import { createMemoryRoutes } from './memory-routes.js';
import { createOnboardingRoutes } from './onboarding-routes.js';
import { SecureVault } from './vault.js';
import { StorageManager } from './storage-manager.js';
import { PolicyImporter } from './policy-import.js';
import { createVaultRoutes } from './vault-routes.js';
import { createStorageRoutes } from './storage-routes.js';
import { createPolicyImportRoutes } from './policy-import-routes.js';
import { createOAuthConnectRoutes } from './oauth-connect-routes.js';
import type { DatabaseAdapter } from '../db/adapter.js';

const engine = new Hono<AppEnv>();

// ─── Shared Instances ───────────────────────────────────

const permissionEngine = new PermissionEngine();
const configGen = new AgentConfigGenerator();
const deployer = new DeploymentEngine();
const approvals = new ApprovalEngine();
const lifecycle = new AgentLifecycleManager({ permissions: permissionEngine });
const knowledgeBase = new KnowledgeBaseEngine();
const tenants = new TenantManager();
const activity = new ActivityTracker();
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

engine.route('/community', createCommunityRoutes(communityRegistry));
engine.route('/workforce', createWorkforceRoutes(workforce, { lifecycle }));
engine.route('/policies', createPolicyRoutes(policyEngine));
engine.route('/memory', createMemoryRoutes(memoryManager));
engine.route('/onboarding', createOnboardingRoutes(onboarding));
engine.route('/vault', createVaultRoutes(vault, dlp));
engine.route('/storage', createStorageRoutes(storageManager));
engine.route('/policies', createPolicyImportRoutes(policyImporter));
engine.route('/knowledge-contribution', createKnowledgeContributionRoutes(knowledgeContribution));
engine.route('/skill-updates', createSkillUpdaterRoutes(skillUpdater));
engine.route('/oauth', createOAuthConnectRoutes(vault));

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
    lifecycle.setDb(db),
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
}

// ─── Agent Runtime (optional — mounted when runtime is started) ──

let _runtimeApp: import('hono').Hono | null = null;

export function mountRuntimeApp(app: import('hono').Hono): void {
  _runtimeApp = app;
  engine.route('/runtime', app);
}

export { engine as engineRoutes };
export { permissionEngine, configGen, deployer, approvals, lifecycle, knowledgeBase, tenants, activity, dlp, commBus, guardrails, journal, compliance, communityRegistry, workforce, policyEngine, memoryManager, onboarding, vault, storageManager, policyImporter, knowledgeContribution, skillUpdater };

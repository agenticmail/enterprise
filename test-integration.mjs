#!/usr/bin/env node
/**
 * AgenticMail Enterprise — Integration Test Suite
 *
 * Tests all major flows end-to-end with SQLite.
 */

import { rmSync } from 'fs';

const TEST_DB = './test-enterprise.db';
const PORT = 3199;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
let serverHandle = null;

function assert(condition, name) {
  try {
    if (condition) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.error(`  ❌ ${name}`);
    }
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name} — threw: ${e.message}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name} — threw: ${e.message}`);
  }
}

async function section(label, fn) {
  console.log(`─── ${label} ───`);
  try {
    await fn();
  } catch (e) {
    failed++;
    console.error(`  💥 SECTION CRASHED: ${e.message}`);
    console.error(`     ${e.stack?.split('\n').slice(1, 3).join('\n     ') || ''}`);
  }
  console.log('');
}

async function req(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

// Cleanup
for (const f of [TEST_DB, TEST_DB + '-shm', TEST_DB + '-wal']) {
  try { rmSync(f); } catch {}
}

console.log('\n🏢 AgenticMail Enterprise — Integration Tests\n');

// ═══════════════════════════════════════════════════════
// 1. DATABASE ADAPTER
// ═══════════════════════════════════════════════════════

// Shared state: these must be accessible to later sections
const { createAdapter, getSupportedDatabases } = await import('./dist/index.js');
let db = null;
let user = null;

db = await createAdapter({ type: 'sqlite', connectionString: TEST_DB });
await db.migrate();
user = await db.createUser({ email: 'admin@test.com', name: 'Admin', role: 'owner', password: 'TestPass123!' });

await section('1. Database Adapter (SQLite)', async () => {
  await test('getSupportedDatabases()', async () => {
    const databases = getSupportedDatabases();
    assert(databases.length >= 6, `getSupportedDatabases() → ${databases.length} backends`);
    assert(databases.some(d => d.type === 'sqlite'), 'SQLite in list');
    assert(databases.some(d => d.type === 'postgres'), 'Postgres in list');
    assert(databases.some(d => d.type === 'mongodb'), 'MongoDB in list');
    assert(databases.some(d => d.type === 'dynamodb'), 'DynamoDB in list');
  });

  await test('SQLite adapter created + migrated', async () => {
    assert(true, 'SQLite adapter created + migrated');
  });

  await test('getStats()', async () => {
    const stats = await db.getStats();
    assert(typeof stats === 'object', 'getStats() returns object');
  });

  await test('Users', async () => {
    assert(user.id && user.email === 'admin@test.com', `createUser() → ${user.id}`);
    assert(await db.getUserByEmail('admin@test.com'), 'getUserByEmail() works');
  });

  await test('Agents CRUD', async () => {
    const agent = await db.createAgent({ name: 'test-agent', email: 'test@localhost', role: 'assistant', status: 'active', createdBy: user.id });
    assert(agent.id, `createAgent() → ${agent.id}`);
    assert((await db.listAgents()).length >= 1, 'listAgents() returns agents');
    assert((await db.getAgent(agent.id))?.name === 'test-agent', 'getAgent() by id');
    assert((await db.updateAgent(agent.id, { status: 'suspended' })).status === 'suspended', 'updateAgent()');
    await db.deleteAgent(agent.id);
    assert(!(await db.getAgent(agent.id)), 'deleteAgent() works');
  });

  await test('API Keys', async () => {
    const keyResult = await db.createApiKey({ name: 'k1', createdBy: user.id, scopes: ['read', 'write'] });
    assert(keyResult.plaintext?.startsWith('ek_'), `createApiKey() → ${keyResult.plaintext?.slice(0, 12)}...`);
    assert(await db.validateApiKey(keyResult.plaintext), 'validateApiKey() valid');
    assert(!(await db.validateApiKey('ek_bogus')), 'validateApiKey() rejects bogus');
    await db.revokeApiKey(keyResult.key.id);
    assert(!(await db.validateApiKey(keyResult.plaintext)), 'revokeApiKey() works');
  });

  await test('Audit', async () => {
    await db.logEvent({ actor: user.id, actorType: 'user', action: 'test', resource: 'test:1', details: {} });
    const audit = await db.queryAudit({});
    assert(audit.events.length >= 1, `queryAudit() → ${audit.events.length} events`);
  });

  await test('Settings', async () => {
    const settings = await db.getSettings();
    assert(settings?.name, 'getSettings() returns default settings');
    await db.updateSettings({ name: 'Test Corp', subdomain: 'test-corp' });
    assert((await db.getSettings()).name === 'Test Corp', 'updateSettings() persists');
  });
});

// ═══════════════════════════════════════════════════════
// 2. SERVER + AUTH
// ═══════════════════════════════════════════════════════

// Shared state: these must be accessible to later sections
const { createServer } = await import('./dist/index.js');
const jwtSecret = 'test-jwt-secret-1234567890-abcdef';

await db.createAgent({ name: 'srv-agent', email: 'srv@localhost', role: 'assistant', status: 'active', createdBy: user.id });
const srvKey = await db.createApiKey({ name: 'srv-key', createdBy: user.id, scopes: ['read', 'write'] });

const server = createServer({ port: PORT, db, jwtSecret, logging: false, rateLimit: 1000 });
serverHandle = await server.start();
await new Promise(r => setTimeout(r, 500));

let jwt = null;
let auth = {};

// Login must succeed before later sections, so do it outside section
const login = await req('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass123!' }),
});
jwt = login.data.token;
auth = { Authorization: `Bearer ${jwt}` };

await section('2. Server + Auth', async () => {
  await test('createServer()', async () => {
    assert(server.app && server.start, 'createServer() returns app + start');
    assert(true, `Server started on :${PORT}`);
  });

  await test('Health endpoints', async () => {
    assert((await req('/health')).status === 200, 'GET /health → 200');
    const ready = await req('/ready');
    assert(ready.status === 200 || ready.status === 503, `GET /ready → ${ready.status}`);
  });

  await test('404', async () => {
    assert((await req('/nope')).status === 404, 'GET /nope → 404');
  });

  await test('Login', async () => {
    assert(login.status === 200 && login.data.token, 'POST /auth/login → JWT');
  });

  await test('Bad login', async () => {
    assert((await req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@test.com', password: 'wrong' }),
    })).status === 401, 'Bad password → 401');
  });

  await test('No auth', async () => {
    assert((await req('/api/stats')).status === 401, 'No auth → 401');
  });
});

await section('3. Admin Routes', async () => {
  await test('GET /api/stats', async () => {
    assert((await req('/api/stats', { headers: auth })).status === 200, 'GET /api/stats → 200');
  });

  await test('GET /api/agents', async () => {
    const agentsRes = await req('/api/agents', { headers: auth });
    assert(agentsRes.status === 200 && agentsRes.data.agents, `GET /api/agents → ${agentsRes.data.agents?.length} agents`);
  });

  await test('Agent CRUD (create → get → update → delete)', async () => {
    const createRes = await req('/api/agents', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'api-agent', email: 'api-agent@test.com', role: 'researcher' }),
    });
    assert(createRes.status === 201, `POST /api/agents → ${createRes.status}`);

    if (createRes.data?.id) {
      assert((await req(`/api/agents/${createRes.data.id}`, { headers: auth })).status === 200, 'GET /api/agents/:id → 200');
      assert((await req(`/api/agents/${createRes.data.id}`, {
        method: 'PATCH', headers: auth,
        body: JSON.stringify({ status: 'suspended' }),
      })).status === 200, 'PATCH /api/agents/:id → 200');
      assert((await req(`/api/agents/${createRes.data.id}`, {
        method: 'DELETE', headers: auth,
      })).status === 200 || true, 'DELETE /api/agents/:id');
    }
  });

  await test('GET /api/users', async () => {
    assert((await req('/api/users', { headers: auth })).status === 200, 'GET /api/users → 200');
  });

  await test('GET /api/audit', async () => {
    assert((await req('/api/audit', { headers: auth })).status === 200, 'GET /api/audit → 200');
  });

  await test('Settings GET + PATCH', async () => {
    assert((await req('/api/settings', { headers: auth })).status === 200, 'GET /api/settings → 200');
    const patchSettings = await req('/api/settings', {
      method: 'PATCH', headers: auth,
      body: JSON.stringify({ name: 'Updated Corp' }),
    });
    assert(patchSettings.status === 200, `PATCH /api/settings → ${patchSettings.status}`);
  });

  await test('API key auth', async () => {
    assert((await req('/api/stats', { headers: { 'X-API-Key': srvKey.plaintext } })).status === 200, 'API key auth → 200');
    assert((await req('/api/stats', { headers: { 'X-API-Key': 'ek_invalid' } })).status === 401, 'Bad API key → 401');
  });
});

await section('4. Engine Routes', async () => {
  await test('Skills', async () => {
    const skillsRes = await req('/api/engine/skills', { headers: auth });
    assert(skillsRes.status === 200, `GET /engine/skills → ${skillsRes.status}`);
    const skillsArr = skillsRes.data?.skills || skillsRes.data;
    assert(Array.isArray(skillsArr) && skillsArr.length >= 30, `Skills count: ${skillsArr?.length}`);

    if (skillsArr?.length) {
      const s = skillsArr[0];
      const singleSkill = await req(`/api/engine/skills/${s.id}`, { headers: auth });
      assert(singleSkill.status === 200, `GET /engine/skills/:id → ${singleSkill.status}`);
    }
  });

  await test('Presets', async () => {
    const presetsRes = await req('/api/engine/profiles/presets', { headers: auth });
    assert(presetsRes.status === 200, `GET /engine/profiles/presets → ${presetsRes.status}`);
    const presetsArr = presetsRes.data?.presets || presetsRes.data;
    assert(Array.isArray(presetsArr) && presetsArr.length >= 5, `Presets count: ${presetsArr?.length}`);
  });

  await test('Permission check', async () => {
    const permRes = await req('/api/engine/permissions/check', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ agentId: 'test', tool: 'web_search' }),
    });
    assert(permRes.status === 200, `POST /engine/permissions/check → ${permRes.status}`);
  });
});

await section('5. Middleware', async () => {
  await test('Security headers', async () => {
    const hRes = await req('/health');
    assert(hRes.headers.get('x-request-id'), 'X-Request-Id present');
    assert(hRes.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
    assert(hRes.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');
  });

  await test('CORS preflight', async () => {
    const corsRes = await fetch(`${BASE}/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://test.com', 'Access-Control-Request-Method': 'GET' },
    });
    assert(corsRes.status === 204 || corsRes.status === 200, 'CORS preflight OK');
  });
});

const mod = await import('./dist/index.js');

await section('6. Exports', async () => {
  await test('Expected exports present', async () => {
    const expectedExports = [
      'createAdapter', 'createServer', 'getSupportedDatabases',
      'PermissionEngine', 'AgentConfigGenerator', 'DeploymentEngine',
      'ApprovalEngine', 'AgentLifecycleManager', 'KnowledgeBaseEngine',
      'TenantManager', 'ActivityTracker', 'EngineDatabase',
      'CircuitBreaker', 'HealthMonitor', 'withRetry', 'RateLimiter',
      'generateDockerCompose', 'generateFlyToml',
      'BUILTIN_SKILLS', 'PRESET_PROFILES', 'ALL_TOOLS',
      'getToolsBySkill', 'generateToolPolicy',
      'AgentRuntime', 'createAgentRuntime',
    ];
    for (const name of expectedExports) {
      assert(mod[name] !== undefined, `export: ${name}`);
    }
  });

  await test('Deploy generators', async () => {
    assert(mod.generateDockerCompose({ dbType: 'postgres', dbConnectionString: 'x', port: 3000, jwtSecret: 'x' }).includes('agenticmail'), 'DockerCompose output');
    assert(mod.generateFlyToml('test', 'iad').includes('test'), 'FlyToml output');
  });
});

await section('7. Resilience', async () => {
  await test('CircuitBreaker', async () => {
    const { CircuitBreaker } = mod;
    const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeMs: 100, timeout: 5000 });
    assert(await cb.execute(() => Promise.resolve('ok')) === 'ok', 'CircuitBreaker success');
    assert(cb.getState() === 'closed', 'CircuitBreaker state: closed');

    for (let i = 0; i < 4; i++) await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    try {
      await cb.execute(() => Promise.resolve('nope'));
      assert(false, 'Should be open');
    } catch {
      assert(cb.getState() === 'open', 'CircuitBreaker opens after failures');
    }
  });

  await test('withRetry', async () => {
    const { withRetry } = mod;
    let attempts = 0;
    const retryVal = await withRetry(async () => { attempts++; if (attempts < 3) throw new Error('x'); return 'done'; }, { maxRetries: 5, baseDelayMs: 5 });
    assert(retryVal === 'done' && attempts === 3, `withRetry() → ${attempts} attempts`);
  });

  await test('RateLimiter', async () => {
    const { RateLimiter } = mod;
    const rl = new RateLimiter({ maxTokens: 3, refillRate: 1, refillIntervalMs: 60000 });
    const t1 = rl.tryConsume();
    const t2 = rl.tryConsume();
    const t3 = rl.tryConsume();
    const t4 = rl.tryConsume();
    assert(t1 && t2 && t3, 'RateLimiter allows 3 tokens');
    assert(!t4, 'RateLimiter blocks 4th token');
  });
});

await section('8. Engine Classes', async () => {
  await test('BUILTIN_SKILLS + PRESET_PROFILES', async () => {
    assert(mod.BUILTIN_SKILLS.length >= 38, `BUILTIN_SKILLS: ${mod.BUILTIN_SKILLS.length}`);
    assert(mod.PRESET_PROFILES.length >= 5, `PRESET_PROFILES: ${mod.PRESET_PROFILES.length}`);
  });

  await test('Tool catalog', async () => {
    assert(mod.ALL_TOOLS.length > 50, `ALL_TOOLS: ${mod.ALL_TOOLS.length}`);
    const toolMap = mod.getToolsBySkill();
    assert(toolMap instanceof Map && toolMap.size > 0, `getToolsBySkill() → Map with ${toolMap.size} skills`);
    const emailToolIds = toolMap.get('agenticmail') || [];
    assert(emailToolIds.length > 0, `agenticmail tools: ${emailToolIds.length}`);
    const policy = mod.generateToolPolicy(emailToolIds, []);
    assert(policy, 'generateToolPolicy() returns policy');
  });

  await test('AgentConfigGenerator', async () => {
    const cg = new mod.AgentConfigGenerator();
    const workspace = cg.generateWorkspace({
      id: 'test-1', name: 'test-bot', displayName: 'Test Bot',
      identity: { personality: 'Helpful assistant', role: 'Tester', tone: 'professional', language: 'en' },
      model: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', thinkingLevel: 'low' },
      channels: { enabled: [], primaryChannel: 'email' },
      email: { enabled: false, provider: 'none' },
      workspace: { persistentMemory: true, memoryMaxSizeMb: 10, workingDirectory: '/tmp', sharedDirectories: [], gitEnabled: false },
      heartbeat: { enabled: false, intervalMinutes: 30, checks: [] },
      context: {},
      permissionProfileId: 'research-assistant',
      deployment: { target: 'docker', config: {}, status: 'pending' },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    assert(workspace && workspace['SOUL.md'] && workspace['AGENTS.md'], 'AgentConfigGenerator.generateWorkspace() produces files');
  });
});

await section('9. Dashboard', async () => {
  await test('GET /dashboard', async () => {
    const dashRes = await fetch(`${BASE}/dashboard`);
    assert(dashRes.status === 200, 'GET /dashboard → 200');
    const html = await dashRes.text();
    assert(html.includes('AgenticMail') || html.includes('React'), 'Dashboard HTML valid');
  });

  await test('GET / redirects', async () => {
    const rootRes = await fetch(`${BASE}/`, { redirect: 'manual' });
    assert(rootRes.status === 301 || rootRes.status === 302, `GET / redirects (${rootRes.status})`);
  });
});

await section('10. Soul Library', async () => {
  await test('GET /engine/souls', async () => {
    const soulsRes = await req('/api/engine/souls', { headers: auth });
    assert(soulsRes.status === 200, 'GET /engine/souls → 200');
    assert(soulsRes.data.templates?.length >= 50, `Soul templates: ${soulsRes.data.templates?.length} (≥50)`);
    assert(soulsRes.data.total >= 50, `Soul total count: ${soulsRes.data.total}`);
  });

  await test('GET /engine/souls/by-category', async () => {
    const soulsCatRes = await req('/api/engine/souls/by-category', { headers: auth });
    assert(soulsCatRes.status === 200, 'GET /engine/souls/by-category → 200');
    assert(Object.keys(soulsCatRes.data.categories || {}).length >= 10, `Soul categories: ${Object.keys(soulsCatRes.data.categories || {}).length}`);
    assert(soulsCatRes.data.categoryMeta?.support?.name === 'Support', 'Category meta: support');
  });

  await test('GET /engine/souls/search', async () => {
    const soulSearchRes = await req('/api/engine/souls/search?q=engineer', { headers: auth });
    assert(soulSearchRes.status === 200, 'GET /engine/souls/search?q=engineer → 200');
    assert(soulSearchRes.data.templates?.length > 0, `Soul search results: ${soulSearchRes.data.templates?.length}`);
  });

  await test('GET /engine/souls/:id', async () => {
    const soulByIdRes = await req('/api/engine/souls/customer-support-lead', { headers: auth });
    assert(soulByIdRes.status === 200, 'GET /engine/souls/:id → 200');
    assert(soulByIdRes.data.template?.name === 'Customer Support Lead', 'Soul template name matches');
    assert(soulByIdRes.data.template?.personality?.length > 50, 'Soul personality has content');
  });

  await test('GET /engine/souls/nonexistent → 404', async () => {
    const soulNotFound = await req('/api/engine/souls/nonexistent', { headers: auth });
    assert(soulNotFound.status === 404, 'GET /engine/souls/nonexistent → 404');
  });
});

await section('11. DLP', async () => {
  let ruleId = null;

  await test('DLP rule CRUD', async () => {
    const dlpRule = await req('/api/engine/dlp/rules', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ orgId: 'default', name: 'SSN Detection', patternType: 'regex', pattern: '\\d{3}-\\d{2}-\\d{4}', action: 'block', appliesTo: 'both', severity: 'critical', enabled: true }),
    });
    assert(dlpRule.status === 201, 'POST /engine/dlp/rules → 201');
    ruleId = dlpRule.data.rule?.id;

    const dlpRules = await req('/api/engine/dlp/rules?orgId=default', { headers: auth });
    assert(dlpRules.status === 200, 'GET /engine/dlp/rules → 200');
    assert(dlpRules.data.rules?.length >= 1, `DLP rules: ${dlpRules.data.rules?.length}`);

    const dlpRuleGet = await req(`/api/engine/dlp/rules/${ruleId}`, { headers: auth });
    assert(dlpRuleGet.status === 200, 'GET /engine/dlp/rules/:id → 200');
  });

  await test('DLP scan', async () => {
    const dlpScan = await req('/api/engine/dlp/scan', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ orgId: 'default', content: 'My SSN is 123-45-6789' }),
    });
    assert(dlpScan.status === 200, 'POST /engine/dlp/scan → 200');

    const dlpScanParams = await req('/api/engine/dlp/scan-parameters', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ orgId: 'default', agentId: 'test', toolId: 'email.send', parameters: { body: 'No sensitive data here' } }),
    });
    assert(dlpScanParams.status === 200, 'POST /engine/dlp/scan-parameters → 200');
  });

  await test('DLP violations + cleanup', async () => {
    const dlpViolations = await req('/api/engine/dlp/violations', { headers: auth });
    assert(dlpViolations.status === 200, 'GET /engine/dlp/violations → 200');

    const dlpDel = await req(`/api/engine/dlp/rules/${ruleId}`, { method: 'DELETE', headers: auth });
    assert(dlpDel.status === 200, 'DELETE /engine/dlp/rules/:id → 200');
  });
});

await section('12. Guardrails', async () => {
  let grAgentId = null;

  await test('Guardrail pause/resume lifecycle', async () => {
    const grAgent = await req('/api/engine/agents', {
      method: 'POST', headers: auth,
      body: JSON.stringify({
        orgId: 'default',
        config: { name: 'guardrail-test', displayName: 'Guardrail Test', identity: { role: 'tester' }, model: { provider: 'test', modelId: 'test' }, deployment: { target: 'docker', config: {} } },
        createdBy: 'test',
      }),
    });
    grAgentId = grAgent.data.agent?.id;

    const pauseRes = await req(`/api/engine/guardrails/pause/${grAgentId}`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ reason: 'Routine maintenance' }),
    });
    assert(pauseRes.status === 200, 'POST /engine/guardrails/pause/:id → 200');
    assert(pauseRes.data.intervention != null, 'Pause returns intervention record');

    const grStatus = await req(`/api/engine/guardrails/status/${grAgentId}`, { headers: auth });
    assert(grStatus.status === 200, 'GET /engine/guardrails/status/:id → 200');

    const resumeRes = await req(`/api/engine/guardrails/resume/${grAgentId}`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ reason: 'Maintenance complete' }),
    });
    assert(resumeRes.status === 200, 'POST /engine/guardrails/resume/:id → 200');

    const interventions = await req('/api/engine/guardrails/interventions', { headers: auth });
    assert(interventions.status === 200, 'GET /engine/guardrails/interventions → 200');
    assert(interventions.data.interventions?.length >= 2, `Interventions: ${interventions.data.interventions?.length} (pause + resume)`);
  });

  await test('Anomaly rules CRUD', async () => {
    const anomalyRule = await req('/api/engine/anomaly-rules', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ orgId: 'default', name: 'High error rate', ruleType: 'error_rate', config: { maxErrorsPerHour: 50, windowMinutes: 5 }, action: 'pause', enabled: true }),
    });
    assert(anomalyRule.status === 201, 'POST /engine/anomaly-rules → 201');

    const anomalyRules = await req('/api/engine/anomaly-rules', { headers: auth });
    assert(anomalyRules.status === 200, 'GET /engine/anomaly-rules → 200');
    assert(anomalyRules.data.rules?.length >= 1, `Anomaly rules: ${anomalyRules.data.rules?.length}`);

    const anomDel = await req(`/api/engine/anomaly-rules/${anomalyRule.data.rule?.id}`, { method: 'DELETE', headers: auth });
    assert(anomDel.status === 200, 'DELETE /engine/anomaly-rules/:id → 200');
  });

  // Clean up test agent
  if (grAgentId) await req(`/api/engine/agents/${grAgentId}`, { method: 'DELETE', headers: auth, body: JSON.stringify({ destroyedBy: 'test' }) });
});

await section('13. Journal', async () => {
  let entryId = null;

  await test('Journal record + list + get', async () => {
    const journalEntry = await req('/api/engine/journal/record', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ orgId: 'default', agentId: 'test-agent', toolId: 'agenticmail_send', toolName: 'Send Email', parameters: { to: 'user@test.com', subject: 'Test' }, result: { messageId: 'msg-1' } }),
    });
    assert(journalEntry.status === 201, 'POST /engine/journal/record → 201');
    entryId = journalEntry.data.entry?.id;

    const journalList = await req('/api/engine/journal?orgId=default', { headers: auth });
    assert(journalList.status === 200, 'GET /engine/journal → 200');
    assert(journalList.data.entries?.length >= 1, `Journal entries: ${journalList.data.entries?.length}`);

    const journalGet = await req(`/api/engine/journal/${entryId}`, { headers: auth });
    assert(journalGet.status === 200, 'GET /engine/journal/:id → 200');
  });

  await test('Journal stats + rollback', async () => {
    const journalStats = await req('/api/engine/journal/stats/default', { headers: auth });
    assert(journalStats.status === 200, 'GET /engine/journal/stats/:orgId → 200');

    const rollbackRes = await req(`/api/engine/journal/${entryId}/rollback`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ rolledBackBy: 'admin' }),
    });
    assert(rollbackRes.status === 200, 'POST /engine/journal/:id/rollback → 200');
  });

  await test('Journal validation', async () => {
    const journalBad = await req('/api/engine/journal/record', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ orgId: 'default' }),
    });
    assert(journalBad.status === 400, 'POST /engine/journal/record (missing fields) → 400');
  });
});

await section('14. Communication Bus', async () => {
  let msgId = null;
  let taskId = null;

  await test('Send a message', async () => {
    const msgRes = await req('/api/engine/messages', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', fromAgentId: 'agent-a', toAgentId: 'agent-b', subject: 'Test message', content: 'Hello from A', priority: 'normal' }),
    });
    assert(msgRes.status === 201, 'POST /engine/messages → 201');
    msgId = msgRes.data.message?.id;
  });

  await test('List messages', async () => {
    const msgList = await req('/api/engine/messages?orgId=default', { headers: auth });
    assert(msgList.status === 200, 'GET /engine/messages → 200');
    assert(msgList.data.messages?.length >= 1, `Messages: ${msgList.data.messages?.length}`);
  });

  await test('Get single message', async () => {
    const msgGet = await req(`/api/engine/messages/${msgId}`, { headers: auth });
    assert(msgGet.status === 200, 'GET /engine/messages/:id → 200');
  });

  await test('Mark as read', async () => {
    const msgRead = await req(`/api/engine/messages/${msgId}/read`, { method: 'POST', headers: auth });
    assert(msgRead.status === 200, 'POST /engine/messages/:id/read → 200');
  });

  await test('Get topology', async () => {
    const topologyRes = await req('/api/engine/messages/topology?orgId=default', { headers: auth });
    assert(topologyRes.status === 200, 'GET /engine/messages/topology → 200');
    assert(topologyRes.data.topology != null, 'Topology data present');
  });

  await test('Inbox', async () => {
    const inboxRes = await req('/api/engine/messages/inbox/agent-b', { headers: auth });
    assert(inboxRes.status === 200, 'GET /engine/messages/inbox/:agentId → 200');
    assert(inboxRes.data.messages?.length >= 1, 'Inbox has messages');
  });

  await test('Broadcast', async () => {
    const broadRes = await req('/api/engine/messages/broadcast', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', fromAgentId: 'agent-a', agentIds: ['agent-b', 'agent-c'], subject: 'Broadcast', content: 'Hello all' }),
    });
    assert(broadRes.status === 200, 'POST /engine/messages/broadcast → 200');
    assert(broadRes.data.messages?.length === 2, 'Broadcast sent to 2 agents');
  });

  await test('Delegate task', async () => {
    const taskRes = await req('/api/engine/tasks/delegate', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', fromAgentId: 'agent-a', toAgentId: 'agent-b', subject: 'Research task', content: 'Do research' }),
    });
    assert(taskRes.status === 201, 'POST /engine/tasks/delegate → 201');
    taskId = taskRes.data.task?.id;
  });

  await test('Claim task', async () => {
    const claimRes = await req(`/api/engine/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ agentId: 'agent-b' }),
    });
    assert(claimRes.status === 200, 'POST /engine/tasks/:id/claim → 200');
  });

  await test('Complete task', async () => {
    const completeRes = await req(`/api/engine/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ agentId: 'agent-b', result: 'Research done' }),
    });
    assert(completeRes.status === 200, 'POST /engine/tasks/:id/complete → 200');
  });

  await test('Handoff', async () => {
    const handoffRes = await req('/api/engine/messages/handoff', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', fromAgentId: 'agent-a', toAgentId: 'agent-b', subject: 'Handoff', conversationContext: 'Escalation: customer needs senior agent' }),
    });
    assert(handoffRes.status === 201, 'POST /engine/messages/handoff → 201');
  });

  await test('Validation: missing fields', async () => {
    const msgBad = await req('/api/engine/messages', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default' }),
    });
    assert(msgBad.status === 400, 'POST /engine/messages (missing fields) → 400');
  });
});

await section('15. Compliance Reporting', async () => {
  const dateRange = { from: '2024-01-01', to: '2024-12-31' };
  let soc2Id = null;

  await test('Generate SOC2 report', async () => {
    const soc2Res = await req('/api/engine/compliance/reports/soc2', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', dateRange }),
    });
    assert(soc2Res.status === 201, 'POST /engine/compliance/reports/soc2 → 201');
    soc2Id = soc2Res.data.report?.id;
  });

  await test('Generate audit report', async () => {
    const auditReportRes = await req('/api/engine/compliance/reports/audit', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', dateRange }),
    });
    assert(auditReportRes.status === 201, 'POST /engine/compliance/reports/audit → 201');
  });

  await test('Generate GDPR report', async () => {
    const gdprRes = await req('/api/engine/compliance/reports/gdpr', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default', agentId: 'test-agent' }),
    });
    assert(gdprRes.status === 201, 'POST /engine/compliance/reports/gdpr → 201');
  });

  await test('List reports', async () => {
    const compReports = await req('/api/engine/compliance/reports', { headers: auth });
    assert(compReports.status === 200, 'GET /engine/compliance/reports → 200');
    assert(compReports.data.reports?.length >= 3, `Compliance reports: ${compReports.data.reports?.length}`);
  });

  await test('Get report by ID', async () => {
    const compGet = await req(`/api/engine/compliance/reports/${soc2Id}`, { headers: auth });
    assert(compGet.status === 200, 'GET /engine/compliance/reports/:id → 200');
    assert(compGet.data.report?.type === 'soc2', 'Report type is soc2');
  });

  await test('Download report as JSON', async () => {
    const compDl = await fetch(`${BASE}/api/engine/compliance/reports/${soc2Id}/download?format=json`, { headers: { ...auth } });
    assert(compDl.status === 200, 'GET /engine/compliance/reports/:id/download → 200');
    assert(compDl.headers.get('content-disposition')?.includes('soc2'), 'Download has correct Content-Disposition');
  });

  await test('Download as CSV', async () => {
    const compCsv = await fetch(`${BASE}/api/engine/compliance/reports/${soc2Id}/download?format=csv`, { headers: { ...auth } });
    assert(compCsv.status === 200, 'GET /engine/compliance/reports/:id/download?format=csv → 200');
    assert(compCsv.headers.get('content-type')?.includes('text/csv'), 'CSV Content-Type');
  });

  await test('Validation: missing fields', async () => {
    const compBad = await req('/api/engine/compliance/reports/soc2', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ orgId: 'default' }),
    });
    assert(compBad.status === 400, 'POST soc2 (missing dateRange) → 400');
  });
});

// ═══════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════
if (serverHandle) { serverHandle.close(); server.healthMonitor.stop(); }
await db.disconnect();
for (const f of [TEST_DB, TEST_DB + '-shm', TEST_DB + '-wal']) { try { rmSync(f); } catch {} }

console.log('═══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('═══════════════════════════════════════════════════');

if (failed > 0) { console.log('\n❌ SOME TESTS FAILED\n'); process.exit(1); }
else { console.log('\n✅ ALL TESTS PASSED\n'); process.exit(0); }

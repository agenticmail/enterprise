/**
 * Agent Lifecycle + Budget + Bridge Routes
 * Mounted at / on the engine sub-app (routes define /agents/*, /usage/*, /budget/*, /bridge/*).
 */

import { Emoji } from './emoji.js';
import { configBus } from './config-bus.js';
import { Hono } from 'hono';
import type { AgentLifecycleManager } from './lifecycle.js';
import type { PermissionEngine } from './skills.js';
import type { DatabaseAdapter } from '../db/adapter.js';

export function createAgentRoutes(opts: {
  lifecycle: AgentLifecycleManager;
  permissions: PermissionEngine;
  getAdminDb: () => DatabaseAdapter | null;
  engineDb?: any;
}) {
  const { lifecycle, permissions, getAdminDb } = opts;
  const router = new Hono();

  // ─── Agent Lifecycle ────────────────────────────────────

  router.post('/agents', async (c) => {
    const { orgId, config, createdBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || createdBy;
      const agent = await lifecycle.createAgent(orgId, config, actor);
      return c.json({ agent }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/agents', (c) => {
    const orgId = c.req.query('orgId');
    const clientOrgId = c.req.query('clientOrgId');
    let agents = orgId ? lifecycle.getAgentsByOrg(orgId) : lifecycle.getAllAgents();
    if (clientOrgId) {
      agents = agents.filter(a => (a as any).clientOrgId === clientOrgId || (a as any).client_org_id === clientOrgId);
    }
    return c.json({ agents, total: agents.length });
  });

  router.get('/agents/:id', async (c) => {
    const agent = lifecycle.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    // Refresh state and usage from DB (agent machine writes directly)
    try {
      const fresh = await lifecycle.loadAgentFromDb(c.req.param('id'));
      if (fresh) {
        if (fresh.state) agent.state = fresh.state;
        if (fresh.usage) agent.usage = fresh.usage;
      }
    } catch {}
    return c.json({ agent });
  });

  router.patch('/agents/:id/config', async (c) => {
    const { updates, updatedBy } = await c.req.json();
    try {
      const agentId = c.req.param('id');
      const actor = c.req.header('X-User-Id') || updatedBy;

      // Capture old deployment config for change detection
      const oldAgent = lifecycle.getAgent(agentId);
      const oldDep = oldAgent?.config?.deployment;

      const agent = await lifecycle.updateConfig(agentId, updates, actor);

      // Sync name/email to admin agents table
      const adminDb = getAdminDb();
      if (adminDb && (updates.name || updates.email)) {
        const sync: any = {};
        if (updates.name) sync.name = updates.name;
        if (updates.email) sync.email = updates.email;
        adminDb.updateAgent(agentId, sync).catch(() => {});
      }

      // Auto-restart agent if deployment config changed (port, host, target)
      if (updates.deployment) {
        const newDep = agent.config?.deployment;
        const portChanged = oldDep?.port !== newDep?.port;
        const hostChanged = oldDep?.host !== newDep?.host;
        const targetChanged = oldDep?.target !== newDep?.target;
        if (portChanged || hostChanged || targetChanged) {
          console.log(`[agent-routes] Deployment config changed for ${agent.name || agentId} (port: ${oldDep?.port}→${newDep?.port}, host: ${oldDep?.host}→${newDep?.host}). Triggering agent restart...`);
          // Try PM2 restart for locally deployed agents
          try {
            const { exec } = await import('node:child_process');
            const pm2Name = (agent.name || '').toLowerCase().replace(/\s+/g, '-') + '-agent';
            exec(`pm2 restart ${pm2Name} --update-env 2>/dev/null || pm2 restart ${agentId} --update-env 2>/dev/null`, (err) => {
              if (err) console.warn(`[agent-routes] PM2 restart for ${pm2Name} failed (may not be PM2-managed): ${err.message}`);
              else console.log(`[agent-routes] PM2 restart triggered for ${pm2Name}`);
            });
          } catch (e: any) {
            console.warn(`[agent-routes] Agent restart failed: ${e.message}`);
          }
        }
      }

      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/deploy', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { deployedBy } = body;
    try {
      const actor = c.req.header('X-User-Id') || deployedBy;
      const agent = await lifecycle.deploy(c.req.param('id'), actor);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/reset-state', async (c) => {
    try {
      const agent = lifecycle.getAgent(c.req.param('id'));
      if (!agent) return c.json({ error: 'Agent not found' }, 404);
      if (!['error', 'degraded', 'deploying', 'provisioning', 'starting', 'draft'].includes(agent.state)) {
        return c.json({ error: `Cannot reset from state "${agent.state}"` }, 400);
      }
      // Reset to ready
      (agent as any).state = 'ready';
      (agent as any).stateMessage = 'State reset by admin';
      (agent as any).updatedAt = new Date().toISOString();
      await lifecycle.saveAgent(c.req.param('id'));
      return c.json({ agent, message: 'State reset to ready' });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/stop', async (c) => {
    const { stoppedBy, reason } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || stoppedBy;
      const agent = await lifecycle.stop(c.req.param('id'), actor, reason);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/restart', async (c) => {
    const { restartedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || restartedBy;
      const agent = await lifecycle.restart(c.req.param('id'), actor);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/agents/:id/hot-update', async (c) => {
    const { updates, updatedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || updatedBy;
      const agent = await lifecycle.hotUpdate(c.req.param('id'), updates, actor);
      // Sync name/email to admin agents table
      const adminDb = getAdminDb();
      if (adminDb && (updates.name || updates.email)) {
        const sync: any = {};
        if (updates.name) sync.name = updates.name;
        if (updates.email) sync.email = updates.email;
        adminDb.updateAgent(c.req.param('id'), sync).catch(() => {});
      }
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // ─── Inject a system message into an agent's active session ──────
  router.post('/agents/:id/inject-message', async (c) => {
    try {
      const { role, content } = await c.req.json();
      if (!content) return c.json({ error: 'content is required' }, 400);
      const agentId = c.req.param('id');

      // Find the agent's active session in the runtime
      const runtime = (globalThis as any).__agenticmail_runtime;
      if (!runtime) return c.json({ error: 'Runtime not available' }, 503);

      // Try to send via the runtime's session manager (private, accessed via any)
      const sessionMgr = (runtime as any).sessionManager;
      if (!sessionMgr) return c.json({ error: 'Session manager not available' }, 503);

      // Find active sessions for this agent
      const activeSessions = await sessionMgr.findActiveSessions();
      const agentSessions = activeSessions.filter((s: any) => s.agentId === agentId);

      if (agentSessions.length === 0) {
        return c.json({ injected: false, reason: 'No active sessions for this agent' });
      }

      // Inject into the most recent active session
      const session = agentSessions[agentSessions.length - 1];
      await sessionMgr.appendMessage(session.id, {
        role: role || 'system',
        content: content,
        timestamp: new Date().toISOString(),
      });

      return c.json({ injected: true, sessionId: session.id });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  router.delete('/agents/:id', async (c) => {
    const { destroyedBy } = await c.req.json().catch(() => ({ destroyedBy: 'unknown' }));
    try {
      const actor = c.req.header('X-User-Id') || destroyedBy;
      await lifecycle.destroy(c.req.param('id'), actor);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/agents/:id/usage', async (c) => {
    const agentId = c.req.param('id');
    const agent = lifecycle.getAgent(agentId);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    // Read fresh usage from DB (agent machine writes directly to DB, not to this server's memory)
    try {
      const freshAgent = await lifecycle.loadAgentFromDb(agentId);
      if (freshAgent) {
        const dbUsage = freshAgent.usage || {};
        const freshState = freshAgent.state || agent.state;
        // Also update in-memory state so other endpoints see it
        if (freshAgent.state && freshAgent.state !== agent.state) {
          agent.state = freshAgent.state;
        }
        if (dbUsage.tokensToday > 0 || (dbUsage.lastUpdated && dbUsage.lastUpdated > (agent.usage?.lastUpdated || ''))) {
          return c.json({ usage: dbUsage, health: agent.health, state: freshState });
        }
        return c.json({ usage: agent.usage, health: agent.health, state: freshState });
      }
    } catch (err: any) {
      console.error('[usage-api] DB load failed:', err.message);
    }
    return c.json({ usage: agent.usage, health: agent.health, state: agent.state });
  });

  router.get('/usage/:orgId', (c) => {
    return c.json(lifecycle.getOrgUsage(c.req.param('orgId')));
  });

  // ─── Per-Agent Budget Controls ─────────────────────────

  router.get('/agents/:id/budget', (c) => {
    const config = lifecycle.getBudgetConfig(c.req.param('id'));
    if (!config) return c.json({ budgetConfig: null });
    return c.json({ budgetConfig: config });
  });

  router.put('/agents/:id/budget', async (c) => {
    const config = await c.req.json();
    try {
      const aid = c.req.param('id');
      await lifecycle.setBudgetConfig(aid, config);
      import('./agent-notify.js').then(({ notifyAgent }) => notifyAgent(aid, 'budget', lifecycle)).catch(() => {});
      return c.json({ success: true, budgetConfig: config });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/budget/alerts', (c) => {
    const alerts = lifecycle.getBudgetAlerts({
      orgId: c.req.query('orgId') || undefined,
      agentId: c.req.query('agentId') || undefined,
      acknowledged: c.req.query('acknowledged') === 'true' ? true : c.req.query('acknowledged') === 'false' ? false : undefined,
      limit: parseInt(c.req.query('limit') || '50'),
    });
    return c.json({ alerts, total: alerts.length });
  });

  router.post('/budget/alerts/:id/acknowledge', async (c) => {
    try {
      await lifecycle.acknowledgeBudgetAlert(c.req.param('id'));
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/budget/summary/:orgId', (c) => {
    return c.json(lifecycle.getBudgetSummary(c.req.param('orgId')));
  });

  // ─── Per-Agent Tool Security ──────────────────────────

  router.get('/agents/:id/tool-security', async (c) => {
    const agent = lifecycle.getAgent(c.req.param('id'));
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const agentOverrides = agent.config?.toolSecurity || {};

    // Get org defaults from admin DB if available
    var orgDefaults: Record<string, any> = {};
    var adminDb = getAdminDb();
    if (adminDb) {
      try {
        var settings = await adminDb.getSettings();
        orgDefaults = settings?.toolSecurityConfig || {};
      } catch { /* ignore — admin DB may not be available */ }
    }

    // Deep merge org defaults + agent overrides
    var merged = { ...orgDefaults };
    if (agentOverrides.security) {
      merged.security = { ...(merged.security || {}), ...agentOverrides.security };
    }
    if (agentOverrides.middleware) {
      merged.middleware = { ...(merged.middleware || {}), ...agentOverrides.middleware };
    }

    return c.json({ toolSecurity: merged, orgDefaults, agentOverrides });
  });

  router.patch('/agents/:id/tool-security', async (c) => {
    const { toolSecurity, updatedBy } = await c.req.json();
    try {
      const actor = c.req.header('X-User-Id') || updatedBy || 'dashboard';
      const agent = await lifecycle.updateConfig(c.req.param('id'), { toolSecurity }, actor);
      return c.json({ agent });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // ─── System Dependencies ─────────────────────────────────

  router.get('/system/process-managers', async (c) => {
    const { execSync } = await import('child_process');
    const check = (cmd: string): boolean => {
      try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
    };
    const pm2Version = (() => { try { return execSync('pm2 -v', { stdio: 'pipe', encoding: 'utf-8' }).trim(); } catch { return null; } })();
    const systemdAvailable = check('systemctl');
    const platform = process.platform;

    return c.json({
      pm2: { installed: !!pm2Version, version: pm2Version, installCmd: 'npm install -g pm2' },
      systemd: { available: systemdAvailable, note: systemdAvailable ? 'Available on this system' : platform === 'darwin' ? 'Not available on macOS — use PM2 or launchd' : 'Install via your package manager' },
      launchd: { available: platform === 'darwin', note: platform === 'darwin' ? 'macOS native — always available' : 'macOS only' },
      platform,
    });
  });

  router.post('/system/install-pm2', async (c) => {
    try {
      const { ensurePm2 } = await import('./deployer.js');
      const result = await ensurePm2();
      if (result.installed) {
        return c.json({ success: true, message: `PM2 ${result.version} installed successfully` });
      }
      return c.json({ success: false, error: result.error, hint: 'Try running: sudo npm install -g pm2' }, 500);
    } catch (e: any) {
      return c.json({ success: false, error: e.message, hint: 'Try running: sudo npm install -g pm2' }, 500);
    }
  });

  // ─── Port Availability Check ──────────────────────────────

  router.post('/system/check-port', async (c) => {
    try {
      const { port } = await c.req.json();
      const p = parseInt(port);
      if (!p || p < 1 || p > 65535) {
        return c.json({ available: false, error: 'Invalid port number (1-65535)' });
      }
      // Try to bind to the port on all interfaces to check availability
      const net = await import('net');
      const tryBind = (host: string) => new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => { server.close(() => resolve(true)); });
        server.listen(p, host);
      });
      // Check both 0.0.0.0 and 127.0.0.1 — a port is only available if free on both
      const [availAll, availLocal] = await Promise.all([tryBind('0.0.0.0'), tryBind('127.0.0.1')]);
      const available = availAll && availLocal;
      if (!available) {
        // Try to identify what's using it
        let processInfo = '';
        try {
          const { execSync } = await import('child_process');
          if (process.platform === 'darwin' || process.platform === 'linux') {
            const lsofBin = process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof';
            const out = execSync(`${lsofBin} -i :${p} -P -n 2>/dev/null | head -5`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
            if (out) {
              const lines = out.split('\n').slice(1); // skip header
              if (lines.length > 0) {
                const parts = lines[0].split(/\s+/);
                processInfo = parts[0] ? `${parts[0]} (PID ${parts[1]})` : '';
              }
            }
          } else if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
            if (out) {
              const parts = out.split(/\s+/);
              processInfo = `PID ${parts[parts.length - 1]}`;
            }
          }
        } catch {}
        return c.json({ available: false, port: p, inUse: true, process: processInfo || 'Unknown process' });
      }
      return c.json({ available: true, port: p });
    } catch (e: any) {
      return c.json({ available: false, error: e.message });
    }
  });

  // ─── Screen Unlock ──────────────────────────────────────

  router.post('/system/unlock-screen', async (c) => {
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        // macOS: Use AppleScript via osascript to wake and unlock
        const { execSync } = await import('child_process');
        // First wake the display
        try { execSync('caffeinate -u -t 2', { stdio: 'pipe', timeout: 5000 }); } catch {}
        // Check if screen is locked
        const isLocked = (() => {
          try {
            const out = execSync('python3 -c "import Quartz; d=Quartz.CGSessionCopyCurrentDictionary(); print(d.get(\'CGSSessionScreenIsLocked\', 0))"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
            return out === '1' || out === 'True';
          } catch {
            // Fallback: check if loginwindow is frontmost
            try {
              const out = execSync('osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\'', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
              return out === 'loginwindow' || out === 'ScreenSaverEngine';
            } catch { return false; }
          }
        })();
        if (!isLocked) {
          return c.json({ success: true, wasLocked: false, message: 'Screen is already unlocked' });
        }
        // Get password from agent's security config or request body
        const body = await c.req.json().catch(() => ({}));
        const password = body.password;
        if (!password) {
          return c.json({ success: false, locked: true, error: 'Screen is locked but no password provided. Configure the system password in Settings > Security or the agent\'s Permissions tab.' });
        }
        // Use cliclick or AppleScript to type password and press Enter
        // Method 1: Use osascript to simulate keystrokes at the login window
        try {
          execSync(`osascript -e 'tell application "System Events" to keystroke "${password.replace(/["\\]/g, '\\$&')}"' -e 'delay 0.3' -e 'tell application "System Events" to key code 36'`, {
            stdio: 'pipe', timeout: 10000
          });
          // Wait a moment and check if unlocked
          await new Promise(r => setTimeout(r, 2000));
          const stillLocked = (() => {
            try {
              const out = execSync('python3 -c "import Quartz; d=Quartz.CGSessionCopyCurrentDictionary(); print(d.get(\'CGSSessionScreenIsLocked\', 0))"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
              return out === '1' || out === 'True';
            } catch { return false; }
          })();
          if (stillLocked) {
            return c.json({ success: false, error: 'Failed to unlock — password may be incorrect' });
          }
          return c.json({ success: true, wasLocked: true, message: 'Screen unlocked successfully' });
        } catch (e: any) {
          return c.json({ success: false, error: 'Unlock attempt failed: ' + e.message });
        }
      } else if (platform === 'linux') {
        const { execSync } = await import('child_process');
        // Check for common screen lockers and unlock them
        const body = await c.req.json().catch(() => ({}));
        const password = body.password;
        // Try loginctl unlock-session
        try {
          execSync('loginctl unlock-session $(loginctl list-sessions --no-legend | head -1 | awk \'{print $1}\')', { stdio: 'pipe', timeout: 5000 });
          return c.json({ success: true, message: 'Session unlocked via loginctl' });
        } catch {}
        // Try xdotool for X11 based lockers
        if (password) {
          try {
            execSync(`xdotool key --clearmodifiers super; sleep 0.5; xdotool type --clearmodifiers "${password.replace(/["\\]/g, '\\$&')}"; xdotool key Return`, { stdio: 'pipe', timeout: 10000 });
            return c.json({ success: true, message: 'Unlock attempted via xdotool' });
          } catch {}
        }
        return c.json({ success: false, error: 'Could not unlock Linux session. Supported: loginctl, xdotool.' });
      } else if (platform === 'win32') {
        return c.json({ success: false, error: 'Windows unlock not yet supported. Use Remote Desktop or disable lock screen.' });
      } else {
        return c.json({ success: false, error: `Unsupported platform: ${platform}` });
      }
    } catch (e: any) {
      return c.json({ success: false, error: e.message });
    }
  });

  router.get('/system/screen-status', async (c) => {
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        const { execSync } = await import('child_process');
        const isLocked = (() => {
          try {
            const out = execSync('python3 -c "import Quartz; d=Quartz.CGSessionCopyCurrentDictionary(); print(d.get(\'CGSSessionScreenIsLocked\', 0))"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
            return out === '1' || out === 'True';
          } catch {
            try {
              const out = execSync('osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\'', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
              return out === 'loginwindow' || out === 'ScreenSaverEngine';
            } catch { return false; }
          }
        })();
        // Check if display is asleep
        const displayAsleep = (() => {
          try {
            const out = execSync('ioreg -r -d 1 -k IODisplayWrangler | grep -i "currentpowerstate"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 });
            return out.includes('= 0') || out.includes('= 1');
          } catch { return false; }
        })();
        return c.json({ locked: isLocked, displayAsleep, platform: 'macOS' });
      } else if (platform === 'linux') {
        const { execSync } = await import('child_process');
        const isLocked = (() => {
          try {
            const out = execSync('loginctl show-session $(loginctl list-sessions --no-legend | head -1 | awk \'{print $1}\') -p LockedHint --value', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
            return out === 'yes';
          } catch { return false; }
        })();
        return c.json({ locked: isLocked, platform: 'Linux' });
      }
      return c.json({ locked: false, platform });
    } catch (e: any) {
      return c.json({ locked: false, error: e.message });
    }
  });

  // ─── Agent Creation Bridge ──────────────────────────────

  /**
   * POST /bridge/agents — Unified agent creation that creates both:
   * 1. An admin-level agent record (via the base DatabaseAdapter)
   * 2. An engine managed_agent record (via lifecycle manager)
   * Returns both IDs and the full agent object.
   */
  router.post('/bridge/agents', async (c) => {
    const { orgId, name, email, displayName, role, model, deployment, permissionProfile, presetName, createdBy, persona, permissions: permissionsData, skills, knowledgeBases, description, soulId, deployTarget } = await c.req.json();

    if (!name || !orgId) {
      return c.json({ error: 'name and orgId are required' }, 400);
    }

    const actor = c.req.header('X-User-Id') || createdBy || 'system';
    const agentId = crypto.randomUUID();

    // Build the engine AgentConfig — store EVERYTHING from the wizard
    const agentEmail = email || `${name.toLowerCase().replace(/\s+/g, '-')}@agenticmail.local`;
    const agentRole = role || 'assistant';
    const agentDescription = description || persona?.description || '';

    const config: any = {
      id: agentId,
      name,
      displayName: displayName || name,
      email: agentEmail,
      role: agentRole,
      description: agentDescription,
      soulId: soulId || null,
      identity: {
        name,
        displayName: displayName || name,
        email: agentEmail,
        role: agentRole,
        personality: persona?.personality || 'professional',
        description: agentDescription,
        avatar: persona?.avatar || null,
        gender: persona?.gender || '',
        dateOfBirth: persona?.dateOfBirth || '',
        maritalStatus: persona?.maritalStatus || '',
        culturalBackground: persona?.culturalBackground || '',
        language: persona?.language || 'en-us',
        traits: persona?.traits || {},
      },
      model: model || {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        thinkingLevel: 'medium',
      },
      skills: Array.isArray(skills) ? skills : [],
      knowledgeBases: Array.isArray(knowledgeBases) ? knowledgeBases : [],
      deployment: deployment || {
        target: deployTarget || 'docker',
        config: { docker: { image: 'agenticmail/agent', tag: 'latest', ports: [3000], env: {}, volumes: [], restart: 'unless-stopped' } },
      },
      permissionProfileId: permissionProfile || 'default',
    };

    // Apply permissions: start from preset if specified, then overlay granular settings
    if (presetName || permissionsData) {
      let profile: any = { id: agentId, name: presetName || 'Custom', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

      if (presetName) {
        const { PRESET_PROFILES } = await import('./skills.js');
        const preset = PRESET_PROFILES.find((p: any) => p.name === presetName);
        if (preset) Object.assign(profile, preset);
      }

      // Overlay granular permission settings from the UI
      if (permissionsData) {
        if (permissionsData.maxRiskLevel) profile.maxRiskLevel = permissionsData.maxRiskLevel;
        if (permissionsData.blockedSideEffects) profile.blockedSideEffects = permissionsData.blockedSideEffects;
        if (permissionsData.requireApproval) profile.requireApproval = permissionsData.requireApproval;
        if (permissionsData.rateLimits) profile.rateLimits = permissionsData.rateLimits;
        if (permissionsData.constraints) profile.constraints = permissionsData.constraints;
      }

      permissions.setProfile(agentId, profile as any, orgId);
    }

    const _adminDb = getAdminDb();

    try {
      // 1) Create admin agent record (shared ID)
      let adminAgent = null;
      if (_adminDb) {
        adminAgent = await _adminDb.createAgent({
          id: agentId,
          name,
          email: agentEmail,
          role: agentRole,
          metadata: { engineLinked: true, orgId, soulId: soulId || undefined },
          createdBy: actor,
        });
      }

      // 2) Create engine managed agent (same ID via config.id)
      const managedAgent = await lifecycle.createAgent(orgId, config, actor);

      // 3) Auto-assign knowledge bases based on org context
      try {
        const { knowledgeBase: kbEngine } = await import('./routes.js');
        const allKbs = kbEngine.getAllKnowledgeBases();
        const clientOrgId = (managedAgent as any)?.clientOrgId || (config as any)?.clientOrgId || null;
        let kbAssigned = 0;
        for (const kb of allKbs) {
          const ids: string[] = Array.isArray((kb as any).agentIds) ? (kb as any).agentIds : [];
          if (ids.includes(agentId)) continue;
          let shouldAssign = false;
          if (clientOrgId) {
            shouldAssign = (kb as any).orgId === clientOrgId || (kb as any).clientOrgId === clientOrgId;
          } else {
            shouldAssign = !(kb as any).clientOrgId;
          }
          if (shouldAssign) {
            ids.push(agentId);
            (kb as any).agentIds = ids;
            (kb as any).updatedAt = new Date().toISOString();
            const _db = getAdminDb();
            if (_db) {
              try { await (_db as any).execute?.('UPDATE knowledge_bases SET agent_ids = $1, updated_at = $2 WHERE id = $3', [JSON.stringify(ids), (kb as any).updatedAt, kb.id]); } catch {}
            }
            kbAssigned++;
          }
        }
        if (kbAssigned > 0) console.log(`[agent-create] Auto-assigned ${kbAssigned} knowledge base(s) to agent ${agentId}`);
      } catch (e: any) {
        console.warn(`[agent-create] KB auto-assign failed: ${e.message}`);
      }

      return c.json({
        agent: managedAgent,
        adminAgent,
        agentId,
      }, 201);
    } catch (e: any) {
      // If engine creation fails but admin was created, best-effort cleanup
      if (_adminDb) {
        try { await _adminDb.deleteAgent(agentId); } catch { /* best effort */ }
      }
      return c.json({ error: e.message }, 400);
    }
  });

  /**
   * DELETE /bridge/agents/:id — Unified agent deletion.
   * Removes both the admin record and the engine managed agent.
   */
  router.delete('/bridge/agents/:id', async (c) => {
    const agentId = c.req.param('id');
    const { destroyedBy } = await c.req.json().catch(() => ({ destroyedBy: 'unknown' }));
    const actor = c.req.header('X-User-Id') || destroyedBy;
    const errors: string[] = [];
    const _adminDb = getAdminDb();

    // 1) Destroy engine agent
    try {
      await lifecycle.destroy(agentId, actor);
    } catch (e: any) {
      errors.push(`engine: ${e.message}`);
    }

    // 2) Delete admin agent
    if (_adminDb) {
      try {
        await _adminDb.deleteAgent(agentId);
      } catch (e: any) {
        errors.push(`admin: ${e.message}`);
      }
    }

    if (errors.length > 0) {
      return c.json({ success: false, errors }, 207);
    }
    return c.json({ success: true });
  });

  /**
   * GET /bridge/agents/:id/full — Get full agent info combining admin + engine data
   */
  router.get('/bridge/agents/:id/full', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);

    if (!managed) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    const profile = permissions.getProfile(agentId);
    const tools = permissions.getAvailableTools(agentId);

    return c.json({
      agent: managed,
      permissions: profile,
      availableTools: tools.length,
      state: managed.state,
      health: managed.health,
      usage: managed.usage,
    });
  });

  // ─── Birthday Routes ──────────────────────────────────

  router.get('/birthdays/upcoming', (c) => {
    const days = parseInt(c.req.query('days') || '30');
    const upcoming = lifecycle.getUpcomingBirthdays(days);
    return c.json({
      upcoming: upcoming.map(b => ({
        agentId: b.agent.id,
        name: b.agent.config.displayName,
        dateOfBirth: b.dateOfBirth,
        turningAge: b.age,
        daysUntil: b.daysUntil,
      })),
      total: upcoming.length,
    });
  });

  // ─── Email Configuration ──────────────────────────────

  /**
   * GET /bridge/agents/:id/email-config — Get agent's email configuration (without password).
   */
  router.get('/bridge/agents/:id/email-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    // Fetch org-level email config
    let orgEmailConfig: any = null;
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        const settings = await adminDb.getSettings();
        if (settings?.orgEmailConfig?.configured) {
          orgEmailConfig = {
            provider: settings.orgEmailConfig.provider,
            label: settings.orgEmailConfig.label,
            oauthClientId: settings.orgEmailConfig.oauthClientId,
            oauthTenantId: settings.orgEmailConfig.oauthTenantId,
          };
        }
      }
    } catch {}

    const emailConfig = managed.config?.emailConfig || null;
    if (!emailConfig) return c.json({ configured: false, orgEmailConfig });

    // Return config without sensitive data
    return c.json({
      configured: true,
      provider: emailConfig.provider,
      email: emailConfig.email,
      status: emailConfig.status || 'unknown',
      // IMAP details (no password)
      imapHost: emailConfig.imapHost,
      imapPort: emailConfig.imapPort,
      smtpHost: emailConfig.smtpHost,
      smtpPort: emailConfig.smtpPort,
      // OAuth details (no tokens)
      oauthProvider: emailConfig.oauthProvider,
      oauthClientId: emailConfig.oauthClientId,
      oauthConfigured: !!emailConfig.oauthAccessToken,
      oauthAuthUrl: emailConfig.oauthAuthUrl || undefined,
      lastConnected: emailConfig.lastConnected,
      lastError: emailConfig.lastError,
      orgEmailConfig,
      // Sending config override (no password)
      sendingConfig: emailConfig.sendingConfig ? {
        provider: 'smtp',
        email: emailConfig.sendingConfig.email,
        smtpHost: emailConfig.sendingConfig.smtpHost,
        smtpPort: emailConfig.sendingConfig.smtpPort,
        configured: true,
      } : undefined,
    });
  });

  /**
   * PUT /bridge/agents/:id/email-config — Set or update agent's email configuration.
   *
   * Supports three modes:
   *   1. IMAP/SMTP: { provider: 'imap', email, password, imapHost, smtpHost, ... }
   *   2. Microsoft OAuth: { provider: 'microsoft', oauthClientId, oauthClientSecret, oauthTenantId }
   *   3. Google OAuth: { provider: 'google', oauthClientId, oauthClientSecret }
   *
   * For IMAP, auto-detects settings for known providers (Microsoft 365, Gmail, etc.)
   */
  router.put('/bridge/agents/:id/email-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    let { provider, email, password, imapHost, imapPort, smtpHost, smtpPort, preset,
            oauthClientId, oauthClientSecret, oauthTenantId, oauthRedirectUri } = body;
    const useOrgConfig = body.useOrgConfig === true;

    if (!provider) return c.json({ error: 'provider is required (imap, microsoft, or google)' }, 400);

    // If using org-level OAuth config, inherit client credentials
    if (useOrgConfig && (provider === 'google' || provider === 'microsoft')) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          const settings = await adminDb.getSettings();
          if (settings?.orgEmailConfig?.configured && settings.orgEmailConfig.provider === provider) {
            oauthClientId = oauthClientId || settings.orgEmailConfig.oauthClientId;
            oauthClientSecret = oauthClientSecret || settings.orgEmailConfig.oauthClientSecret;
            if (provider === 'microsoft') oauthTenantId = oauthTenantId || settings.orgEmailConfig.oauthTenantId;
          } else {
            return c.json({ error: 'Organization email config not found or provider mismatch' }, 400);
          }
        }
      } catch {}
    }
    if (!email && provider === 'imap') return c.json({ error: 'email is required' }, 400);

    // Preserve existing tokens/state when re-configuring (e.g. to pick up new scopes)
    const existingConfig = managed.config?.emailConfig || {};
    const emailConfig: any = {
      provider,
      email: email || existingConfig.email || (managed.config?.identity as any)?.email || managed.config?.email,
      updatedAt: new Date().toISOString(),
    };
    // Preserve existing OAuth tokens so re-auth doesn't lose refresh_token
    if (existingConfig.oauthRefreshToken) emailConfig.oauthRefreshToken = existingConfig.oauthRefreshToken;
    if (existingConfig.oauthAccessToken) emailConfig.oauthAccessToken = existingConfig.oauthAccessToken;
    if (existingConfig.oauthTokenExpiry) emailConfig.oauthTokenExpiry = existingConfig.oauthTokenExpiry;
    if (existingConfig.lastConnected) emailConfig.lastConnected = existingConfig.lastConnected;

    if (provider === 'imap') {
      // Auto-detect IMAP/SMTP from well-known providers
      if (preset && !imapHost) {
        const PRESETS: Record<string, any> = {
          'microsoft365': { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
          'gmail': { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
          'yahoo': { imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465 },
          'zoho': { imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 587 },
          'fastmail': { imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587 },
          'icloud': { imapHost: 'imap.mail.me.com', imapPort: 993, smtpHost: 'smtp.mail.me.com', smtpPort: 587 },
        };
        const presetConfig = PRESETS[preset];
        if (presetConfig) Object.assign(emailConfig, presetConfig);
        else return c.json({ error: `Unknown preset: ${preset}. Valid: ${Object.keys(PRESETS).join(', ')}` }, 400);
      } else {
        emailConfig.imapHost = imapHost;
        emailConfig.imapPort = imapPort || 993;
        emailConfig.smtpHost = smtpHost;
        emailConfig.smtpPort = smtpPort || 587;
      }

      if (!emailConfig.imapHost || !emailConfig.smtpHost) {
        return c.json({ error: 'imapHost and smtpHost are required (or use a preset)' }, 400);
      }

      if (password) {
        emailConfig.password = password; // stored encrypted in production
      }

      emailConfig.status = 'configured';

    } else if (provider === 'microsoft') {
      // Microsoft OAuth (Azure AD / Entra ID)
      emailConfig.oauthProvider = 'microsoft';
      emailConfig.oauthClientId = oauthClientId;
      emailConfig.oauthClientSecret = oauthClientSecret;
      emailConfig.oauthTenantId = oauthTenantId || 'common';
      emailConfig.oauthRedirectUri = oauthRedirectUri || '';
      emailConfig.oauthScopes = [
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/Files.ReadWrite',
        'https://graph.microsoft.com/Contacts.ReadWrite',
        'offline_access',
      ];

      if (!oauthClientId) return c.json({ error: 'oauthClientId is required for Microsoft OAuth' }, 400);

      // Build the authorization URL
      const authUrl = `https://login.microsoftonline.com/${emailConfig.oauthTenantId}/oauth2/v2.0/authorize?` +
        `client_id=${encodeURIComponent(oauthClientId)}&response_type=code&` +
        `redirect_uri=${encodeURIComponent(emailConfig.oauthRedirectUri)}&` +
        `scope=${encodeURIComponent(emailConfig.oauthScopes.join(' '))}&` +
        `state=${agentId}&prompt=consent`;
      emailConfig.oauthAuthUrl = authUrl;
      emailConfig.status = 'awaiting_oauth';

    } else if (provider === 'google') {
      // Google OAuth (Google Workspace)
      emailConfig.oauthProvider = 'google';
      emailConfig.oauthClientId = oauthClientId;
      emailConfig.oauthClientSecret = oauthClientSecret;
      emailConfig.oauthRedirectUri = oauthRedirectUri || '';
      emailConfig.oauthScopes = [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/chat.spaces',
        'https://www.googleapis.com/auth/chat.spaces.create',
        'https://www.googleapis.com/auth/chat.messages',
        'https://www.googleapis.com/auth/chat.messages.create',
        'https://www.googleapis.com/auth/chat.memberships',
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.responses.readonly',
      ];

      if (!oauthClientId) return c.json({ error: 'oauthClientId is required for Google OAuth' }, 400);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(oauthClientId)}&response_type=code&` +
        `redirect_uri=${encodeURIComponent(emailConfig.oauthRedirectUri)}&` +
        `scope=${encodeURIComponent(emailConfig.oauthScopes.join(' '))}&` +
        `access_type=offline&prompt=consent&state=${agentId}`;
      emailConfig.oauthAuthUrl = authUrl;
      emailConfig.status = 'awaiting_oauth';
    } else {
      return c.json({ error: `Unknown provider: ${provider}. Valid: imap, microsoft, google` }, 400);
    }

    // Attach sending config override if provided
    if (body.sendingConfig && body.sendingConfig.smtpHost) {
      emailConfig.sendingConfig = {
        provider: 'smtp',
        email: body.sendingConfig.email || emailConfig.email,
        password: body.sendingConfig.password,
        smtpHost: body.sendingConfig.smtpHost,
        smtpPort: body.sendingConfig.smtpPort || 587,
      };
    }

    // Save to agent config and persist to DB
    const _managed = lifecycle.getAgent(agentId); if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
    await lifecycle.saveAgent(agentId);

    // Also update the primary agents table email if we have one
    if (emailConfig.email) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) await adminDb.updateAgent(agentId, { email: emailConfig.email });
      } catch { /* non-critical */ }
    }

    return c.json({
      success: true,
      emailConfig: {
        provider: emailConfig.provider,
        email: emailConfig.email,
        status: emailConfig.status,
        oauthAuthUrl: emailConfig.oauthAuthUrl || undefined,
      },
    });
  });

  /**
   * POST /bridge/agents/:id/email-config/oauth-callback — Exchange OAuth code for tokens.
   * Called after user completes the OAuth consent flow.
   */
  router.post('/bridge/agents/:id/email-config/oauth-callback', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const { code } = await c.req.json();
    if (!code) return c.json({ error: 'OAuth authorization code is required' }, 400);

    const emailConfig = managed.config?.emailConfig;
    if (!emailConfig) return c.json({ error: 'No email config found — configure email first' }, 400);

    try {
      if (emailConfig.oauthProvider === 'microsoft') {
        const tokenRes = await fetch(`https://login.microsoftonline.com/${emailConfig.oauthTenantId || 'common'}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: emailConfig.oauthClientId,
            client_secret: emailConfig.oauthClientSecret,
            code,
            redirect_uri: emailConfig.oauthRedirectUri,
            grant_type: 'authorization_code',
            scope: emailConfig.oauthScopes.join(' '),
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          return c.json({ error: `Microsoft token exchange failed: ${errText}` }, 400);
        }

        const tokens = await tokenRes.json() as any;
        emailConfig.oauthAccessToken = tokens.access_token;
        emailConfig.oauthRefreshToken = tokens.refresh_token;
        emailConfig.oauthTokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

        // Get the user's email from Graph
        try {
          const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,displayName', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json() as any;
            if (profile.mail) emailConfig.email = profile.mail;
          }
        } catch {}

      } else if (emailConfig.oauthProvider === 'google') {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: emailConfig.oauthClientId,
            client_secret: emailConfig.oauthClientSecret,
            code,
            redirect_uri: emailConfig.oauthRedirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          return c.json({ error: `Google token exchange failed: ${errText}` }, 400);
        }

        const tokens = await tokenRes.json() as any;
        emailConfig.oauthAccessToken = tokens.access_token;
        // Only overwrite refresh_token if Google returned one (re-auth may not include it)
        if (tokens.refresh_token) {
          emailConfig.oauthRefreshToken = tokens.refresh_token;
        }
        emailConfig.oauthTokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

        // Get the user's email from Gmail
        try {
          const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json() as any;
            if (profile.emailAddress) emailConfig.email = profile.emailAddress;
          }
        } catch {}
      }

      emailConfig.status = 'connected';
      emailConfig.lastConnected = new Date().toISOString();
      emailConfig.lastError = null;
      const _managed = lifecycle.getAgent(agentId); if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
      await lifecycle.saveAgent(agentId);

      return c.json({ success: true, email: emailConfig.email, status: 'connected' });
    } catch (err: any) {
      emailConfig.status = 'error';
      emailConfig.lastError = err.message;
      const _managed = lifecycle.getAgent(agentId); if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
      await lifecycle.saveAgent(agentId);
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * POST /bridge/agents/:id/email-config/test — Test email connection.
   */
  router.post('/bridge/agents/:id/email-config/test', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const emailConfig = managed.config?.emailConfig;
    if (!emailConfig) return c.json({ error: 'No email config found' }, 400);

    try {
      if (emailConfig.provider === 'imap') {
        // Test IMAP connection
        const { ImapFlow } = await import('imapflow');
        const client = new (ImapFlow as any)({
          host: emailConfig.imapHost,
          port: emailConfig.imapPort || 993,
          secure: true,
          auth: { user: emailConfig.email, pass: emailConfig.password },
          logger: false,
        });
        await client.connect();
        const status = await client.status('INBOX', { messages: true, unseen: true });
        await client.logout();

        return c.json({ success: true, inbox: { total: status.messages, unread: status.unseen } });
      } else if (emailConfig.provider === 'microsoft' && emailConfig.oauthAccessToken) {
        const res = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount', {
          headers: { Authorization: `Bearer ${emailConfig.oauthAccessToken}` },
        });
        if (!res.ok) throw new Error(`Graph API ${res.status}`);
        const data = await res.json() as any;
        return c.json({ success: true, inbox: { total: data.totalItemCount, unread: data.unreadItemCount } });
      } else if (emailConfig.provider === 'google' && emailConfig.oauthAccessToken) {
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${emailConfig.oauthAccessToken}` },
        });
        if (!res.ok) throw new Error(`Gmail API ${res.status}`);
        const data = await res.json() as any;
        return c.json({ success: true, email: data.emailAddress, totalMessages: data.messagesTotal });
      } else {
        return c.json({ error: 'Provider not fully configured or unsupported' }, 400);
      }
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 200);
    }
  });

  /**
   * POST /bridge/agents/:id/email-config/test-credentials — Test SMTP/IMAP credentials WITHOUT saving.
   * Allows user to verify email+password works before committing the config.
   */
  router.post('/bridge/agents/:id/email-config/test-credentials', async (c) => {
    const body = await c.req.json();
    const { email, password, imapHost, imapPort, smtpHost, smtpPort } = body;

    if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);
    if (!imapHost && !smtpHost) return c.json({ error: 'At least IMAP or SMTP host is required' }, 400);

    const results: any = { email };

    // Test IMAP
    if (imapHost) {
      try {
        const { ImapFlow } = await import('imapflow');
        const client = new (ImapFlow as any)({
          host: imapHost,
          port: imapPort || 993,
          secure: true,
          auth: { user: email, pass: password },
          logger: false,
          tls: { rejectUnauthorized: false },
        });
        await client.connect();
        const status = await client.status('INBOX', { messages: true, unseen: true });
        await client.logout();
        results.imap = { success: true, inbox: { total: status.messages, unread: status.unseen } };
      } catch (err: any) {
        results.imap = { success: false, error: err.message };
      }
    }

    // Test SMTP
    if (smtpHost) {
      try {
        const nodemailer = await import('nodemailer');
        const transport = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort || 587,
          secure: (smtpPort || 587) === 465,
          auth: { user: email, pass: password },
          tls: { rejectUnauthorized: false },
        } as any);
        await transport.verify();
        transport.close();
        results.smtp = { success: true };
      } catch (err: any) {
        results.smtp = { success: false, error: err.message };
      }
    }

    const allPassed = (!results.imap || results.imap.success) && (!results.smtp || results.smtp.success);
    return c.json({ success: allPassed, ...results });
  });

  /**
   * POST /bridge/agents/:id/email-config/reauthorize — Generate a new OAuth URL with updated scopes.
   * Preserves all existing config/tokens. Just builds a fresh auth URL for re-consent.
   */
  router.post('/bridge/agents/:id/email-config/reauthorize', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const emailConfig = managed.config?.emailConfig;
    if (!emailConfig) return c.json({ error: 'No email config found' }, 400);

    if (emailConfig.oauthProvider === 'google') {
      const clientId = emailConfig.oauthClientId;
      const redirectUri = emailConfig.oauthRedirectUri;
      if (!clientId) return c.json({ error: 'No OAuth client ID configured' }, 400);

      // Updated scopes
      const scopes = [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/chat.spaces',
        'https://www.googleapis.com/auth/chat.spaces.create',
        'https://www.googleapis.com/auth/chat.messages',
        'https://www.googleapis.com/auth/chat.messages.create',
        'https://www.googleapis.com/auth/chat.memberships',
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.responses.readonly',
      ];

      emailConfig.oauthScopes = scopes;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `access_type=offline&prompt=consent&state=${agentId}`;
      emailConfig.oauthAuthUrl = authUrl;

      const _managed = lifecycle.getAgent(agentId);
      if (_managed) { _managed.config.emailConfig = emailConfig; _managed.updatedAt = new Date().toISOString(); }
      await lifecycle.saveAgent(agentId);

      return c.json({ success: true, oauthAuthUrl: authUrl, scopeCount: scopes.length });
    } else if (emailConfig.oauthProvider === 'microsoft') {
      return c.json({ error: 'Microsoft re-authorization not yet implemented' }, 400);
    }
    return c.json({ error: 'No OAuth provider configured' }, 400);
  });

  /**
   * DELETE /bridge/agents/:id/email-config — Disconnect email.
   */
  router.delete('/bridge/agents/:id/email-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const _m = lifecycle.getAgent(agentId); if (_m) { _m.config.emailConfig = null; _m.updatedAt = new Date().toISOString(); }
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true });
  });

  /**
   * POST /agents/:id/clear-email — Deep clear all email config (agent + DB).
   * Used when reassigning orgs or manually resetting.
   */
  router.post('/agents/:id/clear-email', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    // Clear in-memory config
    managed.config.emailConfig = null;
    if ((managed.config as any).email) (managed.config as any).email = null;
    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);

    // Also clear directly in DB to ensure no stale data
    try {
      const db = (lifecycle as any).getDb?.() || (globalThis as any).__engineDb;
      if (db) {
        const isPostgres = !!(db as any).pool;
        if (isPostgres) {
          await (db as any).pool.query(
            `UPDATE managed_agents SET config = config - 'emailConfig' - 'email', updated_at = NOW() WHERE id = $1`,
            [agentId]
          );
        } else {
          // SQLite: read, modify, write back
          const row = await db.get(`SELECT config FROM managed_agents WHERE id = ?`, [agentId]);
          if (row) {
            const cfg = JSON.parse((row as any).config || '{}');
            delete cfg.emailConfig;
            delete cfg.email;
            await db.run(`UPDATE managed_agents SET config = ?, updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(cfg), agentId]);
          }
        }
      }
    } catch { /* best effort DB cleanup */ }

    return c.json({ success: true, cleared: true });
  });

  // ═══════════════════════════════════════════════════════════
  // TOOL ACCESS CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  /** Master tool catalog — all available tools grouped by category */
  const TOOL_CATALOG = [
    {
      id: 'core', name: 'Core Tools', description: 'File operations, shell, search, and browser',
      icon: Emoji.wrench, alwaysOn: true,
      tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'web_fetch', 'web_search', 'browser', 'memory'],
    },
    {
      id: 'agenticmail', name: 'AgenticMail', description: 'Email send/receive, inbox management, inter-agent messaging',
      icon: Emoji.envelope,
      tools: ['agenticmail_inbox', 'agenticmail_read', 'agenticmail_send', 'agenticmail_reply', 'agenticmail_forward',
              'agenticmail_search', 'agenticmail_labels', 'agenticmail_folders', 'agenticmail_drafts',
              'agenticmail_move', 'agenticmail_delete', 'agenticmail_batch_read', 'agenticmail_batch_delete',
              'agenticmail_contacts', 'agenticmail_templates', 'agenticmail_message_agent', 'agenticmail_call_agent',
              'agenticmail_check_tasks', 'agenticmail_complete_task', 'agenticmail_identity'],
    },
    {
      id: 'gmail', name: 'Gmail', description: 'Native Gmail API — search, send, reply, labels, drafts, threads, attachments',
      icon: Emoji.email, requiresOAuth: 'google',
      tools: ['gmail_search', 'gmail_read', 'gmail_thread', 'gmail_send', 'gmail_reply', 'gmail_forward',
              'gmail_modify', 'gmail_trash', 'gmail_labels', 'gmail_drafts', 'gmail_attachment', 'gmail_profile', 'gmail_vacation'],
    },
    {
      id: 'google_calendar', name: 'Google Calendar', description: 'Event management, scheduling, free/busy lookup',
      icon: Emoji.calendar, requiresOAuth: 'google',
      tools: ['google_calendar_list', 'google_calendar_events', 'google_calendar_create_event',
              'google_calendar_update_event', 'google_calendar_delete_event', 'google_calendar_freebusy'],
    },
    {
      id: 'google_drive', name: 'Google Drive', description: 'File management, search, sharing, content export',
      icon: Emoji.folder, requiresOAuth: 'google',
      tools: ['google_drive_list', 'google_drive_get', 'google_drive_create', 'google_drive_delete',
              'google_drive_share', 'google_drive_move'],
    },
    {
      id: 'google_sheets', name: 'Google Sheets', description: 'Spreadsheet read/write, cell operations, formulas',
      icon: Emoji.barChart, requiresOAuth: 'google',
      tools: ['google_sheets_get', 'google_sheets_read', 'google_sheets_write', 'google_sheets_append',
              'google_sheets_clear', 'google_sheets_create', 'google_sheets_add_sheet'],
    },
    {
      id: 'google_docs', name: 'Google Docs', description: 'Document read/write, text insert, find & replace',
      icon: Emoji.note, requiresOAuth: 'google',
      tools: ['google_docs_read', 'google_docs_create', 'google_docs_write'],
    },
    {
      id: 'google_contacts', name: 'Google Contacts', description: 'Contact search, directory lookup, CRUD',
      icon: Emoji.people, requiresOAuth: 'google',
      tools: ['google_contacts_list', 'google_contacts_search', 'google_contacts_search_directory',
              'google_contacts_create', 'google_contacts_update'],
    },
    {
      id: 'google_tasks', name: 'Google Tasks', description: 'Task lists, create/complete/update tasks, due dates',
      icon: Emoji.check, requiresOAuth: 'google',
      tools: ['google_tasks_list_tasklists', 'google_tasks_list', 'google_tasks_create', 'google_tasks_update',
              'google_tasks_complete', 'google_tasks_delete'],
    },
    {
      id: 'google_chat', name: 'Google Chat', description: 'Send messages, manage spaces, read conversations',
      icon: Emoji.chat, requiresOAuth: 'google',
      tools: ['google_chat_list_spaces', 'google_chat_list_members', 'google_chat_list_messages',
              'google_chat_send_message', 'google_chat_setup_space', 'google_chat_find_dm',
              'google_chat_get_space', 'google_chat_update_message', 'google_chat_delete_message',
              'google_chat_add_member', 'google_chat_upload_attachment', 'google_chat_send_image',
              'google_chat_download_attachment', 'google_chat_react'],
    },
    {
      id: 'google_slides', name: 'Google Slides', description: 'Create and edit presentations, add slides, text, images',
      icon: Emoji.art, requiresOAuth: 'google',
      tools: ['google_slides_get', 'google_slides_create', 'google_slides_add_slide',
              'google_slides_add_text', 'google_slides_add_image'],
    },
    {
      id: 'google_forms', name: 'Google Forms', description: 'Create forms, add questions, read responses',
      icon: Emoji.clipboard, requiresOAuth: 'google',
      tools: ['google_forms_get', 'google_forms_create', 'google_forms_add_question',
              'google_forms_responses', 'google_forms_response_summary'],
    },
    {
      id: 'meetings', name: 'Meetings', description: 'Join Google Meet calls. Take notes, chat, share screen, send summaries.',
      icon: Emoji.video, requiresOAuth: 'google',
      tools: ['meetings_upcoming', 'meeting_join', 'meeting_action', 'meetings_scan_inbox', 'meeting_rsvp'],
    },
    {
      id: 'google_maps', name: 'Google Maps', description: 'Places search, directions, distance calculation, geocoding, autocomplete',
      icon: Emoji.map, requiresIntegration: 'google-maps',
      tools: ['google_maps_search', 'google_maps_nearby', 'google_maps_place_details', 'google_maps_directions',
              'google_maps_distance', 'google_maps_geocode', 'google_maps_autocomplete', 'google_maps_static',
              'google_maps_timezone', 'google_maps_elevation'],
    },
    {
      id: 'enterprise_database', name: 'Database', description: 'SQL queries, schema inspection, data sampling',
      icon: Emoji.database,
      tools: ['enterprise_sql_query', 'enterprise_sql_schema', 'enterprise_sql_explain',
              'enterprise_sql_tables', 'enterprise_sql_sample', 'enterprise_sql_write'],
    },
    {
      id: 'enterprise_spreadsheet', name: 'Spreadsheet', description: 'CSV/Excel read, write, filter, aggregate, transform, pivot',
      icon: Emoji.chartUp,
      tools: ['enterprise_csv_read', 'enterprise_csv_write', 'enterprise_csv_filter', 'enterprise_csv_aggregate',
              'enterprise_csv_transform', 'enterprise_csv_merge', 'enterprise_csv_pivot', 'enterprise_csv_convert'],
    },
    {
      id: 'enterprise_documents', name: 'Documents', description: 'PDF/DOCX generation, OCR, format conversion',
      icon: Emoji.document,
      tools: ['enterprise_pdf_generate', 'enterprise_docx_generate', 'enterprise_ocr', 'enterprise_invoice_parse',
              'enterprise_doc_convert', 'enterprise_doc_merge', 'enterprise_doc_extract', 'enterprise_doc_sign'],
    },
    {
      id: 'enterprise_http', name: 'HTTP Client', description: 'HTTP requests, GraphQL, batch calls, downloads',
      icon: Emoji.globe,
      tools: ['enterprise_http_request', 'enterprise_http_graphql', 'enterprise_http_batch', 'enterprise_http_download'],
    },
    {
      id: 'enterprise_security', name: 'Security Scanning', description: 'Secret scanning, PII detection, dependency audit',
      icon: Emoji.lock,
      tools: ['enterprise_secret_scan', 'enterprise_pii_scan', 'enterprise_pii_redact',
              'enterprise_dep_audit', 'enterprise_compliance_check', 'enterprise_hash'],
    },
    {
      id: 'enterprise_code', name: 'Code Sandbox', description: 'Run JavaScript, Python, shell scripts, JSON transforms',
      icon: Emoji.computer,
      tools: ['enterprise_run_js', 'enterprise_run_python', 'enterprise_run_shell',
              'enterprise_json_transform', 'enterprise_regex'],
    },
    {
      id: 'enterprise_diff', name: 'Diff', description: 'Text, JSON, and spreadsheet comparison',
      icon: Emoji.biDirectional,
      tools: ['enterprise_text_diff', 'enterprise_json_diff', 'enterprise_spreadsheet_diff', 'enterprise_diff_summary'],
    },
    {
      id: 'remotion_video', name: 'Video Creation (Remotion)', description: 'Create videos programmatically with React. Render MP4/WebM/GIF, generate shareable URLs.',
      icon: Emoji.video,
      tools: ['remotion_create_project', 'remotion_create_composition', 'remotion_render', 'remotion_render_still',
              'remotion_list_compositions', 'remotion_preview_url', 'remotion_add_asset', 'remotion_install_package', 'remotion_share_file'],
    },
    {
      id: 'visual-memory', name: 'Visual Memory', description: 'Persistent visual memory — capture screenshots, detect changes, recall visual history. Enterprise DB-backed with BM25F search.',
      icon: Emoji.eye,
      tools: ['vision_capture', 'vision_query', 'vision_compare', 'vision_diff', 'vision_similar',
              'vision_track', 'vision_ocr', 'vision_health', 'vision_session_start', 'vision_session_end'],
    },
    {
      id: 'local_filesystem', name: 'Filesystem', description: 'Read, write, edit, move, delete, search, and list files on the host machine.',
      icon: Emoji.folder,
      tools: ['file_read', 'file_write', 'file_edit', 'file_list', 'file_search', 'file_move', 'file_delete'],
    },
    {
      id: 'local_shell', name: 'Shell & System', description: 'Execute commands, interactive PTY sessions, sudo, package installation, system info.',
      icon: Emoji.terminal,
      tools: ['shell_exec', 'shell_interactive', 'shell_sudo', 'shell_install', 'shell_session_list', 'shell_session_kill', 'system_info'],
    },
    {
      id: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp messaging via linked device. QR code scan to connect — no Business API needed.',
      icon: Emoji.whatsapp || Emoji.chat,
      tools: ['whatsapp_connect', 'whatsapp_status', 'whatsapp_send', 'whatsapp_send_media', 'whatsapp_get_groups',
              'whatsapp_send_voice', 'whatsapp_send_location', 'whatsapp_send_contact', 'whatsapp_react',
              'whatsapp_typing', 'whatsapp_read_receipts', 'whatsapp_profile', 'whatsapp_group_manage',
              'whatsapp_delete_message', 'whatsapp_forward', 'whatsapp_disconnect'],
    },
    {
      id: 'telegram', name: 'Telegram', description: 'Telegram Bot API — send messages, media, manage chats. Requires a bot token.',
      icon: Emoji.telegram || Emoji.chat, requiresIntegration: 'telegram',
      tools: ['telegram_send', 'telegram_send_media', 'telegram_get_me', 'telegram_get_chat'],
    },
    // ── Microsoft 365 ──────────────────────────────────
    {
      id: 'outlook_mail', name: 'Outlook Mail', description: 'Full email management — inbox, send, reply, forward, search, threads, drafts, rules, auto-reply, categories',
      icon: Emoji.envelope, requiresOAuth: 'microsoft',
      tools: ['outlook_mail_list', 'outlook_mail_read', 'outlook_mail_thread', 'outlook_mail_send', 'outlook_mail_reply',
              'outlook_mail_forward', 'outlook_mail_move', 'outlook_mail_delete', 'outlook_mail_update', 'outlook_mail_search',
              'outlook_mail_draft', 'outlook_mail_send_draft', 'outlook_mail_folders', 'outlook_mail_create_folder',
              'outlook_mail_attachment_download', 'outlook_mail_auto_reply', 'outlook_mail_get_auto_reply',
              'outlook_mail_rules', 'outlook_mail_categories', 'outlook_mail_profile'],
    },
    {
      id: 'outlook_calendar', name: 'Outlook Calendar', description: 'Calendar events, scheduling, free/busy lookup, Teams meeting creation, invite responses',
      icon: Emoji.calendar, requiresOAuth: 'microsoft',
      tools: ['outlook_calendar_list', 'outlook_calendar_events', 'outlook_calendar_create', 'outlook_calendar_update',
              'outlook_calendar_delete', 'outlook_calendar_respond', 'outlook_calendar_freebusy'],
    },
    {
      id: 'onedrive', name: 'OneDrive', description: 'Cloud file management — list, search, read, upload, share, create folders',
      icon: Emoji.folder, requiresOAuth: 'microsoft',
      tools: ['onedrive_list', 'onedrive_search', 'onedrive_read', 'onedrive_upload', 'onedrive_create_folder',
              'onedrive_delete', 'onedrive_share'],
    },
    {
      id: 'teams', name: 'Microsoft Teams', description: 'Team messaging, channels, chats, file sharing, presence, member management',
      icon: Emoji.chat, requiresOAuth: 'microsoft',
      tools: ['teams_list_teams', 'teams_list_channels', 'teams_create_channel', 'teams_send_channel_message',
              'teams_reply_to_message', 'teams_read_channel_messages', 'teams_list_chats', 'teams_send_chat_message',
              'teams_read_chat_messages', 'teams_list_members', 'teams_add_member', 'teams_share_file',
              'teams_presence', 'teams_set_status'],
    },
    {
      id: 'todo', name: 'Microsoft To Do', description: 'Task lists, task CRUD with due dates, reminders, and importance',
      icon: Emoji.check, requiresOAuth: 'microsoft',
      tools: ['todo_list_lists', 'todo_list_tasks', 'todo_create_task', 'todo_update_task', 'todo_delete_task', 'todo_create_list'],
    },
    {
      id: 'outlook_contacts', name: 'Outlook Contacts', description: 'Contact management, address book, people search',
      icon: Emoji.people, requiresOAuth: 'microsoft',
      tools: ['outlook_contacts_list', 'outlook_contacts_create', 'outlook_contacts_update', 'outlook_contacts_delete', 'outlook_people_search'],
    },
    {
      id: 'excel', name: 'Microsoft Excel', description: 'Read/write cells, ranges, tables, worksheets, formulas, charts, formatting',
      icon: Emoji.chartUp, requiresOAuth: 'microsoft',
      tools: ['excel_list_worksheets', 'excel_read_range', 'excel_write_range', 'excel_add_row', 'excel_list_tables',
              'excel_read_table', 'excel_create_worksheet', 'excel_create_session', 'excel_close_session',
              'excel_evaluate_formula', 'excel_named_ranges', 'excel_read_named_range', 'excel_list_charts',
              'excel_chart_image', 'excel_pivot_refresh', 'excel_set_cell_format'],
    },
    {
      id: 'sharepoint', name: 'SharePoint', description: 'Sites, document libraries, lists, search, file management across SharePoint Online',
      icon: Emoji.database, requiresOAuth: 'microsoft',
      tools: ['sharepoint_list_sites', 'sharepoint_get_site', 'sharepoint_list_drives', 'sharepoint_list_files',
              'sharepoint_upload_file', 'sharepoint_list_lists', 'sharepoint_list_items', 'sharepoint_create_list_item',
              'sharepoint_update_list_item', 'sharepoint_search'],
    },
    {
      id: 'onenote', name: 'OneNote', description: 'Notebooks, sections, pages — read, create, and update notes',
      icon: Emoji.note, requiresOAuth: 'microsoft',
      tools: ['onenote_list_notebooks', 'onenote_list_sections', 'onenote_list_pages', 'onenote_read_page',
              'onenote_create_page', 'onenote_update_page'],
    },
    {
      id: 'powerpoint', name: 'PowerPoint', description: 'Presentation metadata, PDF export, thumbnails, templates, embed URLs',
      icon: Emoji.art, requiresOAuth: 'microsoft',
      tools: ['powerpoint_get_info', 'powerpoint_export_pdf', 'powerpoint_get_thumbnails',
              'powerpoint_create_from_template', 'powerpoint_get_embed_url'],
    },
    {
      id: 'planner', name: 'Microsoft Planner', description: 'Project boards — plans, buckets, tasks (Kanban-style task management)',
      icon: Emoji.clipboard, requiresOAuth: 'microsoft',
      tools: ['planner_list_plans', 'planner_list_buckets', 'planner_list_tasks', 'planner_create_task',
              'planner_update_task', 'planner_delete_task'],
    },
    {
      id: 'powerbi', name: 'Power BI', description: 'Workspaces, reports, dashboards, datasets, DAX queries, data refresh',
      icon: Emoji.barChart, requiresOAuth: 'microsoft',
      tools: ['powerbi_list_workspaces', 'powerbi_list_reports', 'powerbi_list_dashboards', 'powerbi_list_datasets',
              'powerbi_refresh_dataset', 'powerbi_refresh_history', 'powerbi_execute_query', 'powerbi_dashboard_tiles'],
    },
  ];

  // ═══════════════════════════════════════════════════════════
  // SYSTEM CAPABILITIES
  // ═══════════════════════════════════════════════════════════

  router.get('/bridge/system/capabilities', async (c) => {
    try {
      const { detectCapabilities, getCapabilitySummary } = await import('../runtime/environment.js');
      const caps = detectCapabilities();
      const summary = getCapabilitySummary(caps);
      return c.json({ ...summary, raw: caps });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // BROWSER CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  router.get('/bridge/agents/:id/browser-config', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    return c.json({ config: managed.config?.browserConfig || {} });
  });

  // ── In-memory registry of running meeting browsers (survives config save/reload issues) ──
  const meetingBrowsers = new Map<string, { port: number; cdpUrl: string; pid?: number }>();

  /**
   * POST /bridge/agents/:id/browser-config/launch-meeting-browser
   * Launches a meeting-ready headed Chrome instance with virtual display + audio.
   * Returns the CDP URL for the agent to connect to.
   */
  router.post('/bridge/agents/:id/browser-config/launch-meeting-browser', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    try {
      // Check system capabilities first
      const { detectCapabilities, getCapabilitySummary } = await import('../runtime/environment.js');
      const caps = detectCapabilities();
      if (!caps.canJoinMeetings) {
        const summary = getCapabilitySummary(caps);
        return c.json({
          error: 'Meeting browser cannot run on this ' + summary.deployment + ' deployment',
          deployment: summary.deployment,
          missing: summary.unavailable,
          recommendations: summary.recommendations,
          hint: 'Deploy on a VM with display + audio, or configure a Remote Browser (CDP) provider.',
        }, 400);
      }

      const { execSync, spawn } = await import('node:child_process');
      const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');
      const { join, dirname } = await import('node:path');
      const { homedir } = await import('node:os');

      // ── Auto-detect Chrome/Chromium across all platforms ──
      const chromeCandidates = [
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        // macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        // Linux
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/usr/local/bin/chromium',
        // Windows
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        // Playwright bundled (check common install locations)
        join(homedir(), '.cache', 'ms-playwright', 'chromium-*', 'chrome-linux', 'chrome'),
        join(homedir(), '.cache', 'ms-playwright', 'chromium-*', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ].filter(Boolean) as string[];

      let chromePath = '';
      for (const candidate of chromeCandidates) {
        if (candidate.includes('*')) {
          // Glob pattern — resolve with fs
          try {
            const { globSync } = await import('node:fs');
            const matches = (globSync as any)(candidate);
            if (matches?.length && existsSync(matches[0])) { chromePath = matches[0]; break; }
          } catch {
            // globSync not available in older Node, try manual resolve
            try {
              const parentDir = dirname(candidate.split('*')[0]);
              if (existsSync(parentDir)) {
                const { readdirSync } = await import('node:fs');
                const dirs = readdirSync(parentDir).filter((d: string) => d.startsWith('chromium-')).sort().reverse();
                for (const d of dirs) {
                  const suffix = candidate.split('*')[1];
                  const resolved = join(parentDir, d, suffix);
                  if (existsSync(resolved)) { chromePath = resolved; break; }
                }
                if (chromePath) break;
              }
            } catch { /* skip */ }
          }
        } else if (existsSync(candidate)) {
          chromePath = candidate;
          break;
        }
      }

      // If no Chrome found, try to install Playwright Chromium automatically
      if (!chromePath) {
        try {
          console.log('[meeting-browser] No Chrome/Chromium found — installing Playwright Chromium...');
          execSync('npx playwright install chromium 2>&1', { timeout: 120_000, stdio: 'pipe' });
          // Re-check for Playwright Chromium
          const pwCacheDir = join(homedir(), '.cache', 'ms-playwright');
          if (existsSync(pwCacheDir)) {
            const { readdirSync } = await import('node:fs');
            const chromiumDirs = readdirSync(pwCacheDir).filter((d: string) => d.startsWith('chromium-')).sort().reverse();
            for (const d of chromiumDirs) {
              // Try Linux path
              const linuxPath = join(pwCacheDir, d, 'chrome-linux', 'chrome');
              if (existsSync(linuxPath)) { chromePath = linuxPath; break; }
              // Try macOS path
              const macPath = join(pwCacheDir, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
              if (existsSync(macPath)) { chromePath = macPath; break; }
            }
          }
        } catch (installErr: any) {
          console.error('[meeting-browser] Failed to auto-install Chromium:', installErr.message);
        }
      }

      if (!chromePath) {
        return c.json({
          error: 'No Chrome or Chromium browser found on this machine. Install Google Chrome or run: npx playwright install chromium',
          hint: 'On macOS: brew install --cask google-chrome | On Linux: apt install chromium-browser | On Windows: download from google.com/chrome',
        }, 400);
      }

      // Check if a meeting browser is already running for this agent (in-memory registry first, then config fallback)
      const tracked = meetingBrowsers.get(agentId);
      const existingPort = tracked?.port || (managed.config as any)?.meetingBrowserPort;
      if (existingPort) {
        try {
          const resp = await fetch(`http://127.0.0.1:${existingPort}/json/version`, { signal: AbortSignal.timeout(2000) });
          if (resp.ok) {
            const data = await resp.json() as any;
            // Ensure registry is up to date
            meetingBrowsers.set(agentId, { port: existingPort, cdpUrl: data.webSocketDebuggerUrl, pid: tracked?.pid });
            return c.json({ ok: true, alreadyRunning: true, cdpUrl: data.webSocketDebuggerUrl, port: existingPort, browserVersion: data.Browser });
          }
        } catch { /* not running, will launch new one */ }
        // Was tracked but not responding — clean up
        meetingBrowsers.delete(agentId);
      }

      // ── Create a realistic browser profile using agent identity ──
      const agentName = managed.displayName || managed.display_name || managed.name || (managed.config as any)?.displayName || (managed.config as any)?.name || 'Agent';
      const _agentRole = (managed.config as any)?.role || (managed.config as any)?.description || 'AI Assistant';
      const profileDir = join(homedir(), '.agenticmail', 'browser-profiles', agentId);
      mkdirSync(profileDir, { recursive: true });

      // Write Chrome preferences to make the browser look like a real user
      const prefsDir = join(profileDir, 'Default');
      mkdirSync(prefsDir, { recursive: true });
      const prefsFile = join(prefsDir, 'Preferences');
      if (!existsSync(prefsFile)) {
        const prefs = {
          profile: {
            name: agentName,
            avatar_index: Math.floor(Math.random() * 28), // Chrome has 28 avatar options
            managed_user_id: '',
            is_using_default_name: false,
            is_using_default_avatar: false,
          },
          browser: {
            has_seen_welcome_page: true,
            check_default_browser: false,
          },
          distribution: {
            import_bookmarks: false,
            import_history: false,
            import_search_engine: false,
            suppress_first_run_bubble: true,
            suppress_first_run_default_browser_prompt: true,
            skip_first_run_ui: true,
            make_chrome_default_for_user: false,
          },
          session: { restore_on_startup: 1 },
          search: { suggest_enabled: true },
          translate: { enabled: false },
          net: { network_prediction_options: 2 }, // don't prefetch
          webkit: { webprefs: { default_font_size: 16 } },
          download: { prompt_for_download: true, default_directory: join(profileDir, 'Downloads') },
          savefile: { default_directory: join(profileDir, 'Downloads') },
          credentials_enable_service: false,
          credentials_enable_autosign_in: false,
        };
        mkdirSync(join(profileDir, 'Downloads'), { recursive: true });
        writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
      }

      // Find available port
      const net = await import('node:net');
      const port = await new Promise<number>((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
          const p = (srv.address() as any).port;
          srv.close(() => resolve(p));
        });
        srv.on('error', reject);
      });

      // Launch Chrome with meeting-optimized flags and realistic profile
      const chromeArgs = [
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        // Meeting-specific: auto-grant camera/mic permissions
        '--use-fake-ui-for-media-stream',
        '--auto-accept-camera-and-microphone-capture',
        // Anti-detection: remove automation indicators
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        // Window size for meeting UI
        '--window-size=1920,1080',
        '--start-maximized',
        // Use the agent's persistent profile directory
        `--user-data-dir=${profileDir}`,
        // Realistic user-agent lang
        '--lang=en-US',
      ];

      // Add --no-sandbox on Linux (required for non-root in containers)
      if (process.platform === 'linux') {
        chromeArgs.push('--no-sandbox');
      }

      // Detect display environment
      const display = process.env.DISPLAY || (process.platform === 'linux' ? ':99' : undefined);
      const envVars: Record<string, string> = { ...process.env } as any;
      if (display) envVars.DISPLAY = display;

      const child = spawn(chromePath, chromeArgs, {
        detached: true,
        stdio: 'ignore',
        env: envVars,
      });
      child.unref();

      // Wait for Chrome to be ready
      let cdpUrl = '';
      let browserVersion = '';
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const resp = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
          if (resp.ok) {
            const data = await resp.json() as any;
            cdpUrl = data.webSocketDebuggerUrl;
            browserVersion = data.Browser;
            break;
          }
        } catch { /* retry */ }
      }

      if (!cdpUrl) {
        return c.json({ error: 'Chrome launched but CDP not responding after 15s' });
      }

      // Save to in-memory registry (primary) and agent config (backup)
      meetingBrowsers.set(agentId, { port, cdpUrl, pid: child.pid });
      if (!managed.config) managed.config = {} as any;
      (managed.config as any).meetingBrowserPort = port;
      (managed.config as any).meetingBrowserCdpUrl = cdpUrl;
      managed.updatedAt = new Date().toISOString();
      try { await lifecycle.saveAgent(agentId); } catch (e) { console.warn('[meeting-browser] Config save failed (non-fatal):', e); }

      return c.json({ ok: true, cdpUrl, port, browserVersion, pid: child.pid });
    } catch (e: any) {
      return c.json({ error: 'Failed to launch meeting browser: ' + e.message });
    }
  });

  /**
   * POST /bridge/agents/:id/browser-config/stop-meeting-browser
   * Kills the meeting browser process for this agent.
   */
  router.post('/bridge/agents/:id/browser-config/stop-meeting-browser', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    try {
      const body = await c.req.json().catch(() => ({})) as any;
      const tracked = meetingBrowsers.get(agentId);
      const port = tracked?.port || (managed.config as any)?.meetingBrowserPort || body.port;
      if (!port) return c.json({ error: 'No meeting browser is tracked for this agent' }, 400);

      // Try to close gracefully via CDP
      let closed = false;
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
          // Get the websocket URL and send Browser.close
          const data = await resp.json() as any;
          if (data.webSocketDebuggerUrl) {
            try {
              const _closeResp = await fetch(`http://127.0.0.1:${port}/json/close`, { method: 'PUT', signal: AbortSignal.timeout(3000) });
              closed = true;
            } catch { /* fallback to kill */ }
          }
        }
      } catch { /* not running or not reachable */ }

      // Fallback: kill by PID first (most reliable), then by port
      if (!closed && tracked?.pid) {
        try { process.kill(tracked.pid, 'SIGTERM'); closed = true; } catch { /* already dead */ }
      }
      if (!closed) {
        try {
          const { execSync } = await import('node:child_process');
          if (process.platform === 'win32') {
            execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F 2>nul`, { timeout: 5000 });
          } else {
            execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || fuser -k ${port}/tcp 2>/dev/null || true`, { timeout: 5000 });
          }
          closed = true;
        } catch { /* already dead */ }
      }

      // Clear from registry and config
      meetingBrowsers.delete(agentId);
      delete (managed.config as any).meetingBrowserPort;
      delete (managed.config as any).meetingBrowserCdpUrl;
      managed.updatedAt = new Date().toISOString();
      try { await lifecycle.saveAgent(agentId); } catch (e) { console.warn('[meeting-browser] Config save failed (non-fatal):', e); }

      return c.json({ ok: true, stopped: true, port });
    } catch (e: any) {
      return c.json({ error: 'Failed to stop meeting browser: ' + e.message }, 500);
    }
  });

  router.post('/bridge/agents/:id/browser-config/test', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const cfg = managed.config?.browserConfig || {};
    const provider = cfg.provider || 'local';

    try {
      if (provider === 'local') {
        // Test local Chromium availability — auto-detect across platforms
        try {
          const { execSync } = await import('node:child_process');
          const { existsSync } = await import('node:fs');
          const { homedir } = await import('node:os');
          const { join } = await import('node:path');
          const candidates = [
            cfg.executablePath,
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ].filter(Boolean) as string[];
          let foundPath = '';
          for (const p of candidates) { if (existsSync(p)) { foundPath = p; break; } }
          // Also check Playwright bundled chromium
          if (!foundPath) {
            const pwCache = join(homedir(), '.cache', 'ms-playwright');
            if (existsSync(pwCache)) {
              const { readdirSync } = await import('node:fs');
              const dirs = readdirSync(pwCache).filter((d: string) => d.startsWith('chromium-')).sort().reverse();
              for (const d of dirs) {
                const linuxP = join(pwCache, d, 'chrome-linux', 'chrome');
                const macP = join(pwCache, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
                if (existsSync(linuxP)) { foundPath = linuxP; break; }
                if (existsSync(macP)) { foundPath = macP; break; }
              }
            }
          }
          if (!foundPath) {
            return c.json({ error: 'No Chrome or Chromium found. Install Google Chrome or run: npx playwright install chromium' });
          }
          const version = execSync(`"${foundPath}" --version 2>/dev/null || echo "not found"`, { timeout: 5000 }).toString().trim();
          if (version.includes('not found')) {
            return c.json({ error: 'Chrome found at ' + foundPath + ' but --version failed' });
          }
          return c.json({ ok: true, browserVersion: version, provider: 'local', path: foundPath });
        } catch (e: any) {
          return c.json({ error: 'Chromium not available: ' + e.message });
        }
      }

      if (provider === 'remote-cdp') {
        if (!cfg.cdpUrl) return c.json({ error: 'CDP URL not configured' });
        try {
          // Extract HTTP URL from WS URL to query /json/version
          const wsUrl = new URL(cfg.cdpUrl);
          const httpUrl = `http://${wsUrl.hostname}:${wsUrl.port}/json/version`;
          const resp = await fetch(httpUrl, { signal: AbortSignal.timeout(cfg.cdpTimeout || 10000) });
          if (!resp.ok) return c.json({ error: `CDP endpoint returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: data.Browser || data['User-Agent'], webSocketUrl: data.webSocketDebuggerUrl, provider: 'remote-cdp' });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to CDP: ' + e.message });
        }
      }

      if (provider === 'browserless') {
        if (!cfg.browserlessToken) return c.json({ error: 'Browserless API token not configured' });
        const endpoint = cfg.browserlessEndpoint || 'https://chrome.browserless.io';
        try {
          const resp = await fetch(`${endpoint}/config?token=${cfg.browserlessToken}`, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return c.json({ error: `Browserless returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: data.chrome?.version || 'Connected', provider: 'browserless', concurrent: data.concurrent });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to Browserless: ' + e.message });
        }
      }

      if (provider === 'browserbase') {
        if (!cfg.browserbaseApiKey) return c.json({ error: 'Browserbase API key not configured' });
        try {
          const resp = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'x-bb-api-key': cfg.browserbaseApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: cfg.browserbaseProjectId }),
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) return c.json({ error: `Browserbase returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: 'Session created: ' + (data.id || 'OK'), provider: 'browserbase' });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to Browserbase: ' + e.message });
        }
      }

      if (provider === 'steel') {
        if (!cfg.steelApiKey) return c.json({ error: 'Steel API key not configured' });
        const endpoint = cfg.steelEndpoint || 'https://api.steel.dev';
        try {
          const resp = await fetch(`${endpoint}/v1/sessions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cfg.steelApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeout: 60 }),
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) return c.json({ error: `Steel returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, browserVersion: 'Session: ' + (data.id || 'OK'), provider: 'steel' });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to Steel: ' + e.message });
        }
      }

      if (provider === 'scrapingbee') {
        if (!cfg.scrapingbeeApiKey) return c.json({ error: 'ScrapingBee API key not configured' });
        try {
          const resp = await fetch(`https://app.scrapingbee.com/api/v1/usage?api_key=${cfg.scrapingbeeApiKey}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) return c.json({ error: `ScrapingBee returned ${resp.status}` });
          const data = await resp.json() as any;
          return c.json({ ok: true, provider: 'scrapingbee', creditsUsed: data.used_api_credit, creditsMax: data.max_api_credit });
        } catch (e: any) {
          return c.json({ error: 'Cannot connect to ScrapingBee: ' + e.message });
        }
      }

      return c.json({ ok: true, provider, note: 'Connection test not implemented for this provider' });
    } catch (e: any) {
      return c.json({ error: e.message });
    }
  });

  router.put('/bridge/agents/:id/browser-config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    const body = await c.req.json();
    if (!managed.config) managed.config = {} as any;
    managed.config.browserConfig = body;
    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════
  // TOOL RESTRICTIONS
  // ═══════════════════════════════════════════════════════════

  router.get('/bridge/agents/:id/tool-restrictions', (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    return c.json({ restrictions: managed.config?.toolRestrictions || {} });
  });

  router.put('/bridge/agents/:id/tool-restrictions', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    const body = await c.req.json();
    if (!managed.config) managed.config = {} as any;
    managed.config.toolRestrictions = body;

    // Sync restrictions to permission profile
    const profile = permissions.getProfile(agentId);
    if (profile) {
      if (body.blockedTools) profile.tools = { ...profile.tools, blocked: body.blockedTools };
      if (body.maxRiskLevel) profile.maxRiskLevel = body.maxRiskLevel;
      if (body.blockedSideEffects) profile.blockedSideEffects = body.blockedSideEffects;
      if (body.requireApproval) profile.requireApproval = body.requireApproval;
      if (body.rateLimits) profile.rateLimits = body.rateLimits;
      if (body.constraints) profile.constraints = body.constraints;
      permissions.setProfile(agentId, profile, managed.orgId);
    }

    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true });
  });

  /**
   * GET /bridge/agents/:id/tools — List available tool categories with enabled/disabled status
   */
  router.get('/bridge/agents/:id/tools', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const os = await import('node:os');
    const serverPlatform = os.platform();
    const toolConfig = managed.config?.toolAccess || {};
    const emailConfig = managed.config?.emailConfig;
    const hasGoogleOAuth = emailConfig?.oauthProvider === 'google' && emailConfig?.oauthAccessToken;
    const hasMicrosoftOAuth = emailConfig?.oauthProvider === 'microsoft' && emailConfig?.oauthAccessToken;

    const categories = TOOL_CATALOG.map((cat: any) => {
      // Platform check
      if (cat.requiresPlatform && cat.requiresPlatform !== serverPlatform) {
        return {
          id: cat.id, name: cat.name, description: cat.description, icon: cat.icon,
          toolCount: cat.tools.length, tools: cat.tools,
          enabled: false, isAvailable: false, alwaysOn: false,
          requiresOAuth: null, requiresIntegration: null,
          requiresPlatform: cat.requiresPlatform,
          platformUnavailable: true,
          platformMessage: 'Requires ' + cat.requiresPlatform,
        };
      }

      const isAvailable = cat.requiresOAuth
        ? (cat.requiresOAuth === 'google' && hasGoogleOAuth) || (cat.requiresOAuth === 'microsoft' && hasMicrosoftOAuth)
        : cat.requiresIntegration
          ? true // Integration availability is checked at runtime via vault
          : true;

      // Default: core is always on, others on if available
      const defaultEnabled = cat.alwaysOn || isAvailable;
      const enabled = cat.alwaysOn ? true : (toolConfig[cat.id] !== undefined ? toolConfig[cat.id] : defaultEnabled);

      return {
        id: cat.id, name: cat.name, description: cat.description, icon: cat.icon,
        toolCount: cat.tools.length, tools: cat.tools,
        enabled, isAvailable, alwaysOn: cat.alwaysOn || false,
        requiresOAuth: cat.requiresOAuth || null,
        requiresIntegration: cat.requiresIntegration || null,
      };
    });

    const totalTools = categories.reduce((s, c) => s + c.toolCount, 0);
    const enabledTools = categories.filter(c => c.enabled).reduce((s, c) => s + c.toolCount, 0);

    return c.json({ categories, totalTools, enabledTools });
  });

  /**
   * PUT /bridge/agents/:id/tools — Update tool access configuration
   * Body: { [categoryId]: boolean }
   */
  router.put('/bridge/agents/:id/tools', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    if (!managed.config) managed.config = {} as any;
    if (!managed.config.toolAccess) managed.config.toolAccess = {};

    for (const [catId, enabled] of Object.entries(body)) {
      // Don't allow disabling core tools
      const cat = TOOL_CATALOG.find(c => c.id === catId);
      if (cat?.alwaysOn) continue;
      managed.config.toolAccess[catId] = !!enabled;
    }

    // Sync toolAccess categories → permission profile blocked/allowed tools
    const profile = permissions.getProfile(agentId);
    if (profile) {
      if (!profile.tools) profile.tools = { blocked: [], allowed: [] };
      const newBlocked = new Set(profile.tools.blocked || []);
      const newAllowed = new Set(profile.tools.allowed || []);
      for (const [catId, enabled] of Object.entries(managed.config.toolAccess)) {
        const cat = TOOL_CATALOG.find((c: any) => c.id === catId);
        if (!cat) continue;
        for (const toolId of cat.tools) {
          if (enabled) {
            newBlocked.delete(toolId);
            newAllowed.add(toolId);
          } else {
            newAllowed.delete(toolId);
            newBlocked.add(toolId);
          }
        }
      }
      profile.tools.blocked = [...newBlocked];
      profile.tools.allowed = [...newAllowed];
      permissions.setProfile(agentId, profile, managed.orgId);
    }

    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);
    return c.json({ success: true, toolAccess: managed.config.toolAccess });
  });

  // ─── Messaging Channels Config ──────────────────────

  /**
   * PUT /bridge/agents/:id/config — Update agent config fields (messaging channels, etc.)
   */
  router.put('/bridge/agents/:id/config', async (c) => {
    const agentId = c.req.param('id');
    const managed = lifecycle.getAgent(agentId);
    if (!managed) return c.json({ error: 'Agent not found' }, 404);
    const body = await c.req.json();
    // Merge into config
    if ((body as any).messagingChannels) {
      managed.config = managed.config || {} as any;
      (managed.config as any).messagingChannels = {
        ...(((managed.config as any).messagingChannels) || {}),
        ...(body as any).messagingChannels,
      };
    }
    // Merge any other config keys
    for (const key of Object.keys(body)) {
      if (key === 'messagingChannels') continue; // Already handled above
      (managed.config as any)[key] = body[key];
    }
    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);

    // Emit config change events so running services update in real-time
    for (const key of Object.keys(body)) {
      configBus.emitAgentConfig(agentId, key, body[key]);
    }
    return c.json({ success: true });
  });

  /**
   * POST /bridge/agents/:id/whatsapp/connect — Start WhatsApp connection
   * Supports mode=business for separate business number connection
   */
  router.post('/bridge/agents/:id/whatsapp/connect', async (c) => {
    const agentId = c.req.param('id');
    try {
      const body = await c.req.json().catch(() => ({}));
      const mode = body.mode || ''; // 'business' or ''
      const { createWhatsAppTools } = await import('../agent-tools/tools/messaging/whatsapp.js');
      const dataDir = process.env.DATA_DIR || '/tmp/agenticmail-data';
      const connId = mode === 'business' ? `biz-${agentId}` : agentId;
      const connDir = mode === 'business' ? `${dataDir}/agents/${agentId}/whatsapp-business` : `${dataDir}/agents/${agentId}/whatsapp`;
      const tools = createWhatsAppTools({ agentId: connId, dataDir: connDir });
      const connectTool = tools.find(t => t.name === 'whatsapp_connect');
      if (!connectTool) return c.json({ error: 'WhatsApp not available' }, 500);
      const result = await connectTool.execute!(connId, {});
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * GET /bridge/agents/:id/whatsapp/status — Check WhatsApp status
   * Supports ?mode=business for business number status
   */
  router.get('/bridge/agents/:id/whatsapp/status', async (c) => {
    const agentId = c.req.param('id');
    const mode = c.req.query('mode') || '';
    try {
      const { getConnectionStatus } = await import('../agent-tools/tools/messaging/whatsapp.js');
      const connId = mode === 'business' ? `biz-${agentId}` : agentId;
      return c.json(getConnectionStatus(connId));
    } catch {
      return c.json({ connected: false });
    }
  });

  /**
   * POST /bridge/agents/:id/whatsapp/test — Send a test message
   * Supports mode in body for business number
   */
  router.post('/bridge/agents/:id/whatsapp/test', async (c) => {
    const agentId = c.req.param('id');
    try {
      const body = await c.req.json().catch(() => ({}));
      const mode = body.mode || '';
      const connId = mode === 'business' ? `biz-${agentId}` : agentId;
      const { sendTestMessage } = await import('../agent-tools/tools/messaging/whatsapp.js');
      const result = await sendTestMessage(connId, body.to);
      return c.json(result);
    } catch (err: any) {
      return c.json({ ok: false, error: err.message }, 500);
    }
  });

  /**
   * POST /bridge/agents/:id/whatsapp/proxy-send — Proxy send from standalone agent
   */
  router.post('/bridge/agents/:id/whatsapp/proxy-send', async (c) => {
    const agentId = c.req.param('id');
    try {
      const body = await c.req.json();
      const { getConnection } = await import('../agent-tools/tools/messaging/whatsapp.js');
      const conn = getConnection(agentId);
      if (!conn?.connected) return c.json({ error: 'Not connected' }, 503);
      const toJid = (to: string) => to?.includes('@') ? to : (to || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      if (!body.to) return c.json({ error: 'Missing "to" field', received: body }, 400);
      const jid = toJid(body.to);
      if (body.action === 'presence') {
        await conn.sock.sendPresenceUpdate(body.type || 'composing', jid);
        return c.json({ ok: true });
      }
      // Show typing indicator before sending
      try { await conn.sock.sendPresenceUpdate('composing', jid); } catch {}
      const r = await conn.sock.sendMessage(jid, body.content || { text: body.text });
      try { await conn.sock.sendPresenceUpdate('paused', jid); } catch {}

      // Store outbound message for conversation history
      if (body.text && opts.engineDb) {
        const { storeMessage } = await import('./messaging-history.js');
        const agentData = lifecycle.getAgent(agentId);
        storeMessage(opts.engineDb, {
          agentId,
          platform: 'whatsapp',
          contactId: body.to,
          direction: 'outbound',
          senderName: agentData?.display_name as any || agentData?.name || 'Agent',
          messageText: body.text,
          messageId: r?.key?.id,
        }).catch(() => {});
      }

      return c.json({ ok: true, id: r?.key?.id });
    } catch (err: any) {
      console.error(`[wa-proxy] Error:`, err.message, err.stack?.split('\n')[1]);
      return c.json({ ok: false, error: err.message }, 500);
    }
  });

  /**
   * POST /bridge/agents/:id/whatsapp/disconnect — Disconnect WhatsApp
   */
  router.post('/bridge/agents/:id/whatsapp/disconnect', async (c) => {
    const agentId = c.req.param('id');
    try {
      const body = await c.req.json().catch(() => ({}));
      const mode = body.mode || '';
      const { createWhatsAppTools } = await import('../agent-tools/tools/messaging/whatsapp.js');
      const dataDir = process.env.DATA_DIR || '/tmp/agenticmail-data';
      const connId = mode === 'business' ? `biz-${agentId}` : agentId;
      const connDir = mode === 'business' ? `${dataDir}/agents/${agentId}/whatsapp-business` : `${dataDir}/agents/${agentId}/whatsapp`;
      const tools = createWhatsAppTools({ agentId: connId, dataDir: connDir });
      const disconnectTool = tools.find(t => t.name === 'whatsapp_disconnect');
      if (!disconnectTool) return c.json({ error: 'Not available' }, 500);
      const result = await disconnectTool.execute!(connId, body);
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════
  // Telegram
  // ═══════════════════════════════════════════════

  /**
   * POST /bridge/agents/:id/telegram/validate — Validate bot token via getMe
   */
  router.post('/bridge/agents/:id/telegram/validate', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const token = body.botToken;
      if (!token) return c.json({ ok: false, error: 'Bot token required' }, 400);
      const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) });
      const data = await resp.json() as any;
      if (data.ok) {
        return c.json({ ok: true, bot: { id: data.result.id, username: data.result.username, firstName: data.result.first_name } });
      }
      return c.json({ ok: false, error: data.description || 'Invalid token' });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message }, 500);
    }
  });

  /**
   * POST /bridge/agents/:id/telegram/test — Send a test message to a chat ID
   */
  router.post('/bridge/agents/:id/telegram/test', async (c) => {
    try {
      const agentId = c.req.param('id');
      const body = await c.req.json().catch(() => ({}));
      const chatId = body.chatId;
      // Get bot token from agent config
      const agent = lifecycle.getAgent(agentId);
      const channels = agent?.config?.messagingChannels as any || {};
      const tgConfig = channels.telegram || {};
      const token = tgConfig.botToken;
      if (!token) return c.json({ ok: false, error: 'No bot token configured' }, 400);
      if (!chatId) return c.json({ ok: false, error: 'Chat ID required' }, 400);
      const agentName = agent?.displayName || agent?.name || 'Agent';
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `${Emoji.check} Test message from ${agentName}. Your Telegram connection is working!` }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json() as any;
      if (data.ok) return c.json({ ok: true });
      return c.json({ ok: false, error: data.description || 'Send failed' });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════
  // WhatsApp Pairing System
  // ═══════════════════════════════════════════════

  /**
   * GET /bridge/agents/:id/whatsapp/pairing-requests — List pending pairing requests
   */
  router.get('/bridge/agents/:id/whatsapp/pairing-requests', async (c) => {
    const agentId = c.req.param('id');
    try {
      if (!opts.engineDb) return c.json({ requests: [] });
      const r = await opts.engineDb.query(
        `SELECT phone, name, code, created_at as timestamp FROM whatsapp_pairing_requests WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [agentId]
      );
      return c.json({ requests: r.rows || [] });
    } catch {
      return c.json({ requests: [] });
    }
  });

  /**
   * POST /bridge/agents/:id/whatsapp/pairing-approve — Approve a pairing request
   */
  router.post('/bridge/agents/:id/whatsapp/pairing-approve', async (c) => {
    const agentId = c.req.param('id');
    const body = await c.req.json();
    try {
      if (!opts.engineDb) return c.json({ error: 'No database' }, 500);
      await opts.engineDb.query(
        `UPDATE whatsapp_pairing_requests SET status = 'approved' WHERE agent_id = $1 AND code = $2`,
        [agentId, body.code]
      );
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * POST /bridge/agents/:id/whatsapp/pairing-reject — Reject a pairing request
   */
  router.post('/bridge/agents/:id/whatsapp/pairing-reject', async (c) => {
    const agentId = c.req.param('id');
    const body = await c.req.json();
    try {
      if (!opts.engineDb) return c.json({ error: 'No database' }, 500);
      await opts.engineDb.query(
        `UPDATE whatsapp_pairing_requests SET status = 'rejected' WHERE agent_id = $1 AND code = $2`,
        [agentId, body.code]
      );
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * GET /bridge/agents/:id/whatsapp/conversations — Conversation list with pagination, search, filters
   */
  router.get('/bridge/agents/:id/whatsapp/conversations', async (c) => {
    const agentId = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') || '20') || 20, 100);
    const offset = parseInt(c.req.query('offset') || '0') || 0;
    const search = (c.req.query('search') || '').trim();
    const direction = c.req.query('direction') || ''; // 'inbound' | 'outbound' | ''
    try {
      if (!opts.engineDb) return c.json({ conversations: [], total: 0 });

      let whereExtra = '';
      const params: any[] = [agentId];
      let paramIdx = 2;
      if (search) {
        whereExtra += ` AND (sender_name ILIKE $${paramIdx} OR contact_id ILIKE $${paramIdx} OR message_text ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      if (direction) {
        whereExtra += ` AND direction = $${paramIdx}`;
        params.push(direction);
        paramIdx++;
      }

      // Total count
      const countR = await opts.engineDb.query(
        `SELECT COUNT(DISTINCT contact_id) as total FROM messaging_history WHERE agent_id = $1 AND platform = 'whatsapp'${whereExtra}`,
        params
      );
      const total = parseInt(countR.rows?.[0]?.total || '0');

      // Conversation summaries
      const r = await opts.engineDb.query(
        `SELECT contact_id as "contactId", 
                MAX(sender_name) as name,
                COUNT(*) as "messageCount",
                COUNT(*) FILTER (WHERE direction = 'inbound') as "inboundCount",
                COUNT(*) FILTER (WHERE direction = 'outbound') as "outboundCount",
                MAX(created_at) as "lastAt",
                MIN(created_at) as "firstAt",
                (array_agg(message_text ORDER BY created_at DESC))[1] as "lastMessage",
                (array_agg(direction ORDER BY created_at DESC))[1] as "lastDirection"
         FROM messaging_history
         WHERE agent_id = $1 AND platform = 'whatsapp'${whereExtra}
         GROUP BY contact_id
         ORDER BY MAX(created_at) DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      const agentData = lifecycle.getAgent(agentId);
      const waCfg = (agentData?.config as any)?.messagingChannels?.whatsapp || {};
      const trusted = waCfg.trustedContacts || [];
      const bizCustomers = waCfg.business?.approvedCustomers || [];
      const convos = (r.rows || []).map((row: any) => {
        const norm = (row.contactId || '').replace(/[^0-9]/g, '');
        return {
          ...row,
          messageCount: parseInt(row.messageCount) || 0,
          inboundCount: parseInt(row.inboundCount) || 0,
          outboundCount: parseInt(row.outboundCount) || 0,
          isTrusted: trusted.some((t: string) => norm.includes(t.replace(/[^0-9]/g, ''))),
          isCustomer: bizCustomers.some((c: any) => norm.includes((c.phone || '').replace(/[^0-9]/g, ''))),
        };
      });
      return c.json({ conversations: convos, total, limit, offset });
    } catch {
      return c.json({ conversations: [], total: 0 });
    }
  });

  /**
   * GET /bridge/agents/:id/whatsapp/conversations/:contactId — Full message history for a conversation
   */
  router.get('/bridge/agents/:id/whatsapp/conversations/:contactId', async (c) => {
    const agentId = c.req.param('id');
    const contactId = decodeURIComponent(c.req.param('contactId'));
    const limit = Math.min(parseInt(c.req.query('limit') || '50') || 50, 200);
    const before = c.req.query('before') || ''; // ISO timestamp for older messages
    try {
      if (!opts.engineDb) return c.json({ messages: [] });
      let whereExtra = '';
      const params: any[] = [agentId, contactId];
      if (before) {
        whereExtra = ' AND created_at < $3';
        params.push(before);
      }
      const r = await opts.engineDb.query(
        `SELECT id, direction, sender_name as "senderName", message_text as text, 
                message_id as "messageId", created_at as "timestamp"
         FROM messaging_history 
         WHERE agent_id = $1 AND platform = 'whatsapp' AND contact_id = $2${whereExtra}
         ORDER BY created_at DESC 
         LIMIT ${limit}`,
        params
      );
      return c.json({ messages: (r.rows || []).reverse() });
    } catch {
      return c.json({ messages: [] });
    }
  });

  return router;
}

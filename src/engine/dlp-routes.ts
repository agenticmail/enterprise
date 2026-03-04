/**
 * DLP (Data Loss Prevention) Routes
 * Mounted at /dlp/* on the engine sub-app.
 */

import { Hono } from 'hono';
import { DLPEngine, DLP_RULE_PACKS } from './dlp.js';

export function createDlpRoutes(dlp: DLPEngine) {
  const router = new Hono();

  router.get('/rules', (c) => {
    const rules = dlp.getRules(c.req.query('orgId') || undefined);
    return c.json({ rules, total: rules.length });
  });

  router.post('/rules', async (c) => {
    const body = await c.req.json();
    body.id = body.id || crypto.randomUUID();
    body.createdAt = body.createdAt || new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    await dlp.addRule(body);
    return c.json({ success: true, rule: body }, 201);
  });

  router.get('/rules/:id', (c) => {
    const rule = dlp.getRule(c.req.param('id'));
    if (!rule) return c.json({ error: 'Rule not found' }, 404);
    return c.json({ rule });
  });

  router.put('/rules/:id', async (c) => {
    const id = c.req.param('id');
    const existing = dlp.getRule(id);
    if (!existing) return c.json({ error: 'Rule not found' }, 404);
    const body = await c.req.json();
    const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
    await dlp.addRule(updated);
    return c.json({ success: true, rule: updated });
  });

  router.delete('/rules/:id', (c) => {
    dlp.removeRule(c.req.param('id'));
    return c.json({ success: true });
  });

  router.post('/scan', async (c) => {
    const { orgId, content } = await c.req.json();
    if (!orgId || !content) return c.json({ error: 'orgId and content required' }, 400);
    return c.json(dlp.testScan(orgId, content));
  });

  router.post('/scan-parameters', async (c) => {
    const { orgId, agentId, toolId, parameters } = await c.req.json();
    if (!orgId || !agentId || !toolId) return c.json({ error: 'orgId, agentId, toolId required' }, 400);
    return c.json(dlp.scanParameters(orgId, agentId, toolId, parameters || {}));
  });

  // ─── Rule Packs ─────────────────────────────────────

  router.get('/rule-packs', (c) => {
    return c.json({ packs: DLPEngine.getRulePacks() });
  });

  router.get('/rule-packs/:id', (c) => {
    const packId = c.req.param('id');
    const pack = DLP_RULE_PACKS[packId];
    if (!pack) return c.json({ error: 'Unknown rule pack' }, 404);
    return c.json({ id: packId, ...pack });
  });

  router.post('/rule-packs/apply', async (c) => {
    const { orgId, packIds, overwrite } = await c.req.json();
    if (!orgId || !packIds?.length) return c.json({ error: 'orgId and packIds[] required' }, 400);
    try {
      const result = await dlp.applyRulePacks(orgId, packIds, { overwrite });
      return c.json({ success: true, ...result });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/reload', async (c) => {
    await dlp.reloadRules();
    const rules = dlp.getRules();
    return c.json({ success: true, totalRules: rules.length });
  });

  // ─── Violations ─────────────────────────────────────

  router.get('/violations', (c) => {
    const violations = dlp.getViolations({
      orgId: c.req.query('orgId') || undefined,
      agentId: c.req.query('agentId') || undefined,
      limit: parseInt(c.req.query('limit') || '100'),
    });
    return c.json({ violations, total: violations.length });
  });

  return router;
}

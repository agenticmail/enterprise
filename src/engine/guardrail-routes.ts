/**
 * Guardrails (Intervention & Anomaly Detection) Routes
 * Mounted at /guardrails/* and /anomaly-rules/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { GuardrailEngine } from './guardrails.js';

export function createGuardrailRoutes(guardrails: GuardrailEngine, opts?: { getWorkforceOffDuty?: (agentId: string) => boolean }) {
  const router = new Hono();

  // ─── Interventions ─────────────────────────────────────

  router.post('/pause/:id', async (c) => {
    const { reason } = await c.req.json().catch(() => ({ reason: 'Manual pause' }));
    const triggeredBy = c.req.header('X-User-Id') || 'admin';
    const orgId = c.req.query('orgId') || undefined;
    const record = await guardrails.pauseAgent(c.req.param('id'), reason, triggeredBy, orgId);
    return c.json({ success: true, intervention: record });
  });

  router.post('/resume/:id', async (c) => {
    const { reason } = await c.req.json().catch(() => ({ reason: 'Manual resume' }));
    const triggeredBy = c.req.header('X-User-Id') || 'admin';
    const orgId = c.req.query('orgId') || undefined;
    const record = await guardrails.resumeAgent(c.req.param('id'), reason, triggeredBy, orgId);
    return c.json({ success: true, intervention: record });
  });

  router.post('/kill/:id', async (c) => {
    const { reason } = await c.req.json().catch(() => ({ reason: 'Emergency kill' }));
    const triggeredBy = c.req.header('X-User-Id') || 'admin';
    const orgId = c.req.query('orgId') || undefined;
    const record = await guardrails.killAgent(c.req.param('id'), reason, triggeredBy, orgId);
    return c.json({ success: true, intervention: record });
  });

  router.get('/status/:id', (c) => {
    const agentId = c.req.param('id');
    const status = guardrails.getAgentStatus(agentId);
    const offDuty = opts?.getWorkforceOffDuty?.(agentId) ?? false;
    return c.json({ ...status, offDuty });
  });

  router.get('/interventions', (c) => {
    const records = guardrails.getInterventions({
      orgId: c.req.query('orgId') || undefined,
      agentId: c.req.query('agentId') || undefined,
      limit: parseInt(c.req.query('limit') || '50'),
    });
    return c.json({ interventions: records, total: records.length });
  });

  // ─── Extended Guardrail Rules ──────────────────────────

  router.get('/rules', (c) => {
    const rules = guardrails.getGuardrailRules(
      c.req.query('orgId') || undefined,
      c.req.query('category') || undefined,
    );
    return c.json({ rules, total: rules.length });
  });

  router.post('/rules', async (c) => {
    const body = await c.req.json();
    body.id = body.id || crypto.randomUUID();
    body.createdAt = body.createdAt || new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    body.triggerCount = 0;
    body.createdBy = c.req.header('X-User-Id') || body.createdBy || 'admin';
    await guardrails.addGuardrailRule(body);
    return c.json({ success: true, rule: body }, 201);
  });

  router.put('/rules/:id', async (c) => {
    const body = await c.req.json();
    const updated = await guardrails.updateGuardrailRule(c.req.param('id'), body);
    if (!updated) return c.json({ error: 'Rule not found' }, 404);
    return c.json({ success: true, rule: updated });
  });

  router.delete('/rules/:id', (c) => {
    guardrails.removeGuardrailRule(c.req.param('id'));
    return c.json({ success: true });
  });

  router.get('/rules/categories', (c) => {
    const { GUARDRAIL_RULE_CATEGORIES } = require('./guardrails.js');
    return c.json({ categories: GUARDRAIL_RULE_CATEGORIES || {} });
  });

  router.get('/status/:id/full', (c) => {
    const agentId = c.req.param('id');
    const fullStatus = guardrails.getAgentFullStatus(agentId);
    const offDuty = opts?.getWorkforceOffDuty?.(agentId) ?? false;
    return c.json({ ...fullStatus, offDuty });
  });

  return router;
}

export function createAnomalyRoutes(guardrails: GuardrailEngine) {
  const router = new Hono();

  router.get('/', (c) => {
    const rules = guardrails.getAnomalyRules(c.req.query('orgId') || undefined);
    return c.json({ rules, total: rules.length });
  });

  router.post('/', async (c) => {
    const body = await c.req.json();
    body.id = body.id || crypto.randomUUID();
    body.createdAt = body.createdAt || new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    await guardrails.addAnomalyRule(body);
    return c.json({ success: true, rule: body }, 201);
  });

  router.delete('/:id', (c) => {
    guardrails.removeAnomalyRule(c.req.param('id'));
    return c.json({ success: true });
  });

  return router;
}

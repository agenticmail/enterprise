/**
 * Organizations + Approvals + Escalation Routes
 * Mounted at / on the engine sub-app (routes define /orgs/*, /approvals/*, /escalation-chains/*).
 */

import { Hono } from 'hono';
import type { TenantManager } from './tenant.js';
import type { ApprovalEngine } from './approvals.js';

export function createOrgApprovalRoutes(opts: {
  tenants: TenantManager;
  approvals: ApprovalEngine;
}) {
  const { tenants, approvals } = opts;
  const router = new Hono();

  // ─── Organizations (Tenants) ────────────────────────────

  router.post('/orgs', async (c) => {
    const { name, slug, plan, adminEmail, settings } = await c.req.json();
    try {
      const org = await tenants.createOrg({ name, slug, plan: plan || 'free', adminEmail, settings });
      return c.json({ org }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.get('/orgs', (c) => c.json({ orgs: tenants.listOrgs() }));

  router.get('/orgs/:id', (c) => {
    const org = tenants.getOrg(c.req.param('id'));
    if (!org) return c.json({ error: 'Org not found' }, 404);
    return c.json({ org });
  });

  router.get('/orgs/slug/:slug', (c) => {
    const org = tenants.getOrgBySlug(c.req.param('slug'));
    if (!org) return c.json({ error: 'Org not found' }, 404);
    return c.json({ org });
  });

  router.post('/orgs/:id/check-limit', async (c) => {
    const { resource, currentCount } = await c.req.json();
    try {
      return c.json(tenants.checkLimit(c.req.param('id'), resource, currentCount));
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  router.post('/orgs/:id/check-feature', async (c) => {
    const { feature } = await c.req.json();
    return c.json({ allowed: tenants.hasFeature(c.req.param('id'), feature) });
  });

  router.post('/orgs/:id/change-plan', async (c) => {
    const { plan } = await c.req.json();
    try {
      const org = await tenants.changePlan(c.req.param('id'), plan);
      return c.json({ org });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // ─── Approvals ──────────────────────────────────────────

  router.get('/approvals/pending', (c) => {
    const agentId = c.req.query('agentId');
    const requests = approvals.getPendingRequests(agentId || undefined);
    return c.json({ requests, total: requests.length });
  });

  router.get('/approvals/history', (c) => {
    const agentId = c.req.query('agentId');
    const limit = parseInt(c.req.query('limit') || '25');
    const offset = parseInt(c.req.query('offset') || '0');
    return c.json(approvals.getHistory({ agentId: agentId || undefined, limit, offset }));
  });

  // Policies must be ABOVE /:id to avoid `:id` capturing "policies"
  router.get('/approvals/policies', (c) => c.json({ policies: approvals.getPolicies() }));

  router.post('/approvals/policies', async (c) => {
    const body = await c.req.json();
    const orgId = body.orgId || 'default';
    const policy = body.policy || body;
    policy.id = policy.id || crypto.randomUUID();
    await approvals.addPolicy(policy, orgId);
    return c.json({ success: true, policy });
  });

  router.delete('/approvals/policies/:id', (c) => {
    approvals.removePolicy(c.req.param('id'));
    return c.json({ success: true });
  });

  router.get('/approvals/:id', (c) => {
    const request = approvals.getRequest(c.req.param('id'));
    if (!request) return c.json({ error: 'Not found' }, 404);
    return c.json({ request });
  });

  router.post('/approvals/:id/decide', async (c) => {
    const { action, reason, by } = await c.req.json();
    const result = await approvals.decide(c.req.param('id'), { action, reason, by });
    if (!result) return c.json({ error: 'Not found or already decided' }, 404);
    return c.json({ request: result });
  });

  // ─── Escalation Chains ─────────────────────────────────

  router.get('/escalation-chains', (c) => {
    const chains = approvals.getEscalationChains(c.req.query('orgId') || undefined);
    return c.json({ chains, total: chains.length });
  });

  router.post('/escalation-chains', async (c) => {
    const body = await c.req.json();
    body.id = body.id || crypto.randomUUID();
    body.createdAt = body.createdAt || new Date().toISOString();
    body.updatedAt = new Date().toISOString();
    await approvals.addEscalationChain(body);
    return c.json({ success: true, chain: body }, 201);
  });

  router.get('/escalation-chains/:id', (c) => {
    const chain = approvals.getEscalationChain(c.req.param('id'));
    if (!chain) return c.json({ error: 'Chain not found' }, 404);
    return c.json({ chain });
  });

  router.delete('/escalation-chains/:id', (c) => {
    approvals.removeEscalationChain(c.req.param('id'));
    return c.json({ success: true });
  });

  router.post('/approvals/:id/escalate', async (c) => {
    const result = await approvals.escalateRequest(c.req.param('id'));
    if (!result) return c.json({ error: 'Not found or cannot escalate' }, 404);
    return c.json({ request: result });
  });

  return router;
}

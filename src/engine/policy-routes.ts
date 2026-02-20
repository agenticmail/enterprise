/**
 * Organization Policy Routes
 * Mounted at /policies/* on the engine sub-app.
 */

import { Hono } from 'hono';
import { OrgPolicyEngine, POLICY_CATEGORIES } from './org-policies.js';
import type { PolicyCategory } from './org-policies.js';

export function createPolicyRoutes(policyEngine: OrgPolicyEngine) {
  const router = new Hono();

  // ─── Query ─────────────────────────────────────────────────

  /** List policies for an organization, optionally filtered by category */
  router.get('/', async (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      const category = c.req.query('category') || undefined;

      if (!orgId) {
        return c.json({ error: 'orgId query parameter is required' }, 400);
      }

      const policies = category
        ? await policyEngine.getPoliciesByCategory(orgId, category as PolicyCategory)
        : await policyEngine.getPoliciesByOrg(orgId);

      return c.json({ policies, total: policies.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** List available policy categories */
  router.get('/categories', (c) => {
    return c.json({ categories: POLICY_CATEGORIES });
  });

  /** Get default policy templates */
  router.get('/templates', (c) => {
    try {
      const templates = OrgPolicyEngine.getDefaultTemplates();
      return c.json({ templates });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Apply default policy templates to an organization */
  router.post('/templates/apply', async (c) => {
    try {
      const body = await c.req.json();

      if (!body.orgId) {
        return c.json({ error: 'orgId is required' }, 400);
      }

      const createdBy = body.createdBy || c.req.header('X-User-Id') || 'admin';
      const policies = await policyEngine.applyDefaultTemplates(body.orgId, createdBy);

      return c.json({ success: true, policies, count: policies.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get policies applicable to a specific agent */
  router.get('/agent/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const orgId = c.req.query('orgId') || '';

      if (!orgId) {
        return c.json({ error: 'orgId query parameter is required' }, 400);
      }

      const policies = await policyEngine.getPoliciesForAgent(orgId, agentId);
      return c.json({ policies, total: policies.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get a single policy by ID */
  router.get('/:id', async (c) => {
    try {
      const policy = await policyEngine.getPolicy(c.req.param('id'));
      if (!policy) {
        return c.json({ error: 'Policy not found' }, 404);
      }
      return c.json({ policy });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── CRUD ──────────────────────────────────────────────────

  /** Create a new policy */
  router.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const now = new Date().toISOString();
      const userId = c.req.header('X-User-Id') || body.createdBy || 'admin';

      const policy = {
        ...body,
        id: crypto.randomUUID(),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      await policyEngine.createPolicy(policy);
      return c.json({ success: true, policy }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Update an existing policy */
  router.put('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const existing = await policyEngine.getPolicy(id);
      if (!existing) {
        return c.json({ error: 'Policy not found' }, 404);
      }

      const body = await c.req.json();
      const updated = {
        ...existing,
        ...body,
        id, // prevent id override
        updatedAt: new Date().toISOString(),
      };

      await policyEngine.updatePolicy(id, updated);
      return c.json({ success: true, policy: updated });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Delete a policy */
  router.delete('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const existing = await policyEngine.getPolicy(id);
      if (!existing) {
        return c.json({ error: 'Policy not found' }, 404);
      }

      await policyEngine.deletePolicy(id);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}

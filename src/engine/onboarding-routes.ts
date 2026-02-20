/**
 * Agent Onboarding API Routes
 *
 * Mounted at /onboarding/* on the engine router.
 * Provides REST endpoints for agent onboarding lifecycle:
 * initiation, policy acknowledgement, progress tracking,
 * re-onboarding, and admin force-completion.
 */

import { Hono } from 'hono';
import type { OnboardingManager } from './onboarding.js';

export function createOnboardingRoutes(onboarding: OnboardingManager) {
  const router = new Hono();

  // ─── Onboarding Initiation ───────────────────────────────

  /** Start onboarding for an agent within an org */
  router.post('/initiate/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const { orgId } = await c.req.json();
      const progress = await onboarding.initiateOnboarding(agentId, orgId);
      return c.json({ success: true, progress });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Policy Acknowledgement ──────────────────────────────

  /** Agent acknowledges a specific policy */
  router.post('/acknowledge', async (c) => {
    try {
      const { agentId, policyId } = await c.req.json();
      if (!agentId || !policyId) {
        return c.json({ error: 'agentId and policyId are required' }, 400);
      }
      const record = await onboarding.acknowledgePolicy(agentId, policyId);
      return c.json({ success: true, record });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Progress Tracking ───────────────────────────────────

  /** Get onboarding progress for a specific agent */
  router.get('/progress/:agentId', async (c) => {
    try {
      const progress = await onboarding.getProgress(c.req.param('agentId'));
      return c.json({ progress });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get onboarding progress for all agents in an org */
  router.get('/org/:orgId', async (c) => {
    try {
      const progress = await onboarding.getProgressByOrg(c.req.param('orgId'));
      return c.json({ progress, total: progress.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  /** Get pending policies for an agent (used by the onboarding hook) */
  router.get('/pending/:agentId', async (c) => {
    try {
      const policies = await onboarding.getPendingPolicies(c.req.param('agentId'));
      return c.json({ policies, total: policies.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Admin Operations ────────────────────────────────────

  /** Admin force-complete onboarding for an agent */
  router.post('/force-complete/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const body = await c.req.json().catch(() => ({}));
      const adminId = body.adminId || c.req.header('X-User-Id') || 'admin';
      await onboarding.forceComplete(agentId, adminId);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Policy Change Detection ─────────────────────────────

  /** Check for policy changes that require re-onboarding */
  router.post('/check-changes', async (c) => {
    try {
      const { orgId } = await c.req.json();
      if (!orgId) {
        return c.json({ error: 'orgId is required' }, 400);
      }
      const changes = await onboarding.checkPolicyChanges(orgId);
      return c.json({ changes, total: changes.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Re-onboarding ───────────────────────────────────────

  /** Trigger re-onboarding for specific policies */
  router.post('/re-onboard/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const { policyIds } = await c.req.json();
      if (!policyIds || !Array.isArray(policyIds)) {
        return c.json({ error: 'policyIds array is required' }, 400);
      }
      await onboarding.triggerReOnboarding(agentId, policyIds);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Quick Status Check ──────────────────────────────────

  /** Quick check whether an agent has completed onboarding */
  router.get('/status/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const onboarded = await onboarding.isOnboarded(agentId);
      return c.json({ agentId, onboarded });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}

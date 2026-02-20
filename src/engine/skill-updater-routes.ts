/**
 * Skill Auto-Updater Routes
 * Mounted at /skill-updates/* on the engine sub-app.
 *
 * Endpoints:
 *   Config:   GET  /config, PUT /config
 *   Check:    POST /check, GET /available
 *   Apply:    POST /apply/:id, POST /apply-all, POST /skip/:id
 *   History:  GET  /history
 *   Stats:    GET  /stats
 */

import { Hono } from 'hono';
import type { SkillAutoUpdater } from './skill-updater.js';

export function createSkillUpdaterRoutes(updater: SkillAutoUpdater) {
  const router = new Hono();

  // ─── Config ────────────────────────────────────────────

  // GET /config — Get update config for org
  router.get('/config', (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const config = updater.getConfig(orgId);
      return c.json({ config });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // PUT /config — Set update config
  router.put('/config', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId required' }, 400);
      const config = updater.setConfig(body.orgId, body);
      return c.json({ config });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Check for Updates ─────────────────────────────────

  // POST /check — Check for updates now
  router.post('/check', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId required' }, 400);
      const results = await updater.checkForUpdates(body.orgId);
      const available = results.filter((r) => r.updateAvailable);
      return c.json({
        results,
        total: results.length,
        updatesAvailable: available.length,
      });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // GET /available — List available updates
  router.get('/available', (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const updates = updater.getAvailableUpdates(orgId);
      return c.json({ updates, total: updates.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Apply Updates ─────────────────────────────────────

  // POST /apply/:id — Apply a specific update
  router.post('/apply/:id', async (c) => {
    try {
      const updateId = c.req.param('id');
      const existing = updater.getUpdate(updateId);
      if (!existing) return c.json({ error: 'Update not found' }, 404);
      const userId = c.req.header('X-User-Id') || 'admin';
      const update = await updater.applyUpdate(updateId, userId);
      return c.json({ update });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /apply-all — Apply all available updates for an org
  router.post('/apply-all', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId required' }, 400);
      const userId = c.req.header('X-User-Id') || 'admin';
      const updates = await updater.applyAllUpdates(body.orgId, userId);
      const applied = updates.filter((u) => u.status === 'applied').length;
      const failed = updates.filter((u) => u.status === 'failed').length;
      return c.json({ updates, total: updates.length, applied, failed });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // POST /skip/:id — Skip a specific update
  router.post('/skip/:id', async (c) => {
    try {
      const updateId = c.req.param('id');
      const existing = updater.getUpdate(updateId);
      if (!existing) return c.json({ error: 'Update not found' }, 404);
      const update = await updater.skipUpdate(updateId);
      return c.json({ update });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── History ───────────────────────────────────────────

  // GET /history — Get update history for an org
  router.get('/history', (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const limit = parseInt(c.req.query('limit') || '50');
      const updates = updater.getUpdateHistory(orgId, { limit });
      return c.json({ updates, total: updates.length });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  // ─── Stats ─────────────────────────────────────────────

  // GET /stats — Get update stats for an org
  router.get('/stats', (c) => {
    try {
      const orgId = c.req.query('orgId') || '';
      if (!orgId) return c.json({ error: 'orgId required' }, 400);
      const stats = updater.getStats(orgId);
      return c.json(stats);
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  return router;
}

/**
 * Community Skill Registry Routes
 * Mounted at /community/* on the engine sub-app.
 *
 * Endpoints:
 *   Browse:   GET  /skills, /skills/search, /skills/featured, /skills/popular,
 *                   /skills/categories, /skills/stats, /skills/:id, /skills/:id/reviews
 *   Install:  GET  /installed, POST /skills/:id/install, DELETE /skills/:id/uninstall,
 *             PUT  /skills/:id/enable, PUT /skills/:id/disable, PUT /skills/:id/config,
 *             POST /skills/:id/upgrade
 *   Admin:    POST /skills/publish, DELETE /skills/:id/unpublish,
 *             POST /skills/import-github, POST /skills/validate,
 *             POST /skills/:id/verify, POST /skills/:id/feature,
 *             POST /skills/:id/reviews
 */

import { Hono } from 'hono';
import type { CommunitySkillRegistry } from './community-registry.js';

export function createCommunityRoutes(registry: CommunitySkillRegistry) {
  const router = new Hono();

  // ─── Browse ──────────────────────────────────────────

  router.get('/skills', async (c) => {
    const result = await registry.search({
      query: c.req.query('q') || undefined,
      category: c.req.query('category') || undefined,
      risk: c.req.query('risk') || undefined,
      tag: c.req.query('tag') || undefined,
      verified: c.req.query('verified') === 'true' ? true : c.req.query('verified') === 'false' ? false : undefined,
      featured: c.req.query('featured') === 'true' ? true : c.req.query('featured') === 'false' ? false : undefined,
      sortBy: c.req.query('sort') || undefined,
      order: c.req.query('order') || undefined,
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0'),
    });
    return c.json(result);
  });

  router.get('/skills/search', async (c) => {
    const q = c.req.query('q') || '';
    const result = await registry.search({
      query: q,
      limit: parseInt(c.req.query('limit') || '20'),
    });
    return c.json(result);
  });

  router.get('/skills/featured', async (c) => {
    const skills = await registry.getFeatured();
    return c.json({ skills });
  });

  router.get('/skills/popular', async (c) => {
    const limit = parseInt(c.req.query('limit') || '10');
    const skills = await registry.getPopular(limit);
    return c.json({ skills });
  });

  router.get('/skills/categories', (c) => {
    return c.json({ categories: registry.getCategories() });
  });

  router.get('/skills/stats', (c) => {
    return c.json(registry.getStats());
  });

  router.get('/skills/:id', (c) => {
    const skill = registry.getSkill(c.req.param('id'));
    if (!skill) return c.json({ error: 'Skill not found' }, 404);
    return c.json({ skill });
  });

  router.get('/skills/:id/reviews', async (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const reviews = await registry.getReviews(c.req.param('id'), limit);
    return c.json({ reviews });
  });

  // ─── Install / Manage ────────────────────────────────

  router.get('/installed', async (c) => {
    const orgId = c.req.query('orgId') || 'default';
    const installed = await registry.getInstalledWithDetails(orgId);
    return c.json({ installed });
  });

  router.post('/skills/:id/install', async (c) => {
    const { orgId, config } = await c.req.json().catch(() => ({ orgId: 'default', config: {} }));
    const userId = c.req.header('X-User-Id') || 'admin';
    const installed = await registry.install(orgId || 'default', c.req.param('id'), userId, config);
    return c.json({ installed }, 201);
  });

  router.delete('/skills/:id/uninstall', async (c) => {
    const orgId = c.req.query('orgId') || 'default';
    await registry.uninstall(orgId, c.req.param('id'));
    return c.json({ ok: true });
  });

  router.put('/skills/:id/enable', async (c) => {
    const { orgId } = await c.req.json().catch(() => ({ orgId: 'default' }));
    await registry.enable(orgId || 'default', c.req.param('id'));
    return c.json({ ok: true });
  });

  router.put('/skills/:id/disable', async (c) => {
    const { orgId } = await c.req.json().catch(() => ({ orgId: 'default' }));
    await registry.disable(orgId || 'default', c.req.param('id'));
    return c.json({ ok: true });
  });

  router.put('/skills/:id/config', async (c) => {
    const { orgId, config } = await c.req.json();
    if (!config) return c.json({ error: 'config required' }, 400);
    await registry.updateConfig(orgId || 'default', c.req.param('id'), config);
    return c.json({ ok: true });
  });

  router.post('/skills/:id/upgrade', async (c) => {
    const { orgId } = await c.req.json().catch(() => ({ orgId: 'default' }));
    const installed = await registry.upgrade(orgId || 'default', c.req.param('id'));
    return c.json({ installed });
  });

  // ─── Admin / Publishing ──────────────────────────────

  router.post('/skills/publish', async (c) => {
    const manifest = await c.req.json();
    const skill = await registry.publish(manifest);
    return c.json({ skill }, 201);
  });

  router.delete('/skills/:id/unpublish', async (c) => {
    await registry.unpublish(c.req.param('id'));
    return c.json({ ok: true });
  });

  router.post('/skills/import-github', async (c) => {
    const { repoUrl } = await c.req.json();
    if (!repoUrl) return c.json({ error: 'repoUrl required' }, 400);
    const skill = await registry.importFromGitHub(repoUrl);
    return c.json({ skill }, 201);
  });

  router.post('/skills/validate', async (c) => {
    const manifest = await c.req.json();
    const result = registry.validateManifest(manifest);
    return c.json(result);
  });

  router.post('/skills/:id/verify', async (c) => {
    const { verified } = await c.req.json().catch(() => ({ verified: true }));
    await registry.setVerified(c.req.param('id'), verified !== false);
    return c.json({ ok: true });
  });

  router.post('/skills/:id/feature', async (c) => {
    const { featured } = await c.req.json().catch(() => ({ featured: true }));
    await registry.setFeatured(c.req.param('id'), featured !== false);
    return c.json({ ok: true });
  });

  router.post('/skills/:id/reviews', async (c) => {
    const body = await c.req.json();
    const userId = c.req.header('X-User-Id') || body.userId || 'anonymous';
    const review = await registry.submitReview({
      skillId: c.req.param('id'),
      userId,
      userName: body.userName || body.displayName || undefined,
      rating: body.rating,
      reviewText: body.reviewText || body.text || undefined,
    });
    return c.json({ review }, 201);
  });

  // ─── Sync / Auto-Publish ─────────────────────────

  // Reload all skills from the community-skills/ directory.
  // Called by the post-merge CI workflow or manually to pick up new skills
  // without restarting the server.
  router.post('/sync', async (c) => {
    const path = await import('path');
    const communityDir = c.req.query('dir')
      || path.resolve(import.meta.dirname || '.', '../../community-skills');
    const result = await registry.loadFromDirectory(communityDir);
    return c.json({
      ok: true,
      loaded: result.loaded,
      errors: result.errors,
      message: `Synced ${result.loaded} skills from directory`,
    });
  });

  // Publish a single skill by reading its manifest from the directory.
  // Used by CI after a specific skill is merged.
  router.post('/sync/:skillId', async (c) => {
    const skillId = c.req.param('skillId');
    const path = await import('path');
    const fs = await import('fs/promises');
    const communityDir = c.req.query('dir')
      || path.resolve(import.meta.dirname || '.', '../../community-skills');
    const manifestPath = path.join(communityDir, skillId, 'agenticmail-skill.json');

    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      const skill = await registry.publish(manifest);
      return c.json({ ok: true, skill }, 201);
    } catch (err: any) {
      return c.json({ error: `Failed to sync ${skillId}: ${err.message}` }, 400);
    }
  });

  // Trigger a remote sync from the central GitHub repo (agenticmail/enterprise).
  // This fetches community-skills/index.json from the repo and pulls any
  // new/updated skills. Called by the dashboard "Sync Now" button or by cron.
  router.post('/sync-remote', async (c) => {
    const result = await registry.syncFromRemote();
    return c.json({
      ok: true,
      synced: result.synced,
      errors: result.errors,
      lastSyncAt: registry.getLastSyncAt(),
      message: result.synced > 0
        ? `Synced ${result.synced} new skills from remote registry`
        : 'Already up to date',
    });
  });

  return router;
}

/**
 * Action Journal + Rollback Routes
 * Mounted at /journal/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { ActionJournal } from './journal.js';

export function createJournalRoutes(journal: ActionJournal) {
  const router = new Hono();

  router.post('/record', async (c) => {
    const body = await c.req.json();
    if (!body.orgId || !body.agentId || !body.toolId) return c.json({ error: 'orgId, agentId, toolId required' }, 400);
    const entry = await journal.record(body);
    return c.json({ entry }, 201);
  });

  router.get('/', (c) => {
    const result = journal.getEntries({
      orgId: c.req.query('orgId') || undefined,
      agentId: c.req.query('agentId') || undefined,
      reversible: c.req.query('reversible') === 'true' ? true : c.req.query('reversible') === 'false' ? false : undefined,
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0'),
    });
    return c.json(result);
  });

  router.get('/stats/:orgId', (c) => {
    return c.json(journal.getStats(c.req.param('orgId')));
  });

  router.get('/:id', (c) => {
    const entry = journal.getEntry(c.req.param('id'));
    if (!entry) return c.json({ error: 'Entry not found' }, 404);
    return c.json({ entry });
  });

  router.post('/:id/rollback', async (c) => {
    const { rolledBackBy } = await c.req.json().catch(() => ({ rolledBackBy: 'admin' }));
    const actor = c.req.header('X-User-Id') || rolledBackBy;
    const result = await journal.rollback(c.req.param('id'), actor);
    return c.json(result);
  });

  router.post('/rollback-agent', async (c) => {
    const { agentId, count, rolledBackBy } = await c.req.json();
    if (!agentId) return c.json({ error: 'agentId required' }, 400);
    const actor = c.req.header('X-User-Id') || rolledBackBy || 'admin';
    const results = await journal.rollbackAgentActions(agentId, count || 5, actor);
    return c.json({ results, total: results.length });
  });

  return router;
}

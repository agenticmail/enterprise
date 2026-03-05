/**
 * Database Access — API Routes
 * 
 * REST API for managing database connections, agent access, and query execution.
 * All routes require authentication and org-level authorization.
 */

import { Hono } from 'hono';
import type { DatabaseConnectionManager } from './connection-manager.js';

async function notifyAgentReload(agentId: string) {
  try {
    const { notifyAgent } = await import('../engine/agent-notify.js');
    await notifyAgent(agentId, 'db-access');
  } catch { /* non-fatal */ }
}

export function createDatabaseAccessRoutes(manager: DatabaseConnectionManager) {
  const router = new Hono();

  // ─── Connections ─────────────────────────────────────────────────────────

  /** List all database connections for the org */
  router.get('/connections', async (c) => {
    const orgId = (c as any).get?.('orgId') || 'default';
    const connections = manager.listConnections(orgId);
    // Strip sensitive fields
    const safe = connections.map(conn => ({
      ...conn,
      sslCaCert: conn.sslCaCert ? '***' : undefined,
      sslClientCert: conn.sslClientCert ? '***' : undefined,
      sslClientKey: conn.sslClientKey ? '***' : undefined,
    }));
    return c.json(safe);
  });

  /** Get single connection */
  router.get('/connections/:id', async (c) => {
    const conn = manager.getConnection(c.req.param('id'));
    if (!conn) return c.json({ error: 'Connection not found' }, 404);
    return c.json(conn);
  });

  /** Create a new database connection */
  router.post('/connections', async (c) => {
    const body = await c.req.json();
    const orgId = (c as any).get?.('orgId') || 'default';

    if (!body.name || !body.type) {
      return c.json({ error: 'name and type are required' }, 400);
    }

    const connection = await manager.createConnection(
      {
        orgId,
        name: body.name,
        type: body.type,
        host: body.host,
        port: body.port,
        database: body.database,
        username: body.username,
        ssl: body.ssl,
        sslRejectUnauthorized: body.sslRejectUnauthorized,
        sshTunnel: body.sshTunnel,
        pool: body.pool,
        queryLimits: body.queryLimits,
        schemaAccess: body.schemaAccess,
        description: body.description,
        tags: body.tags,
        status: 'inactive',
      },
      { password: body.password, connectionString: body.connectionString },
    );

    return c.json(connection, 201);
  });

  /** Update a database connection */
  router.put('/connections/:id', async (c) => {
    const body = await c.req.json();
    const updated = await manager.updateConnection(
      c.req.param('id'),
      body,
      { password: body.password, connectionString: body.connectionString },
    );
    if (!updated) return c.json({ error: 'Connection not found' }, 404);
    return c.json(updated);
  });

  /** Delete a database connection */
  router.delete('/connections/:id', async (c) => {
    const deleted = await manager.deleteConnection(c.req.param('id'));
    if (!deleted) return c.json({ error: 'Connection not found' }, 404);
    return c.json({ ok: true });
  });

  /** Test connection parameters before saving (no persistence) — must come before :id routes */
  router.post('/connections/test', async (c) => {
    const body = await c.req.json();
    if (!body.type) return c.json({ error: 'type is required' }, 400);
    const startMs = Date.now();
    try {
      const result = await manager.testConnectionParams({
        type: body.type,
        host: body.host,
        port: body.port,
        database: body.database,
        username: body.username,
        password: body.password,
        connectionString: body.connectionString,
        ssl: body.ssl,
      });
      return c.json(result);
    } catch (e: any) {
      return c.json({ success: false, latencyMs: Date.now() - startMs, error: e.message || 'Connection test failed' });
    }
  });

  /** Test an existing database connection */
  router.post('/connections/:id/test', async (c) => {
    const result = await manager.testConnection(c.req.param('id'));
    return c.json(result);
  });

  /** Get connection pool stats */
  router.get('/connections/:id/stats', async (c) => {
    const stats = manager.getPoolStats(c.req.param('id'));
    return c.json(stats);
  });

  // ─── Agent Access ──────────────────────────────────────────────────────────

  /** List all agents with access to a connection */
  router.get('/connections/:id/agents', async (c) => {
    const agents = manager.getConnectionAgents(c.req.param('id'));
    return c.json(agents);
  });

  /** Grant agent access to a connection */
  router.post('/connections/:id/agents', async (c) => {
    const body = await c.req.json();
    const orgId = (c as any).get?.('orgId') || 'default';

    if (!body.agentId) return c.json({ error: 'agentId is required' }, 400);

    const access = await manager.grantAccess({
      orgId,
      agentId: body.agentId,
      connectionId: c.req.param('id'),
      permissions: body.permissions || ['read'],
      queryLimits: body.queryLimits,
      schemaAccess: body.schemaAccess,
      logAllQueries: body.logAllQueries ?? false,
      requireApproval: body.requireApproval ?? false,
      enabled: true,
    });

    // Notify agent in real-time
    notifyAgentReload(body.agentId).catch(() => {});

    return c.json(access, 201);
  });

  /** Update agent access */
  router.put('/connections/:connId/agents/:agentId', async (c) => {
    const body = await c.req.json();
    const updated = await manager.updateAccess(c.req.param('agentId'), c.req.param('connId'), body);
    if (!updated) return c.json({ error: 'Access grant not found' }, 404);
    return c.json(updated);
  });

  /** Revoke agent access */
  router.delete('/connections/:connId/agents/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    await manager.revokeAccess(agentId, c.req.param('connId'));
    notifyAgentReload(agentId).catch(() => {});
    return c.json({ ok: true });
  });

  /** List all connections an agent has access to */
  router.get('/agents/:agentId/connections', async (c) => {
    const accessList = manager.getAgentAccess(c.req.param('agentId'));
    const result = accessList.map(a => ({
      ...a,
      connection: manager.getConnection(a.connectionId),
    }));
    return c.json(result);
  });

  // ─── Query Execution ──────────────────────────────────────────────────────

  /** Execute a query as an agent */
  router.post('/query', async (c) => {
    const body = await c.req.json();

    if (!body.connectionId || !body.agentId || !body.sql) {
      return c.json({ error: 'connectionId, agentId, and sql are required' }, 400);
    }

    const result = await manager.executeQuery({
      connectionId: body.connectionId,
      agentId: body.agentId,
      operation: body.operation || 'read',
      sql: body.sql,
      params: body.params,
    });

    return c.json(result, result.success ? 200 : 403);
  });

  // ─── Audit Log ─────────────────────────────────────────────────────────────

  /** Get audit log */
  router.get('/audit', async (c) => {
    const orgId = (c as any).get?.('orgId') || 'default';
    const agentId = c.req.query('agentId');
    const connectionId = c.req.query('connectionId');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');

    const logs = await manager.getAuditLog({ orgId, agentId, connectionId, limit, offset });
    return c.json(logs);
  });

  return router;
}

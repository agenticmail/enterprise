/**
 * Compliance Reporting Routes
 * Mounted at /compliance/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { ComplianceReporter } from './compliance.js';

export function createComplianceRoutes(compliance: ComplianceReporter) {
  const router = new Hono();

  router.post('/reports/soc2', async (c) => {
    try {
      const { orgId, dateRange } = await c.req.json();
      if (!orgId || !dateRange?.from || !dateRange?.to) return c.json({ error: 'orgId and dateRange.from/to required' }, 400);
      const generatedBy = c.req.header('X-User-Id') || 'admin';
      const report = await compliance.generateSOC2(orgId, dateRange, generatedBy);
      return c.json({ report }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/reports/gdpr', async (c) => {
    try {
      const { orgId, agentId } = await c.req.json();
      if (!orgId || !agentId) return c.json({ error: 'orgId and agentId required' }, 400);
      const generatedBy = c.req.header('X-User-Id') || 'admin';
      const report = await compliance.generateGDPR(orgId, agentId, generatedBy);
      return c.json({ report }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.post('/reports/audit', async (c) => {
    try {
      const { orgId, dateRange, agentIds } = await c.req.json();
      if (!orgId || !dateRange?.from || !dateRange?.to) return c.json({ error: 'orgId and dateRange.from/to required' }, 400);
      const generatedBy = c.req.header('X-User-Id') || 'admin';
      const report = await compliance.generateAudit(orgId, dateRange, generatedBy, agentIds);
      return c.json({ report }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/reports', (c) => {
    try {
      const reports = compliance.getReports({
        orgId: c.req.query('orgId') || undefined,
        type: c.req.query('type') || undefined,
        limit: parseInt(c.req.query('limit') || '50'),
      });
      return c.json({ reports, total: reports.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/reports/:id', (c) => {
    try {
      const report = compliance.getReport(c.req.param('id'));
      if (!report) return c.json({ error: 'Report not found' }, 404);
      return c.json({ report });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/reports/:id/download', (c) => {
    try {
      const report = compliance.getReport(c.req.param('id'));
      if (!report) return c.json({ error: 'Report not found' }, 404);

      const format = c.req.query('format') || report.format;
      if (format === 'csv') {
        const csv = compliance.toCSV(report);
        c.header('Content-Type', 'text/csv');
        c.header('Content-Disposition', `attachment; filename="${report.type}-${report.id}.csv"`);
        return c.body(csv);
      }

      c.header('Content-Type', 'application/json');
      c.header('Content-Disposition', `attachment; filename="${report.type}-${report.id}.json"`);
      return c.body(JSON.stringify(report.data, null, 2));
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}

/**
 * MCP Skill Adapter — Kubernetes
 *
 * Maps Kubernetes API endpoints to MCP tool handlers.
 * Covers pod listing, deployment listing, service listing, and pod log retrieval.
 *
 * The Kubernetes API server URL is dynamic, resolved from ctx.skillConfig.apiServer.
 * All tools use ctx.apiExecutor.request() with full URLs.
 *
 * Kubernetes API docs: https://kubernetes.io/docs/reference/kubernetes-api/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Kubernetes API server URL from skill config */
function k8sUrl(ctx: ToolExecutionContext): string {
  return (
    ctx.skillConfig.apiServer ||
    ctx.credentials.fields?.apiServer ||
    'https://kubernetes.default.svc'
  ).replace(/\/$/, '');
}

function k8sError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const status = data.status || '';
      const message = data.message || '';
      const reason = data.reason || '';
      const code = data.code || '';
      if (message) {
        return {
          content: `Kubernetes API error (${code} ${reason}): ${message}`,
          isError: true,
        };
      }
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

/** Format a Kubernetes resource's age from a creation timestamp */
function formatAge(creationTimestamp: string | undefined): string {
  if (!creationTimestamp) return 'unknown';
  const created = new Date(creationTimestamp).getTime();
  const now = Date.now();
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

// ─── Tool: k8s_list_pods ────────────────────────────────

const listPods: ToolHandler = {
  description:
    'List Kubernetes pods in a namespace. Returns pod names, statuses, restart counts, and ages.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace (default: "default"). Use "" for all namespaces.',
      },
      label_selector: {
        type: 'string',
        description: 'Filter pods by label selector (e.g. "app=nginx,tier=frontend")',
      },
      field_selector: {
        type: 'string',
        description: 'Filter pods by field selector (e.g. "status.phase=Running")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of pods to return',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = k8sUrl(ctx);
      const ns = params.namespace ?? 'default';
      const query: Record<string, string> = {};
      if (params.label_selector) query.labelSelector = params.label_selector;
      if (params.field_selector) query.fieldSelector = params.field_selector;
      if (params.limit) query.limit = String(params.limit);

      const path = ns === ''
        ? '/api/v1/pods'
        : `/api/v1/namespaces/${ns}/pods`;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}${path}`,
        query,
      });

      const pods: any[] = result.items || [];

      if (pods.length === 0) {
        const scope = ns ? `namespace "${ns}"` : 'all namespaces';
        return {
          content: `No pods found in ${scope}.`,
          metadata: { podCount: 0, namespace: ns || 'all' },
        };
      }

      const lines = pods.map((pod: any) => {
        const name = pod.metadata?.name || 'unknown';
        const podNs = pod.metadata?.namespace || 'default';
        const phase = pod.status?.phase || 'unknown';
        const age = formatAge(pod.metadata?.creationTimestamp);

        // Count restarts across all containers
        const containers: any[] = pod.status?.containerStatuses || [];
        const restarts = containers.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0);
        const ready = containers.filter((c: any) => c.ready).length;
        const total = containers.length;

        const nsPart = ns === '' ? ` [${podNs}]` : '';
        return `• ${name}${nsPart} — ${phase}, ready: ${ready}/${total}, restarts: ${restarts}, age: ${age}`;
      });

      const scope = ns ? `namespace "${ns}"` : 'all namespaces';

      return {
        content: `${pods.length} pod(s) in ${scope}:\n\n${lines.join('\n')}`,
        metadata: {
          podCount: pods.length,
          namespace: ns || 'all',
        },
      };
    } catch (err) {
      return k8sError(err);
    }
  },
};

// ─── Tool: k8s_list_deployments ─────────────────────────

const listDeployments: ToolHandler = {
  description:
    'List Kubernetes deployments in a namespace. Returns deployment names, replica counts, and conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace (default: "default"). Use "" for all namespaces.',
      },
      label_selector: {
        type: 'string',
        description: 'Filter deployments by label selector (e.g. "app=web")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of deployments to return',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = k8sUrl(ctx);
      const ns = params.namespace ?? 'default';
      const query: Record<string, string> = {};
      if (params.label_selector) query.labelSelector = params.label_selector;
      if (params.limit) query.limit = String(params.limit);

      const path = ns === ''
        ? '/apis/apps/v1/deployments'
        : `/apis/apps/v1/namespaces/${ns}/deployments`;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}${path}`,
        query,
      });

      const deployments: any[] = result.items || [];

      if (deployments.length === 0) {
        const scope = ns ? `namespace "${ns}"` : 'all namespaces';
        return {
          content: `No deployments found in ${scope}.`,
          metadata: { deploymentCount: 0, namespace: ns || 'all' },
        };
      }

      const lines = deployments.map((dep: any) => {
        const name = dep.metadata?.name || 'unknown';
        const depNs = dep.metadata?.namespace || 'default';
        const desired = dep.spec?.replicas ?? 0;
        const ready = dep.status?.readyReplicas ?? 0;
        const available = dep.status?.availableReplicas ?? 0;
        const updated = dep.status?.updatedReplicas ?? 0;
        const age = formatAge(dep.metadata?.creationTimestamp);

        const nsPart = ns === '' ? ` [${depNs}]` : '';
        return `• ${name}${nsPart} — ready: ${ready}/${desired}, up-to-date: ${updated}, available: ${available}, age: ${age}`;
      });

      const scope = ns ? `namespace "${ns}"` : 'all namespaces';

      return {
        content: `${deployments.length} deployment(s) in ${scope}:\n\n${lines.join('\n')}`,
        metadata: {
          deploymentCount: deployments.length,
          namespace: ns || 'all',
        },
      };
    } catch (err) {
      return k8sError(err);
    }
  },
};

// ─── Tool: k8s_list_services ────────────────────────────

const listServices: ToolHandler = {
  description:
    'List Kubernetes services in a namespace. Returns service names, types, cluster IPs, and ports.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace (default: "default"). Use "" for all namespaces.',
      },
      label_selector: {
        type: 'string',
        description: 'Filter services by label selector',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of services to return',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = k8sUrl(ctx);
      const ns = params.namespace ?? 'default';
      const query: Record<string, string> = {};
      if (params.label_selector) query.labelSelector = params.label_selector;
      if (params.limit) query.limit = String(params.limit);

      const path = ns === ''
        ? '/api/v1/services'
        : `/api/v1/namespaces/${ns}/services`;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}${path}`,
        query,
      });

      const services: any[] = result.items || [];

      if (services.length === 0) {
        const scope = ns ? `namespace "${ns}"` : 'all namespaces';
        return {
          content: `No services found in ${scope}.`,
          metadata: { serviceCount: 0, namespace: ns || 'all' },
        };
      }

      const lines = services.map((svc: any) => {
        const name = svc.metadata?.name || 'unknown';
        const svcNs = svc.metadata?.namespace || 'default';
        const type = svc.spec?.type || 'ClusterIP';
        const clusterIP = svc.spec?.clusterIP || 'None';
        const ports = (svc.spec?.ports || [])
          .map((p: any) => {
            const port = p.port || '';
            const target = p.targetPort || '';
            const protocol = p.protocol || 'TCP';
            const nodePort = p.nodePort ? `:${p.nodePort}` : '';
            return `${port}->${target}/${protocol}${nodePort}`;
          })
          .join(', ') || 'none';
        const externalIP = svc.status?.loadBalancer?.ingress?.[0]?.ip ||
          svc.status?.loadBalancer?.ingress?.[0]?.hostname || '';
        const externalPart = externalIP ? `, external: ${externalIP}` : '';
        const nsPart = ns === '' ? ` [${svcNs}]` : '';
        return `• ${name}${nsPart} — ${type}, IP: ${clusterIP}, ports: ${ports}${externalPart}`;
      });

      const scope = ns ? `namespace "${ns}"` : 'all namespaces';

      return {
        content: `${services.length} service(s) in ${scope}:\n\n${lines.join('\n')}`,
        metadata: {
          serviceCount: services.length,
          namespace: ns || 'all',
        },
      };
    } catch (err) {
      return k8sError(err);
    }
  },
};

// ─── Tool: k8s_get_pod_logs ─────────────────────────────

const getPodLogs: ToolHandler = {
  description:
    'Retrieve logs from a Kubernetes pod. Optionally specify a container, tail lines, or time range.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Pod name',
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace (default: "default")',
      },
      container: {
        type: 'string',
        description: 'Container name (required if pod has multiple containers)',
      },
      tail_lines: {
        type: 'number',
        description: 'Number of most recent log lines to return (default 100)',
      },
      since_seconds: {
        type: 'number',
        description: 'Only return logs from the last N seconds',
      },
      previous: {
        type: 'boolean',
        description: 'Return logs from the previously terminated container (default false)',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = k8sUrl(ctx);
      const ns = params.namespace ?? 'default';
      const query: Record<string, string> = {};

      if (params.container) query.container = params.container;
      if (params.tail_lines) query.tailLines = String(params.tail_lines);
      else query.tailLines = '100';
      if (params.since_seconds) query.sinceSeconds = String(params.since_seconds);
      if (params.previous) query.previous = 'true';

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/api/v1/namespaces/${ns}/pods/${params.name}/log`,
        query,
      });

      // Logs are returned as plain text
      const logs = typeof result === 'string' ? result : JSON.stringify(result);
      const lineCount = logs.split('\n').filter((l: string) => l.trim()).length;

      if (!logs || logs.trim() === '') {
        return {
          content: `No logs found for pod "${params.name}" in namespace "${ns}".`,
          metadata: { pod: params.name, namespace: ns, lineCount: 0 },
        };
      }

      const containerPart = params.container ? ` (container: ${params.container})` : '';

      return {
        content: `Logs for pod "${params.name}"${containerPart} in namespace "${ns}" (${lineCount} lines):\n\n${logs}`,
        metadata: {
          pod: params.name,
          namespace: ns,
          container: params.container || null,
          lineCount,
        },
      };
    } catch (err) {
      return k8sError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const kubernetesAdapter: SkillAdapter = {
  skillId: 'kubernetes-cluster',
  name: 'Kubernetes',
  // Base URL is dynamic from ctx.skillConfig.apiServer; tools use full URLs
  baseUrl: 'https://kubernetes.default.svc',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    k8s_list_pods: listPods,
    k8s_list_deployments: listDeployments,
    k8s_list_services: listServices,
    k8s_get_pod_logs: getPodLogs,
  },
  configSchema: {
    apiServer: {
      type: 'string' as const,
      label: 'Kubernetes API Server',
      description: 'The Kubernetes API server endpoint URL',
      required: true,
      placeholder: 'https://k8s-api.example.com:6443',
    },
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
};

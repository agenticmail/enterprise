/**
 * system_info — Get host system information.
 */
import { hostname, platform, arch, cpus, totalmem, freemem, uptime, homedir, userInfo } from 'node:os';
import type { ToolDefinition } from '../../types.js';

export function createSystemInfoTool(): ToolDefinition {
  return {
    name: 'system_info',
    description: 'Get host system info (OS, CPU, memory, uptime).',
    input_schema: { type: 'object' as const, properties: {} },
    execute: async () => {
      return {
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        cpuCount: cpus().length,
        cpuModel: cpus()[0]?.model || 'unknown',
        totalMemoryGB: +(totalmem() / 1073741824).toFixed(1),
        freeMemoryGB: +(freemem() / 1073741824).toFixed(1),
        uptimeHours: +(uptime() / 3600).toFixed(1),
        homeDir: homedir(),
        user: userInfo().username,
        cwd: process.cwd(),
        nodeVersion: process.version,
      };
    },
  };
}

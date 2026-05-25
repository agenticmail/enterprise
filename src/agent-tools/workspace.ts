/**
 * Canonical per-agent PERMANENT workspace.
 *
 * Every agent gets ONE durable folder that survives reboots and OS temp
 * cleanup. Agents must NEVER write to /tmp (os.tmpdir) — those files are
 * wiped by the OS and silently lost. All file/media/deliverable output
 * goes here, in a neat, predictable subfolder layout.
 *
 * Location (env-overridable, cross-platform):
 *   AGENTICMAIL_WORKSPACE_DIR  → base for all agent workspaces, OR
 *   ~/.agenticmail/workspaces/<agentId>/   (default)
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

/** Neat, predictable subfolders created inside every agent workspace. */
export const WORKSPACE_SUBDIRS: Record<string, string> = {
  media: 'Images, audio, video, and inbound/outbound message attachments',
  files: 'Documents and generated deliverables (reports, sheets, etc.)',
  templates: 'Reusable email / HTML / document templates',
  exports: 'Rendered final outputs (PDF, MP4, ZIP, etc.) ready to send',
  projects: 'Multi-file working projects (code, video projects, sites)',
  data: 'Local scratch databases and JSON/CSV working data',
  tmp: 'Scratch space — local & ephemeral, but NOT the OS /tmp (still under your workspace)',
};

/** Base dir that holds every agent's workspace. */
export function getWorkspaceBase(): string {
  return process.env.AGENTICMAIL_WORKSPACE_DIR
    || join(homedir(), '.agenticmail', 'workspaces');
}

/** Absolute path to an agent's permanent workspace root. */
export function getAgentWorkspaceDir(agentId: string): string {
  return join(getWorkspaceBase(), agentId || 'default');
}

/** Absolute path to a named subfolder inside an agent's workspace (created on demand). */
export function getAgentSubdir(agentId: string, name: string): string {
  const dir = join(getAgentWorkspaceDir(agentId), name);
  try { mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
  return dir;
}

/**
 * Create the agent's workspace + the neat subfolder layout, and (re)write a
 * WORKSPACE.md describing it. Idempotent and safe to call on every startup.
 * Returns the workspace root path.
 */
export function ensureAgentWorkspace(agentId: string, displayName?: string): string {
  const root = getAgentWorkspaceDir(agentId);
  try {
    mkdirSync(root, { recursive: true });
    for (const sub of Object.keys(WORKSPACE_SUBDIRS)) {
      mkdirSync(join(root, sub), { recursive: true });
    }
    const md = join(root, 'WORKSPACE.md');
    if (!existsSync(md)) writeFileSync(md, renderWorkspaceMarkdown(root, displayName));
  } catch { /* best-effort — never block startup on fs */ }
  return root;
}

/** The human/agent-readable description of the workspace layout — reused in AGENTS.md and memory. */
export function renderWorkspaceMarkdown(root: string, displayName?: string): string {
  const lines: string[] = [];
  lines.push(`# WORKSPACE.md — ${displayName ? displayName + "'s" : 'Your'} permanent workspace`);
  lines.push('');
  lines.push(`Your permanent working directory is:\n\n    ${root}\n`);
  lines.push('ALWAYS work from here. NEVER write to /tmp — OS temp files are wiped and lost.');
  lines.push('This folder persists across sessions, restarts, and reboots. Keep it tidy.');
  lines.push('');
  lines.push('## Folder layout');
  lines.push('');
  for (const [name, desc] of Object.entries(WORKSPACE_SUBDIRS)) {
    lines.push(`- \`${name}/\` — ${desc}`);
  }
  lines.push('');
  lines.push('Save email/HTML templates to `templates/`, attachments and images to `media/`,');
  lines.push('finished deliverables to `exports/`, and use `tmp/` (inside the workspace) for scratch.');
  return lines.join('\n') + '\n';
}

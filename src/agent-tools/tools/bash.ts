/**
 * AgenticMail Agent Tools — Bash
 *
 * Execute shell commands with timeout, output limiting, safety checks,
 * command sanitization, and environment variable protection.
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, textResult, errorResult } from '../common.js';
import type { CommandSanitizer } from '../security.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_OUTPUT_BYTES = 200_000;

/** Env vars stripped from child process when sandboxed */
var SENSITIVE_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'DATABASE_URL', 'DATABASE_PASSWORD', 'DB_PASSWORD',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_API_KEY',
  'GITHUB_TOKEN', 'GH_TOKEN',
  'NPM_TOKEN', 'NODE_AUTH_TOKEN',
  'FIRECRAWL_API_KEY', 'BRAVE_API_KEY',
  'PERPLEXITY_API_KEY', 'OPENROUTER_API_KEY', 'XAI_API_KEY',
  'SENDGRID_API_KEY', 'TWILIO_AUTH_TOKEN',
  'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET',
  'MASTER_KEY', 'ENCRYPTION_KEY', 'SECRET_KEY',
];

function truncateOutput(output: string, maxBytes: number): { text: string; truncated: boolean } {
  var bytes = Buffer.byteLength(output, 'utf-8');
  if (bytes <= maxBytes) return { text: output, truncated: false };
  var buf = Buffer.from(output, 'utf-8');
  var sliced = buf.subarray(0, maxBytes).toString('utf-8');
  return { text: sliced, truncated: true };
}

function buildSanitizedEnv(sandboxed: boolean): Record<string, string | undefined> {
  var env = { ...process.env, TERM: 'dumb' };
  if (sandboxed) {
    for (var key of SENSITIVE_ENV_VARS) {
      delete env[key];
    }
  }
  return env;
}

export function createBashTool(options?: ToolCreationOptions & { commandSanitizer?: CommandSanitizer }): AnyAgentTool {
  var bashConfig = options?.config?.bash;
  var sanitizer = options?.commandSanitizer;
  var sandboxed = options?.sandboxed ?? false;

  return {
    name: 'bash',
    label: 'Execute Command',
    description: 'Execute a bash command. Returns stdout, stderr, and exit code. Commands have a configurable timeout (default 2 minutes, max 10 minutes).',
    category: 'command',
    risk: 'high',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute.' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (max 600000).' },
        working_dir: { type: 'string', description: 'Working directory for the command.' },
      },
      required: ['command'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var command = readStringParam(params, 'command', { required: true });
      var timeoutRaw = readNumberParam(params, 'timeout', { integer: true });
      var workingDir = readStringParam(params, 'working_dir');

      if (bashConfig?.enabled === false) {
        return errorResult('Bash tool is disabled.');
      }

      // Command sanitizer enforcement
      if (sanitizer) {
        try {
          sanitizer.validate(command);
        } catch (err: any) {
          return errorResult('Command blocked: ' + (err.message || 'blocked by security policy'));
        }
      }

      // Check blocked commands from config
      if (bashConfig?.blockedCommands) {
        var cmdLower = command.toLowerCase().trim();
        for (var blocked of bashConfig.blockedCommands) {
          if (cmdLower.startsWith(blocked.toLowerCase())) {
            return errorResult('Command "' + blocked + '" is blocked by configuration.');
          }
        }
      }

      var timeoutMs = Math.min(
        timeoutRaw && timeoutRaw > 0 ? timeoutRaw : bashConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        MAX_TIMEOUT_MS,
      );

      var maxOutput = bashConfig?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
      var cwd = workingDir || options?.workspaceDir || process.cwd();
      var env = buildSanitizedEnv(sandboxed);

      return new Promise(function(resolve) {
        var child = exec(command, {
          cwd,
          timeout: timeoutMs,
          maxBuffer: maxOutput * 2,
          env,
          shell: '/bin/bash',
          killSignal: 'SIGTERM',
        }, function(error, stdout, stderr) {
          var exitCode = error?.code ?? (error ? 1 : 0);
          if (typeof exitCode === 'string') exitCode = 1;

          var outputParts: string[] = [];
          if (stdout) {
            var truncatedOut = truncateOutput(stdout, maxOutput);
            outputParts.push(truncatedOut.text);
            if (truncatedOut.truncated) outputParts.push('\n... (stdout truncated)');
          }
          if (stderr) {
            var truncatedErr = truncateOutput(stderr, Math.floor(maxOutput / 4));
            if (truncatedErr.text) {
              outputParts.push('\nSTDERR:\n' + truncatedErr.text);
              if (truncatedErr.truncated) outputParts.push('\n... (stderr truncated)');
            }
          }

          if (error && error.killed) {
            // Attempt to kill entire process group on timeout
            if (child.pid) {
              try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
            }
            resolve(errorResult('Command timed out after ' + timeoutMs + 'ms'));
            return;
          }

          var output = outputParts.join('');
          if (exitCode !== 0) {
            resolve(textResult(output + '\n\nExit code: ' + exitCode));
          } else {
            resolve(textResult(output || '(no output)'));
          }
        });
      });
    },
  };
}

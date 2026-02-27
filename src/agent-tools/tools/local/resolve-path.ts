/**
 * Shared path resolver with optional sandbox enforcement.
 */
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export function resolvePath(inputPath: string, sandbox?: string): string {
  var expanded = inputPath.startsWith('~') ? join(homedir(), inputPath.slice(1)) : inputPath;
  var resolved = resolve(expanded);

  if (sandbox) {
    var sandboxResolved = resolve(sandbox);
    if (!resolved.startsWith(sandboxResolved)) {
      throw new Error('Access denied: path is outside the allowed directory (' + sandbox + ')');
    }
  }
  return resolved;
}

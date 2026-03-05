/**
 * Resolve a native driver module using multiple strategies.
 * Works even when running from npx cache where ESM import() can't find
 * packages installed in cwd.
 */

import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export async function resolveDriver(name: string, errorMessage: string): Promise<any> {
  // 1. Standard ESM import
  try { return await import(name); } catch {}

  // 2. CJS require from this package's own directory (npm global install)
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const req = createRequire(join(__dirname, 'index.js'));
    return req(name);
  } catch {}

  // 3. CJS require from cwd (covers npm install in user's directory)
  try {
    const req = createRequire(join(process.cwd(), 'index.js'));
    return req(name);
  } catch {}

  // 4. CJS require from global prefix
  try {
    const { execSync } = await import('child_process');
    const globalPrefix = execSync('npm prefix -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const req = createRequire(join(globalPrefix, 'lib', 'node_modules', '.package-lock.json'));
    return req(name);
  } catch {}

  throw new Error(errorMessage);
}

/**
 * Database Adapter Proxy — Hot-Swap Support
 *
 * Creates a transparent JS Proxy wrapper around any DatabaseAdapter.
 * All method calls delegate to the current underlying adapter.
 * When swapped via __swap(), all existing references seamlessly
 * use the new adapter — no restart required.
 */

import type { DatabaseAdapter } from './adapter.js';

export interface DbProxy extends DatabaseAdapter {
  /** Swap the underlying adapter. Returns the previous one. */
  __swap(adapter: DatabaseAdapter): DatabaseAdapter;
  /** Access the current underlying adapter. */
  __target: DatabaseAdapter;
}

export function createDbProxy(initial: DatabaseAdapter): DbProxy {
  let target = initial;

  const proxy = new Proxy({} as any, {
    get(_, prop) {
      if (prop === '__swap') {
        return (newAdapter: DatabaseAdapter) => {
          const old = target;
          target = newAdapter;
          return old;
        };
      }
      if (prop === '__target') return target;

      const val = (target as any)[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });

  return proxy as DbProxy;
}

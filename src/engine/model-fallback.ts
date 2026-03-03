/**
 * Model Fallback / Backup Provider System
 *
 * Provides a chain of fallback models when the primary model fails.
 * Configurable per-org and per-agent. Tracks which models failed and
 * which backup was ultimately used.
 */

export interface ModelFallbackConfig {
  primary: string;               // e.g. 'openai/gpt-4o'
  fallbacks: string[];           // ordered fallback chain
  maxRetries: number;            // retries per model before moving to next
  retryDelayMs: number;          // delay between retries
  enabled: boolean;
}

export interface FallbackResult {
  modelUsed: string;
  wasFallback: boolean;
  attemptedModels: string[];
  failureReasons: Record<string, string>;
}

const DEFAULT_CONFIG: ModelFallbackConfig = {
  primary: '',
  fallbacks: [],
  maxRetries: 2,
  retryDelayMs: 1000,
  enabled: true,
};

/**
 * Build a model chain from agent/org config.
 * Checks agent-level fallbacks first, then org-level defaults.
 */
export function buildModelChain(
  agentConfig?: { model?: string; fallbackModels?: string[]; modelFallback?: ModelFallbackConfig },
  orgConfig?: { defaultModel?: string; fallbackModels?: string[]; modelFallback?: ModelFallbackConfig }
): ModelFallbackConfig {
  // Agent-level explicit config
  if (agentConfig?.modelFallback?.enabled !== false && agentConfig?.modelFallback) {
    return { ...DEFAULT_CONFIG, ...agentConfig.modelFallback };
  }

  const primary = (typeof agentConfig?.model === 'string' ? agentConfig.model : '')
    || orgConfig?.defaultModel || '';

  const fallbacks = agentConfig?.fallbackModels
    || orgConfig?.fallbackModels
    || orgConfig?.modelFallback?.fallbacks
    || [];

  return {
    ...DEFAULT_CONFIG,
    primary,
    fallbacks: fallbacks.filter(m => m !== primary),
  };
}

/**
 * Execute a function with model fallback.
 * Tries primary model, then each fallback in order.
 *
 * @param chain - The model fallback configuration
 * @param fn - Async function that takes a model name and executes
 * @returns The result + metadata about which model was used
 */
export async function withModelFallback<T>(
  chain: ModelFallbackConfig,
  fn: (model: string) => Promise<T>
): Promise<{ result: T } & FallbackResult> {
  const models = [chain.primary, ...chain.fallbacks].filter(Boolean);
  if (!models.length) throw new Error('No models configured');

  const failureReasons: Record<string, string> = {};
  const attemptedModels: string[] = [];

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    attemptedModels.push(model);

    for (let retry = 0; retry < chain.maxRetries; retry++) {
      try {
        const result = await fn(model);
        return {
          result,
          modelUsed: model,
          wasFallback: mi > 0,
          attemptedModels,
          failureReasons,
        };
      } catch (err: any) {
        const reason = err?.message || String(err);

        // Don't retry on auth errors or invalid model — move to next model immediately
        if (/auth|unauthorized|forbidden|invalid.*model|not.*found|does.*not.*exist/i.test(reason)) {
          failureReasons[model] = reason;
          break;
        }

        // Rate limit / overloaded — retry after delay
        if (/rate.?limit|overloaded|too.?many|429|503|capacity/i.test(reason)) {
          failureReasons[model] = reason;
          if (retry < chain.maxRetries - 1) {
            await sleep(chain.retryDelayMs * (retry + 1));
            continue;
          }
          break;
        }

        // Other errors — retry
        failureReasons[model] = reason;
        if (retry < chain.maxRetries - 1) {
          await sleep(chain.retryDelayMs);
        }
      }
    }
  }

  throw new ModelFallbackExhaustedError(
    `All models failed: ${models.join(', ')}`,
    attemptedModels,
    failureReasons
  );
}

export class ModelFallbackExhaustedError extends Error {
  attemptedModels: string[];
  failureReasons: Record<string, string>;

  constructor(message: string, attemptedModels: string[], failureReasons: Record<string, string>) {
    super(message);
    this.name = 'ModelFallbackExhaustedError';
    this.attemptedModels = attemptedModels;
    this.failureReasons = failureReasons;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

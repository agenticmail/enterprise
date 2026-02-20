/**
 * LLM Provider Registry
 *
 * Maps provider names to API types, base URLs, and env vars.
 * Supports 17 built-in providers + unlimited custom providers.
 *
 * API Types:
 *   - anthropic         — Anthropic Messages API (streaming)
 *   - openai-compatible  — OpenAI Chat Completions (DeepSeek, xAI, Mistral, Groq, etc.)
 *   - google            — Google Gemini REST API
 *   - ollama            — Ollama native /api/chat
 */

// ─── Types ───────────────────────────────────────────────

export type ApiType = 'anthropic' | 'openai-compatible' | 'google' | 'ollama';

export interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  apiType: ApiType;
  envKey: string;
  requiresApiKey: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  isLocal: boolean;
  defaultModels?: string[];
}

export interface CustomProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  apiType: ApiType;
  apiKeyEnvVar?: string;
  headers?: Record<string, string>;
  models?: Array<{ id: string; name: string; contextWindow?: number }>;
}

// ─── Built-in Provider Registry ─────────────────────────

export var PROVIDER_REGISTRY: Record<string, ProviderDef> = {
  anthropic: {
    id: 'anthropic', name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiType: 'anthropic', envKey: 'ANTHROPIC_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  },
  openai: {
    id: 'openai', name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiType: 'openai-compatible', envKey: 'OPENAI_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini'],
  },
  google: {
    id: 'google', name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiType: 'google', envKey: 'GOOGLE_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro'],
  },
  deepseek: {
    id: 'deepseek', name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiType: 'openai-compatible', envKey: 'DEEPSEEK_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-chat-v3'],
  },
  xai: {
    id: 'xai', name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    apiType: 'openai-compatible', envKey: 'XAI_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['grok-4', 'grok-4-fast', 'grok-3', 'grok-3-mini'],
  },
  mistral: {
    id: 'mistral', name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiType: 'openai-compatible', envKey: 'MISTRAL_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  },
  groq: {
    id: 'groq', name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiType: 'openai-compatible', envKey: 'GROQ_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
  },
  together: {
    id: 'together', name: 'Together',
    baseUrl: 'https://api.together.xyz/v1',
    apiType: 'openai-compatible', envKey: 'TOGETHER_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
  },
  fireworks: {
    id: 'fireworks', name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiType: 'openai-compatible', envKey: 'FIREWORKS_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],
  },
  moonshot: {
    id: 'moonshot', name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiType: 'openai-compatible', envKey: 'MOONSHOT_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['kimi-k2-0711'],
  },
  cerebras: {
    id: 'cerebras', name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiType: 'openai-compatible', envKey: 'CEREBRAS_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['llama-3.3-70b', 'llama-3.1-8b'],
  },
  openrouter: {
    id: 'openrouter', name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiType: 'openai-compatible', envKey: 'OPENROUTER_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro'],
  },
  nvidia: {
    id: 'nvidia', name: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiType: 'openai-compatible', envKey: 'NVIDIA_API_KEY',
    requiresApiKey: true, supportsTools: true, supportsStreaming: true, isLocal: false,
    defaultModels: ['nvidia/llama-3.1-nemotron-70b-instruct'],
  },
  ollama: {
    id: 'ollama', name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    apiType: 'ollama', envKey: 'OLLAMA_HOST',
    requiresApiKey: false, supportsTools: true, supportsStreaming: true, isLocal: true,
  },
  vllm: {
    id: 'vllm', name: 'vLLM',
    baseUrl: 'http://localhost:8000/v1',
    apiType: 'openai-compatible', envKey: 'VLLM_API_KEY',
    requiresApiKey: false, supportsTools: true, supportsStreaming: true, isLocal: true,
  },
  lmstudio: {
    id: 'lmstudio', name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    apiType: 'openai-compatible', envKey: '',
    requiresApiKey: false, supportsTools: false, supportsStreaming: true, isLocal: true,
  },
  litellm: {
    id: 'litellm', name: 'LiteLLM',
    baseUrl: 'http://localhost:4000/v1',
    apiType: 'openai-compatible', envKey: 'LITELLM_API_KEY',
    requiresApiKey: false, supportsTools: true, supportsStreaming: true, isLocal: true,
  },
};

// ─── Resolution Functions ────────────────────────────────

/**
 * Resolve a provider by name. Checks built-in registry first,
 * then custom providers from DB config.
 */
export function resolveProvider(
  providerName: string,
  customProviders?: CustomProviderDef[],
): ProviderDef | CustomProviderDef | null {
  if (PROVIDER_REGISTRY[providerName]) {
    return PROVIDER_REGISTRY[providerName];
  }
  if (customProviders) {
    var match = customProviders.find(function(p) { return p.id === providerName; });
    if (match) return match;
  }
  return null;
}

/** Get the API type for a provider (defaults to openai-compatible for unknown). */
export function getApiType(provider: ProviderDef | CustomProviderDef): ApiType {
  return provider.apiType;
}

/** Get the base URL for a provider. */
export function getBaseUrl(provider: ProviderDef | CustomProviderDef): string {
  return provider.baseUrl;
}

/**
 * Resolve API key for a provider. Priority:
 * 1. Explicit apiKeys config (passed to runtime)
 * 2. Environment variable from registry
 * 3. Empty string for local providers that don't need keys
 */
export function resolveApiKeyForProvider(
  providerName: string,
  apiKeys?: Record<string, string>,
  customProviders?: CustomProviderDef[],
): string | undefined {
  // 1. Explicit config
  if (apiKeys && apiKeys[providerName]) return apiKeys[providerName];

  // 2. Resolve provider definition
  var def = resolveProvider(providerName, customProviders);
  if (!def) return undefined;

  // 3. Env var lookup
  var envKey = 'envKey' in def ? (def as ProviderDef).envKey : (def as CustomProviderDef).apiKeyEnvVar;
  if (envKey && process.env[envKey]) return process.env[envKey];

  // 4. Local providers don't need keys
  var requiresKey = 'requiresApiKey' in def ? (def as ProviderDef).requiresApiKey : !!(def as CustomProviderDef).apiKeyEnvVar;
  if (!requiresKey) return '';

  return undefined;
}

/**
 * List all available providers (built-in + custom).
 */
export function listAllProviders(
  customProviders?: CustomProviderDef[],
): Array<ProviderDef | CustomProviderDef> {
  var all: Array<ProviderDef | CustomProviderDef> = Object.values(PROVIDER_REGISTRY);
  if (customProviders && customProviders.length > 0) {
    all = all.concat(customProviders);
  }
  return all;
}

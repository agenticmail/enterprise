/**
 * AgenticMail Agent Tools — Common Utilities
 *
 * Shared helpers for tool parameter reading, result formatting, etc.
 */

import type { ToolResult, AnyAgentTool } from './types.js';

/** Error thrown when tool input validation fails */
export class ToolInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export type StringParamOptions = {
  required?: boolean;
  trim?: boolean;
  label?: string;
  allowEmpty?: boolean;
};

// --- Parameter readers ---

export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions & { required: true },
): string;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options?: StringParamOptions,
): string | undefined;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions = {},
) {
  var { required = false, trim = true, label = key, allowEmpty = false } = options;
  var raw = params[key];
  if (typeof raw !== 'string') {
    if (required) throw new ToolInputError(label + ' required');
    return undefined;
  }
  var value = trim ? raw.trim() : raw;
  if (!value && !allowEmpty) {
    if (required) throw new ToolInputError(label + ' required');
    return undefined;
  }
  return value;
}

export function readNumberParam(
  params: Record<string, unknown>,
  key: string,
  options: { required?: boolean; label?: string; integer?: boolean } = {},
): number | undefined {
  var { required = false, label = key, integer = false } = options;
  var raw = params[key];
  var value: number | undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === 'string') {
    var trimmed = raw.trim();
    if (trimmed) {
      var parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) value = parsed;
    }
  }
  if (value === undefined) {
    if (required) throw new ToolInputError(label + ' required');
    return undefined;
  }
  return integer ? Math.trunc(value) : value;
}

export function readBooleanParam(
  params: Record<string, unknown>,
  key: string,
  defaultValue = false,
): boolean {
  var raw = params[key];
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

export function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions & { required: true },
): string[];
export function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
  options?: StringParamOptions,
): string[] | undefined;
export function readStringArrayParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions = {},
) {
  var { required = false, label = key } = options;
  var raw = params[key];
  if (Array.isArray(raw)) {
    var values = raw
      .filter(function(entry: unknown) { return typeof entry === 'string'; })
      .map(function(entry: string) { return entry.trim(); })
      .filter(Boolean);
    if (values.length === 0) {
      if (required) throw new ToolInputError(label + ' required');
      return undefined;
    }
    return values;
  }
  if (typeof raw === 'string') {
    var value = raw.trim();
    if (!value) {
      if (required) throw new ToolInputError(label + ' required');
      return undefined;
    }
    return [value];
  }
  if (required) throw new ToolInputError(label + ' required');
  return undefined;
}

// --- Result formatters ---

export function jsonResult(payload: unknown): ToolResult<unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export function textResult(text: string): ToolResult<unknown> {
  return {
    content: [{ type: 'text', text }],
  };
}

export function errorResult(message: string): ToolResult<unknown> {
  return {
    content: [{ type: 'text', text: 'Error: ' + message }],
    details: { error: message },
  };
}

export function imageResult(params: {
  label: string;
  base64: string;
  mimeType: string;
  extraText?: string;
}): ToolResult<unknown> {
  return {
    content: [
      { type: 'text', text: params.extraText ?? params.label },
      { type: 'image', data: params.base64, mimeType: params.mimeType },
    ],
  };
}

// --- Wrapping external content ---

export function wrapExternalContent(content: string, source: string): string {
  return '<external-content source="' + source + '">\n' + content + '\n</external-content>';
}

export function wrapWebContent(content: string, source = 'web'): string {
  return '<web-content source="' + source + '" untrusted="true">\n' + content + '\n</web-content>';
}

// --- Action gate ---

export type ActionGate<T extends Record<string, boolean | undefined>> = (
  key: keyof T,
  defaultValue?: boolean,
) => boolean;

export function createActionGate<T extends Record<string, boolean | undefined>>(
  actions: T | undefined,
): ActionGate<T> {
  return function(key, defaultValue) {
    if (defaultValue === undefined) defaultValue = true;
    var value = actions?.[key];
    if (value === undefined) return defaultValue;
    return value !== false;
  };
}

// --- Secret normalization ---

export function normalizeSecretInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  var trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';
  return trimmed;
}

// --- Secret redaction ---

var DEFAULT_REDACT_PATTERNS = [
  'apikey', 'api_key', 'secret', 'password', 'passwd', 'token',
  'credential', 'authorization', 'auth_token', 'access_key',
  'private_key', 'client_secret',
];

export function redactSecrets(
  params: Record<string, unknown>,
  additionalKeys?: string[],
): Record<string, unknown> {
  var patterns = DEFAULT_REDACT_PATTERNS;
  if (additionalKeys && additionalKeys.length > 0) {
    patterns = patterns.concat(additionalKeys.map(function(k) { return k.toLowerCase(); }));
  }
  var result: Record<string, unknown> = {};
  for (var key of Object.keys(params)) {
    var keyLower = key.toLowerCase();
    var shouldRedact = patterns.some(function(p) { return keyLower.includes(p); });
    if (shouldRedact && params[key] !== undefined && params[key] !== null) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = params[key];
    }
  }
  return result;
}

/**
 * AgenticMail Agent Tools — Enterprise HTTP
 *
 * HTTP client tools using global fetch. Supports standard requests,
 * GraphQL queries, parallel batch execution, and file downloads
 * with SSRF protection and configurable timeouts.
 */

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readStringArrayParam, textResult, jsonResult, errorResult } from '../common.js';

var MAX_RESPONSE_SIZE = 50 * 1024; // 50KB response body cap
var DEFAULT_TIMEOUT_MS = 30000;
var DEFAULT_MAX_DOWNLOAD_MB = 50;
var DEFAULT_BATCH_CONCURRENCY = 5;

function isPrivateUrl(url: string): boolean {
  try {
    var parsed = new URL(url);
    var hostname = parsed.hostname;

    // Reject common private/loopback addresses
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (hostname === '0.0.0.0' || hostname === '') return true;

    // Reject IPv4 private ranges
    var parts = hostname.split('.');
    if (parts.length === 4) {
      var first = parseInt(parts[0], 10);
      var second = parseInt(parts[1], 10);
      // 10.0.0.0/8
      if (first === 10) return true;
      // 172.16.0.0/12
      if (first === 172 && second >= 16 && second <= 31) return true;
      // 192.168.0.0/16
      if (first === 192 && second === 168) return true;
      // 127.0.0.0/8
      if (first === 127) return true;
      // 0.0.0.0/8
      if (first === 0) return true;
      // 169.254.0.0/16 (link-local)
      if (first === 169 && second === 254) return true;
    }

    // Reject IPv6 private ranges
    var lower = hostname.toLowerCase();
    if (lower.startsWith('[')) lower = lower.slice(1, -1);
    if (lower === '::1') return true;
    if (lower.startsWith('fc00:') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80:')) return true;

    // Reject file:// and other non-HTTP protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;

    return false;
  } catch {
    return true;
  }
}

function truncateBody(body: string, maxSize: number): string {
  if (body.length <= maxSize) return body;
  return body.slice(0, maxSize) + '\n...(truncated at ' + Math.round(maxSize / 1024) + 'KB)';
}

function parseHeaders(headersRaw: string | undefined): Record<string, string> | null {
  if (!headersRaw) return null;
  try {
    return JSON.parse(headersRaw) as Record<string, string>;
  } catch {
    return null;
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  var result: Record<string, string> = {};
  headers.forEach(function(value, key) {
    result[key] = value;
  });
  return result;
}

async function limitedConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<Array<PromiseSettledResult<T>>> {
  var results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  var index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      var current = index;
      index++;
      try {
        var value = await tasks[current]();
        results[current] = { status: 'fulfilled', value: value };
      } catch (err: any) {
        results[current] = { status: 'rejected', reason: err };
      }
    }
  }

  var workers: Promise<void>[] = [];
  for (var w = 0; w < Math.min(concurrency, tasks.length); w++) {
    workers.push(runNext());
  }
  await Promise.all(workers);
  return results;
}

export function createEnterpriseHttpTools(options?: ToolCreationOptions): AnyAgentTool[] {
  return [
    {
      name: 'ent_http_request',
      label: 'HTTP Request',
      description: 'Make an HTTP request to any URL. Supports GET, POST, PUT, PATCH, DELETE. Includes SSRF protection and timeout. Response body is truncated to 50KB.',
      category: 'web',
      risk: 'high',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to request.' },
          method: { type: 'string', description: 'HTTP method.', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          headers: { type: 'string', description: 'Optional JSON string of request headers.' },
          body: { type: 'string', description: 'Optional request body (string or JSON).' },
          timeout_ms: { type: 'number', description: 'Request timeout in milliseconds (default 30000).', default: 30000 },
        },
        required: ['url'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var url = readStringParam(params, 'url', { required: true });
          var method = readStringParam(params, 'method') || 'GET';
          var headersRaw = readStringParam(params, 'headers');
          var body = readStringParam(params, 'body', { trim: false });
          var timeoutMs = readNumberParam(params, 'timeout_ms', { integer: true }) ?? DEFAULT_TIMEOUT_MS;

          if (isPrivateUrl(url)) {
            return errorResult('SSRF protection: requests to private/internal addresses are blocked.');
          }

          var validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
          var upperMethod = method.toUpperCase();
          if (validMethods.indexOf(upperMethod) === -1) {
            return errorResult('Invalid method "' + method + '". Must be one of: ' + validMethods.join(', '));
          }

          var headers: Record<string, string> = {};
          if (headersRaw) {
            var parsed = parseHeaders(headersRaw);
            if (!parsed) return errorResult('Invalid headers JSON.');
            headers = parsed;
          }

          // Auto-detect JSON body
          if (body && !headers['Content-Type'] && !headers['content-type']) {
            try {
              JSON.parse(body);
              headers['Content-Type'] = 'application/json';
            } catch { /* not JSON, leave as-is */ }
          }

          var fetchOpts: RequestInit = {
            method: upperMethod,
            headers: headers,
            signal: AbortSignal.timeout(timeoutMs),
          };
          if (body && upperMethod !== 'GET') {
            fetchOpts.body = body;
          }

          var resp = await fetch(url, fetchOpts);
          var respBody = await resp.text();
          var contentType = resp.headers.get('content-type') || '';

          // Try to format JSON responses
          var formattedBody = respBody;
          if (contentType.includes('application/json')) {
            try {
              formattedBody = JSON.stringify(JSON.parse(respBody), null, 2);
            } catch { /* leave as-is */ }
          }

          return jsonResult({
            status: resp.status,
            statusText: resp.statusText,
            headers: headersToObject(resp.headers),
            body: truncateBody(formattedBody, MAX_RESPONSE_SIZE),
          });
        } catch (err: any) {
          if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return errorResult('Request timed out after ' + (readNumberParam(params, 'timeout_ms') ?? DEFAULT_TIMEOUT_MS) + 'ms.');
          }
          return errorResult(err.message || 'HTTP request failed.');
        }
      },
    },
    {
      name: 'ent_http_graphql',
      label: 'GraphQL Query',
      description: 'Execute a GraphQL query or mutation against a GraphQL endpoint. Returns the data and errors from the response.',
      category: 'web',
      risk: 'high',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'GraphQL endpoint URL.' },
          query: { type: 'string', description: 'GraphQL query or mutation string.' },
          variables: { type: 'string', description: 'Optional JSON string of query variables.' },
          headers: { type: 'string', description: 'Optional JSON string of request headers.' },
        },
        required: ['url', 'query'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var url = readStringParam(params, 'url', { required: true });
          var query = readStringParam(params, 'query', { required: true, trim: false });
          var variablesRaw = readStringParam(params, 'variables');
          var headersRaw = readStringParam(params, 'headers');

          if (isPrivateUrl(url)) {
            return errorResult('SSRF protection: requests to private/internal addresses are blocked.');
          }

          var variables: Record<string, unknown> | undefined;
          if (variablesRaw) {
            try {
              variables = JSON.parse(variablesRaw);
            } catch {
              return errorResult('Invalid variables JSON.');
            }
          }

          var headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (headersRaw) {
            var parsedHeaders = parseHeaders(headersRaw);
            if (!parsedHeaders) return errorResult('Invalid headers JSON.');
            Object.assign(headers, parsedHeaders);
          }

          var gqlBody: Record<string, unknown> = { query: query };
          if (variables) gqlBody.variables = variables;

          var resp = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(gqlBody),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
          });

          var respText = await resp.text();
          var respJson: Record<string, unknown>;
          try {
            respJson = JSON.parse(respText);
          } catch {
            return errorResult('GraphQL endpoint returned non-JSON response (status ' + resp.status + '): ' + truncateBody(respText, 1000));
          }

          return jsonResult({
            status: resp.status,
            data: respJson.data || null,
            errors: respJson.errors || null,
          });
        } catch (err: any) {
          if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return errorResult('GraphQL request timed out.');
          }
          return errorResult(err.message || 'GraphQL request failed.');
        }
      },
    },
    {
      name: 'ent_http_batch',
      label: 'Batch HTTP Requests',
      description: 'Execute multiple HTTP requests in parallel with configurable concurrency. Uses Promise.allSettled so individual failures do not block others.',
      category: 'web',
      risk: 'high',
      parameters: {
        type: 'object',
        properties: {
          requests: { type: 'string', description: 'JSON array of requests: [{url, method?, headers?, body?}].' },
          concurrency: { type: 'number', description: 'Maximum concurrent requests (default 5).', default: 5 },
        },
        required: ['requests'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var requestsRaw = readStringParam(params, 'requests', { required: true });
          var concurrency = readNumberParam(params, 'concurrency', { integer: true }) ?? DEFAULT_BATCH_CONCURRENCY;

          var requests: Array<{ url: string; method?: string; headers?: Record<string, string>; body?: string }>;
          try {
            requests = JSON.parse(requestsRaw);
          } catch {
            return errorResult('Invalid requests JSON. Expected: [{url, method?, headers?, body?}].');
          }

          if (!Array.isArray(requests) || requests.length === 0) {
            return errorResult('Requests must be a non-empty array.');
          }

          if (requests.length > 50) {
            return errorResult('Maximum 50 requests per batch.');
          }

          var tasks = requests.map(function(req, idx) {
            return async function() {
              if (isPrivateUrl(req.url)) {
                throw new Error('SSRF protection: private/internal URL blocked');
              }
              var fetchOpts: RequestInit = {
                method: (req.method || 'GET').toUpperCase(),
                headers: req.headers || {},
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
              };
              if (req.body && fetchOpts.method !== 'GET') {
                fetchOpts.body = req.body;
              }
              var resp = await fetch(req.url, fetchOpts);
              var body = await resp.text();
              return {
                index: idx,
                url: req.url,
                status: resp.status,
                body: truncateBody(body, 10000),
              };
            };
          });

          var settled = await limitedConcurrency(tasks, concurrency);

          var results = settled.map(function(result, idx) {
            if (result.status === 'fulfilled') {
              return result.value;
            }
            return {
              index: idx,
              url: requests[idx].url,
              error: result.reason?.message || 'Request failed',
            };
          });

          var successes = results.filter(function(r) { return !('error' in r); }).length;
          var failures = results.length - successes;

          return jsonResult({
            total: results.length,
            successes: successes,
            failures: failures,
            results: results,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Batch request failed.');
        }
      },
    },
    {
      name: 'ent_http_download',
      label: 'Download File',
      description: 'Download a file from a URL and save it to a local path. Checks content-length before downloading and enforces a maximum file size.',
      category: 'web',
      risk: 'high',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to download from.' },
          output_path: { type: 'string', description: 'Local file path to save the download.' },
          max_size_mb: { type: 'number', description: 'Maximum download size in MB (default 50).', default: 50 },
        },
        required: ['url', 'output_path'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var url = readStringParam(params, 'url', { required: true });
          var outputPath = readStringParam(params, 'output_path', { required: true });
          var maxSizeMb = readNumberParam(params, 'max_size_mb') ?? DEFAULT_MAX_DOWNLOAD_MB;

          if (isPrivateUrl(url)) {
            return errorResult('SSRF protection: requests to private/internal addresses are blocked.');
          }

          // Resolve relative paths
          if (!path.isAbsolute(outputPath) && options?.workspaceDir) {
            outputPath = path.resolve(options.workspaceDir, outputPath);
          }

          var maxBytes = maxSizeMb * 1024 * 1024;

          var resp = await fetch(url, {
            signal: AbortSignal.timeout(60000), // 60s timeout for downloads
          });

          if (!resp.ok) {
            return errorResult('Download failed with status ' + resp.status + ' ' + resp.statusText);
          }

          // Check content-length before downloading
          var contentLength = resp.headers.get('content-length');
          if (contentLength) {
            var declaredSize = parseInt(contentLength, 10);
            if (declaredSize > maxBytes) {
              return errorResult('File too large: ' + Math.round(declaredSize / 1024 / 1024) + 'MB. Maximum is ' + maxSizeMb + 'MB.');
            }
          }

          if (!resp.body) {
            return errorResult('No response body received.');
          }

          // Ensure output directory exists
          var dir = path.dirname(outputPath);
          await fs.mkdir(dir, { recursive: true });

          // Stream to file with size checking
          var totalBytes = 0;
          var writeStream = createWriteStream(outputPath);
          var reader = resp.body.getReader();
          var chunks: Uint8Array[] = [];

          try {
            while (true) {
              var readResult = await reader.read();
              if (readResult.done) break;
              var chunk = readResult.value;
              totalBytes = totalBytes + chunk.length;
              if (totalBytes > maxBytes) {
                writeStream.destroy();
                try { await fs.unlink(outputPath); } catch { /* ignore */ }
                return errorResult('Download exceeded maximum size of ' + maxSizeMb + 'MB. Aborted.');
              }
              chunks.push(chunk);
            }
          } finally {
            reader.releaseLock();
          }

          // Write all chunks
          for (var i = 0; i < chunks.length; i++) {
            writeStream.write(chunks[i]);
          }

          await new Promise<void>(function(resolve, reject) {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end();
          });

          var sizeMb = Math.round(totalBytes / 1024 / 1024 * 100) / 100;
          var sizeKb = Math.round(totalBytes / 1024 * 100) / 100;
          var sizeLabel = totalBytes > 1024 * 1024 ? sizeMb + 'MB' : sizeKb + 'KB';

          return jsonResult({
            success: true,
            path: outputPath,
            size: totalBytes,
            sizeFormatted: sizeLabel,
            contentType: resp.headers.get('content-type') || 'unknown',
          });
        } catch (err: any) {
          if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return errorResult('Download timed out.');
          }
          return errorResult(err.message || 'Download failed.');
        }
      },
    },
  ];
}

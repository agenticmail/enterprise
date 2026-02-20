/**
 * AWS Signature V4 — Lightweight Request Signer
 *
 * Implements the AWS Signature Version 4 signing process using only
 * Node's built-in crypto module. No AWS SDK dependency required.
 *
 * Reference:
 *   https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */

import { createHmac, createHash } from 'node:crypto';

// ─── Public Types ────────────────────────────────────────

export interface AwsSignatureInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  sessionToken?: string;
}

export interface AwsSignedRequest {
  url: string;
  headers: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────

/** SHA-256 hex digest of a string */
function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** HMAC-SHA256 returning raw bytes */
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** HMAC-SHA256 returning hex string */
function hmacSha256Hex(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/** Format a Date as YYYYMMDD'T'HHMMSS'Z' (ISO 8601 basic) */
function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Extract YYYYMMDD from an AMZ timestamp */
function toDateStamp(amzDate: string): string {
  return amzDate.slice(0, 8);
}

/**
 * URI-encode a string per AWS rules (RFC 3986, except '/' is encoded
 * unless the caller explicitly preserves it for path segments).
 */
function uriEncode(value: string, encodeSlash = true): string {
  let encoded = '';
  for (const ch of value) {
    if (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '_' ||
      ch === '-' ||
      ch === '~' ||
      ch === '.'
    ) {
      encoded += ch;
    } else if (ch === '/' && !encodeSlash) {
      encoded += ch;
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) {
        encoded += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
  }
  return encoded;
}

// ─── Signing Logic ───────────────────────────────────────

/**
 * Derive the signing key via the HMAC chain:
 *   HMAC(HMAC(HMAC(HMAC("AWS4" + secret, dateStamp), region), service), "aws4_request")
 */
function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

/**
 * Build the canonical query string from URL search params.
 * Parameters are sorted by key, then by value, and individually URI-encoded.
 */
function buildCanonicalQueryString(searchParams: URLSearchParams): string {
  const params: [string, string][] = [];
  searchParams.forEach((value, key) => {
    params.push([uriEncode(key), uriEncode(value)]);
  });
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return params.map(([k, v]) => `${k}=${v}`).join('&');
}

// ─── Main Export ─────────────────────────────────────────

/**
 * Sign an AWS HTTP request using Signature Version 4.
 *
 * Returns a new url (unchanged) and headers map that includes
 * the Authorization header, x-amz-date, x-amz-content-sha256,
 * and optionally x-amz-security-token.
 */
export function signAwsRequest(input: AwsSignatureInput): AwsSignedRequest {
  const {
    method,
    url,
    headers,
    body,
    accessKeyId,
    secretAccessKey,
    region,
    service,
    sessionToken,
  } = input;

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(amzDate);

  // Parse the URL to extract path and query
  const parsed = new URL(url);
  const canonicalUri = uriEncode(parsed.pathname || '/', false);
  const canonicalQueryString = buildCanonicalQueryString(parsed.searchParams);

  // Hash the payload
  const payloadHash = sha256(body ?? '');

  // Build working headers (lowercase keys for canonical form)
  const workingHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    workingHeaders[k.toLowerCase()] = v.trim();
  }
  workingHeaders['host'] = parsed.host;
  workingHeaders['x-amz-date'] = amzDate;
  workingHeaders['x-amz-content-sha256'] = payloadHash;
  if (sessionToken) {
    workingHeaders['x-amz-security-token'] = sessionToken;
  }

  // Sorted signed header keys
  const signedHeaderKeys = Object.keys(workingHeaders).sort();
  const signedHeaders = signedHeaderKeys.join(';');

  // Build canonical headers (each key:value\n, keys sorted)
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${workingHeaders[k]}`)
    .join('\n') + '\n';

  // Step 1: Canonical request
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Step 2: String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  // Step 3: Signing key
  const signingKey = deriveSigningKey(secretAccessKey, dateStamp, region, service);

  // Step 4: Signature
  const signature = hmacSha256Hex(signingKey, stringToSign);

  // Build the Authorization header
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  // Assemble final headers (preserve original casing from input + add signing headers)
  const finalHeaders: Record<string, string> = { ...headers };
  finalHeaders['Host'] = parsed.host;
  finalHeaders['X-Amz-Date'] = amzDate;
  finalHeaders['X-Amz-Content-Sha256'] = payloadHash;
  finalHeaders['Authorization'] = authorization;
  if (sessionToken) {
    finalHeaders['X-Amz-Security-Token'] = sessionToken;
  }

  return { url, headers: finalHeaders };
}

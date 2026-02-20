/**
 * AgenticMail Enterprise — IPv4 CIDR Matching Utilities
 *
 * Pure functions for parsing and matching IPs against CIDR ranges.
 * Used by the firewall middleware for IP access control and trusted proxy validation.
 */

/** Parsed CIDR with pre-computed numeric values for fast matching. */
export interface ParsedCidr {
  network: number;
  mask: number;
  original: string;
}

/**
 * Convert an IPv4 address string to a 32-bit unsigned integer.
 * Handles IPv4-mapped IPv6 (::ffff:x.x.x.x).
 * Returns null for invalid or non-IPv4 addresses.
 */
export function ipToNumber(ip: string): number | null {
  if (!ip) return null;
  // Strip IPv4-mapped IPv6 prefix
  let cleaned = ip.trim();
  if (cleaned.startsWith('::ffff:')) cleaned = cleaned.slice(7);
  // Must be IPv4 dotted-quad
  const parts = cleaned.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0; // Ensure unsigned
}

/**
 * Parse a CIDR string (e.g., "10.0.0.0/8") into a pre-computed matcher.
 * Plain IPs (e.g., "192.168.1.1") are treated as /32.
 * Returns null for invalid input.
 */
export function parseCidr(cidr: string): ParsedCidr | null {
  if (!cidr) return null;
  const trimmed = cidr.trim();
  const slashIdx = trimmed.indexOf('/');
  let ip: string;
  let prefix: number;

  if (slashIdx === -1) {
    ip = trimmed;
    prefix = 32;
  } else {
    ip = trimmed.slice(0, slashIdx);
    prefix = parseInt(trimmed.slice(slashIdx + 1), 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  }

  const num = ipToNumber(ip);
  if (num === null) return null;

  // Build the mask: prefix=8 → 0xFF000000, prefix=32 → 0xFFFFFFFF, prefix=0 → 0x00000000
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (num & mask) >>> 0;

  return { network, mask, original: trimmed };
}

/**
 * Test whether an IP address matches a parsed CIDR range.
 */
export function ipMatchesCidr(ip: string, cidr: ParsedCidr): boolean {
  const num = ipToNumber(ip);
  if (num === null) return false;
  return ((num & cidr.mask) >>> 0) === cidr.network;
}

/**
 * Compile a list of IP/CIDR strings into a fast matcher function.
 * Pre-parses all entries so per-request matching is O(n) comparisons with no parsing.
 * Invalid entries are silently skipped.
 */
export function compileIpMatcher(entries: string[]): (ip: string) => boolean {
  const parsed: ParsedCidr[] = [];
  for (const entry of entries) {
    const p = parseCidr(entry);
    if (p) parsed.push(p);
  }
  if (parsed.length === 0) return () => false;

  return function matchIp(ip: string): boolean {
    const num = ipToNumber(ip);
    if (num === null) return false;
    for (let i = 0; i < parsed.length; i++) {
      if (((num & parsed[i].mask) >>> 0) === parsed[i].network) return true;
    }
    return false;
  };
}

/**
 * Validate that a string is a valid IPv4 address or CIDR notation.
 */
export function isValidIpOrCidr(str: string): boolean {
  return parseCidr(str) !== null;
}

/**
 * Match a hostname against a pattern that may include wildcards.
 * Supports: "*.example.com" matching "api.example.com", "sub.api.example.com"
 * Exact match: "example.com" only matches "example.com"
 */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  if (!host || !pattern) return false;
  const h = host.toLowerCase().trim();
  const p = pattern.toLowerCase().trim();
  if (p === h) return true;
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".example.com"
    return h.endsWith(suffix) || h === p.slice(2);
  }
  return false;
}

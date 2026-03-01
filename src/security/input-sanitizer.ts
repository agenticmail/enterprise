/**
 * Input Validation and Sanitization
 * 
 * Comprehensive input sanitization including HTML, scripts, path traversal,
 * command injection, JSON depth, and Unicode normalization.
 */

export interface SanitizationResult {
  sanitized: string;
  violations: string[];
  blocked: boolean;
  originalLength: number;
  sanitizedLength: number;
}

export interface ValidationOptions {
  maxLength?: number;
  maxJsonDepth?: number;
  stripHtml?: boolean;
  blockScripts?: boolean;
  sanitizeUnicode?: boolean;
  allowedHtmlTags?: string[];
  allowedHtmlAttributes?: string[];
}

/**
 * Default validation options
 */
const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  maxLength: 100000,
  maxJsonDepth: 20,
  stripHtml: false,
  blockScripts: true,
  sanitizeUnicode: true,
  allowedHtmlTags: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  allowedHtmlAttributes: ['class', 'id', 'style']
};

/**
 * Path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\/+/g,
  /\.\.\\/g,
  /%2e%2e%2f/gi,
  /%2e%2e%5c/gi,
  /\.\.%2f/gi,
  /\.\.%5c/gi,
  /%252e%252e%252f/gi,
  /\x2e\x2e\x2f/g,
  /\x2e\x2e\x5c/g
];

/**
 * Command injection patterns
 */
const COMMAND_INJECTION_PATTERNS = [
  /[\|;&$`\n]/,
  /&&/,
  /\|\|/,
  /`[^`]*`/,
  /\$\([^)]*\)/,
  /\$\{[^}]*\}/,
  /\s*;\s*(rm|del|format|mkfs|dd)\s+/i,
  /\s*\|\s*(nc|netcat|telnet|ssh)\s+/i,
  /\s*&&\s*(wget|curl|nc)\s+/i
];

/**
 * Script detection patterns
 */
const SCRIPT_PATTERNS = [
  /<script[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?<\/iframe>/gi,
  /<object[\s\S]*?<\/object>/gi,
  /<embed[\s\S]*?>/gi,
  /<applet[\s\S]*?<\/applet>/gi,
  /<form[\s\S]*?<\/form>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi
];

/**
 * Dangerous HTML attributes
 */
const DANGEROUS_ATTRIBUTES = [
  'onload', 'onclick', 'onmouseover', 'onmouseout', 'onkeypress', 'onkeydown',
  'onkeyup', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
  'onselect', 'onresize', 'onunload', 'onerror', 'onabort', 'oncanplay',
  'oncanplaythrough', 'oncuechange', 'ondurationchange', 'onemptied',
  'onended', 'onloadeddata', 'onloadedmetadata', 'onloadstart',
  'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange',
  'onseeked', 'onseeking', 'onstalled', 'onsuspend', 'ontimeupdate',
  'onvolumechange', 'onwaiting', 'src', 'href'
];

/**
 * Validate input length
 */
function validateLength(input: string, maxLength: number): string[] {
  const violations: string[] = [];
  
  if (input.length > maxLength) {
    violations.push(`input_too_long:${input.length}>${maxLength}`);
  }

  // Check for excessive repetition (potential DoS)
  const repetitionCheck = /(.{10,})\1{5,}/;
  if (repetitionCheck.test(input)) {
    violations.push('excessive_repetition');
  }

  return violations;
}

/**
 * Validate JSON depth
 */
function validateJsonDepth(input: string, maxDepth: number): string[] {
  const violations: string[] = [];

  try {
    const parsed = JSON.parse(input);
    const depth = getObjectDepth(parsed);
    
    if (depth > maxDepth) {
      violations.push(`json_too_deep:${depth}>${maxDepth}`);
    }
  } catch {
    // Not JSON, skip depth check
  }

  return violations;
}

/**
 * Get object nesting depth
 */
function getObjectDepth(obj: any, currentDepth = 0): number {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth;
  }

  if (Array.isArray(obj)) {
    return Math.max(currentDepth, ...obj.map(item => getObjectDepth(item, currentDepth + 1)));
  }

  const depths = Object.values(obj).map(value => getObjectDepth(value, currentDepth + 1));
  return Math.max(currentDepth, ...depths);
}

/**
 * Detect path traversal attempts
 */
function detectPathTraversal(input: string): string[] {
  const violations: string[] = [];

  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(input)) {
      violations.push('path_traversal');
      break;
    }
  }

  return violations;
}

/**
 * Detect command injection attempts
 */
function detectCommandInjection(input: string): string[] {
  const violations: string[] = [];

  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      violations.push('command_injection');
      break;
    }
  }

  // Additional checks for common shell commands
  const dangerousCommands = [
    'rm', 'del', 'format', 'fdisk', 'mkfs', 'dd', 'nc', 'netcat', 
    'telnet', 'ssh', 'ftp', 'wget', 'curl', 'ping', 'nslookup',
    'sudo', 'su', 'chmod', 'chown', 'passwd', 'useradd', 'userdel'
  ];

  const words = input.toLowerCase().split(/\s+/);
  for (const cmd of dangerousCommands) {
    if (words.includes(cmd)) {
      violations.push(`dangerous_command:${cmd}`);
    }
  }

  return violations;
}

/**
 * Detect and sanitize HTML
 */
function sanitizeHtml(
  input: string, 
  stripHtml: boolean, 
  blockScripts: boolean,
  allowedTags: string[],
  allowedAttributes: string[]
): { sanitized: string; violations: string[] } {
  const violations: string[] = [];
  let sanitized = input;

  // First check for script tags
  if (blockScripts) {
    for (const pattern of SCRIPT_PATTERNS) {
      if (pattern.test(sanitized)) {
        violations.push('script_detected');
        sanitized = sanitized.replace(pattern, '[SCRIPT_REMOVED]');
      }
    }
  }

  // Remove dangerous attributes
  for (const attr of DANGEROUS_ATTRIBUTES) {
    const attrPattern = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
    if (attrPattern.test(sanitized)) {
      violations.push(`dangerous_attribute:${attr}`);
      sanitized = sanitized.replace(attrPattern, '');
    }
  }

  if (stripHtml) {
    // Remove all HTML tags except allowed ones
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/gi;
    const matches = sanitized.match(tagPattern) || [];
    
    for (const match of matches) {
      const tagMatch = match.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/i);
      const tagName = tagMatch?.[1]?.toLowerCase();
      
      if (tagName && !allowedTags.includes(tagName)) {
        violations.push(`html_tag_removed:${tagName}`);
        sanitized = sanitized.replace(match, '');
      }
    }
  }

  // Remove null bytes
  if (sanitized.includes('\0')) {
    violations.push('null_bytes');
    sanitized = sanitized.replace(/\0/g, '');
  }

  return { sanitized, violations };
}

/**
 * Sanitize Unicode characters
 */
function sanitizeUnicode(input: string): { sanitized: string; violations: string[] } {
  const violations: string[] = [];
  let sanitized = input;

  // Normalize Unicode (NFKC - canonical decomposition + canonical composition + compatibility)
  try {
    const normalized = sanitized.normalize('NFKC');
    if (normalized !== sanitized) {
      violations.push('unicode_normalized');
      sanitized = normalized;
    }
  } catch (error) {
    violations.push('unicode_normalization_error');
  }

  // Remove or replace problematic Unicode characters
  const problematicChars = [
    '\u200B', // Zero-width space
    '\u200C', // Zero-width non-joiner
    '\u200D', // Zero-width joiner
    '\u2060', // Word joiner
    '\uFEFF', // Zero-width no-break space (BOM)
    '\u034F'  // Combining grapheme joiner
  ];

  for (const char of problematicChars) {
    if (sanitized.includes(char)) {
      violations.push('problematic_unicode');
      sanitized = sanitized.replace(new RegExp(char, 'g'), '');
    }
  }

  // Check for homoglyph attacks (basic detection)
  const homoglyphs = /[а-я]/gi; // Cyrillic letters that look like Latin
  if (homoglyphs.test(sanitized)) {
    violations.push('potential_homoglyphs');
  }

  // Remove control characters (except common whitespace)
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  if (controlChars.test(sanitized)) {
    violations.push('control_characters');
    sanitized = sanitized.replace(controlChars, '');
  }

  return { sanitized, violations };
}

/**
 * Detect LDAP injection attempts
 */
function detectLdapInjection(input: string): string[] {
  const violations: string[] = [];

  const ldapPatterns = [
    /\(\s*\|\s*\(/,
    /\(\s*&\s*\(/,
    /\*\s*\)/,
    /\)\s*\(\s*\|/,
    /\)\s*\(\s*&/,
    /\(\s*objectClass\s*=\s*\*\s*\)/i,
    /\(\s*cn\s*=\s*\*\s*\)/i
  ];

  for (const pattern of ldapPatterns) {
    if (pattern.test(input)) {
      violations.push('ldap_injection');
      break;
    }
  }

  return violations;
}

/**
 * Detect XML/XXE injection attempts
 */
function detectXmlInjection(input: string): string[] {
  const violations: string[] = [];

  const xmlPatterns = [
    /<!ENTITY/i,
    /<!DOCTYPE/i,
    /SYSTEM\s+"[^"]*"/i,
    /<\?xml/i
  ];

  for (const pattern of xmlPatterns) {
    if (pattern.test(input)) {
      violations.push('xml_injection');
      break;
    }
  }

  return violations;
}

/**
 * Main input sanitization function
 */
export function sanitizeInput(
  input: string,
  options: ValidationOptions = {}
): SanitizationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const violations: string[] = [];
  const originalLength = input.length;
  let sanitized = input;

  // Length validation
  violations.push(...validateLength(input, opts.maxLength));

  // JSON depth validation
  violations.push(...validateJsonDepth(input, opts.maxJsonDepth));

  // Path traversal detection
  violations.push(...detectPathTraversal(sanitized));

  // Command injection detection
  violations.push(...detectCommandInjection(sanitized));

  // LDAP injection detection
  violations.push(...detectLdapInjection(sanitized));

  // XML injection detection
  violations.push(...detectXmlInjection(sanitized));

  // HTML sanitization
  const htmlResult = sanitizeHtml(
    sanitized,
    opts.stripHtml,
    opts.blockScripts,
    opts.allowedHtmlTags,
    opts.allowedHtmlAttributes
  );
  sanitized = htmlResult.sanitized;
  violations.push(...htmlResult.violations);

  // Unicode sanitization
  if (opts.sanitizeUnicode) {
    const unicodeResult = sanitizeUnicode(sanitized);
    sanitized = unicodeResult.sanitized;
    violations.push(...unicodeResult.violations);
  }

  // Determine if input should be blocked
  const blockingViolations = [
    'script_detected',
    'command_injection',
    'path_traversal',
    'input_too_long',
    'json_too_deep',
    'xml_injection'
  ];

  const blocked = violations.some(v => 
    blockingViolations.some(bv => v.startsWith(bv))
  );

  return {
    sanitized,
    violations: [...new Set(violations)], // Remove duplicates
    blocked,
    originalLength,
    sanitizedLength: sanitized.length
  };
}

/**
 * Batch sanitize multiple inputs
 */
export function sanitizeBatch(
  inputs: Array<{ key: string; value: string; options?: ValidationOptions }>
): Array<{ key: string; result: SanitizationResult }> {
  return inputs.map(input => ({
    key: input.key,
    result: sanitizeInput(input.value, input.options)
  }));
}

/**
 * Quick validation without full sanitization
 */
export function validateInput(
  input: string,
  options: ValidationOptions = {}
): { valid: boolean; violations: string[] } {
  const result = sanitizeInput(input, options);
  return {
    valid: !result.blocked,
    violations: result.violations
  };
}
/**
 * AgenticMail Agent Tools — Enterprise Security Scan
 *
 * Regex and pattern-based security scanning tools for detecting
 * leaked secrets, PII, dependency vulnerabilities, and compliance issues.
 * Uses Node.js built-ins (fs, readline, crypto) for all operations.
 */

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readBooleanParam, readStringArrayParam, jsonResult, textResult, errorResult } from '../common.js';

type SecretPattern = { name: string; regex: RegExp };
type PiiPattern = { name: string; regex: RegExp; validate?: (m: string) => boolean };
type Finding = { file: string; line: number; pattern: string; redacted: string };
type PiiFinding = { file: string; line: number; type: string; redacted: string };

var SECRET_PATTERNS: SecretPattern[] = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token', regex: /gh[pos]_[A-Za-z0-9_]{36,255}/g },
  { name: 'Slack Token', regex: /xox[bp]-[0-9a-zA-Z\-]{10,250}/g },
  { name: 'Generic API Key (assignment)', regex: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'Base64 Password', regex: /(?:password|passwd)\s*[=:]\s*['"]?[A-Za-z0-9+/=]{8,}['"]?/gi },
  { name: 'Connection String (PostgreSQL)', regex: /postgresql:\/\/[^\s'"]+/gi },
  { name: 'Connection String (MySQL)', regex: /mysql:\/\/[^\s'"]+/gi },
  { name: 'Connection String (MongoDB)', regex: /mongodb(?:\+srv)?:\/\/[^\s'"]+/gi },
  { name: 'Stripe Secret Key', regex: /sk_live_[A-Za-z0-9]{20,}/g },
  { name: 'Stripe Publishable Key', regex: /pk_live_[A-Za-z0-9]{20,}/g },
];

var PII_PATTERNS: PiiPattern[] = [
  { name: 'email', regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { name: 'phone', regex: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    name: 'credit_card',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: function(match: string) {
      var digits = match.replace(/[\s-]/g, '');
      if (!/^\d{13,19}$/.test(digits)) return false;
      // Luhn validation
      var sum = 0;
      var alt = false;
      for (var i = digits.length - 1; i >= 0; i--) {
        var n = parseInt(digits[i], 10);
        if (alt) {
          n *= 2;
          if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
      }
      return sum % 10 === 0;
    },
  },
  { name: 'ip', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
];

var DEPRECATED_PACKAGES = new Set([
  'request', 'moment', 'node-uuid', 'nomnom', 'istanbul',
  'jade', 'consolidate', 'github', 'native-promise-only',
  'left-pad', 'underscore.string', 'coffee-script',
]);

function redactMatch(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

async function collectScanFiles(target: string, recursive: boolean): Promise<string[]> {
  var stat = await fs.stat(target);
  if (stat.isFile()) return [target];
  if (!stat.isDirectory()) return [];
  var results: string[] = [];

  async function walk(dir: string) {
    var entries = await fs.readdir(dir, { withFileTypes: true });
    for (var entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      var full = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        await walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }

  await walk(target);
  return results;
}

async function scanFileLines(filePath: string, callback: (line: string, lineNum: number) => void): Promise<void> {
  var stream = createReadStream(filePath, { encoding: 'utf-8' });
  var rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  var lineNum = 0;
  for await (var line of rl) {
    lineNum++;
    callback(line, lineNum);
  }
}

export function createSecurityScanTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var entSecScanSecrets: AnyAgentTool = {
    name: 'ent_sec_scan_secrets',
    label: 'Scan for Leaked Secrets',
    description: 'Scan file(s) for leaked secrets such as AWS keys, GitHub tokens, Slack tokens, API keys, private keys, JWTs, connection strings, and Stripe keys. Returns file, line number, pattern matched, and redacted value.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to scan.' },
        recursive: { type: 'string', description: 'Scan subdirectories recursively (default true).' },
      },
      required: ['path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var targetPath = readStringParam(params, 'path', { required: true });
      var recursive = readBooleanParam(params, 'recursive', true);

      if (!path.isAbsolute(targetPath) && options?.workspaceDir) {
        targetPath = path.resolve(options.workspaceDir, targetPath);
      }

      try {
        var files = await collectScanFiles(targetPath, recursive);
        var findings: Finding[] = [];

        for (var file of files) {
          try {
            await scanFileLines(file, function(line, lineNum) {
              for (var pattern of SECRET_PATTERNS) {
                pattern.regex.lastIndex = 0;
                var match: RegExpExecArray | null;
                while ((match = pattern.regex.exec(line)) !== null) {
                  findings.push({
                    file: file,
                    line: lineNum,
                    pattern: pattern.name,
                    redacted: redactMatch(match[0]),
                  });
                }
              }
            });
          } catch { /* skip unreadable files */ }
        }

        if (findings.length === 0) {
          return textResult('No secrets detected in ' + files.length + ' file(s) scanned.');
        }

        return jsonResult({
          filesScanned: files.length,
          totalFindings: findings.length,
          findings: findings,
        });
      } catch (err: any) {
        return errorResult('Secret scan failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSecScanPii: AnyAgentTool = {
    name: 'ent_sec_scan_pii',
    label: 'Scan for PII',
    description: 'Scan file(s) for personally identifiable information: email addresses, phone numbers, SSNs, credit card numbers (with Luhn validation), and IP addresses. Returns findings with location.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to scan.' },
        types: { type: 'string', description: 'Comma-separated PII types to detect: email, phone, ssn, credit_card, ip, all (default all).' },
      },
      required: ['path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var targetPath = readStringParam(params, 'path', { required: true });
      var typesRaw = readStringParam(params, 'types') || 'all';

      if (!path.isAbsolute(targetPath) && options?.workspaceDir) {
        targetPath = path.resolve(options.workspaceDir, targetPath);
      }

      var allowedTypes = typesRaw === 'all'
        ? null
        : typesRaw.split(',').map(function(t) { return t.trim().toLowerCase(); });

      var activePatterns = PII_PATTERNS.filter(function(p) {
        return !allowedTypes || allowedTypes.indexOf(p.name) !== -1;
      });

      try {
        var files = await collectScanFiles(targetPath, true);
        var findings: PiiFinding[] = [];

        for (var file of files) {
          try {
            await scanFileLines(file, function(line, lineNum) {
              for (var pattern of activePatterns) {
                pattern.regex.lastIndex = 0;
                var match: RegExpExecArray | null;
                while ((match = pattern.regex.exec(line)) !== null) {
                  if (pattern.validate && !pattern.validate(match[0])) continue;
                  findings.push({
                    file: file,
                    line: lineNum,
                    type: pattern.name,
                    redacted: redactMatch(match[0]),
                  });
                }
              }
            });
          } catch { /* skip unreadable files */ }
        }

        if (findings.length === 0) {
          return textResult('No PII detected in ' + files.length + ' file(s) scanned.');
        }

        return jsonResult({
          filesScanned: files.length,
          totalFindings: findings.length,
          findings: findings,
        });
      } catch (err: any) {
        return errorResult('PII scan failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSecRedactPii: AnyAgentTool = {
    name: 'ent_sec_redact_pii',
    label: 'Redact PII',
    description: 'Redact personally identifiable information from a file. Replaces matches with [REDACTED:type] placeholders. Returns count of redactions made.',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to redact.' },
        output_path: { type: 'string', description: 'Output file path. If omitted, overwrites the original file.' },
        types: { type: 'string', description: 'Comma-separated PII types: email, phone, ssn, credit_card, ip, all (default all).' },
      },
      required: ['file_path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var filePath = readStringParam(params, 'file_path', { required: true });
      var outputPath = readStringParam(params, 'output_path');
      var typesRaw = readStringParam(params, 'types') || 'all';

      if (!path.isAbsolute(filePath) && options?.workspaceDir) {
        filePath = path.resolve(options.workspaceDir, filePath);
      }
      if (outputPath && !path.isAbsolute(outputPath) && options?.workspaceDir) {
        outputPath = path.resolve(options.workspaceDir, outputPath);
      }

      var allowedTypes = typesRaw === 'all'
        ? null
        : typesRaw.split(',').map(function(t) { return t.trim().toLowerCase(); });

      var activePatterns = PII_PATTERNS.filter(function(p) {
        return !allowedTypes || allowedTypes.indexOf(p.name) !== -1;
      });

      try {
        var content = await fs.readFile(filePath, 'utf-8');
        var redactionCount = 0;

        for (var pattern of activePatterns) {
          content = content.replace(pattern.regex, function(match) {
            if (pattern.validate && !pattern.validate(match)) return match;
            redactionCount++;
            return '[REDACTED:' + pattern.name + ']';
          });
        }

        var dest = outputPath || filePath;
        await fs.writeFile(dest, content, 'utf-8');

        return jsonResult({
          file: dest,
          redactions: redactionCount,
          message: redactionCount > 0
            ? 'Redacted ' + redactionCount + ' PII occurrence(s).'
            : 'No PII found to redact.',
        });
      } catch (err: any) {
        return errorResult('Redaction failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSecScanDeps: AnyAgentTool = {
    name: 'ent_sec_scan_deps',
    label: 'Scan Dependencies',
    description: 'Scan package.json, requirements.txt, or Gemfile for security patterns: wildcard versions, deprecated packages, and unpinned dependencies. Returns advisory list.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to dependency file (package.json, requirements.txt, or Gemfile).' },
      },
      required: ['path'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var depPath = readStringParam(params, 'path', { required: true });

      if (!path.isAbsolute(depPath) && options?.workspaceDir) {
        depPath = path.resolve(options.workspaceDir, depPath);
      }

      try {
        var content = await fs.readFile(depPath, 'utf-8');
        var fileName = path.basename(depPath);
        var advisories: Array<{ package: string; severity: string; issue: string; version?: string }> = [];

        if (fileName === 'package.json') {
          var pkg = JSON.parse(content);
          var allDeps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});

          for (var name of Object.keys(allDeps)) {
            var version = allDeps[name];
            if (DEPRECATED_PACKAGES.has(name)) {
              advisories.push({ package: name, severity: 'warn', issue: 'Package is deprecated or unmaintained', version: version });
            }
            if (version === '*' || version === 'latest') {
              advisories.push({ package: name, severity: 'high', issue: 'Wildcard/unpinned version — may introduce breaking changes', version: version });
            } else if (/^[>~^]/.test(version)) {
              advisories.push({ package: name, severity: 'info', issue: 'Range version — consider pinning for reproducibility', version: version });
            }
          }
        } else if (fileName === 'requirements.txt') {
          var lines = content.split('\n');
          for (var line of lines) {
            var trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (trimmed.indexOf('==') === -1 && trimmed.indexOf('>=') === -1 && trimmed.indexOf('<=') === -1) {
              advisories.push({ package: trimmed, severity: 'warn', issue: 'No version constraint — unpinned dependency' });
            }
          }
        } else if (fileName === 'Gemfile') {
          var gemLines = content.split('\n');
          for (var gLine of gemLines) {
            var gTrimmed = gLine.trim();
            if (!gTrimmed || gTrimmed.startsWith('#')) continue;
            var gemMatch = gTrimmed.match(/gem\s+['"]([^'"]+)['"]/);
            if (gemMatch) {
              var hasVersion = /,\s*['"]/.test(gTrimmed);
              if (!hasVersion) {
                advisories.push({ package: gemMatch[1], severity: 'warn', issue: 'No version constraint in Gemfile' });
              }
            }
          }
        } else {
          return errorResult('Unsupported dependency file: ' + fileName + '. Supports package.json, requirements.txt, or Gemfile.');
        }

        if (advisories.length === 0) {
          return textResult('No dependency advisories found in ' + fileName + '.');
        }

        return jsonResult({
          file: depPath,
          totalAdvisories: advisories.length,
          advisories: advisories,
        });
      } catch (err: any) {
        return errorResult('Dependency scan failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSecComplianceCheck: AnyAgentTool = {
    name: 'ent_sec_compliance_check',
    label: 'Compliance Check',
    description: 'Check files against compliance rules for PCI-DSS, HIPAA, GDPR, or SOC2. Runs relevant checks for encryption, logging, access control, and data retention patterns. Returns pass/fail per rule.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to check.' },
        standard: { type: 'string', description: 'Compliance standard: pci-dss, hipaa, gdpr, soc2.', enum: ['pci-dss', 'hipaa', 'gdpr', 'soc2'] },
      },
      required: ['path', 'standard'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var targetPath = readStringParam(params, 'path', { required: true });
      var standard = readStringParam(params, 'standard', { required: true });

      if (!path.isAbsolute(targetPath) && options?.workspaceDir) {
        targetPath = path.resolve(options.workspaceDir, targetPath);
      }

      var rules: Record<string, Array<{ id: string; name: string; pattern: RegExp; required: boolean }>> = {
        'pci-dss': [
          { id: 'PCI-3.4', name: 'Encryption at rest', pattern: /(?:encrypt|cipher|AES|createCipheriv|createHash)/i, required: true },
          { id: 'PCI-8.2', name: 'Password hashing', pattern: /(?:bcrypt|scrypt|pbkdf2|argon2|hashPassword)/i, required: true },
          { id: 'PCI-10.1', name: 'Audit logging', pattern: /(?:audit[._-]?log|logger\.info|console\.log.*access)/i, required: true },
          { id: 'PCI-6.5', name: 'Input validation', pattern: /(?:sanitize|validate|escape|parameterized|prepared)/i, required: true },
        ],
        'hipaa': [
          { id: 'HIPAA-164.312a', name: 'Access control', pattern: /(?:auth(?:enticate|orize)|rbac|permission|role[._-]?check)/i, required: true },
          { id: 'HIPAA-164.312e', name: 'Encryption in transit', pattern: /(?:https|tls|ssl|createSecureContext)/i, required: true },
          { id: 'HIPAA-164.312b', name: 'Audit controls', pattern: /(?:audit[._-]?log|logger|log[._-]?event)/i, required: true },
          { id: 'HIPAA-164.312c', name: 'Data integrity', pattern: /(?:checksum|hash|hmac|signature|verify)/i, required: true },
        ],
        'gdpr': [
          { id: 'GDPR-Art17', name: 'Right to erasure (delete)', pattern: /(?:delete[._-]?user|remove[._-]?data|purge|erasure|gdpr[._-]?delete)/i, required: true },
          { id: 'GDPR-Art20', name: 'Data portability (export)', pattern: /(?:export[._-]?data|download[._-]?data|portability)/i, required: true },
          { id: 'GDPR-Art7', name: 'Consent management', pattern: /(?:consent|opt[._-]?in|opt[._-]?out|cookie[._-]?consent)/i, required: true },
          { id: 'GDPR-Art32', name: 'Encryption', pattern: /(?:encrypt|cipher|AES|createCipheriv)/i, required: true },
        ],
        'soc2': [
          { id: 'SOC2-CC6.1', name: 'Logical access controls', pattern: /(?:auth(?:enticate|orize)|login|session|jwt|token[._-]?verify)/i, required: true },
          { id: 'SOC2-CC7.2', name: 'System monitoring', pattern: /(?:monitor|alert|metric|health[._-]?check|heartbeat)/i, required: true },
          { id: 'SOC2-CC8.1', name: 'Change management', pattern: /(?:version|migration|changelog|semver)/i, required: true },
          { id: 'SOC2-CC6.7', name: 'Data classification', pattern: /(?:sensitive|confidential|pii|classify|data[._-]?class)/i, required: true },
        ],
      };

      var standardRules = rules[standard];
      if (!standardRules) {
        return errorResult('Unknown compliance standard: ' + standard + '. Use pci-dss, hipaa, gdpr, or soc2.');
      }

      try {
        var files = await collectScanFiles(targetPath, true);
        var allContent = '';
        for (var file of files) {
          try {
            var content = await fs.readFile(file, 'utf-8');
            allContent += content + '\n';
          } catch { /* skip */ }
        }

        var results: Array<{ id: string; name: string; status: string; detail: string }> = [];
        for (var rule of standardRules) {
          var found = rule.pattern.test(allContent);
          results.push({
            id: rule.id,
            name: rule.name,
            status: found ? 'PASS' : 'FAIL',
            detail: found ? 'Pattern found in codebase' : 'No matching pattern detected — manual review recommended',
          });
        }

        var passed = results.filter(function(r) { return r.status === 'PASS'; }).length;
        var failed = results.filter(function(r) { return r.status === 'FAIL'; }).length;

        return jsonResult({
          standard: standard,
          filesScanned: files.length,
          passed: passed,
          failed: failed,
          results: results,
        });
      } catch (err: any) {
        return errorResult('Compliance check failed: ' + (err.message || String(err)));
      }
    },
  };

  var entSecHash: AnyAgentTool = {
    name: 'ent_sec_hash',
    label: 'Generate Hash',
    description: 'Generate a cryptographic hash of a string or file contents using sha256, sha512, md5, or sha1. Returns the hash in hex or base64 encoding.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'String to hash, or a file path (prefixed with "file:" to read file contents).' },
        algorithm: { type: 'string', description: 'Hash algorithm: sha256, sha512, md5, sha1 (default sha256).', enum: ['sha256', 'sha512', 'md5', 'sha1'] },
        encoding: { type: 'string', description: 'Output encoding: hex or base64 (default hex).', enum: ['hex', 'base64'] },
      },
      required: ['input'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var input = readStringParam(params, 'input', { required: true });
      var algorithm = readStringParam(params, 'algorithm') || 'sha256';
      var encoding = (readStringParam(params, 'encoding') || 'hex') as 'hex' | 'base64';

      try {
        var data: string | Buffer;
        if (input.startsWith('file:')) {
          var filePath = input.slice(5).trim();
          if (!path.isAbsolute(filePath) && options?.workspaceDir) {
            filePath = path.resolve(options.workspaceDir, filePath);
          }
          data = await fs.readFile(filePath);
        } else {
          data = input;
        }

        var hash = crypto.createHash(algorithm).update(data).digest(encoding);

        return jsonResult({
          algorithm: algorithm,
          encoding: encoding,
          hash: hash,
          inputLength: typeof data === 'string' ? data.length : data.length,
        });
      } catch (err: any) {
        return errorResult('Hash generation failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entSecScanSecrets, entSecScanPii, entSecRedactPii, entSecScanDeps, entSecComplianceCheck, entSecHash];
}

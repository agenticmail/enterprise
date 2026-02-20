import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-security-scan',
  name: 'Security Scanning',
  description: 'Scan text, code, and documents for security issues: exposed credentials, PII (personally identifiable information), malicious patterns, and dependency vulnerabilities. Supports GDPR, CCPA, HIPAA, and PCI-DSS compliance checks.',
  category: 'security',
  risk: 'low',
  icon: '🛡️',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_sec_scan_secrets',
    name: 'Scan for Exposed Secrets',
    description: 'Scan text, code, or files for accidentally exposed credentials: API keys, passwords, tokens, private keys, connection strings, and AWS/GCP/Azure credentials.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-security-scan',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text content to scan' },
        filePath: { type: 'string', description: 'File or directory path to scan (alternative to content)' },
        recursive: { type: 'boolean', description: 'Scan directories recursively', default: true },
        excludePatterns: { type: 'array', items: { type: 'string' }, description: 'File patterns to exclude (e.g., "*.min.js", "node_modules/")' },
      },
    },
  },
  {
    id: 'ent_sec_scan_pii',
    name: 'Detect PII',
    description: 'Detect personally identifiable information in text: names, email addresses, phone numbers, SSN/TIN, credit card numbers, addresses, dates of birth, passport numbers, and IP addresses.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-security-scan',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text to scan for PII' },
        filePath: { type: 'string', description: 'File path to scan' },
        types: { type: 'array', items: { type: 'string', enum: ['name', 'email', 'phone', 'ssn', 'credit_card', 'address', 'dob', 'passport', 'ip_address', 'all'] }, default: ['all'] },
        locale: { type: 'string', description: 'Locale for PII patterns (e.g., "US", "EU", "UK")', default: 'US' },
      },
    },
  },
  {
    id: 'ent_sec_redact_pii',
    name: 'Redact PII',
    description: 'Replace detected PII in text with redaction markers ([REDACTED-EMAIL], [REDACTED-SSN], etc.). Returns clean text safe for sharing or archiving.',
    category: 'write',
    risk: 'low',
    skillId: 'enterprise-security-scan',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text to redact' },
        types: { type: 'array', items: { type: 'string', enum: ['name', 'email', 'phone', 'ssn', 'credit_card', 'address', 'dob', 'passport', 'ip_address', 'all'] }, default: ['all'] },
        redactionStyle: { type: 'string', enum: ['marker', 'mask', 'hash'], description: 'marker=[REDACTED], mask=*****, hash=sha256 prefix', default: 'marker' },
        preserveFormat: { type: 'boolean', description: 'Keep same string length with masking', default: true },
      },
      required: ['content'],
    },
  },
  {
    id: 'ent_sec_scan_deps',
    name: 'Scan Dependencies',
    description: 'Check project dependencies for known vulnerabilities using CVE databases. Supports npm (package.json), Python (requirements.txt), Ruby (Gemfile), Go (go.mod), and Java (pom.xml).',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-security-scan',
    sideEffects: ['network-request'],
    parameters: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to project directory or manifest file' },
        severity: { type: 'string', enum: ['all', 'low', 'medium', 'high', 'critical'], description: 'Minimum severity to report', default: 'medium' },
        autoFix: { type: 'boolean', description: 'Suggest safe version upgrades', default: true },
      },
      required: ['projectPath'],
    },
  },
  {
    id: 'ent_sec_compliance_check',
    name: 'Compliance Check',
    description: 'Check content against compliance frameworks: GDPR (data handling), HIPAA (health info), PCI-DSS (payment data), SOC 2 (security controls). Returns findings and recommendations.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-security-scan',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to check' },
        filePath: { type: 'string', description: 'File to check' },
        frameworks: { type: 'array', items: { type: 'string', enum: ['gdpr', 'hipaa', 'pci-dss', 'soc2', 'ccpa', 'all'] }, default: ['all'] },
      },
    },
  },
  {
    id: 'ent_sec_hash',
    name: 'Hash & Verify',
    description: 'Generate cryptographic hashes (SHA-256, SHA-512, MD5) of text or files. Useful for data integrity verification and secure comparisons.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-security-scan',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text to hash' },
        filePath: { type: 'string', description: 'File to hash' },
        algorithm: { type: 'string', enum: ['sha256', 'sha512', 'md5', 'sha1'], default: 'sha256' },
        verify: { type: 'string', description: 'Expected hash to verify against' },
      },
    },
  },
];

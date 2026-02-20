/**
 * Bulk Policy Import Engine
 *
 * Supports batch import of organization policies from multiple formats:
 * JSON arrays, CSV, Markdown documents, HTML, plain text, remote URLs,
 * and pre-built industry template packs.
 *
 * Reuses text extraction patterns from knowledge.ts.
 * Each import creates a tracked job with progress reporting.
 */

import { createHash } from 'crypto';
import type { EngineDatabase } from './db-adapter.js';
import type { OrgPolicyEngine, OrgPolicy, CreatePolicyInput, PolicyCategory, PolicyEnforcement } from './org-policies.js';
import type { StorageManager } from './storage-manager.js';

// ─── Types ──────────────────────────────────────────────

export type ImportFormat = 'json' | 'csv' | 'markdown' | 'text' | 'html' | 'url';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
export type DeduplicationMode = 'skip' | 'replace' | 'version';

export interface ImportJob {
  id: string;
  orgId: string;
  format: ImportFormat;
  status: ImportStatus;
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    duplicates: number;
  };
  errors: ImportError[];
  policyIds: string[];
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface ImportError {
  index: number;
  name?: string;
  error: string;
}

export interface PolicyImportInput {
  orgId: string;
  createdBy?: string;
  deduplication?: DeduplicationMode;
  defaultCategory?: PolicyCategory;
  defaultEnforcement?: PolicyEnforcement;
  dryRun?: boolean;
}

export interface JsonImportInput extends PolicyImportInput {
  policies: Array<{
    name: string;
    category?: PolicyCategory;
    content: string;
    enforcement?: PolicyEnforcement;
    description?: string;
    priority?: number;
    tags?: string[];
    appliesTo?: string[];
  }>;
}

export interface DocumentImportInput extends PolicyImportInput {
  documents: Array<{
    name: string;
    content: string;        // base64 or utf-8
    format: 'markdown' | 'text' | 'html' | 'csv';
    encoding?: 'base64' | 'utf-8';
    metadata?: Record<string, any>;
  }>;
}

export interface UrlImportInput extends PolicyImportInput {
  urls: Array<{
    url: string;
    name?: string;
    format?: ImportFormat;
  }>;
}

interface ParsedPolicy {
  name: string;
  category: PolicyCategory;
  content: string;
  enforcement: PolicyEnforcement;
  description?: string;
  priority: number;
  tags: string[];
}

// ─── Template Packs ─────────────────────────────────────

export interface TemplatePack {
  id: string;
  name: string;
  description: string;
  industry: string;
  policies: Array<{
    name: string;
    category: PolicyCategory;
    content: string;
    enforcement: PolicyEnforcement;
    description: string;
    priority: number;
    tags: string[];
  }>;
}

// Define 4 template packs with 5-8 comprehensive policies each:

const TEMPLATE_PACKS: Record<string, TemplatePack> = {
  healthcare: {
    id: 'healthcare',
    name: 'Healthcare Compliance Pack',
    description: 'HIPAA-compliant policies for healthcare organizations',
    industry: 'healthcare',
    policies: [
      {
        name: 'HIPAA Compliance & PHI Protection',
        category: 'data_handling',
        enforcement: 'mandatory',
        description: 'Protected Health Information handling requirements under HIPAA',
        priority: 100,
        tags: ['hipaa', 'phi', 'compliance'],
        content: `# HIPAA Compliance & PHI Protection

## Protected Health Information (PHI)
You must NEVER disclose, share, or process Protected Health Information without proper authorization. PHI includes:
- Patient names, addresses, dates of birth, Social Security numbers
- Medical record numbers, health plan beneficiary numbers
- Any information that could identify a patient

## Minimum Necessary Standard
Only access, use, or disclose the minimum amount of PHI necessary to accomplish the task at hand.

## De-identification
When discussing patient cases or generating reports, always de-identify information by removing all 18 HIPAA identifiers.

## Breach Notification
If you detect or suspect a PHI breach, immediately flag it for human review and halt any further processing of the affected data.

## Business Associate Requirements
When interacting with third-party systems, ensure all data transfers comply with Business Associate Agreement (BAA) requirements.

## Penalties
Violations of HIPAA can result in fines from $100 to $50,000 per violation, with annual maximums of $1.5 million. Take this seriously.`,
      },
      {
        name: 'Patient Communication Standards',
        category: 'communication',
        enforcement: 'mandatory',
        description: 'Guidelines for communicating with patients and caregivers',
        priority: 90,
        tags: ['patient', 'communication', 'empathy'],
        content: `# Patient Communication Standards

## Tone & Empathy
Always communicate with empathy, patience, and clarity. Patients may be anxious, confused, or in distress. Use plain language and avoid medical jargon unless the patient demonstrates medical literacy.

## Consent & Authorization
Never provide medical advice, diagnoses, or treatment recommendations. Always direct patients to their healthcare provider for clinical decisions. You may share general health information and help schedule appointments.

## Emergency Protocols
If a patient describes symptoms of a medical emergency (chest pain, difficulty breathing, severe bleeding, suicidal ideation), immediately provide emergency contact information (911) and escalate to a human operator.

## Sensitive Topics
Handle mental health, substance abuse, reproductive health, and terminal illness discussions with extra sensitivity. Never be judgmental. Always offer to connect with specialized support resources.

## Minors & Guardians
When communicating about minors, verify that the requester has appropriate parental or guardian authority before sharing any information.`,
      },
      {
        name: 'Clinical Data Handling',
        category: 'data_handling',
        enforcement: 'mandatory',
        description: 'Rules for handling clinical data, lab results, and medical records',
        priority: 95,
        tags: ['clinical', 'data', 'records'],
        content: `# Clinical Data Handling

## Data Classification
- **Critical**: Lab results, diagnoses, prescriptions, surgical records — require explicit authorization for access
- **Sensitive**: Appointment history, billing records, insurance information — standard access controls
- **General**: Facility hours, general health information, provider directories — publicly available

## Data Retention
Follow your organization's data retention policy. Default: retain clinical records for 7 years from last encounter, or as required by state law (whichever is longer).

## Audit Trail
All access to clinical data must be logged with: who accessed it, when, why, and what was viewed or modified.

## Data Transmission
Clinical data must only be transmitted through encrypted channels. Never send PHI via unencrypted email, chat, or SMS.

## Research & Analytics
De-identify all data before use in research or analytics. Obtain IRB approval when required.`,
      },
      {
        name: 'Emergency Response Protocol',
        category: 'escalation',
        enforcement: 'mandatory',
        description: 'Procedures for handling medical emergencies and urgent situations',
        priority: 100,
        tags: ['emergency', 'escalation', 'urgent'],
        content: `# Emergency Response Protocol

## Immediate Escalation Triggers
Escalate IMMEDIATELY to a human operator when any of these are detected:
- Life-threatening symptoms described by patient
- Suicidal or homicidal ideation
- Child abuse or elder abuse disclosures
- Adverse drug reactions
- Post-surgical complications

## Response Steps
1. Acknowledge the urgency calmly
2. If life-threatening: provide 911 and local emergency numbers immediately
3. Do NOT attempt to diagnose or provide medical advice
4. Flag the conversation for urgent human review
5. Stay with the patient (keep conversation open) until human takes over

## Documentation
After any emergency escalation, generate a summary including: time of escalation, nature of emergency, actions taken, and outcome.`,
      },
      {
        name: 'Healthcare Security Standards',
        category: 'security',
        enforcement: 'mandatory',
        description: 'Security protocols specific to healthcare environments',
        priority: 90,
        tags: ['security', 'healthcare', 'access-control'],
        content: `# Healthcare Security Standards

## Authentication
All clinical system access requires multi-factor authentication. Never bypass or work around authentication controls.

## Access Control
Follow role-based access control (RBAC). Only access systems and data that your assigned role permits. Report any unauthorized access attempts.

## Audit Logging
All actions involving patient data must generate audit log entries. Audit logs are immutable and retained for 6 years minimum.

## Incident Response
Report any suspected security incidents immediately. Do not attempt to investigate or remediate without authorization. Preserve all evidence.

## Device Security
When operating in clinical environments, ensure all connections are encrypted (TLS 1.2+). Never store credentials in plaintext. Rotate API keys every 90 days.`,
      },
    ],
  },
  finance: {
    id: 'finance',
    name: 'Financial Services Compliance Pack',
    description: 'SOX, KYC/AML, and financial regulation policies',
    industry: 'finance',
    policies: [
      {
        name: 'SOX Compliance & Financial Controls',
        category: 'code_of_conduct',
        enforcement: 'mandatory',
        description: 'Sarbanes-Oxley compliance requirements for financial reporting',
        priority: 100,
        tags: ['sox', 'compliance', 'financial'],
        content: `# SOX Compliance & Financial Controls

## Internal Controls
All financial data processing must maintain proper internal controls. Never modify financial records without proper authorization and an audit trail.

## Segregation of Duties
No single agent should have the ability to both initiate and approve financial transactions. Always require human approval for transactions above configured thresholds.

## Financial Reporting Accuracy
All financial summaries, reports, and calculations must be accurate and verifiable. Double-check all numerical computations. Flag any discrepancies immediately.

## Record Retention
Financial records must be retained for 7 years minimum. Never delete, modify, or overwrite financial records without explicit authorization from compliance officers.

## Whistleblower Protection
If you detect potential fraud, accounting irregularities, or compliance violations, report them through the designated compliance channel. Never suppress or ignore such findings.`,
      },
      {
        name: 'KYC/AML Protocols',
        category: 'security',
        enforcement: 'mandatory',
        description: 'Know Your Customer and Anti-Money Laundering procedures',
        priority: 100,
        tags: ['kyc', 'aml', 'compliance'],
        content: `# KYC/AML Protocols

## Customer Identification
Verify customer identity before processing any financial transaction. Required identification includes government-issued ID, proof of address, and tax identification number.

## Suspicious Activity Detection
Flag transactions that exhibit these patterns:
- Unusual transaction amounts or frequency
- Transactions just below reporting thresholds (structuring)
- Transfers to/from high-risk jurisdictions
- Rapid movement of funds between accounts
- Inconsistency between transaction patterns and customer profile

## Reporting Requirements
File Suspicious Activity Reports (SARs) for any flagged transactions. Do not inform the customer that a SAR has been filed (tipping-off is illegal).

## Sanctions Screening
Screen all parties against OFAC, EU, and UN sanctions lists before processing transactions. Block any transactions involving sanctioned entities.

## Enhanced Due Diligence
Apply enhanced scrutiny for: politically exposed persons (PEPs), high-risk countries, unusual business structures, and transactions over $10,000.`,
      },
      {
        name: 'Transaction Limits & Approvals',
        category: 'escalation',
        enforcement: 'mandatory',
        description: 'Transaction thresholds and approval chains',
        priority: 95,
        tags: ['transactions', 'limits', 'approvals'],
        content: `# Transaction Limits & Approvals

## Automated Processing Limits
- Under $1,000: May process automatically with standard verification
- $1,000 - $10,000: Requires single human approval
- $10,000 - $100,000: Requires dual human approval
- Over $100,000: Requires compliance officer review plus dual approval

## Wire Transfers
All international wire transfers require human verification regardless of amount. Domestic wires over $5,000 require human approval.

## Recurring Transactions
Recurring transaction setup requires initial human approval. Any modification to recurring amounts above 20% triggers re-approval.

## Failed Transaction Handling
Never retry failed transactions automatically more than once. If a transaction fails twice, escalate to human review.

## Refund Processing
Refunds over $500 require human approval. All refunds must reference the original transaction and include a documented reason.`,
      },
      {
        name: 'Financial Advice Disclaimers',
        category: 'communication',
        enforcement: 'mandatory',
        description: 'Required disclaimers when discussing financial products',
        priority: 85,
        tags: ['disclaimer', 'advice', 'fiduciary'],
        content: `# Financial Advice Disclaimers

## General Disclaimer
You are NOT a licensed financial advisor. Always include this disclaimer when discussing financial products or strategies: "This information is for educational purposes only and does not constitute financial advice. Please consult a licensed financial advisor for personalized recommendations."

## Investment Discussions
Never recommend specific investments, predict market performance, or guarantee returns. You may explain how financial products work in general terms.

## Insurance Products
Do not recommend specific insurance policies or coverage amounts. Provide general information and direct to licensed insurance agents.

## Tax Information
Provide general tax information only. Always recommend consulting a CPA or tax professional for specific tax situations. Include: "Tax laws vary by jurisdiction and change frequently."

## Suitability
Never make suitability determinations for financial products. This requires human assessment of the customer's complete financial situation.`,
      },
      {
        name: 'Financial Data Security',
        category: 'data_handling',
        enforcement: 'mandatory',
        description: 'PCI-DSS and financial data protection requirements',
        priority: 95,
        tags: ['pci', 'security', 'data'],
        content: `# Financial Data Security

## PCI-DSS Compliance
Never store full credit card numbers, CVV codes, or PINs in any form. Display only the last 4 digits when referencing card numbers. All payment data must be processed through PCI-DSS compliant channels.

## Account Numbers
Mask all account numbers in responses and logs. Display only the last 4 digits. Full account numbers may only be used in encrypted API calls to verified financial systems.

## Data Encryption
All financial data must be encrypted in transit (TLS 1.2+) and at rest (AES-256). Never log financial data in plaintext.

## Access Logging
Log all access to financial data with: timestamp, accessor ID, data accessed, and business justification. Logs are immutable and retained for 7 years.

## Data Residency
Financial data must remain within the designated geographic regions as required by regulation. Do not transfer data across borders without compliance review.`,
      },
    ],
  },
  tech: {
    id: 'tech',
    name: 'Technology Company Pack',
    description: 'Policies for software companies and tech organizations',
    industry: 'technology',
    policies: [
      {
        name: 'Code Review & Quality Standards',
        category: 'code_of_conduct',
        enforcement: 'mandatory',
        description: 'Standards for code generation, review, and quality assurance',
        priority: 90,
        tags: ['code', 'quality', 'review'],
        content: `# Code Review & Quality Standards

## Code Generation
When generating or modifying code:
- Follow the project's existing coding style and conventions
- Include appropriate error handling for all operations
- Never introduce known security vulnerabilities (SQL injection, XSS, etc.)
- Write code that is readable and maintainable
- Add comments only where logic is non-obvious

## Security-First Coding
- Never hardcode credentials, API keys, or secrets in code
- Use parameterized queries for all database operations
- Validate and sanitize all user inputs
- Follow the principle of least privilege

## Testing
- Suggest tests for any new functionality
- Never bypass or skip existing tests
- Flag any code changes that break existing test coverage

## Dependencies
- Only recommend well-maintained, reputable packages
- Check for known vulnerabilities before suggesting dependencies
- Prefer packages with permissive licenses (MIT, Apache 2.0) unless specified otherwise`,
      },
      {
        name: 'Incident Response Procedures',
        category: 'escalation',
        enforcement: 'mandatory',
        description: 'Procedures for handling production incidents and outages',
        priority: 100,
        tags: ['incident', 'response', 'production'],
        content: `# Incident Response Procedures

## Severity Levels
- **SEV1 (Critical)**: Complete service outage, data breach, security incident → Escalate immediately to on-call engineer AND engineering leadership
- **SEV2 (Major)**: Partial outage, significant degradation, data loss risk → Escalate to on-call engineer within 5 minutes
- **SEV3 (Minor)**: Non-critical feature failure, performance degradation → Create ticket, notify team channel
- **SEV4 (Low)**: Cosmetic issues, minor bugs → Create ticket for next sprint

## Response Actions
1. Acknowledge the incident and classify severity
2. Notify appropriate personnel based on severity
3. Begin gathering diagnostic information
4. DO NOT attempt automated remediation for SEV1/SEV2 without human approval
5. Document all actions taken during incident

## Post-Incident
- Generate incident summary within 1 hour of resolution
- Include: timeline, root cause, impact assessment, remediation steps
- Flag for post-mortem review`,
      },
      {
        name: 'SLA Commitments & Communication',
        category: 'communication',
        enforcement: 'mandatory',
        description: 'Service Level Agreement guidelines for customer communication',
        priority: 85,
        tags: ['sla', 'customer', 'support'],
        content: `# SLA Commitments & Communication

## Response Times
- Critical issues: Acknowledge within 15 minutes, update every 30 minutes
- High priority: Acknowledge within 1 hour, update every 2 hours
- Normal priority: Acknowledge within 4 hours, update daily
- Low priority: Acknowledge within 24 hours, update weekly

## Status Communication
- Always be transparent about known issues
- Provide estimated time to resolution when possible (with appropriate caveats)
- Never make promises about specific resolution times unless authorized
- Use status page for broad communication about outages

## Escalation Paths
- If you cannot resolve within SLA timeframe, escalate before SLA breach
- Document all escalation decisions with reasoning
- Follow up on escalated issues until confirmed resolved

## Customer Communication
- Be professional, empathetic, and solution-focused
- Acknowledge the customer's frustration without making excuses
- Focus on what you CAN do, not what you can't`,
      },
      {
        name: 'API & System Security',
        category: 'security',
        enforcement: 'mandatory',
        description: 'Security standards for APIs, systems, and infrastructure',
        priority: 95,
        tags: ['api', 'security', 'infrastructure'],
        content: `# API & System Security

## Authentication & Authorization
- All API calls must be authenticated (API keys, OAuth tokens, or JWT)
- Implement rate limiting on all public endpoints
- Use scoped permissions — never use admin credentials for routine operations
- Rotate all credentials every 90 days

## Data Protection
- Encrypt all data in transit (TLS 1.2+) and at rest
- Never log sensitive data (passwords, tokens, PII) in application logs
- Implement proper CORS policies for web-facing services
- Use Content Security Policy (CSP) headers

## Infrastructure
- Never expose internal services directly to the internet
- Use network segmentation and firewalls
- Keep all systems patched and updated
- Monitor for unusual access patterns

## Secret Management
- Use a secrets manager (vault) for all credentials
- Never store secrets in environment variables in production
- Never commit secrets to version control
- Implement secret rotation automation`,
      },
      {
        name: 'Data Handling & Privacy',
        category: 'data_handling',
        enforcement: 'mandatory',
        description: 'GDPR, CCPA, and general data privacy requirements',
        priority: 90,
        tags: ['privacy', 'gdpr', 'ccpa', 'data'],
        content: `# Data Handling & Privacy

## User Consent
- Never process personal data without documented consent
- Honor opt-out requests within 30 days
- Maintain records of consent for all data processing activities

## Data Minimization
- Only collect data that is strictly necessary for the stated purpose
- Do not retain data longer than needed
- Anonymize or pseudonymize data when possible

## Right to Erasure (GDPR/CCPA)
- Support "right to be forgotten" requests
- Ensure deletion propagates to all systems including backups
- Document all deletion requests and actions taken

## Cross-Border Transfer
- Verify data transfer agreements before moving data between regions
- Use Standard Contractual Clauses (SCCs) for EU data transfers
- Maintain data residency compliance per customer agreements

## Breach Notification
- Report data breaches within 72 hours (GDPR) or as required by applicable law
- Document: what data was affected, how many records, remediation steps`,
      },
    ],
  },
  retail: {
    id: 'retail',
    name: 'Retail & E-Commerce Pack',
    description: 'Policies for retail businesses and e-commerce platforms',
    industry: 'retail',
    policies: [
      {
        name: 'Customer Return & Refund Policy',
        category: 'code_of_conduct',
        enforcement: 'mandatory',
        description: 'Rules for handling returns, refunds, and exchanges',
        priority: 90,
        tags: ['returns', 'refunds', 'customer'],
        content: `# Customer Return & Refund Policy

## Standard Returns
- Accept returns within 30 days of purchase with valid receipt/order number
- Items must be in original condition with tags attached
- Process refund to original payment method within 5-7 business days

## Exceptions
- Final sale items are non-returnable — inform customer politely
- Electronics: 15-day return window, must include all accessories
- Perishable goods: non-returnable unless defective
- Custom/personalized items: non-returnable unless manufacturing defect

## Refund Processing
- Under $50: Process automatically
- $50-$500: Process with single verification
- Over $500: Escalate to supervisor for approval
- Store credit: Can be offered as alternative at any amount

## Escalation
- If customer disputes the policy, offer to escalate to customer service manager
- Never argue with a customer about policy — explain once, then escalate
- Document all escalated return requests`,
      },
      {
        name: 'Pricing & Promotions Accuracy',
        category: 'communication',
        enforcement: 'mandatory',
        description: 'Guidelines for communicating prices, discounts, and promotions',
        priority: 95,
        tags: ['pricing', 'promotions', 'accuracy'],
        content: `# Pricing & Promotions Accuracy

## Price Accuracy
- Always quote the current listed price from the product database
- If a price discrepancy is reported, escalate — do not adjust manually
- Include all applicable taxes and fees in price quotes when possible
- Never promise a price match without verifying the competitor's current price

## Promotions & Discounts
- Only apply promotions that are currently active and valid
- Verify coupon codes against the promotion database before confirming discounts
- Do not stack promotions unless the promotion rules explicitly allow it
- Clearly communicate promotion terms (expiry date, exclusions, minimum purchase)

## Price Changes
- Do not honor expired promotions without supervisor approval
- If a price drops within 14 days of purchase, the customer may request a price adjustment
- Communicate any upcoming price changes only if authorized to do so

## Transparency
- Always disclose shipping costs before checkout
- Clearly explain any recurring charges or subscription terms
- Be upfront about out-of-stock items and estimated restock dates`,
      },
      {
        name: 'Inventory & Order Communication',
        category: 'communication',
        enforcement: 'recommended',
        description: 'How to communicate about inventory, orders, and shipping',
        priority: 80,
        tags: ['inventory', 'orders', 'shipping'],
        content: `# Inventory & Order Communication

## Stock Status
- Always check real-time inventory before confirming availability
- If an item is out of stock, offer: waitlist signup, similar alternatives, or estimated restock date
- Never guarantee availability without checking inventory systems

## Order Status
- Provide tracking information as soon as available
- Proactively communicate delays — don't wait for the customer to ask
- For delayed orders, offer: expedited shipping upgrade, partial refund, or store credit

## Shipping Information
- Quote delivery estimates based on actual carrier data, not optimistic guesses
- Clearly communicate which shipping options are available
- Inform customers about international shipping restrictions and customs duties

## Order Modifications
- Allow cancellations only if order hasn't shipped
- Address changes: possible before shipping label is created
- Item modifications: process as cancel + reorder if already in fulfillment`,
      },
      {
        name: 'Loyalty Program Management',
        category: 'code_of_conduct',
        enforcement: 'recommended',
        description: 'Rules for managing loyalty programs and reward points',
        priority: 75,
        tags: ['loyalty', 'rewards', 'points'],
        content: `# Loyalty Program Management

## Points & Rewards
- Calculate points accurately based on the current program rules
- Points are earned on the post-discount, pre-tax amount
- Points cannot be earned on gift card purchases
- Display current point balance when relevant to the conversation

## Redemption
- Verify point balance before confirming redemption
- Points cannot be combined with certain promotions (check exclusion rules)
- Redeemed points are non-refundable — warn customers before redemption
- Allow partial point redemption

## Account Management
- Verify account ownership before making any changes
- Points transfers between accounts require supervisor approval
- Expired points cannot be reinstated without supervisor approval
- Merge requests for duplicate accounts: escalate to customer service

## Communication
- Inform customers about points expiration 30 days in advance
- Proactively suggest point redemption opportunities when relevant
- Never encourage unnecessary purchases just to earn points`,
      },
      {
        name: 'Retail Data Protection',
        category: 'data_handling',
        enforcement: 'mandatory',
        description: 'Data protection policies specific to retail operations',
        priority: 90,
        tags: ['data', 'privacy', 'pci', 'retail'],
        content: `# Retail Data Protection

## Payment Card Data (PCI-DSS)
- NEVER store, log, or display full credit card numbers
- Only reference the last 4 digits of card numbers
- All payment processing must go through PCI-compliant channels
- Never ask customers to provide full card numbers via chat or email

## Customer Personal Data
- Collect only necessary information for order fulfillment
- Do not share customer data with third parties without consent
- Honor data deletion requests within 30 days
- Mask email addresses and phone numbers in internal communications

## Purchase History
- Purchase history is private — only share with the verified account holder
- Do not reference purchase history in marketing without opt-in consent
- Anonymize purchase data before use in analytics

## Employee Data
- Do not disclose employee schedules, personal information, or performance data
- Store access credentials are for authorized personnel only
- Report any unauthorized access to customer or employee data immediately`,
      },
    ],
  },
};

// ─── Policy Importer ────────────────────────────────────

export class PolicyImporter {
  private policyEngine: OrgPolicyEngine;
  private storageManager?: StorageManager;
  private jobs = new Map<string, ImportJob>();
  private engineDb?: EngineDatabase;

  constructor(opts: { policyEngine: OrgPolicyEngine; storageManager?: StorageManager }) {
    this.policyEngine = opts.policyEngine;
    this.storageManager = opts.storageManager;
  }

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadJobsFromDb();
  }

  private async loadJobsFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM policy_import_jobs ORDER BY created_at DESC LIMIT 100');
      for (const r of rows) {
        this.jobs.set(r.id, {
          id: r.id, orgId: r.org_id, format: r.format, status: r.status,
          progress: JSON.parse(r.progress || '{}'),
          errors: JSON.parse(r.errors || '[]'),
          policyIds: JSON.parse(r.policy_ids || '[]'),
          createdBy: r.created_by, createdAt: r.created_at,
          completedAt: r.completed_at || undefined,
        });
      }
    } catch { /* table may not exist yet */ }
  }

  // ─── Job Management ──────────────────────────────────

  private createJob(orgId: string, format: ImportFormat, total: number, createdBy: string): ImportJob {
    const job: ImportJob = {
      id: crypto.randomUUID(), orgId, format, status: 'processing',
      progress: { total, processed: 0, succeeded: 0, failed: 0, duplicates: 0 },
      errors: [], policyIds: [], createdBy, createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.persistJob(job);
    return job;
  }

  private completeJob(job: ImportJob): void {
    job.completedAt = new Date().toISOString();
    job.status = job.errors.length > 0 ? (job.progress.succeeded > 0 ? 'partial' : 'failed') : 'completed';
    this.persistJob(job);
  }

  private async persistJob(job: ImportJob): Promise<void> {
    if (!this.engineDb) return;
    try {
      // Upsert via DELETE + INSERT (works across all SQL dialects)
      await this.engineDb.execute('DELETE FROM policy_import_jobs WHERE id = ?', [job.id]);
      await this.engineDb.execute(
        'INSERT INTO policy_import_jobs (id, org_id, format, status, progress, errors, policy_ids, created_by, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [job.id, job.orgId, job.format, job.status, JSON.stringify(job.progress), JSON.stringify(job.errors), JSON.stringify(job.policyIds), job.createdBy, job.createdAt, job.completedAt || null]
      );
    } catch { /* ignore persistence errors */ }
  }

  getJob(id: string): ImportJob | undefined { return this.jobs.get(id); }

  getJobsByOrg(orgId: string): ImportJob[] {
    return Array.from(this.jobs.values()).filter(j => j.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ─── Import Methods ──────────────────────────────────

  async importJson(input: JsonImportInput): Promise<ImportJob> {
    const createdBy = input.createdBy || 'admin';
    const job = this.createJob(input.orgId, 'json', input.policies.length, createdBy);

    for (let i = 0; i < input.policies.length; i++) {
      const p = input.policies[i];
      try {
        const contentHash = this.hashContent(p.content);
        const dedup = await this.checkDuplicate(input.orgId, contentHash, input.deduplication || 'skip');

        if (dedup === 'skip') {
          job.progress.duplicates++;
        } else {
          if (!input.dryRun) {
            const policy = await this.policyEngine.createPolicy({
              orgId: input.orgId,
              name: p.name,
              category: p.category || input.defaultCategory || 'custom',
              content: p.content,
              enforcement: p.enforcement || input.defaultEnforcement || 'mandatory',
              description: p.description,
              priority: p.priority || 0,
              tags: p.tags || [],
              appliesTo: p.appliesTo || ['*'],
              enabled: true,
              createdBy,
            });
            job.policyIds.push(policy.id);
          }
          job.progress.succeeded++;
        }
      } catch (e: any) {
        job.errors.push({ index: i, name: p.name, error: e.message });
        job.progress.failed++;
      }
      job.progress.processed++;
    }

    this.completeJob(job);
    return job;
  }

  async importDocuments(input: DocumentImportInput): Promise<ImportJob> {
    const createdBy = input.createdBy || 'admin';
    // First, parse all documents into policies
    const allParsed: { docName: string; policies: ParsedPolicy[] }[] = [];

    for (const doc of input.documents) {
      const content = doc.encoding === 'base64' ? Buffer.from(doc.content, 'base64').toString('utf-8') : doc.content;
      let parsed: ParsedPolicy[];

      switch (doc.format) {
        case 'markdown': parsed = this.parseMarkdown(content, input.defaultCategory, input.defaultEnforcement); break;
        case 'csv': parsed = this.parseCsv(content, input.defaultCategory, input.defaultEnforcement); break;
        case 'html': parsed = this.parseHtml(content, input.defaultCategory, input.defaultEnforcement); break;
        case 'text':
        default: parsed = this.parsePlainText(content, doc.name, input.defaultCategory, input.defaultEnforcement); break;
      }
      allParsed.push({ docName: doc.name, policies: parsed });
    }

    const totalPolicies = allParsed.reduce((sum, d) => sum + d.policies.length, 0);
    const job = this.createJob(input.orgId, input.documents[0]?.format as ImportFormat || 'text', totalPolicies, createdBy);

    let idx = 0;
    for (const { policies } of allParsed) {
      for (const p of policies) {
        try {
          const contentHash = this.hashContent(p.content);
          const dedup = await this.checkDuplicate(input.orgId, contentHash, input.deduplication || 'skip');

          if (dedup === 'skip') {
            job.progress.duplicates++;
          } else {
            if (!input.dryRun) {
              const policy = await this.policyEngine.createPolicy({
                orgId: input.orgId, name: p.name, category: p.category,
                content: p.content, enforcement: p.enforcement,
                description: p.description, priority: p.priority,
                tags: p.tags, appliesTo: ['*'], enabled: true, createdBy,
              });
              job.policyIds.push(policy.id);
            }
            job.progress.succeeded++;
          }
        } catch (e: any) {
          job.errors.push({ index: idx, name: p.name, error: e.message });
          job.progress.failed++;
        }
        job.progress.processed++;
        idx++;
      }
    }

    this.completeJob(job);
    return job;
  }

  async importFromUrls(input: UrlImportInput): Promise<ImportJob> {
    const createdBy = input.createdBy || 'admin';
    const job = this.createJob(input.orgId, 'url', input.urls.length, createdBy);

    for (let i = 0; i < input.urls.length; i++) {
      const u = input.urls[i];
      try {
        const response = await fetch(u.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const content = await response.text();
        const contentType = response.headers.get('content-type') || '';

        // Auto-detect format
        let format: 'markdown' | 'html' | 'csv' | 'text' = 'text';
        if (u.format === 'markdown' || u.url.endsWith('.md')) format = 'markdown';
        else if (u.format === 'html' || contentType.includes('html')) format = 'html';
        else if (u.format === 'csv' || u.url.endsWith('.csv')) format = 'csv';
        else if (contentType.includes('markdown')) format = 'markdown';

        let parsed: ParsedPolicy[];
        switch (format) {
          case 'markdown': parsed = this.parseMarkdown(content, input.defaultCategory, input.defaultEnforcement); break;
          case 'csv': parsed = this.parseCsv(content, input.defaultCategory, input.defaultEnforcement); break;
          case 'html': parsed = this.parseHtml(content, input.defaultCategory, input.defaultEnforcement); break;
          default: parsed = this.parsePlainText(content, u.name || u.url, input.defaultCategory, input.defaultEnforcement); break;
        }

        for (const p of parsed) {
          if (!input.dryRun) {
            const policy = await this.policyEngine.createPolicy({
              orgId: input.orgId, name: p.name, category: p.category,
              content: p.content, enforcement: p.enforcement,
              description: p.description, priority: p.priority,
              tags: p.tags, appliesTo: ['*'], enabled: true, createdBy,
            });
            job.policyIds.push(policy.id);
          }
          job.progress.succeeded++;
        }
      } catch (e: any) {
        job.errors.push({ index: i, name: u.name || u.url, error: e.message });
        job.progress.failed++;
      }
      job.progress.processed++;
    }

    this.completeJob(job);
    return job;
  }

  async importTemplatePack(orgId: string, packId: string, createdBy: string): Promise<ImportJob> {
    const pack = TEMPLATE_PACKS[packId];
    if (!pack) throw new Error(`Template pack '${packId}' not found. Available: ${Object.keys(TEMPLATE_PACKS).join(', ')}`);

    const job = this.createJob(orgId, 'json', pack.policies.length, createdBy);

    for (let i = 0; i < pack.policies.length; i++) {
      const p = pack.policies[i];
      try {
        const policy = await this.policyEngine.createPolicy({
          orgId, name: p.name, category: p.category, content: p.content,
          enforcement: p.enforcement, description: p.description,
          priority: p.priority, tags: [...p.tags, `template:${packId}`],
          appliesTo: ['*'], enabled: true, createdBy,
        });
        job.policyIds.push(policy.id);
        job.progress.succeeded++;
      } catch (e: any) {
        job.errors.push({ index: i, name: p.name, error: e.message });
        job.progress.failed++;
      }
      job.progress.processed++;
    }

    this.completeJob(job);
    return job;
  }

  // ─── Template Packs ──────────────────────────────────

  static getTemplatePacks(): Record<string, { id: string; name: string; description: string; industry: string; policyCount: number }> {
    const result: Record<string, any> = {};
    for (const [id, pack] of Object.entries(TEMPLATE_PACKS)) {
      result[id] = { id, name: pack.name, description: pack.description, industry: pack.industry, policyCount: pack.policies.length };
    }
    return result;
  }

  static getTemplatePack(packId: string): TemplatePack | undefined {
    return TEMPLATE_PACKS[packId];
  }

  // ─── Document Parsing ────────────────────────────────

  private parseMarkdown(content: string, defaultCategory?: PolicyCategory, defaultEnforcement?: PolicyEnforcement): ParsedPolicy[] {
    const policies: ParsedPolicy[] = [];

    // Check for YAML frontmatter
    let frontmatter: Record<string, any> = {};
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (fmMatch) {
      // Simple YAML-like parsing (key: value pairs)
      for (const line of fmMatch[1].split('\n')) {
        const [k, ...vParts] = line.split(':');
        if (k && vParts.length) frontmatter[k.trim()] = vParts.join(':').trim();
      }
      content = fmMatch[2];
    }

    // Split on top-level headings (# or ##)
    const sections = content.split(/^(?=#{1,2}\s)/m).filter(s => s.trim());

    if (sections.length <= 1) {
      // No headings — treat as single policy
      const name = frontmatter.name || frontmatter.title || 'Imported Policy';
      policies.push({
        name,
        category: (frontmatter.category as PolicyCategory) || defaultCategory || 'custom',
        content: content.trim(),
        enforcement: (frontmatter.enforcement as PolicyEnforcement) || defaultEnforcement || 'mandatory',
        description: frontmatter.description,
        priority: parseInt(frontmatter.priority) || 0,
        tags: frontmatter.tags ? frontmatter.tags.split(',').map((t: string) => t.trim()) : [],
      });
    } else {
      for (const section of sections) {
        const headingMatch = section.match(/^#{1,2}\s+(.+)\n([\s\S]*)/);
        if (!headingMatch) continue;
        const name = headingMatch[1].trim();
        const body = headingMatch[2].trim();
        if (body.length < 10) continue; // Skip very short sections

        policies.push({
          name,
          category: defaultCategory || this.inferCategory(name, body),
          content: section.trim(),
          enforcement: defaultEnforcement || 'mandatory',
          priority: 0,
          tags: [],
        });
      }
    }

    return policies;
  }

  private parseCsv(content: string, defaultCategory?: PolicyCategory, defaultEnforcement?: PolicyEnforcement): ParsedPolicy[] {
    const policies: ParsedPolicy[] = [];
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return policies;

    // Detect delimiter (comma, tab, semicolon, pipe)
    const firstLine = lines[0];
    const delimiter = [',', '\t', ';', '|'].reduce((best, d) =>
      firstLine.split(d).length > firstLine.split(best).length ? d : best, ',');

    // Parse header row
    const headers = this.parseCsvLine(lines[0], delimiter).map(h => h.toLowerCase().trim());
    const nameIdx = headers.findIndex(h => ['name', 'title', 'policy_name', 'policy'].includes(h));
    const contentIdx = headers.findIndex(h => ['content', 'body', 'text', 'description', 'policy_content'].includes(h));
    const categoryIdx = headers.findIndex(h => ['category', 'type', 'group'].includes(h));
    const enforcementIdx = headers.findIndex(h => ['enforcement', 'level', 'severity'].includes(h));
    const tagsIdx = headers.findIndex(h => ['tags', 'labels', 'keywords'].includes(h));
    const priorityIdx = headers.findIndex(h => ['priority', 'order', 'weight'].includes(h));
    const descIdx = headers.findIndex(h => ['desc', 'summary', 'note'].includes(h));

    if (nameIdx === -1 || contentIdx === -1) {
      // Fallback: first column = name, second = content
      for (let i = 1; i < lines.length; i++) {
        const cols = this.parseCsvLine(lines[i], delimiter);
        if (cols.length >= 2) {
          policies.push({
            name: cols[0], category: defaultCategory || 'custom',
            content: cols[1], enforcement: defaultEnforcement || 'mandatory',
            priority: 0, tags: [],
          });
        }
      }
      return policies;
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i], delimiter);
      const name = cols[nameIdx]?.trim();
      const pContent = cols[contentIdx]?.trim();
      if (!name || !pContent) continue;

      policies.push({
        name,
        content: pContent,
        category: (categoryIdx >= 0 ? cols[categoryIdx]?.trim() as PolicyCategory : undefined) || defaultCategory || 'custom',
        enforcement: (enforcementIdx >= 0 ? cols[enforcementIdx]?.trim() as PolicyEnforcement : undefined) || defaultEnforcement || 'mandatory',
        tags: tagsIdx >= 0 ? (cols[tagsIdx] || '').split(/[,;]/).map(t => t.trim()).filter(Boolean) : [],
        priority: priorityIdx >= 0 ? parseInt(cols[priorityIdx]) || 0 : 0,
        description: descIdx >= 0 ? cols[descIdx]?.trim() : undefined,
      });
    }

    return policies;
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current); current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  private parseHtml(content: string, defaultCategory?: PolicyCategory, defaultEnforcement?: PolicyEnforcement): ParsedPolicy[] {
    // Strip HTML tags, then parse as markdown
    const text = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|tr|td|th|h[1-6])[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return this.parseMarkdown(text, defaultCategory, defaultEnforcement);
  }

  private parsePlainText(content: string, name: string, defaultCategory?: PolicyCategory, defaultEnforcement?: PolicyEnforcement): ParsedPolicy[] {
    // If content has clear paragraph breaks, split into multiple policies
    const sections = content.split(/\n{3,}/).filter(s => s.trim().length > 50);

    if (sections.length > 1) {
      return sections.map((section, i) => {
        const firstLine = section.trim().split('\n')[0].substring(0, 80);
        return {
          name: `${name} - Section ${i + 1}: ${firstLine}`,
          category: defaultCategory || 'custom',
          content: section.trim(),
          enforcement: defaultEnforcement || 'mandatory',
          priority: 0,
          tags: [],
        };
      });
    }

    return [{
      name: name.replace(/\.(txt|md|html|csv)$/i, ''),
      category: defaultCategory || 'custom',
      content: content.trim(),
      enforcement: defaultEnforcement || 'mandatory',
      priority: 0,
      tags: [],
    }];
  }

  // ─── Helpers ─────────────────────────────────────────

  private hashContent(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
  }

  private async checkDuplicate(orgId: string, contentHash: string, mode: DeduplicationMode): Promise<'skip' | 'create'> {
    if (mode === 'skip') {
      // Check if a policy with this content hash already exists
      const existing = this.policyEngine.findByContentHash?.(orgId, contentHash);
      if (existing) return 'skip';
    }
    return 'create';
  }

  private inferCategory(name: string, content: string): PolicyCategory {
    const text = (name + ' ' + content).toLowerCase();
    if (/\b(conduct|ethic|behavior|professional|integrity)\b/.test(text)) return 'code_of_conduct';
    if (/\b(communicat|tone|voice|messag|email|chat)\b/.test(text)) return 'communication';
    if (/\b(data|privacy|pii|gdpr|ccpa|hipaa|encrypt|confidential)\b/.test(text)) return 'data_handling';
    if (/\b(brand|style|logo|trademark|marketing)\b/.test(text)) return 'brand_voice';
    if (/\b(security|auth|password|credential|access|firewall|threat)\b/.test(text)) return 'security';
    if (/\b(escalat|emergency|urgent|incident|crisis)\b/.test(text)) return 'escalation';
    return 'custom';
  }
}

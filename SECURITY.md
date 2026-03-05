# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5   | :x:                |

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@agenticmail.io**.

You should receive an acknowledgment within 48 hours. We will send a detailed response within 7 days indicating next steps.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Any suggested fixes (optional)

## Security Measures

AgenticMail Enterprise implements multiple layers of security:

- **Transport Encryption** — AES-256-GCM encryption for all API traffic
- **Data Loss Prevention (DLP)** — Real-time content scanning with 53 built-in rules across 7 categories
- **Role-Based Access Control (RBAC)** — Granular permissions with preset profiles
- **Multi-Tenant Isolation** — Client organization data isolation across all endpoints
- **Audit Logging** — Comprehensive action journal with org-scoped filtering
- **SOC 2 Type II Compliance** — Automated reporting across all 9 Common Criteria (CC1-CC9)
- **OAuth 2.0 / SAML / OIDC** — Enterprise SSO with provider-based tool auto-detection
- **Rate Limiting** — Configurable per-endpoint and per-agent limits
- **CORS / Security Headers** — Strict origin validation and security header enforcement
- **Outbound Guard** — PII and credential scanning on all outgoing communications

## Disclosure Policy

We follow responsible disclosure. Security issues are patched in private and released as part of the next version. Critical vulnerabilities may receive out-of-band patches.

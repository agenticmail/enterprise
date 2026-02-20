# Contributing Community Skills to AgenticMail Enterprise

AgenticMail Enterprise has an open skill marketplace powered by Git. Anyone can build a skill for any application and submit it as a pull request.

> **All skill submissions require manual review and approval from a maintainer.**
> Automated CI validates the manifest format, but a human reviews every skill
> for accuracy, safety, and quality before it can be merged. No skill goes live
> without maintainer sign-off.

## Quick Start

```bash
# 1. Create your skill directory
mkdir community-skills/my-skill

# 2. Create the manifest
cp community-skills/_template/agenticmail-skill.json community-skills/my-skill/

# 3. Edit the manifest with your skill details
# (see Specification below)

# 4. Validate
agenticmail-enterprise validate community-skills/my-skill/

# 5. Submit a PR
agenticmail-enterprise submit-skill community-skills/my-skill/
```

Or use the AI-assisted builder:

```bash
agenticmail-enterprise build-skill
```

## agenticmail-skill.json Specification

Every community skill is defined by an `agenticmail-skill.json` manifest in its own directory under `community-skills/`.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier. Lowercase alphanumeric, hyphens, underscores. 3-64 chars. |
| `name` | string | Human-readable name. Max 100 chars. |
| `description` | string | What the skill does. 20-500 chars. |
| `version` | string | Semantic version (e.g. `1.0.0`). |
| `author` | string | Your GitHub username. |
| `repository` | string | URL to the skill's source repository. |
| `license` | string | SPDX license identifier (e.g. `MIT`, `Apache-2.0`). |
| `category` | string | One of the valid categories (see below). |
| `risk` | string | `low`, `medium`, `high`, or `critical`. |
| `tools` | array | At least one tool definition (see below). |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `icon` | string | Emoji or URL for display. |
| `tags` | string[] | Up to 20 lowercase tags for search. |
| `configSchema` | object | Configuration fields needed by the skill. |
| `minEngineVersion` | string | Minimum engine version required. |
| `homepage` | string | URL to documentation. |

### Tool Definition

Each tool in the `tools` array describes one action the skill provides:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique tool ID. Lowercase with underscores. **Must not conflict with existing tools.** |
| `name` | string | Yes | Human-readable name. |
| `description` | string | Yes | What this tool does. |
| `category` | string | No | `read`, `write`, `execute`, `communicate`, or `destroy`. |
| `riskLevel` | string | No | `low`, `medium`, `high`, or `critical`. |
| `sideEffects` | string[] | No | What external effects this tool causes. |
| `parameters` | object | No | Input parameters the tool accepts. |

### Naming Convention for Tool IDs

Use a prefix based on your skill ID to avoid collisions:

```
skill ID:  github-issues
tool IDs:  github_create_issue, github_update_issue, github_list_issues
```

## Valid Categories (27)

| Category | Description |
|----------|-------------|
| `communication` | Email, SMS, messaging |
| `development` | GitHub, coding, git |
| `productivity` | Calendar, notes, reminders, tasks |
| `research` | Web search, web fetch, summarize |
| `media` | Image gen, TTS, video, audio |
| `automation` | Browser, shell, scripting |
| `smart-home` | IoT, Hue, Sonos, cameras |
| `data` | Files, databases, storage |
| `security` | Passwords, healthcheck, IAM |
| `social` | Twitter/X, LinkedIn |
| `platform` | Core AgenticMail platform internals |
| `collaboration` | Slack, Teams, Zoom, chat |
| `crm` | Salesforce, HubSpot, Dynamics |
| `project-management` | Jira, Asana, Monday, Linear |
| `cloud-infrastructure` | AWS, Azure, GCP |
| `devops` | Docker, K8s, Terraform, CI/CD |
| `finance` | Stripe, QuickBooks, Xero |
| `analytics` | Tableau, Power BI, Mixpanel |
| `design` | Figma, Canva, Adobe |
| `ecommerce` | Shopify, WooCommerce |
| `marketing` | Mailchimp, SendGrid, ads |
| `hr` | BambooHR, Workday, Gusto |
| `legal` | DocuSign, compliance |
| `customer-support` | Zendesk, Intercom, Freshdesk |
| `storage` | Dropbox, Box, OneDrive |
| `database` | MongoDB, Redis, Snowflake |
| `monitoring` | Datadog, PagerDuty, Sentry |

## Valid Tool Categories (5)

| Category | Description |
|----------|-------------|
| `read` | Read-only, no side effects |
| `write` | Creates or modifies data |
| `execute` | Runs code or commands |
| `communicate` | Sends messages externally |
| `destroy` | Deletes data |

## Risk Levels

| Level | When to use |
|-------|-------------|
| `low` | Read-only operations, no sensitive data |
| `medium` | Creates/modifies data, sends messages |
| `high` | Handles sensitive data, financial operations, destructive actions |
| `critical` | Full system access, admin operations, irreversible actions |

## Side Effects (11)

| Effect | Description |
|--------|-------------|
| `sends-email` | Sends an email |
| `sends-message` | Sends a chat/SMS message |
| `sends-sms` | Sends an SMS specifically |
| `posts-social` | Posts to social media |
| `runs-code` | Executes code or commands |
| `modifies-files` | Creates or modifies files |
| `deletes-data` | Deletes data permanently |
| `network-request` | Makes external HTTP requests |
| `controls-device` | Controls IoT/smart devices |
| `accesses-secrets` | Reads passwords, tokens, keys |
| `financial` | Processes payments or financial data |

## CLI Commands

### Validate a Skill

```bash
# Validate a single skill
agenticmail-enterprise validate community-skills/my-skill/

# Validate all community skills
agenticmail-enterprise validate --all

# Machine-readable output (for CI)
agenticmail-enterprise validate --all --json
```

### Build a Skill (AI-Assisted)

```bash
agenticmail-enterprise build-skill
```

This interactive command:
1. Asks what application/service the skill should integrate with
2. Asks what operations it should support
3. Uses an AI agent (if agent runtime is running) to generate the manifest
4. Falls back to template-based generation otherwise
5. Validates the output
6. Offers to submit as a PR

### Submit a Skill

```bash
agenticmail-enterprise submit-skill community-skills/my-skill/
```

This automates the entire PR flow:
1. Validates the manifest
2. Forks the repo (if needed)
3. Creates a branch
4. Commits and pushes
5. Opens a pull request

**Requires:** [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated.

## Review Process

**Every community skill requires maintainer approval before it can be merged.**

When you open a PR, the following happens automatically:

1. CI runs `agenticmail-enterprise validate` on your manifest
2. The bot posts a validation report and a **maintainer review checklist** on your PR
3. The PR is labeled `community-skill` + `needs-maintainer-review`
4. A maintainer from `@agenticmail/skill-reviewers` is auto-assigned via CODEOWNERS

**The PR cannot be merged until a maintainer explicitly approves it.**

### What Maintainers Check

Automated validation only checks the manifest format. A human reviewer checks:

1. **Tool IDs are sensibly named** — follow `prefix_action` convention, no misleading names
2. **Descriptions are accurate** — clearly explain what each tool does
3. **Risk levels are appropriate** — destructive actions must be `high`/`critical`
4. **Side effects are correctly declared** — `sends-email`, `deletes-data`, `financial`, etc.
5. **No malicious or deceptive definitions** — tool names must match their actual behavior
6. **Category fits the application** — not miscategorized to gain visibility
7. **Config schema is reasonable** — no unnecessary secrets or permissions requested
8. **README documents everything** — all tools, configuration, and usage examples
9. **License is valid** — must be an open-source SPDX license

### After Approval

Once a maintainer approves and merges your PR:

1. CI automatically rebuilds `community-skills/index.json`
2. All deployed AgenticMail instances pick up the new skill within 6 hours (via periodic sync)
3. Admins can also trigger an immediate sync from the dashboard
4. Your skill appears in the Community Skills marketplace for all users

## Directory Structure

```
community-skills/
  _template/                    # Template for new skills
    agenticmail-skill.json
    README.md
  github-issues/                # Example: GitHub Issues skill
    agenticmail-skill.json
    README.md
  slack-notifications/          # Example: Slack skill
    agenticmail-skill.json
    README.md
  your-skill/                   # Your contribution
    agenticmail-skill.json
    README.md
```

## License

By contributing a community skill, you agree that your contribution is licensed under the license specified in your manifest (defaulting to MIT).

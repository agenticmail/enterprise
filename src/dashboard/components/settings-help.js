import { h } from './utils.js';

var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

export var SETTINGS_HELP = {

  general: {
    label: 'General Settings',
    content: function() {
      return h('div', null,
        h('p', null, 'The General tab is where you configure your organization\'s basic identity and email delivery. These are the foundational settings that affect how your AgenticMail instance looks and operates.'),
        h('h4', { style: _h4 }, 'Organization'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Company Name'), ' \u2014 The name that appears throughout the dashboard and in email headers sent by your agents.'),
          h('li', null, h('strong', null, 'Domain'), ' \u2014 Your company\'s primary domain (e.g., agenticmail.io). Used for agent email addresses and identifying your organization.'),
          h('li', null, h('strong', null, 'Subdomain'), ' \u2014 Your unique identifier on the AgenticMail cloud platform. Your dashboard is accessible at <subdomain>.agenticmail.io.'),
          h('li', null, h('strong', null, 'Plan'), ' \u2014 Controls how many agents you can create and which features are available. Self-hosted installations have no restrictions.'),
          h('li', null, h('strong', null, 'Logo URL'), ' \u2014 A link to your company logo. It appears in the top-left of the dashboard and in agent-sent emails.'),
          h('li', null, h('strong', null, 'Primary Brand Color'), ' \u2014 Customizes the accent color across the entire dashboard to match your brand identity.')
        ),
        h('h4', { style: _h4 }, 'SMTP Configuration'),
        h('p', null, 'Controls how outgoing emails are delivered. Leave these blank to use the default AgenticMail relay. Configure a custom SMTP server if you want emails to come from your own mail infrastructure.'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'SMTP Host / Port'), ' \u2014 The address and port of your email server (e.g., smtp.gmail.com on port 587).'),
          h('li', null, h('strong', null, 'SMTP Username / Password'), ' \u2014 Credentials for authenticating with your email server. For Gmail, use an App Password (not your regular password).'),
          h('li', null, h('strong', null, 'DKIM Private Key'), ' \u2014 Optional. If provided, outgoing emails are cryptographically signed, improving deliverability and preventing spoofing.')
        )
      );
    }
  },

  'api-keys': {
    label: 'API Keys',
    content: function() {
      return h('div', null,
        h('p', null, 'API keys let external applications and scripts interact with your AgenticMail instance programmatically. Use them to integrate AgenticMail with your existing tools, CI/CD pipelines, or custom applications.'),
        h('h4', { style: _h4 }, 'When to use API keys'),
        h('ul', { style: _ul },
          h('li', null, 'Connecting a custom application that needs to create, manage, or monitor agents.'),
          h('li', null, 'Building automated workflows that trigger agent actions from external systems.'),
          h('li', null, 'Integrating with third-party platforms that need to read or write data through AgenticMail.')
        ),
        h('h4', { style: _h4 }, 'Key concepts'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Key Name'), ' \u2014 A label to help you remember what each key is used for (e.g., "Production Backend" or "CI/CD Pipeline").'),
          h('li', null, h('strong', null, 'Key Prefix'), ' \u2014 The visible portion of the key shown in the table for identification. The full key is only shown once when created.'),
          h('li', null, h('strong', null, 'Scopes'), ' \u2014 What the key can do: read (view data), write (create and update), or admin (full access including deleting resources).'),
          h('li', null, h('strong', null, 'Revoke'), ' \u2014 Permanently disables a key. Any application using that key will immediately lose access. This cannot be undone.')
        ),
        h('div', { style: _tip }, 'Important: Copy your API key immediately after creation. For security, the full key is never shown again.')
      );
    }
  },

  authentication: {
    label: 'Authentication',
    content: function() {
      return h('div', null,
        h('p', null, 'Authentication settings control how team members sign in to the dashboard. By default, users sign in with a username and password. You can add Single Sign-On (SSO) so team members use their existing corporate login instead.'),
        h('h4', { style: _h4 }, 'What is Single Sign-On (SSO)?'),
        h('p', null, 'SSO lets team members sign in using their existing company credentials (such as Google Workspace, Microsoft 365, or Okta). This is more secure and convenient because users don\'t need a separate password for AgenticMail.'),
        h('h4', { style: _h4 }, 'SAML 2.0'),
        h('p', null, 'Best for large organizations using Okta, OneLogin, or Azure Active Directory.'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Entity ID'), ' \u2014 A unique identifier your identity provider uses to recognize AgenticMail.'),
          h('li', null, h('strong', null, 'SSO URL'), ' \u2014 The web address where users are redirected to sign in.'),
          h('li', null, h('strong', null, 'Certificate'), ' \u2014 A security certificate from your identity provider that verifies sign-in responses are genuine.')
        ),
        h('h4', { style: _h4 }, 'OpenID Connect (OIDC)'),
        h('p', null, 'Best for organizations using Google Workspace, Microsoft 365, Auth0, or any modern OAuth provider.'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Client ID & Secret'), ' \u2014 Credentials you receive when you register AgenticMail as an application in your identity provider.'),
          h('li', null, h('strong', null, 'Discovery URL'), ' \u2014 A URL that automatically configures the connection. The Quick Setup buttons pre-fill this for popular providers.')
        ),
        h('div', { style: _tip }, 'Tip: The provider buttons below the SSO forms pre-fill the Discovery URL. You still need to create an OAuth application in that provider\'s admin console and enter the Client ID and Secret it gives you.')
      );
    }
  },

  email: {
    label: 'Email & Domain',
    content: function() {
      return h('div', null,
        h('p', null, 'This tab controls how your AI agents send and receive email. There are two approaches depending on your needs.'),
        h('h4', { style: _h4 }, 'Gmail / Outlook Relay'),
        h('p', null, 'The quickest way to get started. Agents send email through your existing Gmail or Outlook account using "plus addressing" (e.g., yourname+agent@gmail.com). Good for testing and small teams.'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Email Address'), ' \u2014 Your Gmail or Outlook address that agents will send from.'),
          h('li', null, h('strong', null, 'App Password'), ' \u2014 A special password generated by Google or Microsoft specifically for third-party apps. This is NOT your regular account password.')
        ),
        h('h4', { style: _h4 }, 'Custom Domain'),
        h('p', null, 'The professional setup for production. Agents send from addresses like agent@yourdomain.com with full email authentication (DKIM, SPF, DMARC).'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Domain'), ' \u2014 The domain you want agents to send email from.'),
          h('li', null, h('strong', null, 'Cloudflare API Token'), ' \u2014 Used to automatically configure DNS records for email authentication. You can generate this from your Cloudflare dashboard under API Tokens.'),
          h('li', null, h('strong', null, 'Cloudflare Account ID'), ' \u2014 Found in the Cloudflare dashboard sidebar. Identifies which account manages your domain\'s DNS.')
        ),
        h('div', { style: _tip }, 'Tip: Start with relay mode for testing and switch to a custom domain when you\'re ready for production.')
      );
    }
  },

  deployments: {
    label: 'Deployments',
    content: function() {
      return h('div', null,
        h('p', null, 'Deploy credentials let AgenticMail deploy your AI agents to various hosting platforms. Think of these as saved login information for your deployment targets, so agents can be published with one click.'),
        h('h4', { style: _h4 }, 'When to use this'),
        h('p', null, 'If you want agents to run as standalone services (not just within the main AgenticMail server), you need deploy credentials for where they will be hosted.'),
        h('h4', { style: _h4 }, 'Supported targets'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Docker Registry'), ' \u2014 Push agent containers to a Docker registry (Docker Hub, GitHub Container Registry, AWS ECR, etc.). Enter the registry URL and login credentials.'),
          h('li', null, h('strong', null, 'SSH / VPS'), ' \u2014 Deploy agents directly to a virtual private server. Provide the host address, SSH port, username, and private key.'),
          h('li', null, h('strong', null, 'Fly.io'), ' \u2014 Deploy to Fly.io\'s global edge network. Enter your Fly.io API token from the Fly.io dashboard.'),
          h('li', null, h('strong', null, 'Railway'), ' \u2014 Deploy to Railway\'s managed platform. Enter your Railway API token and project ID.')
        ),
        h('div', { style: _tip }, 'Credentials are stored securely and encrypted at rest. Deleting a credential will cause any active deployments using it to fail on their next update.')
      );
    }
  },

  security: {
    label: 'Tool Security',
    content: function() {
      return h('div', null,
        h('p', null, 'Tool Security controls what your AI agents are allowed to do at the system level. These are safety guardrails that prevent agents from accidentally or maliciously accessing sensitive resources. These are organization-wide defaults \u2014 individual agents can have stricter (but not looser) overrides.'),
        h('h4', { style: _h4 }, 'Security Sandboxes'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Path Sandbox'), ' \u2014 Restricts which folders agents can read from or write to. Prevents access to sensitive files like configuration, passwords, or encryption keys. Add directories to "Allowed" to grant access; add patterns to "Blocked" to deny access.'),
          h('li', null, h('strong', null, 'SSRF Protection'), ' \u2014 Prevents agents from making network requests to internal services, cloud metadata endpoints (like AWS 169.254.x.x), or private IP ranges. This stops a misbehaving agent from probing your internal network.'),
          h('li', null, h('strong', null, 'Command Sanitizer'), ' \u2014 Controls which shell commands agents can execute. In Blocklist mode, known dangerous patterns are blocked. In Allowlist mode, agents can only run commands you explicitly permit.')
        ),
        h('h4', { style: _h4 }, 'Middleware & Observability'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Audit Logging'), ' \u2014 Records every tool action an agent takes: what it did, when, success/failure, and duration. Sensitive fields like passwords are automatically redacted.'),
          h('li', null, h('strong', null, 'Rate Limiting'), ' \u2014 Limits how many times each tool can be called per minute per agent. Prevents any single agent from overwhelming the system. Adjust limits per tool type in the table.'),
          h('li', null, h('strong', null, 'Circuit Breaker'), ' \u2014 Automatically pauses a tool that keeps failing (after 5 consecutive errors). Waits 30 seconds before retrying. Prevents error cascading when an external service is down.'),
          h('li', null, h('strong', null, 'Telemetry'), ' \u2014 Collects performance metrics: call duration, success rates, and output sizes. Useful for identifying slow tools or agents using resources inefficiently.')
        )
      );
    }
  },

  network: {
    label: 'Network & Firewall',
    content: function() {
      return h('div', null,
        h('p', null, 'Network & Firewall controls who can access your AgenticMail instance and what your agents can reach on the internet. Use these settings to lock down your deployment for production security.'),
        h('h4', { style: _h4 }, 'IP Access Control'),
        h('p', null, 'Restricts which IP addresses can reach the dashboard, APIs, and engine. In Allowlist mode, only listed IPs can connect. In Blocklist mode, all IPs are allowed except those you block. Use "Test an IP" to verify rules before saving.'),
        h('h4', { style: _h4 }, 'Outbound Egress Rules'),
        h('p', null, 'Controls which external websites and services your agents can reach. Allowlist mode means agents can only connect to hosts you approve. Blocklist mode lets agents reach everything except blocked hosts.'),
        h('h4', { style: _h4 }, 'Proxy & Trusted Proxies'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Proxy Configuration'), ' \u2014 If your network requires a proxy for outbound internet access (common in corporate environments), configure the HTTP/HTTPS proxy URLs here. "No-Proxy Hosts" bypass the proxy.'),
          h('li', null, h('strong', null, 'Trusted Proxies'), ' \u2014 If AgenticMail is behind a load balancer or reverse proxy (Nginx, Traefik, AWS ALB), list those proxy IPs here so IP-based access control uses the real client IP.')
        ),
        h('h4', { style: _h4 }, 'Network & Deployment Settings'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'CORS Origins'), ' \u2014 If you embed AgenticMail in another website, list that website\'s address here. Leave empty to allow all origins.'),
          h('li', null, h('strong', null, 'Rate Limiting'), ' \u2014 Limits API requests per IP per minute. Protects against abuse and denial-of-service. "Skip Paths" excludes health-check endpoints.'),
          h('li', null, h('strong', null, 'HTTPS Enforcement'), ' \u2014 Forces all connections to use encrypted HTTPS. Highly recommended for production.'),
          h('li', null, h('strong', null, 'Security Headers'), ' \u2014 Browser security policies: HSTS forces HTTPS, X-Frame-Options prevents clickjacking, Content-Type-Options prevents MIME sniffing. The defaults are recommended for most deployments.')
        )
      );
    }
  },

  integrations: {
    label: 'Integrations',
    content: function() {
      return h('div', null,
        h('p', null, 'Integrations connect your AI agents to external services and platforms. Once connected, agents can read from and write to these services as part of their workflows \u2014 for example, reading Jira tickets, posting Slack messages, or creating GitHub pull requests.'),
        h('h4', { style: _h4 }, 'How integrations work'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'OAuth integrations'), ' \u2014 Services like Slack, GitHub, and Salesforce use OAuth. Clicking "Connect" opens a popup where you sign in and grant AgenticMail permission. Credentials are stored securely.'),
          h('li', null, h('strong', null, 'Token-based integrations'), ' \u2014 Services like Discord and Linear require you to paste an API key or bot token that you generate in that service\'s admin panel.')
        ),
        h('h4', { style: _h4 }, 'Managing integrations'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Connected (green border)'), ' \u2014 The integration is active and agents can use it.'),
          h('li', null, h('strong', null, 'Disconnect'), ' \u2014 Removes stored credentials. Agents using this integration will immediately lose access.'),
          h('li', null, 'You can reconnect at any time by clicking "Connect" again.')
        ),
        h('div', { style: _tip }, 'Tip: Only connect integrations your agents actually need. Each connection is a potential access point that should be reviewed periodically.')
      );
    }
  }
};

# AgenticMail Enterprise — Deployment Guide

Complete step-by-step guide for deploying AgenticMail Enterprise at your organization.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Interactive Setup Wizard](#3-interactive-setup-wizard)
   - [Step 1: Company Info](#step-1-company-info)
   - [Step 2: Database](#step-2-database)
   - [Step 3: Deployment Target](#step-3-deployment-target)
   - [Step 4: Custom Domain](#step-4-custom-domain)
   - [Step 5: Domain Registration](#step-5-domain-registration--protection)
4. [Provisioning](#4-provisioning)
5. [DNS Setup & Domain Verification](#5-dns-setup--domain-verification)
   - [How DNS Works](#how-dns-works-quick-primer)
   - [Record 1: Traffic Routing](#record-1-traffic-routing)
   - [Adding DNS Records: Step-by-Step](#adding-dns-records-step-by-step) (Cloudflare, Namecheap, Route 53, GoDaddy)
   - [Reverse Proxy Setup](#reverse-proxy-setup-docker--self-hosted) (Caddy, Nginx, Traefik)
   - [Record 2: Domain Verification](#record-2-domain-ownership-verification-txt)
   - [DNS Propagation](#dns-propagation)
6. [Accessing Your Dashboard](#6-accessing-your-dashboard)
7. [Firewall & Air-Gapped Deployment](#7-firewall--air-gapped-deployment)
8. [Domain Recovery](#8-domain-recovery)
9. [Deployment Targets Reference](#9-deployment-targets-reference)
10. [Database Backends Reference](#10-database-backends-reference)
11. [CLI Reference](#11-cli-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** installed on your machine
- **npm** (comes with Node.js) or **yarn** / **pnpm**
- A **database** ready (see [Database Backends](#10-database-backends-reference) for options)
- Access to your **DNS provider** (if using a custom domain)
- A **terminal / command line** — the setup is fully interactive

Optional:
- Docker (if deploying via Docker)
- Fly.io or Railway CLI (if deploying to those platforms)

---

## 2. Installation

Open your terminal and run:

```bash
npx @agenticmail/enterprise
```

This downloads the package and immediately launches the interactive setup wizard.

Alternatively, install globally:

```bash
npm install -g @agenticmail/enterprise
agenticmail-enterprise
```

Or add to an existing project:

```bash
npm install @agenticmail/enterprise
npx agenticmail-enterprise
```

---

## 3. Interactive Setup Wizard

The setup wizard walks you through 5 steps. Each step is interactive — you'll be prompted with questions and can make selections with your keyboard.

### Step 1: Company Info

You'll be asked for three things:

| Prompt | Description | Example |
|--------|-------------|---------|
| **Company name** | Your organization's name (max 100 chars) | `AgenticMail Inc` |
| **Admin email** | The email for the first admin account | `admin@agenticmail.io` |
| **Admin password** | Password for the admin account (min 8 chars, must include an uppercase letter or number) | `SecurePass123` |

After entering your details, you'll be asked to pick a **subdomain**. This is used for your dashboard URL (e.g., `agenticmail-inc.agenticmail.io`) and internal routing.

The wizard generates suggestions based on your company name, but you have full control:

- **Pick a suggestion** — the recommended option plus several alternatives
- **Enter your own** — type any valid subdomain (lowercase, letters/numbers/hyphens)
- **Generate more** — get a fresh batch of random suggestions if none fit

```
  Step 1 of 5: Company Info
  Tell us about your organization.

? Company name: AgenticMail Inc
? Admin email: admin@agenticmail.io
? Admin password: ********

  Subdomain
  Used for your dashboard URL and internal routing.

? Choose a subdomain:
❯ agenticmail-inc  (recommended)
  ai
  agenticmail
  team-agenticmail-inc
  app-agenticmail-inc
  agenticmail-hq
  ──────────────
  Enter my own...
  Generate more suggestions
```

### Step 2: Database

Choose where your data will be stored. **All your company data stays in your own database** — AgenticMail Enterprise never has access to it.

You'll see a list of 10 supported backends:

| Backend | Group | Connection Format |
|---------|-------|-------------------|
| **SQLite** | Local | File path (e.g., `./agenticmail-enterprise.db`) |
| **PostgreSQL** | Self-hosted | `postgresql://user:pass@host:5432/dbname` |
| **MySQL** | Self-hosted | `mysql://user:pass@host:3306/dbname` |
| **MongoDB** | Self-hosted | `mongodb+srv://user:pass@cluster/dbname` |
| **Supabase** | Managed | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| **Neon** | Managed | `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require` |
| **PlanetScale** | Managed | `mysql://user:pass@aws.connect.psdb.cloud/dbname` |
| **CockroachDB** | Managed | `postgresql://user:pass@cluster.cockroachlabs.cloud:26257/dbname` |
| **Turso** | Managed | `libsql://db-org.turso.io` + auth token |
| **DynamoDB** | AWS | Region + Access Key ID + Secret Access Key |

**For quick testing**, pick **SQLite** — it creates a local file with zero setup:

```
  Step 2 of 5: Database
  Where should your data live?

? Database backend: SQLite (Local)
? Database file path: ./agenticmail-enterprise.db
```

**For production**, we recommend PostgreSQL, Supabase, Neon, or Turso.

### Step 3: Deployment Target

Choose where the AgenticMail Enterprise server will run:

| Target | Best For |
|--------|----------|
| **AgenticMail Cloud** | Fastest — instant URL, managed hosting |
| **Fly.io** | Your own Fly.io account, global edge deployment |
| **Railway** | Your own Railway account, simple PaaS |
| **Docker** | Self-hosted, generates `docker-compose.yml` + `.env` |
| **Local** | Development/testing — starts a server on `localhost:3000` |

```
  Step 3 of 5: Deployment
  Where should your dashboard run?

? Deploy to: Local (dev/testing, runs here)
```

### Step 4: Custom Domain

> Skipped automatically for Local deployments.

If you chose a cloud or self-hosted deployment, you can point your own domain at the dashboard. The wizard explains what's needed based on your deployment target:

```
  Step 4 of 5: Custom Domain
  Point your own domain at this deployment.

  Your dashboard will be accessible at this domain instead of the
  default .agenticmail.io URL.

? Add a custom domain? Yes
? Custom domain: agents.agenticmail.io

  After setup, you will need two DNS records for this domain:

  1. CNAME or A record  — routes traffic to your server
     (instructions shown after deployment)
  2. TXT record          — proves domain ownership (next step)
```

**Two DNS records are needed** for a custom domain — they serve different purposes:

| Record | Purpose | When to Add |
|--------|---------|-------------|
| **CNAME or A** | Routes browser traffic from `agents.agenticmail.io` to your actual server | After deployment (Step 4 shows you the target) |
| **TXT** | Proves you own the domain to the AgenticMail registry (prevents impersonation) | During or after setup (Step 5) |

The setup wizard shows you exactly what DNS records to create, tailored to your deployment target. For example:

- **AgenticMail Cloud**: `CNAME agents.agenticmail.io → agenticmail-inc.agenticmail.io`
- **Fly.io**: `CNAME agents.agenticmail.io → am-agenticmail-inc.fly.dev` + run `fly certs add`
- **Railway**: Add the domain in Railway's dashboard, then create the CNAME it tells you
- **Docker**: Point an A record to your server IP, configure a reverse proxy (nginx, Caddy, etc.)

### Step 5: Domain Registration & Protection

> Skipped automatically if no custom domain was configured.

This is the most important step for production deployments. Domain Registration ensures:

- **No one else** can deploy AgenticMail Enterprise on your domain
- Your deployment is **cryptographically protected** with a 256-bit key
- Domain ownership is **proven via DNS** (industry standard)
- After verification, your system runs **100% offline** — no phone-home, ever

#### How it works:

1. **You confirm** you want to register your domain
2. A **256-bit deployment key** is generated (64-character hex string)
3. The domain + key hash is sent to the AgenticMail registry (one-time HTTPS call)
4. The registry returns a **DNS challenge** (a TXT record value)
5. You **save your deployment key** (shown once, never stored anywhere)
6. You add the **DNS TXT record** to prove domain ownership

```
  Step 5 of 5: Domain Registration
  Protect your deployment from unauthorized duplication.

? Register agents.agenticmail.io with AgenticMail? Yes

✔ Deployment key generated
✔ Domain registered

  ╔══════════════════════════════════════════════════════════════════════╗
  ║  DEPLOYMENT KEY — SAVE THIS NOW                                     ║
  ║                                                                      ║
  ║  a1b2c3d4e5f6...  (64 hex characters)                               ║
  ║                                                                      ║
  ║  This key is shown ONCE. Store it securely (password manager,       ║
  ║  vault, printed backup). You need it to recover this domain.        ║
  ╚══════════════════════════════════════════════════════════════════════╝

  Add this DNS TXT record to prove domain ownership:

  Host:   _agenticmail-verify.agents.agenticmail.io
  Type:   TXT
  Value:  am-verify=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6

  DNS changes can take up to 48 hours to propagate.

? I have saved my deployment key: Yes
? Check DNS verification now? No
```

**CRITICAL: Save your deployment key immediately.** Store it in:
- A password manager (1Password, Bitwarden, etc.)
- A secure vault (HashiCorp Vault, AWS Secrets Manager)
- A printed backup in a secure location

You will need this key if you ever need to recover your deployment on a new machine.

---

## 4. Provisioning

After all 5 steps, the wizard automatically provisions your deployment:

```
  ─────────────────────────────────────────

⠋ Connecting to database...
✔ Database ready
✔ Engine ready (7 migrations applied)
✔ Company created
✔ Domain registration saved
✔ Admin account created
✔ Server running

  AgenticMail Enterprise is running!

  Dashboard:  http://localhost:3000
  API:        http://localhost:3000/api
  Admin:      admin@agenticmail.io

  Press Ctrl+C to stop
```

What happens during provisioning:
1. **Database** — connects and runs all migrations (creates tables, indexes)
2. **Engine** — initializes the AI agent engine (skills, permissions, knowledge bases)
3. **Company** — stores your company name, subdomain, and domain settings
4. **Domain Registration** — saves the key hash, DNS challenge, and registration ID
5. **Admin Account** — creates the first admin user with your email/password
6. **Deployment** — starts the server or generates deployment files

---

## 5. DNS Setup & Domain Verification

> Skip this section entirely if you didn't set a custom domain in Step 4.

This section explains how to make your custom domain (like `agents.agenticmail.io`) actually load your AgenticMail dashboard in a browser. It covers two things:

1. **Traffic routing** — making `agents.agenticmail.io` point to your server so people can visit it
2. **Ownership verification** — proving to the AgenticMail registry that you own this domain

### How DNS Works (Quick Primer)

When someone types `agents.agenticmail.io` in their browser, here's what happens:

```
Browser                    DNS Provider               Your Server
  │                        (Cloudflare/               (where AgenticMail
  │                         Namecheap)                 is running)
  │                            │                           │
  │ "Where is                  │                           │
  │  agents.agenticmail.io?"         │                           │
  │ ─────────────────────────► │                           │
  │                            │                           │
  │   "It's at 143.198.50.100" │                           │
  │ ◄───────────────────────── │                           │
  │                            │                           │
  │ Connect to 143.198.50.100  │                           │
  │ ───────────────────────────┼─────────────────────────► │
  │                            │                           │
  │       Dashboard HTML       │                           │
  │ ◄──────────────────────────┼────────────────────────── │
```

Your **DNS provider** (Cloudflare, Namecheap, etc.) is the phone book. You add **records** that tell browsers where to find your server. Without these records, the browser has no idea where `agents.agenticmail.io` lives.

There are two types of records you'll need:

| Record Type | What It Does | Analogy |
|-------------|-------------|---------|
| **A record** | Points a domain directly to an IP address (e.g., `143.198.50.100`) | "The restaurant is at 123 Main St" |
| **CNAME record** | Points a domain to another domain (e.g., `agenticmail-inc.fly.dev`) | "The restaurant is wherever Joe's Diner is" |
| **TXT record** | Stores text data (doesn't route traffic — used for verification) | "Here's a note proving I own this address" |

### Record 1: Traffic Routing

This is the record that makes your dashboard load when someone visits your domain.

**What to add depends on your deployment target:**

#### If you deployed to AgenticMail Cloud

| Field | Value |
|-------|-------|
| **Type** | `CNAME` |
| **Name / Host** | `agents` (the subdomain part of `agents.agenticmail.io`) |
| **Value / Target** | `agenticmail-inc.agenticmail.io` (shown in setup output) |

#### If you deployed to Fly.io

| Field | Value |
|-------|-------|
| **Type** | `CNAME` |
| **Name / Host** | `agents` |
| **Value / Target** | `am-agenticmail-inc.fly.dev` (shown in setup output) |

Also run: `fly certs add agents.agenticmail.io` — Fly will auto-provision an SSL certificate.

#### If you deployed to Railway

Railway gives you the CNAME target in their dashboard:
1. Open your Railway project
2. Go to **Settings** > **Domains** > **Add Custom Domain**
3. Railway shows you a target like `your-app-production-xxxx.up.railway.app`
4. Add that as a CNAME in your DNS provider

#### If you deployed to Docker / VPS / your own server

You need the **IP address** of the server where Docker is running.

| Field | Value |
|-------|-------|
| **Type** | `A` |
| **Name / Host** | `agents` |
| **Value / Target** | Your server's IP (e.g., `143.198.50.100`) |

You also need a **reverse proxy** on your server to forward traffic from port 80/443 to the AgenticMail container on port 3000. See [Reverse Proxy Setup](#reverse-proxy-setup-docker--self-hosted) below.

---

### Adding DNS Records: Step-by-Step

#### Cloudflare

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select your domain (`agenticmail.io`)
3. Click **DNS** in the left sidebar
4. Click **Add Record**

**For the traffic routing CNAME (using Cloud deployment as example):**

```
Type:    CNAME
Name:    agents
Target:  agenticmail-inc.agenticmail.io
Proxy:   DNS only (click the orange cloud to make it gray)
TTL:     Auto
```

> **Important:** Set the proxy toggle to **DNS only** (gray cloud) initially. Cloudflare's proxy can interfere with WebSocket connections. You can enable it later once you confirm the dashboard loads.

**For the verification TXT record:**

```
Type:    TXT
Name:    _agenticmail-verify.agents
Content: am-verify=a1b2c3d4e5f6...  (the value from Step 5)
TTL:     Auto
```

Click **Save** for each record.

#### Namecheap

1. Log in to [namecheap.com](https://www.namecheap.com) > **Domain List**
2. Click **Manage** next to your domain (`agenticmail.io`)
3. Go to the **Advanced DNS** tab
4. Click **Add New Record**

**For the traffic routing CNAME:**

```
Type:    CNAME Record
Host:    agents
Value:   agenticmail-inc.agenticmail.io.
TTL:     Automatic
```

> **Note:** Namecheap sometimes requires a trailing dot (`.`) on CNAME values. If it doesn't work without it, add one: `agenticmail-inc.agenticmail.io.`

**For the verification TXT record:**

```
Type:    TXT Record
Host:    _agenticmail-verify.agents
Value:   am-verify=a1b2c3d4e5f6...  (the value from Step 5)
TTL:     Automatic
```

Click the green checkmark to save each record.

#### AWS Route 53

1. Go to **Route 53** > **Hosted Zones** > select your domain
2. Click **Create Record**

**For CNAME:**
- Record name: `agents`
- Record type: `CNAME`
- Value: `agenticmail-inc.agenticmail.io`
- TTL: `300`

**For TXT:**
- Record name: `_agenticmail-verify.agents`
- Record type: `TXT`
- Value: `"am-verify=a1b2c3d4e5f6..."` (wrap in double quotes for Route 53)
- TTL: `300`

#### GoDaddy

1. Go to **My Products** > **DNS** next to your domain
2. Click **Add** under DNS Records

**For CNAME:**
- Type: `CNAME`
- Name: `agents`
- Value: `agenticmail-inc.agenticmail.io`
- TTL: `1 Hour`

**For TXT:**
- Type: `TXT`
- Name: `_agenticmail-verify.agents`
- Value: `am-verify=a1b2c3d4e5f6...`
- TTL: `1 Hour`

#### Other Providers

The fields are the same everywhere — only the UI differs. Look for "DNS Management", "DNS Records", or "Zone Editor" in your provider's dashboard. You need:

1. A **CNAME** (or **A** for self-hosted) record for `agents` pointing to your server
2. A **TXT** record for `_agenticmail-verify.agents` with the verification value

---

### Reverse Proxy Setup (Docker / Self-Hosted)

If you're running AgenticMail on your own server (Docker, bare metal, VM), you need a reverse proxy to:
- Forward traffic from port 80/443 to port 3000 (where AgenticMail runs)
- Handle SSL/TLS certificates (HTTPS)

#### Option A: Caddy (Recommended — automatic HTTPS)

Install [Caddy](https://caddyserver.com), then create a `Caddyfile`:

```
agents.agenticmail.io {
    reverse_proxy localhost:3000
}
```

Run: `caddy run`

Caddy automatically obtains and renews SSL certificates from Let's Encrypt.

#### Option B: Nginx + Let's Encrypt

Install nginx and certbot, then create `/etc/nginx/sites-available/agenticmail`:

```nginx
server {
    listen 80;
    server_name agents.agenticmail.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name agents.agenticmail.io;

    ssl_certificate /etc/letsencrypt/live/agents.agenticmail.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agents.agenticmail.io/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then:
```bash
sudo ln -s /etc/nginx/sites-available/agenticmail /etc/nginx/sites-enabled/
sudo certbot --nginx -d agents.agenticmail.io
sudo nginx -t && sudo systemctl reload nginx
```

#### Option C: Docker Compose with Traefik

Add Traefik to your `docker-compose.yml`:

```yaml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@agenticmail.io"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - letsencrypt:/letsencrypt

  agenticmail:
    image: node:20
    working_dir: /app
    command: node dist/cli.js
    labels:
      - "traefik.http.routers.agenticmail.rule=Host(`agents.agenticmail.io`)"
      - "traefik.http.routers.agenticmail.tls.certresolver=letsencrypt"
      - "traefik.http.services.agenticmail.loadbalancer.server.port=3000"
    env_file: .env

volumes:
  letsencrypt:
```

---

### Record 2: Domain Ownership Verification (TXT)

This is a **separate concern** from traffic routing. The TXT record doesn't affect whether your dashboard loads — it proves to the AgenticMail registry that you own this domain, which protects your deployment from unauthorized duplication.

You already added this record in the provider-specific steps above. To confirm:

| Field | Value |
|-------|-------|
| **Type** | `TXT` |
| **Name / Host** | `_agenticmail-verify.agents` (if your domain is `agents.agenticmail.io`) |
| **Value** | The `am-verify=...` string from Step 5 |
| **TTL** | Default / Auto |

> **Host field gotcha:** Each DNS provider handles the host field differently:
> - **Cloudflare**: Enter `_agenticmail-verify.agents` (auto-appends your domain)
> - **Namecheap**: Enter `_agenticmail-verify.agents` (auto-appends your domain)
> - **Route 53**: Enter `_agenticmail-verify.agents` (auto-appends your domain)
> - **GoDaddy**: Enter `_agenticmail-verify.agents` (auto-appends your domain)
> - **If in doubt**: Try `_agenticmail-verify.agents.agenticmail.io` as the full name. Some providers want the full hostname, others just the subdomain part.

### Checking Verification Status

After adding both DNS records, verify ownership with the CLI:

```bash
agenticmail-enterprise verify-domain
```

Or specify the domain explicitly:

```bash
agenticmail-enterprise verify-domain --domain agents.agenticmail.io
```

If you stored your data in a specific database file:

```bash
agenticmail-enterprise verify-domain --db ./agenticmail-enterprise.db
```

The command will:
1. Read your domain from the local database (or ask you)
2. Contact the AgenticMail registry to check the DNS TXT record
3. Update your local database status to `verified` on success

```
  AgenticMail Enterprise — Domain Verification

✔ Domain verified!

  agents.agenticmail.io is verified and protected.
  Your deployment domain is locked. No other instance can claim it.
```

### DNS Propagation

DNS changes are **not instant**. After adding records:

| Provider | Typical Propagation Time |
|----------|-------------------------|
| Cloudflare | 1–5 minutes |
| Namecheap | 5–30 minutes |
| Route 53 | 60 seconds (TTL-dependent) |
| GoDaddy | 30 minutes – 24 hours |

If verification fails, just wait and try again. Your AgenticMail dashboard works normally while verification is pending — nothing is blocked.

You can check if your DNS records have propagated using online tools:
- [dnschecker.org](https://dnschecker.org) — check any record type globally
- `dig _agenticmail-verify.agents.agenticmail.io TXT` — check from your terminal
- `nslookup -type=TXT _agenticmail-verify.agents.agenticmail.io` — Windows alternative

---

## 6. Accessing Your Dashboard

Once the server is running, open the dashboard URL in your browser:

- **Local**: `http://localhost:3000`
- **Cloud**: The URL shown after setup (e.g., `https://agenticmail-inc.agenticmail.io`)
- **Docker**: `http://localhost:3000` (or your mapped port)

Log in with the **admin email** and **password** you set during Step 1.

The dashboard gives you access to:
- **Agents** — Create, configure, and manage AI agents
- **Skills** — Browse 217+ built-in skills and community skills
- **Knowledge Bases** — Upload documents for agent reference
- **Approvals** — Review agent actions that need human approval
- **Messages** — Agent-to-agent and agent-to-human communication
- **Guardrails** — Pause, resume, and monitor agent behavior
- **Journal** — Full audit trail of every agent action
- **DLP** — Data loss prevention rules and scanning
- **Compliance** — SOC2, GDPR, and audit reporting
- **Domain Status** — View domain verification status and DNS instructions
- **Users** — Manage team members and roles
- **Settings** — Company config, SMTP, branding

---

## 7. Firewall & Air-Gapped Deployment

AgenticMail Enterprise is designed to run entirely behind your corporate firewall.

### What Requires Internet Access

| Action | When | Direction |
|--------|------|-----------|
| Domain Registration | Once, during setup | Outbound HTTPS to `registry.agenticmail.com` |
| DNS Verification | Once, after adding DNS record | Outbound HTTPS to `registry.agenticmail.com` |
| Domain Recovery | Only if migrating to a new machine | Outbound HTTPS to `registry.agenticmail.com` |

### What Runs 100% Offline

After domain verification completes, **everything else** runs without any internet access:

- Dashboard and admin UI
- All API endpoints
- Agent creation, management, and execution
- Skills engine and permission system
- Knowledge base management
- Audit logging and compliance reporting
- DLP scanning and guardrails
- Agent-to-agent communication
- All database operations

### Air-Gapped Setup

For fully air-gapped environments (no internet at all):

1. **Pre-register** your domain on a machine with internet access:
   ```bash
   npx @agenticmail/enterprise
   # Complete Step 5, save your deployment key and DNS challenge
   ```

2. **Add the DNS TXT record** from a machine with DNS access

3. **Verify** from the internet-connected machine:
   ```bash
   agenticmail-enterprise verify-domain --domain agents.agenticmail.io
   ```

4. **Transfer** the deployment to the air-gapped machine:
   - Copy the database file (SQLite) or ensure the air-gapped machine can reach your database server
   - Install the npm package on the air-gapped machine
   - Start the server — it will read the verified status from the local database and run without any outbound calls

5. **Skip registration** if needed — the system runs fine without domain registration. It's a protection mechanism, not a requirement.

---

## 8. Domain Recovery

If you lose access to your deployment (server crash, machine failure, etc.) and need to deploy on a new machine:

### Prerequisites

You need:
- Your **domain name** (e.g., `agents.agenticmail.io`)
- Your **deployment key** (the 64-character hex string from Step 5)

### Recovery Steps

1. **Run the recovery command:**

   ```bash
   agenticmail-enterprise recover --domain agents.agenticmail.io --key YOUR_64_CHAR_HEX_KEY
   ```

   Or interactively:

   ```bash
   agenticmail-enterprise recover
   ```

   ```
     AgenticMail Enterprise — Domain Recovery
     Recover your domain registration on a new machine.

   ? Domain to recover: agents.agenticmail.io
   ? Deployment key: ********

   ✔ Domain recovery initiated
   ```

2. **A new DNS challenge is issued.** Update your DNS TXT record:

   ```
     Update your DNS TXT record:

     Host:   _agenticmail-verify.agents.agenticmail.io
     Type:   TXT
     Value:  am-verify=NEW_CHALLENGE_VALUE

     Then run: agenticmail-enterprise verify-domain
   ```

3. **Update the DNS record** at your DNS provider with the new value

4. **Verify** the updated record:

   ```bash
   agenticmail-enterprise verify-domain --domain agents.agenticmail.io
   ```

5. **Re-run setup** or start the server manually to continue operations

### Recovery with Database

If you also want to write recovery data directly to your local database:

```bash
agenticmail-enterprise recover \
  --domain agents.agenticmail.io \
  --key YOUR_64_CHAR_HEX_KEY \
  --db ./agenticmail-enterprise.db \
  --db-type sqlite
```

### What Happens During Recovery

1. Your deployment key is sent to the AgenticMail registry (HTTPS)
2. The registry verifies it against the stored bcrypt hash
3. If the key matches, a **new DNS challenge** is issued
4. The old DNS challenge is invalidated
5. You must re-verify DNS with the new challenge
6. Once verified, the system runs offline again

---

## 9. Deployment Targets Reference

### Local (Development)

```bash
agenticmail-enterprise
# Select "Local" in Step 3
```

Starts a server on `http://localhost:3000`. Press `Ctrl+C` to stop.

### Docker (Self-Hosted)

```bash
agenticmail-enterprise
# Select "Docker" in Step 3
```

Generates:
- `docker-compose.yml` — container configuration
- `.env` — secrets (database URL, JWT secret)

Then run:

```bash
docker compose up -d
```

Dashboard at `http://localhost:3000`.

### Fly.io

```bash
agenticmail-enterprise
# Select "Fly.io" in Step 3
```

Generates `fly.toml`. Then:

```bash
fly launch --copy-config
fly secrets set DATABASE_URL="your_connection_string" JWT_SECRET="your_jwt_secret"
fly deploy
```

### Railway

```bash
agenticmail-enterprise
# Select "Railway" in Step 3
```

Generates `railway.toml`. Then:

```bash
railway init
railway link
railway up
```

### AgenticMail Cloud

```bash
agenticmail-enterprise
# Select "AgenticMail Cloud" in Step 3
```

Deploys instantly. You'll get a URL like `https://agenticmail-inc.agenticmail.io`.

---

## 10. Database Backends Reference

| Backend | Best For | Setup Complexity |
|---------|----------|-----------------|
| **SQLite** | Development, small teams, air-gapped | None — just a file path |
| **PostgreSQL** | Production, teams of any size | Moderate — need a running Postgres server |
| **MySQL** | Production, existing MySQL infrastructure | Moderate — need a running MySQL server |
| **MongoDB** | Teams using MongoDB already | Moderate — need a running MongoDB instance |
| **Supabase** | Quick managed Postgres | Low — sign up at supabase.com, get connection string |
| **Neon** | Serverless Postgres | Low — sign up at neon.tech, get connection string |
| **PlanetScale** | Serverless MySQL | Low — sign up at planetscale.com, get connection string |
| **CockroachDB** | Distributed SQL, high availability | Moderate — sign up at cockroachlabs.com |
| **Turso** | Edge-replicated SQLite (libSQL) | Low — sign up at turso.tech, get URL + token |
| **DynamoDB** | AWS-native, serverless | Moderate — need AWS credentials and region |

---

## 11. CLI Reference

```
AgenticMail Enterprise CLI

Commands:
  setup                   Interactive setup wizard (default)
  validate <path>         Validate a community skill manifest
    --all                 Validate all skills in community-skills/
    --json                Machine-readable output
  build-skill             AI-assisted skill scaffolding
  submit-skill <path>     Submit a skill as a PR
  recover                 Recover a domain registration on a new machine
  verify-domain           Check DNS verification for your domain

Domain Registration:
  agenticmail-enterprise recover --domain agents.agenticmail.io --key <hex>
  agenticmail-enterprise verify-domain
  agenticmail-enterprise verify-domain --domain agents.agenticmail.io

Skill Development:
  agenticmail-enterprise validate ./community-skills/github-issues/
  agenticmail-enterprise validate --all
  agenticmail-enterprise build-skill
  agenticmail-enterprise submit-skill ./community-skills/my-skill/
```

### Registry Server (for AgenticMail operators)

If you're self-hosting the domain registry:

```bash
node dist/registry/cli.js --port 8080 --db ./registry.db
```

Set `AGENTICMAIL_REGISTRY_URL` to point your deployments at your own registry:

```bash
export AGENTICMAIL_REGISTRY_URL=https://your-registry.example.com/v1
```

---

## 12. Troubleshooting

### "Domain already registered" (409 error)

This means someone has already registered and verified this domain. If it's yours:

```bash
agenticmail-enterprise recover --domain your.domain.com
```

If the domain was registered but never verified (pending DNS), re-registration is allowed automatically.

### "Registry unavailable" during setup

The AgenticMail registry couldn't be reached. This is non-blocking — select "Continue setup without registration" and register later:

```bash
agenticmail-enterprise verify-domain
```

### DNS record not found

- **Wait** — DNS propagation can take up to 48 hours
- **Check the record** — ensure host is `_agenticmail-verify.yourdomain.com` (not `_agenticmail-verify.yourdomain.com.yourdomain.com`)
- **Check the value** — must be the exact `am-verify=...` string, including the `am-verify=` prefix
- **Check TTL** — lower TTL values propagate faster

### Lost deployment key

If you've lost your deployment key, there is **no recovery path**. The key is never stored in plaintext anywhere — not on the registry, not on your machine. You would need to:

1. Contact AgenticMail support to deregister the domain (requires proof of domain ownership)
2. Re-register with a new key

This is by design — it prevents anyone (including AgenticMail) from taking over your deployment.

### Database connection fails

- Check your connection string format matches the examples in [Database Backends](#10-database-backends-reference)
- Ensure the database server is running and accessible from your machine
- For SQLite, ensure the directory exists and is writable
- For managed databases (Supabase, Neon, etc.), check that SSL/TLS settings are correct

### Server won't start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Try a different port by setting PORT environment variable
PORT=3001 npx @agenticmail/enterprise
```

---

## Quick Start Summary

For the impatient — here's the fastest path from zero to running:

```bash
# 1. Run the setup wizard
npx @agenticmail/enterprise

# 2. Follow the prompts:
#    - Enter company name, email, password
#    - Pick SQLite (easiest)
#    - Pick Local (for testing) or Docker (for production)
#    - Add custom domain (optional but recommended)
#    - Register domain and SAVE YOUR DEPLOYMENT KEY

# 3. Add DNS TXT record (if you registered a domain)
#    Host:  _agenticmail-verify.yourdomain.com
#    Type:  TXT
#    Value: am-verify=... (from setup output)

# 4. Verify DNS (when ready)
agenticmail-enterprise verify-domain

# 5. Open dashboard
open http://localhost:3000
```

That's it. Your AI agents are ready to deploy behind your firewall.

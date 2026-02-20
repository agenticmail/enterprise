/**
 * Agent Configuration Builder
 *
 * Generates the full workspace config for a deployed agent:
 * SOUL.md, USER.md, AGENTS.md, HEARTBEAT.md, gateway config, etc.
 * Everything needed to spin up a fully configured agent from the admin dashboard.
 */

// ─── Types ──────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  name: string;
  displayName: string;                    // Human-facing name
  
  // Identity
  identity: {
    personality: string;                  // SOUL.md content — who the agent IS
    role: string;                         // e.g. "Customer Support Lead"
    tone: 'formal' | 'casual' | 'professional' | 'friendly' | 'custom';
    customTone?: string;
    language: string;                     // Primary language (e.g. "en", "es", "fr")
    avatar?: string;                      // URL or base64
    gender?: string;                      // e.g. "male", "female", "non-binary"
    dateOfBirth?: string;                 // ISO date string (e.g. "1994-03-15")
    age?: number;                         // Derived from dateOfBirth at runtime
    ageRange?: string;                    // e.g. "young", "mid-career", "senior" (auto-derived if age given)
    maritalStatus?: string;              // e.g. "single", "married", "prefer-not-to-say"
    culturalBackground?: string;          // e.g. "north-american", "east-asian"
    traits?: {                            // Personality trait axes
      communication?: 'direct' | 'diplomatic';
      detail?: 'big-picture' | 'detail-oriented';
      energy?: 'enthusiastic' | 'calm';
      humor?: 'witty' | 'dry' | 'warm' | 'none';
      formality?: 'formal' | 'casual' | 'adaptive';
      empathy?: 'high' | 'moderate' | 'reserved';
      patience?: 'patient' | 'efficient';
      creativity?: 'creative' | 'conventional';
    };
  };

  // Model
  model: {
    provider: string;  // Any registered or custom provider (see runtime/providers.ts)
    modelId: string;                      // e.g. "claude-sonnet-4-20250514", "gpt-4o"
    thinkingLevel: 'off' | 'low' | 'medium' | 'high';
    temperature?: number;
    maxTokens?: number;
    fallbackModelId?: string;             // Fallback if primary is down
    baseUrl?: string;                    // Custom endpoint override
    headers?: Record<string, string>;    // Custom headers
  };

  // Communication channels
  channels: {
    enabled: ChannelConfig[];
    primaryChannel: string;               // Which channel is default
  };

  // Email
  email: {
    enabled: boolean;
    provider: 'relay' | 'domain' | 'none';
    address?: string;                     // e.g. "support@agenticmail.io"
    relayConfig?: { email: string; appPassword: string; provider: 'gmail' | 'outlook' };
    domainConfig?: { domain: string; cloudflareToken: string };
    signature?: string;
    autoReply?: { enabled: boolean; message: string; afterHours: boolean };
  };

  // Workspace
  workspace: {
    persistentMemory: boolean;            // Keep memory across restarts
    memoryMaxSizeMb: number;
    workingDirectory: string;             // Where the agent's files live
    sharedDirectories: string[];          // Directories shared between agents
    gitEnabled: boolean;                  // Auto-commit workspace changes
  };

  // Heartbeat & scheduling
  heartbeat: {
    enabled: boolean;
    intervalMinutes: number;
    checks: string[];                     // What to check: ['email', 'calendar', 'tickets']
  };

  // Context
  context: {
    userInfo?: string;                    // USER.md content — info about the user/company
    customInstructions?: string;          // Additional AGENTS.md instructions
    knowledgeBase?: string[];             // Paths or URLs to reference docs
  };

  // Tool security overrides (merged with org defaults at runtime)
  toolSecurity?: {
    security?: {
      pathSandbox?: { enabled?: boolean; allowedDirs?: string[]; blockedPatterns?: string[] };
      ssrf?: { enabled?: boolean; allowedHosts?: string[]; blockedCidrs?: string[] };
      commandSanitizer?: { enabled?: boolean; mode?: 'blocklist' | 'allowlist'; allowedCommands?: string[]; blockedPatterns?: string[] };
    };
    middleware?: {
      audit?: { enabled?: boolean; redactKeys?: string[] };
      rateLimit?: { enabled?: boolean; overrides?: Record<string, { maxTokens: number; refillRate: number }> };
      circuitBreaker?: { enabled?: boolean };
      telemetry?: { enabled?: boolean };
    };
  };

  // Permission profile
  permissionProfileId: string;

  // Deployment
  deployment: {
    target: DeploymentTarget;
    config: DeploymentConfig;
    status: DeploymentStatus;
  };

  createdAt: string;
  updatedAt: string;
}

export interface ChannelConfig {
  type: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'email' | 'web' | 'api';
  enabled: boolean;
  config: Record<string, any>;           // Channel-specific config (tokens, webhook URLs, etc.)
}

export type DeploymentTarget = 'docker' | 'vps' | 'fly' | 'railway' | 'aws' | 'gcp' | 'azure' | 'local';

export interface DeploymentConfig {
  // Docker
  docker?: {
    image: string;
    tag: string;
    ports: number[];
    volumes: string[];
    env: Record<string, string>;
    resources: { cpuLimit: string; memoryLimit: string };
    restart: 'always' | 'unless-stopped' | 'on-failure' | 'no';
    network?: string;
  };

  // VPS / bare metal
  vps?: {
    host: string;
    port: number;
    user: string;
    authMethod: 'key' | 'password';
    sshKeyPath?: string;
    installPath: string;                  // Where to install on the VPS
    systemd: boolean;                     // Use systemd for process management
    sudo: boolean;
  };

  // Cloud platforms
  cloud?: {
    provider: 'fly' | 'railway' | 'aws' | 'gcp' | 'azure';
    region: string;
    size: string;                         // Instance size / machine type
    apiToken: string;
    appName?: string;                     // Auto-generated if not set
    customDomain?: string;
  };
}

export type DeploymentStatus =
  | 'not-deployed'
  | 'provisioning'
  | 'deploying'
  | 'running'
  | 'stopped'
  | 'error'
  | 'updating';

// ─── Config Generator ───────────────────────────────────

export class AgentConfigGenerator {

  /**
   * Generate the complete workspace files for an agent
   */
  generateWorkspace(config: AgentConfig): WorkspaceFiles {
    return {
      'SOUL.md': this.generateSoul(config),
      'USER.md': this.generateUser(config),
      'AGENTS.md': this.generateAgents(config),
      'IDENTITY.md': this.generateIdentity(config),
      'HEARTBEAT.md': this.generateHeartbeat(config),
      'TOOLS.md': this.generateTools(config),
      'MEMORY.md': `# MEMORY.md — ${config.displayName}'s Long-Term Memory\n\n_Created ${new Date().toISOString()}_\n`,
    };
  }

  /**
   * Generate the gateway config for this agent
   */
  generateGatewayConfig(config: AgentConfig): GatewayConfig {
    const channels: Record<string, any> = {};

    for (const ch of config.channels.enabled) {
      if (!ch.enabled) continue;
      channels[ch.type] = ch.config;
    }

    return {
      model: `${config.model.provider}/${config.model.modelId}`,
      thinking: config.model.thinkingLevel,
      temperature: config.model.temperature,
      maxTokens: config.model.maxTokens,
      channels,
      heartbeat: config.heartbeat.enabled ? {
        intervalMinutes: config.heartbeat.intervalMinutes,
      } : undefined,
      workspace: config.workspace.workingDirectory,
    };
  }

  /**
   * Generate a docker-compose.yml for this agent
   */
  generateDockerCompose(config: AgentConfig): string {
    const dc = config.deployment.config.docker;
    if (!dc) throw new Error('No Docker config');

    const env = { ...dc.env };
    // Inject standard vars
    env['AGENTICMAIL_MODEL'] = `${config.model.provider}/${config.model.modelId}`;
    env['AGENTICMAIL_THINKING'] = config.model.thinkingLevel;
    if (config.email.enabled && config.email.address) {
      env['AGENTICMAIL_EMAIL'] = config.email.address;
    }

    const envLines = Object.entries(env).map(([k, v]) => `      ${k}: "${v}"`).join('\n');
    const volumes = dc.volumes.map(v => `      - ${v}`).join('\n');
    const ports = dc.ports.map(p => `      - "${p}:${p}"`).join('\n');

    return `version: "3.8"

services:
  ${config.name}:
    image: ${dc.image}:${dc.tag}
    container_name: agenticmail-${config.name}
    restart: ${dc.restart}
    ports:
${ports}
    volumes:
${volumes}
    environment:
${envLines}
    deploy:
      resources:
        limits:
          cpus: "${dc.resources.cpuLimit}"
          memory: ${dc.resources.memoryLimit}
${dc.network ? `    networks:\n      - ${dc.network}\n\nnetworks:\n  ${dc.network}:\n    external: true` : ''}
`;
  }

  /**
   * Generate a systemd service file for VPS deployment
   */
  generateSystemdUnit(config: AgentConfig): string {
    const vps = config.deployment.config.vps;
    if (!vps) throw new Error('No VPS config');

    return `[Unit]
Description=AgenticMail Agent: ${config.displayName}
After=network.target

[Service]
Type=simple
User=${vps.user}
WorkingDirectory=${vps.installPath}
ExecStart=/usr/bin/env node ${vps.installPath}/node_modules/.bin/agenticmail-enterprise start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=AGENTICMAIL_MODEL=${config.model.provider}/${config.model.modelId}
Environment=AGENTICMAIL_THINKING=${config.model.thinkingLevel}

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${vps.installPath}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
  }

  /**
   * Generate a deployment script for VPS
   */
  generateVPSDeployScript(config: AgentConfig): string {
    const vps = config.deployment.config.vps;
    if (!vps) throw new Error('No VPS config');

    return `#!/bin/bash
set -euo pipefail

# AgenticMail Agent Deployment Script
# Agent: ${config.displayName}
# Target: ${vps.host}

echo "🚀 Deploying ${config.displayName} to ${vps.host}..."

INSTALL_PATH="${vps.installPath}"
${vps.sudo ? 'SUDO="sudo"' : 'SUDO=""'}

# 1. Install Node.js if needed
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi

# 2. Create workspace
mkdir -p "$INSTALL_PATH/workspace"
cd "$INSTALL_PATH"

# 3. Install AgenticMail Enterprise
echo "📦 Installing packages..."
npm init -y 2>/dev/null || true
npm install @agenticmail/enterprise @agenticmail/core agenticmail

# 4. Write workspace files
echo "📝 Writing agent configuration..."
${Object.entries(this.generateWorkspace(config)).map(([file, content]) =>
  `cat > "$INSTALL_PATH/workspace/${file}" << 'WORKSPACE_EOF'\n${content}\nWORKSPACE_EOF`
).join('\n\n')}

# 5. Write gateway config
cat > "$INSTALL_PATH/config.yaml" << 'CONFIG_EOF'
${JSON.stringify(this.generateGatewayConfig(config), null, 2)}
CONFIG_EOF

# 6. Install systemd service
echo "⚙️ Installing systemd service..."
$SUDO tee /etc/systemd/system/agenticmail-${config.name}.service > /dev/null << 'SERVICE_EOF'
${this.generateSystemdUnit(config)}
SERVICE_EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable agenticmail-${config.name}
$SUDO systemctl start agenticmail-${config.name}

echo "✅ ${config.displayName} deployed and running!"
echo "   Status: systemctl status agenticmail-${config.name}"
echo "   Logs:   journalctl -u agenticmail-${config.name} -f"
`;
  }

  // ─── Private Generators ─────────────────────────────

  private generateSoul(config: AgentConfig): string {
    const id = config.identity;

    // If a full personality was provided (from soul template), append persona context to it
    if (id.personality && id.personality.length > 200) {
      const personaBlock = this.buildPersonaBlock(config);
      return personaBlock ? id.personality + '\n\n' + personaBlock : id.personality;
    }

    const toneMap: Record<string, string> = {
      formal: 'Be professional and precise. Use proper grammar. Avoid slang or casual language.',
      casual: 'Be relaxed and conversational. Use contractions. Feel free to be informal.',
      professional: 'Be competent and clear. Direct communication without being stiff.',
      friendly: 'Be warm and approachable. Show genuine interest. Use a positive tone.',
      custom: id.customTone || '',
    };

    const personaSection = this.buildPersonaBlock(config);

    return `# SOUL.md — Who You Are

## Role
You are **${config.displayName}**, a ${id.role}.

## Communication Style
${toneMap[id.tone] || toneMap['professional']}

## Language
Primary language: ${id.language}
${personaSection ? '\n' + personaSection + '\n' : ''}
## Core Principles
- Be genuinely helpful, not performatively helpful
- Be resourceful — try to figure things out before asking
- Earn trust through competence
- Keep private information private

## Boundaries
- Never share confidential company information
- Ask before taking irreversible actions
- Stay within your assigned role and permissions
`;
  }

  /** Calculate current age from a date-of-birth string */
  static deriveAge(dateOfBirth: string): number {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  private buildPersonaBlock(config: AgentConfig): string {
    const id = config.identity;
    const lines: string[] = [];

    // Derive live age from DOB
    const liveAge = id.dateOfBirth ? AgentConfigGenerator.deriveAge(id.dateOfBirth) : id.age;

    if (id.gender || liveAge || id.ageRange || id.maritalStatus || id.culturalBackground || id.traits) {
      lines.push('## Persona');
      lines.push(`Your name is **${config.displayName}**. This is your real identity — introduce yourself by this name and respond to it naturally. You embody the following personal characteristics. These are core to who you are — reflect them naturally in your communication style, references, perspectives, and behavior.\n`);
    }

    if (id.gender) {
      const genderMap: Record<string, string> = {
        male: 'You present as male. Use he/him pronouns when referring to yourself in the third person.',
        female: 'You present as female. Use she/her pronouns when referring to yourself in the third person.',
        'non-binary': 'You present as non-binary. Use they/them pronouns when referring to yourself in the third person.',
      };
      if (genderMap[id.gender]) lines.push(genderMap[id.gender]);
    }

    if (id.dateOfBirth) {
      const dob = new Date(id.dateOfBirth);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      lines.push(`You were born on ${monthNames[dob.getMonth()]} ${dob.getDate()}, ${dob.getFullYear()}. You are currently ${liveAge} years old. This is your real birthday and age — let it naturally inform your frame of reference, cultural touchstones, energy level, and life experience.`);
    } else if (liveAge) {
      lines.push(`You are ${liveAge} years old. This is your actual age — let it naturally inform your frame of reference, cultural touchstones, energy level, and life experience that you draw from.`);
    } else if (id.ageRange) {
      const ageMap: Record<string, string> = {
        young: 'You are a young professional in your 20s-30s. You bring fresh perspectives, are comfortable with modern technology and trends, and communicate with energy and adaptability. Your references and examples tend to be contemporary.',
        'mid-career': 'You are a mid-career professional in your 30s-40s. You balance youthful energy with substantial experience. You have seen enough to know what works, and you bring both confidence and openness to your interactions.',
        senior: 'You are a senior veteran professional in your 50s+. You draw on decades of experience and wisdom. You communicate with gravitas, patience, and deep institutional knowledge. You mentor naturally and reference time-tested principles.',
      };
      if (ageMap[id.ageRange]) lines.push(ageMap[id.ageRange]);
    }

    if (id.maritalStatus) {
      const maritalMap: Record<string, string> = {
        single: 'You are single. This shapes your availability mindset — you are flexible with your time and can relate to independent lifestyles.',
        married: 'You are married. You understand partnership, compromise, and family-oriented priorities. You naturally reference teamwork and shared responsibility.',
        divorced: 'You have been through a divorce. This gives you resilience, empathy for difficult transitions, and a pragmatic outlook on change.',
        widowed: 'You are widowed. You carry deep empathy, emotional maturity, and an appreciation for what matters most.',
        'in-a-relationship': 'You are in a relationship. You bring warmth and relational awareness to your interactions.',
      };
      if (maritalMap[id.maritalStatus]) lines.push(maritalMap[id.maritalStatus]);
    }

    if (id.culturalBackground) {
      const cultureMap: Record<string, string> = {
        'north-american': 'Your cultural background is North American. You communicate directly, value efficiency and individual initiative, use informal greetings, and are comfortable with straightforward feedback.',
        'british-european': 'Your cultural background is British/European. You communicate with polite understatement, appreciate structured formality, use measured and precise language, and value diplomatic phrasing.',
        'latin-american': 'Your cultural background is Latin American. You communicate with warmth, prioritize building personal relationships before business, are expressive and personable, and value hospitality in interactions.',
        'middle-eastern': 'Your cultural background is Middle Eastern. You communicate with respect and hospitality, are context-aware in formality, value honor and trust-building, and show generous courtesy in your interactions.',
        'east-asian': 'Your cultural background is East Asian. You communicate with indirect harmony, show respect for hierarchy and seniority, exercise thoughtful precision in your words, and value group consensus over individual assertion.',
        'south-asian': 'Your cultural background is South Asian. You communicate with adaptable formality, are relationship-aware and respectful of elders and authority, blend traditional values with modern pragmatism, and show warmth through attentiveness.',
        'southeast-asian': 'Your cultural background is Southeast Asian. You communicate gently and diplomatically, seek consensus in group settings, show deference and politeness, and value harmony over confrontation.',
        'african': 'Your cultural background is African. You communicate with community orientation, warmth, and storytelling richness. You value collective wisdom, show respect for elders and tradition, and bring vibrant energy to interactions.',
        'caribbean': 'Your cultural background is Caribbean. You communicate with friendly warmth, approachable energy, and resilient optimism. You value community, bring vibrant personality to interactions, and balance professionalism with genuine connection.',
        'australian-pacific': 'Your cultural background is Australian/Pacific. You communicate casually and straightforwardly, value egalitarianism, use humor naturally, and keep interactions grounded and unpretentious.',
      };
      if (cultureMap[id.culturalBackground]) lines.push(cultureMap[id.culturalBackground]);
    }

    if (id.traits) {
      const traitLines: string[] = [];
      if (id.traits.communication === 'direct') traitLines.push('You are direct and straightforward — you say what you mean clearly without excessive hedging.');
      if (id.traits.communication === 'diplomatic') traitLines.push('You are diplomatic — you frame feedback constructively, soften disagreements, and prioritize preserving relationships.');
      if (id.traits.detail === 'big-picture') traitLines.push('You focus on the big picture — you lead with strategy, outcomes, and high-level thinking before diving into specifics.');
      if (id.traits.detail === 'detail-oriented') traitLines.push('You are detail-oriented — you are thorough, precise, and ensure nothing falls through the cracks.');
      if (id.traits.energy === 'enthusiastic') traitLines.push('You are enthusiastic — you bring visible energy, optimism, and momentum to every interaction.');
      if (id.traits.energy === 'calm') traitLines.push('You are calm and measured — you project steadiness, think before responding, and bring a grounding presence.');
      if (id.traits.humor === 'witty') traitLines.push('You have a witty sense of humor — you use clever wordplay, quick observations, and well-timed remarks to keep interactions engaging.');
      if (id.traits.humor === 'dry') traitLines.push('You have a dry sense of humor — you deliver deadpan observations and understated irony that reward attentive listeners.');
      if (id.traits.humor === 'warm') traitLines.push('You have a warm sense of humor — you use gentle, inclusive humor that puts people at ease and builds rapport.');
      if (id.traits.humor === 'none') traitLines.push('You keep things strictly professional — you avoid humor and focus entirely on substance and clarity.');
      if (id.traits.formality === 'formal') traitLines.push('You maintain a formal communication style — you use proper titles, structured language, and professional conventions.');
      if (id.traits.formality === 'casual') traitLines.push('You are casual and approachable — you use conversational language, contractions, and a friendly, relaxed tone.');
      if (id.traits.formality === 'adaptive') traitLines.push('You adapt your formality to context — you match the tone of whoever you are speaking with, formal when needed, relaxed when appropriate.');
      if (id.traits.empathy === 'high') traitLines.push('You are highly empathetic — you actively acknowledge emotions, validate feelings, and prioritize emotional connection alongside the task at hand.');
      if (id.traits.empathy === 'moderate') traitLines.push('You show moderate empathy — you are aware of and responsive to emotions without letting them overshadow practical outcomes.');
      if (id.traits.empathy === 'reserved') traitLines.push('You are emotionally reserved — you focus on facts and logic, offering support through competence rather than emotional expression.');
      if (id.traits.patience === 'patient') traitLines.push('You are exceptionally patient — you take time to explain, repeat when needed, and never rush or show frustration.');
      if (id.traits.patience === 'efficient') traitLines.push('You prioritize efficiency — you get to the point quickly, value brevity, and keep interactions focused and productive.');
      if (id.traits.creativity === 'creative') traitLines.push('You are creative and inventive — you suggest novel approaches, think outside the box, and bring fresh perspectives to problems.');
      if (id.traits.creativity === 'conventional') traitLines.push('You favor proven approaches — you rely on established best practices, standard methods, and time-tested solutions.');
      if (traitLines.length) lines.push(traitLines.join(' '));
    }

    return lines.length > 1 ? lines.join('\n') : '';
  }

  private generateUser(config: AgentConfig): string {
    return config.context?.userInfo || `# USER.md — About Your Organization\n\n_Configure this from the admin dashboard._\n`;
  }

  private generateAgents(config: AgentConfig): string {
    const customInstructions = config.context?.customInstructions || '';
    return `# AGENTS.md — Your Workspace

## Every Session
1. Read SOUL.md — this is who you are
2. Read USER.md — this is who you're helping
3. Check memory/ for recent context

## Memory
- Daily notes: memory/YYYY-MM-DD.md
- Long-term: MEMORY.md

## Safety
- Don't exfiltrate private data
- Don't run destructive commands without asking
- When in doubt, ask

${customInstructions}
`;
  }

  private generateIdentity(config: AgentConfig): string {
    const id = config.identity;
    const lines = [
      '# IDENTITY.md\n',
      `- **Name:** ${config.displayName}`,
      `- **Role:** ${id.role}`,
      `- **Tone:** ${id.tone}`,
      `- **Language:** ${id.language || 'en'}`,
    ];
    if (id.gender) lines.push(`- **Gender:** ${id.gender}`);
    if (id.dateOfBirth) {
      const age = AgentConfigGenerator.deriveAge(id.dateOfBirth);
      lines.push(`- **Date of Birth:** ${id.dateOfBirth}`);
      lines.push(`- **Age:** ${age}`);
    } else if (id.age) {
      lines.push(`- **Age:** ${id.age}`);
    }
    if (id.ageRange) lines.push(`- **Age Range:** ${{ young: 'Young Professional (20s-30s)', 'mid-career': 'Mid-Career (30s-40s)', senior: 'Senior / Veteran (50s+)' }[id.ageRange] || id.ageRange}`);
    if (id.maritalStatus) lines.push(`- **Marital Status:** ${id.maritalStatus.replace(/-/g, ' ')}`);
    if (id.culturalBackground) lines.push(`- **Cultural Background:** ${id.culturalBackground.replace(/-/g, ' ')}`);
    if (id.traits) {
      if (id.traits.communication) lines.push(`- **Communication Style:** ${id.traits.communication}`);
      if (id.traits.detail) lines.push(`- **Focus:** ${id.traits.detail}`);
      if (id.traits.energy) lines.push(`- **Energy:** ${id.traits.energy}`);
      if (id.traits.humor) lines.push(`- **Humor:** ${id.traits.humor}`);
      if (id.traits.formality) lines.push(`- **Formality:** ${id.traits.formality}`);
      if (id.traits.empathy) lines.push(`- **Empathy:** ${id.traits.empathy}`);
      if (id.traits.patience) lines.push(`- **Patience:** ${id.traits.patience}`);
      if (id.traits.creativity) lines.push(`- **Creativity:** ${id.traits.creativity}`);
    }
    return lines.join('\n') + '\n';
  }

  private generateHeartbeat(config: AgentConfig): string {
    if (!config.heartbeat.enabled) return '# HEARTBEAT.md\n# Heartbeat disabled\n';

    const checks = config.heartbeat.checks.map(c => `- Check ${c}`).join('\n');
    return `# HEARTBEAT.md

## Periodic Checks
${checks}

## Schedule
Check every ${config.heartbeat.intervalMinutes} minutes during active hours.
`;
  }

  private generateTools(config: AgentConfig): string {
    return `# TOOLS.md — Local Notes

_Add environment-specific notes here (camera names, SSH hosts, etc.)_
`;
  }
}

// ─── Output Types ───────────────────────────────────────

export type WorkspaceFiles = Record<string, string>;

export interface GatewayConfig {
  model: string;
  thinking: string;
  temperature?: number;
  maxTokens?: number;
  channels: Record<string, any>;
  heartbeat?: { intervalMinutes: number };
  workspace: string;
}

#!/usr/bin/env node
/**
 * Generate native integration tool files from MCP adapters.
 * Run: node scripts/generate-integration-tools.js
 *
 * Creates:
 *   src/agent-tools/tools/integrations/{name}.ts   — one per adapter
 *   src/agent-tools/tools/integrations/index.ts    — barrel export
 *   src/agent-tools/tools/integrations/_seed-data.json — DB seed data
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(ROOT, 'src/mcp/adapters');
const OUT_DIR = path.join(ROOT, 'src/agent-tools/tools/integrations');

// Ensure output dir
fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs.readdirSync(ADAPTER_DIR).filter(f => f.endsWith('.adapter.ts') && f !== 'index.ts');
const generated = [];

for (const f of files) {
  const c = fs.readFileSync(path.join(ADAPTER_DIR, f), 'utf8');
  const skillId = (c.match(/skillId:\s*'([^']+)'/) || [])[1];
  const adapterName = (c.match(/^\s*name:\s*'([^']+)'/m) || [])[1];
  const exportName = (c.match(/export\s+(?:const|var)\s+(\w+Adapter)\b/) || [])[1];
  if (!skillId || !exportName) { console.warn('Skip', f, '- missing skillId or export'); continue; }

  // camelCase function name
  const camel = skillId.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  const fnName = 'create' + pascal + 'Tools';
  const outFile = f.replace('.adapter.ts', '.ts');
  const adapterImport = '../../../mcp/adapters/' + f.replace('.ts', '.js');

  const content = `/**
 * ${adapterName} Integration Tools
 *
 * Native agent tools for ${adapterName} API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { ${exportName} } from '${adapterImport}';

export function ${fnName}(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(${exportName}, config);
}
`;

  fs.writeFileSync(path.join(OUT_DIR, outFile), content);

  // Extract tool info for seed data
  const authType = (c.match(/auth:\s*\{[^}]*type:\s*'([^']+)'/) || [])[1] || 'token';
  const toolsBlock = (c.match(/tools:\s*\{([^}]+)\}/) || [])[1] || '';
  const toolKeys = toolsBlock.split('\n')
    .map(l => (l.trim().match(/^(\w[\w_]*):\s*\w/) || [])[1])
    .filter(Boolean);

  const tools = toolKeys.map(key => ({
    id: key,
    name: key.replace(/_/g, ' '),
    description: key,
  }));

  // Category detection
  const fn = outFile.toLowerCase();
  let category = 'general';
  if (/slack|discord|telegram|twilio|whatsapp|webex|ringcentral|zoom|miro|calendly|loom|whereby|gotomeeting|mailgun|postmark|mailchimp|intercom|sendgrid|front|drift|crisp|livechat/.test(fn)) category = 'communication';
  else if (/hubspot|pipedrive|zendesk|freshdesk|freshsales|zoho|close|copper|apollo|gong|outreach|salesloft|salesforce/.test(fn)) category = 'crm';
  else if (/asana|todoist|monday|trello|confluence|airtable|dropbox|clickup|basecamp|shortcut|smartsheet|teamwork|wrike|notion/.test(fn)) category = 'productivity';
  else if (/gitlab|bitbucket|circleci|vercel|github|docker|azure-devops|launchdarkly/.test(fn)) category = 'devops';
  else if (/aws|google-cloud|cloudflare|kubernetes|terraform|heroku|netlify|render|flyio|digitalocean|hashicorp|snowflake/.test(fn)) category = 'infrastructure';
  else if (/mongodb|supabase|firebase|neon|weaviate|pinecone|openai|huggingface/.test(fn)) category = 'data-ai';
  else if (/datadog|mixpanel|google-analytics|segment|sentry|newrelic|grafana|splunk|pagerduty|opsgenie|statuspage/.test(fn)) category = 'monitoring';
  else if (/snyk|crowdstrike|okta|auth0/.test(fn)) category = 'security';
  else if (/google-ads|activecampaign|klaviyo|buffer|hootsuite|contentful|sanity|webflow/.test(fn)) category = 'marketing';
  else if (/figma|canva|pandadoc|box|adobe/.test(fn)) category = 'design';
  else if (/quickbooks|docusign|xero|freshbooks|paypal|square|brex|plaid|chargebee|paddle|recurly|zuora|stripe|netsuite/.test(fn)) category = 'finance';
  else if (/bamboo|workday|gusto|lever|greenhouse|rippling|adp|personio|lattice|hibob/.test(fn)) category = 'hr';
  else if (/twitter|linkedin|youtube|reddit/.test(fn)) category = 'social';
  else if (/shopify|woo|bigcommerce/.test(fn)) category = 'ecommerce';
  else if (/wordpress/.test(fn)) category = 'cms';
  else if (/sap|power-automate|servicenow/.test(fn)) category = 'enterprise';

  generated.push({ outFile, fnName, exportName, skillId, adapterName, category, authType, tools });
}

console.log(`Generated ${generated.length} tool files`);

// ─── Generate index.ts barrel ────────────────────────────

const indexLines = [
  '/**',
  ' * Integration Tools — All 3rd-party service integrations',
  ' *',
  ` * ${generated.length} integrations with ${generated.reduce((s, g) => s + g.tools.length, 0)}+ tools.`,
  ' * Each file wraps an MCP adapter into native agent tools.',
  ' * Tools are only created when vault credentials exist.',
  ' *',
  ' * Auto-generated by scripts/generate-integration-tools.js',
  ' * Do not edit manually.',
  ' */',
  '',
  "import type { AnyAgentTool } from '../../types.js';",
  "import type { IntegrationConfig } from './_factory.js';",
  "export type { IntegrationConfig } from './_factory.js';",
  '',
  '// ─── Individual exports ─────────────────────────────────',
  '',
];

for (const g of generated) {
  indexLines.push(`export { ${g.fnName} } from './${g.outFile.replace('.ts', '.js')}';`);
}

indexLines.push('');
indexLines.push('// ─── Imports for createAllIntegrationTools ───────────');
indexLines.push('');

for (const g of generated) {
  indexLines.push(`import { ${g.fnName} } from './${g.outFile.replace('.ts', '.js')}';`);
}

indexLines.push('');
indexLines.push('/** All integration tool creators */');
indexLines.push('const ALL_CREATORS: Array<(config: IntegrationConfig) => Promise<AnyAgentTool[]>> = [');
for (const g of generated) {
  indexLines.push(`  ${g.fnName},`);
}
indexLines.push('];');
indexLines.push('');
indexLines.push('/**');
indexLines.push(' * Create all integration tools that have credentials in the vault.');
indexLines.push(' * Each creator returns [] if credentials are missing — no errors thrown.');
indexLines.push(' */');
indexLines.push('export async function createAllIntegrationTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {');
indexLines.push('  const results = await Promise.allSettled(ALL_CREATORS.map(fn => fn(config)));');
indexLines.push('  const tools: AnyAgentTool[] = [];');
indexLines.push('  let serviceCount = 0;');
indexLines.push('  for (const r of results) {');
indexLines.push("    if (r.status === 'fulfilled' && r.value.length > 0) {");
indexLines.push('      tools.push(...r.value);');
indexLines.push('      serviceCount++;');
indexLines.push('    }');
indexLines.push('  }');
indexLines.push("  if (tools.length > 0) console.log(`[integrations] Loaded ${tools.length} tools from ${serviceCount} services`);");
indexLines.push('  return tools;');
indexLines.push('}');
indexLines.push('');

fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), indexLines.join('\n'));
console.log('Generated index.ts barrel');

// ─── Generate _seed-data.json ────────────────────────────

const seedData = generated.map(g => ({
  id: g.skillId,
  name: g.adapterName,
  category: g.category,
  authType: g.authType,
  tools: g.tools,
  toolCount: g.tools.length,
}));

fs.writeFileSync(path.join(OUT_DIR, '_seed-data.json'), JSON.stringify(seedData, null, 2));
console.log(`Generated _seed-data.json (${seedData.length} entries, ${seedData.reduce((s, d) => s + d.toolCount, 0)} tools)`);

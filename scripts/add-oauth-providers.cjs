// Quick script to add oauthProvider to oauth2 entries in integration-catalog.ts
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/mcp/integration-catalog.ts');
let content = fs.readFileSync(file, 'utf8');

// Map skillId → oauthProvider
const mapping = {
  'adobe-sign': 'adobe',
  'adp': 'adp',
  'airtable-bases': 'airtable',
  'asana-tasks': 'asana',
  'basecamp': 'basecamp',
  'bitbucket-repos': 'atlassian',
  'box': 'box',
  'buffer': 'buffer',
  'canva-design': 'canva',
  'confluence-wiki': 'atlassian',
  'crowdstrike': 'crowdstrike',
  'docusign-esign': 'docusign',
  'drift': 'drift',
  'dropbox-storage': 'dropbox',
  'figma-design': 'figma',
  'firebase': 'google',
  'freshbooks': 'freshbooks',
  'github-actions': 'github',
  'github': 'github',
  'gitlab-ci': 'gitlab',
  'google-ads': 'google',
  'google-analytics': 'google',
  'google-cloud': 'google',
  'gotomeeting': 'gotomeeting',
  'gusto': 'gusto',
  'hootsuite': 'hootsuite',
  'hubspot-crm': 'hubspot',
  'intercom-support': 'intercom',
  'jira': 'atlassian',
  'lever': 'lever',
  'linear': 'linear',
  'linkedin': 'linkedin',
  'mailchimp-campaigns': 'mailchimp',
  'miro-boards': 'miro',
  'monday-boards': 'monday',
  'netsuite': 'netsuite',
  'notion': 'notion',
  'outreach': 'outreach',
  'paypal': 'paypal',
  'power-automate': 'microsoft',
  'quickbooks-accounting': 'quickbooks',
  'reddit': 'reddit',
  'ringcentral': 'ringcentral',
  'salesforce': 'salesforce',
  'salesloft': 'salesloft',
  'sap': 'sap',
  'servicenow': 'servicenow',
  'slack': 'slack',
  'square': 'square',
  'todoist-tasks': 'todoist',
  'twitter': 'twitter',
  'vercel-deployments': 'vercel',
  'webex': 'webex',
  'webflow': 'webflow',
  'workday': 'workday',
  'wrike': 'wrike',
  'xero': 'xero',
  'youtube': 'google',
  'zendesk-tickets': 'zendesk',
  'zoho-crm': 'zoho',
  'zoom-meetings': 'zoom',
  'zuora': 'zuora',
};

for (const [skillId, provider] of Object.entries(mapping)) {
  // Match the line with this skillId and authType: "oauth2" and add oauthProvider before the closing },
  const re = new RegExp(
    `(\\{ skillId: "${skillId}",.*?authType: "oauth2".*?)(toolCount: \\d+)( },?)`,
  );
  const match = content.match(re);
  if (match) {
    content = content.replace(re, `$1$2, oauthProvider: "${provider}"$3`);
  } else {
    console.log('NOT FOUND:', skillId);
  }
}

fs.writeFileSync(file, content);
console.log('Done! Added oauthProvider to', Object.keys(mapping).length, 'entries');

const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/mcp/integration-catalog.ts');
let c = fs.readFileSync(file, 'utf8');

const fixes = [
  // Change to credentials type with proper fields
  { id: 'activecampaign', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "accountName"], fieldLabels: { apiKey: "API Key", accountName: "Account Name (subdomain before .api-us1.com)" }' },
  { id: 'auth0', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "domain"], fieldLabels: { token: "Management API Token", domain: "Auth0 Domain (e.g. mycompany.auth0.com)" }' },
  { id: 'azure-devops', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "organization"], fieldLabels: { token: "Personal Access Token", organization: "Organization Name" }' },
  { id: 'bamboohr', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "companyDomain"], fieldLabels: { apiKey: "API Key", companyDomain: "Company Subdomain (e.g. mycompany)" }' },
  { id: 'bigcommerce', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["accessToken", "storeHash"], fieldLabels: { accessToken: "Access Token", storeHash: "Store Hash" }' },
  { id: 'chargebee', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "siteName"], fieldLabels: { apiKey: "API Key", siteName: "Site Name (subdomain)" }' },
  { id: 'freshdesk', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "domain"], fieldLabels: { apiKey: "API Key", domain: "Domain (e.g. mycompany.freshdesk.com)" }' },
  { id: 'freshsales', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["token", "domain"], fieldLabels: { token: "API Token", domain: "Domain (e.g. mycompany.myfreshworks.com)" }' },
  { id: 'freshservice', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "domain"], fieldLabels: { apiKey: "API Key", domain: "Domain (e.g. mycompany.freshservice.com)" }' },
  { id: 'grafana', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "instanceUrl"], fieldLabels: { apiKey: "API Key", instanceUrl: "Instance URL (e.g. https://grafana.example.com)" }' },
  { id: 'hashicorp-vault', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["token", "vaultUrl"], fieldLabels: { token: "Vault Token", vaultUrl: "Vault URL (e.g. https://vault.example.com)" }' },
  { id: 'kubernetes-cluster', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "clusterUrl"], fieldLabels: { token: "Service Account Token", clusterUrl: "Cluster API URL (e.g. https://k8s.example.com:6443)" }' },
  { id: 'mailgun', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "domain"], fieldLabels: { apiKey: "API Key", domain: "Sending Domain (e.g. mg.example.com)" }' },
  { id: 'okta', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiToken", "domain"], fieldLabels: { apiToken: "API Token", domain: "Okta Domain (e.g. mycompany.okta.com)" }' },
  { id: 'plaid', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["clientId", "secret", "environment"], fieldLabels: { clientId: "Client ID", secret: "Secret", environment: "Environment (sandbox, development, or production)" }' },
  { id: 'sanity', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "projectId"], fieldLabels: { token: "API Token", projectId: "Project ID" }' },
  { id: 'shopify', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["accessToken", "storeName"], fieldLabels: { accessToken: "Admin API Access Token", storeName: "Store Name (e.g. mystore from mystore.myshopify.com)" }' },
  { id: 'splunk', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "instanceUrl"], fieldLabels: { token: "Bearer Token", instanceUrl: "Splunk Instance URL (e.g. https://splunk.example.com:8089)" }' },
  { id: 'supabase', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "projectRef"], fieldLabels: { apiKey: "API Key (anon or service_role)", projectRef: "Project Reference ID" }' },
  { id: 'teamwork', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "siteName"], fieldLabels: { token: "API Token", siteName: "Site Name (e.g. mycompany from mycompany.teamwork.com)" }' },
  { id: 'weaviate', from: 'authType: "api_key"', to: 'authType: "credentials"', addFields: ', fields: ["apiKey", "clusterUrl"], fieldLabels: { apiKey: "API Key", clusterUrl: "Cluster URL (e.g. https://mycluster.weaviate.network)" }' },
  { id: 'wordpress', from: 'authType: "token"', to: 'authType: "credentials"', addFields: ', fields: ["token", "siteUrl"], fieldLabels: { token: "Application Password", siteUrl: "Site URL (e.g. https://mysite.com)" }' },
  // WooCommerce already has fields but needs siteUrl too
  { id: 'woocommerce', from: 'fields: ["consumerKey", "consumerSecret"]', to: 'fields: ["consumerKey", "consumerSecret", "siteUrl"]', addFields: '' },
  { id: 'woocommerce', from: 'fieldLabels: { consumerKey: "Consumer Key", consumerSecret: "Consumer Secret" }', to: 'fieldLabels: { consumerKey: "Consumer Key", consumerSecret: "Consumer Secret", siteUrl: "Store URL (e.g. https://mystore.com)" }', addFields: '' },
];

let count = 0;
for (const fix of fixes) {
  // Find the line with this skillId
  const lineRe = new RegExp('skillId: "' + fix.id + '"[^\\n]*');
  const match = c.match(lineRe);
  if (!match) { console.log('NOT FOUND:', fix.id); continue; }
  let line = match[0];
  
  if (fix.from && fix.to) {
    if (!line.includes(fix.from)) { console.log('NO MATCH for from:', fix.id, fix.from); continue; }
    line = line.replace(fix.from, fix.to);
  }
  
  if (fix.addFields) {
    // Add fields before the closing }
    // Insert before last }, or before , oauthProvider
    if (line.includes(', oauthProvider:')) {
      line = line.replace(', oauthProvider:', fix.addFields + ', oauthProvider:');
    } else {
      // Insert before closing },
      line = line.replace(/ },?\s*$/, fix.addFields + ' },');
    }
  }
  
  c = c.replace(match[0], line);
  count++;
}

fs.writeFileSync(file, c);
console.log('Fixed', count, 'entries');

/**
 * MCP Skill Adapters — Registry
 *
 * Exports all available skill adapters. The framework registers them
 * and only initializes those with valid credentials in the vault.
 */

import type { SkillAdapter } from '../framework/types.js';

// ─── Phase 1: Flagship Adapters (10) ────────────────────
import { slackAdapter } from './slack.adapter.js';
import { githubAdapter } from './github.adapter.js';
import { jiraAdapter } from './jira.adapter.js';
import { notionAdapter } from './notion.adapter.js';
import { googleDriveAdapter } from './google-drive.adapter.js';
import { stripeAdapter } from './stripe.adapter.js';
import { discordAdapter } from './discord.adapter.js';
import { salesforceAdapter } from './salesforce.adapter.js';
import { linearAdapter } from './linear.adapter.js';
import { teamsAdapter } from './microsoft-teams.adapter.js';

// ─── Communication (16) ─────────────────────────────────
import { twilioAdapter } from './twilio.adapter.js';
import { sendgridAdapter } from './sendgrid.adapter.js';
import { zoomAdapter } from './zoom.adapter.js';
import { whatsappAdapter } from './whatsapp.adapter.js';
import { webexAdapter } from './webex.adapter.js';
import { ringcentralAdapter } from './ringcentral.adapter.js';
import { telegramAdapter } from './telegram.adapter.js';
import { miroAdapter } from './miro.adapter.js';
import { calendlyAdapter } from './calendly.adapter.js';
import { loomAdapter } from './loom.adapter.js';
import { wherebyAdapter } from './whereby.adapter.js';
import { gotomeetingAdapter } from './gotomeeting.adapter.js';
import { mailgunAdapter } from './mailgun.adapter.js';
import { postmarkAdapter } from './postmark.adapter.js';
import { mailchimpAdapter } from './mailchimp.adapter.js';
import { intercomAdapter } from './intercom.adapter.js';

// ─── CRM + Sales (14) ───────────────────────────────────
import { hubspotAdapter } from './hubspot.adapter.js';
import { pipedriveAdapter } from './pipedrive.adapter.js';
import { zendeskAdapter } from './zendesk.adapter.js';
import { freshdeskAdapter } from './freshdesk.adapter.js';
import { freshsalesAdapter } from './freshsales.adapter.js';
import { zohoCrmAdapter } from './zoho-crm.adapter.js';
import { closeAdapter } from './close.adapter.js';
import { copperAdapter } from './copper.adapter.js';
import { apolloAdapter } from './apollo.adapter.js';
import { gongAdapter } from './gong.adapter.js';
import { outreachAdapter } from './outreach.adapter.js';
import { salesloftAdapter } from './salesloft.adapter.js';
import { driftAdapter } from './drift.adapter.js';
import { frontAdapter } from './front.adapter.js';

// ─── Customer Support (3) ────────────────────────────────
import { crispAdapter } from './crisp.adapter.js';
import { livechatAdapter } from './livechat.adapter.js';
import { freshserviceAdapter } from './freshservice.adapter.js';

// ─── Productivity + Project Management (13) ──────────────
import { asanaAdapter } from './asana.adapter.js';
import { todoistAdapter } from './todoist.adapter.js';
import { mondayAdapter } from './monday.adapter.js';
import { trelloAdapter } from './trello.adapter.js';
import { confluenceAdapter } from './confluence.adapter.js';
import { airtableAdapter } from './airtable.adapter.js';
import { dropboxAdapter } from './dropbox.adapter.js';
import { clickupAdapter } from './clickup.adapter.js';
import { basecampAdapter } from './basecamp.adapter.js';
import { shortcutAdapter } from './shortcut.adapter.js';
import { smartsheetAdapter } from './smartsheet.adapter.js';
import { teamworkAdapter } from './teamwork.adapter.js';
import { wrikeAdapter } from './wrike.adapter.js';

// ─── DevOps + CI/CD (8) ─────────────────────────────────
import { gitlabAdapter } from './gitlab.adapter.js';
import { bitbucketAdapter } from './bitbucket.adapter.js';
import { circleciAdapter } from './circleci.adapter.js';
import { vercelAdapter } from './vercel.adapter.js';
import { githubActionsAdapter } from './github-actions.adapter.js';
import { dockerAdapter } from './docker.adapter.js';
import { azureDevopsAdapter } from './azure-devops.adapter.js';
import { launchdarklyAdapter } from './launchdarkly.adapter.js';

// ─── Cloud + Infrastructure (12) ─────────────────────────
import { awsAdapter } from './aws.adapter.js';
import { googleCloudAdapter } from './google-cloud.adapter.js';
import { cloudflareAdapter } from './cloudflare.adapter.js';
import { kubernetesAdapter } from './kubernetes.adapter.js';
import { terraformAdapter } from './terraform.adapter.js';
import { herokuAdapter } from './heroku.adapter.js';
import { netlifyAdapter } from './netlify.adapter.js';
import { renderAdapter } from './render.adapter.js';
import { flyioAdapter } from './flyio.adapter.js';
import { digitaloceanAdapter } from './digitalocean.adapter.js';
import { hashicorpVaultAdapter } from './hashicorp-vault.adapter.js';
import { snowflakeAdapter } from './snowflake.adapter.js';

// ─── Database + AI/ML (7) ────────────────────────────────
import { mongodbAtlasAdapter } from './mongodb-atlas.adapter.js';
import { supabaseAdapter } from './supabase.adapter.js';
import { firebaseAdapter } from './firebase.adapter.js';
import { neonAdapter } from './neon.adapter.js';
import { weaviateAdapter } from './weaviate.adapter.js';
import { pineconeAdapter } from './pinecone.adapter.js';
import { openaiAdapter } from './openai.adapter.js';
import { huggingfaceAdapter } from './huggingface.adapter.js';

// ─── Analytics + Monitoring (10) ─────────────────────────
import { datadogAdapter } from './datadog.adapter.js';
import { mixpanelAdapter } from './mixpanel.adapter.js';
import { googleAnalyticsAdapter } from './google-analytics.adapter.js';
import { segmentAdapter } from './segment.adapter.js';
import { sentryAdapter } from './sentry.adapter.js';
import { newrelicAdapter } from './newrelic.adapter.js';
import { grafanaAdapter } from './grafana.adapter.js';
import { splunkAdapter } from './splunk.adapter.js';
import { pagerdutyAdapter } from './pagerduty.adapter.js';
import { opsgenieAdapter } from './opsgenie.adapter.js';
import { statuspageAdapter } from './statuspage.adapter.js';

// ─── Security + Identity (4) ─────────────────────────────
import { snykAdapter } from './snyk.adapter.js';
import { crowdstrikeAdapter } from './crowdstrike.adapter.js';
import { oktaAdapter } from './okta.adapter.js';
import { auth0Adapter } from './auth0.adapter.js';

// ─── Marketing + Content (8) ─────────────────────────────
import { googleAdsAdapter } from './google-ads.adapter.js';
import { activecampaignAdapter } from './activecampaign.adapter.js';
import { klaviyoAdapter } from './klaviyo.adapter.js';
import { bufferAdapter } from './buffer.adapter.js';
import { hootsuiteAdapter } from './hootsuite.adapter.js';
import { contentfulAdapter } from './contentful.adapter.js';
import { sanityAdapter } from './sanity.adapter.js';
import { webflowAdapter } from './webflow.adapter.js';

// ─── Design + Documents (5) ──────────────────────────────
import { figmaAdapter } from './figma.adapter.js';
import { canvaAdapter } from './canva.adapter.js';
import { pandadocAdapter } from './pandadoc.adapter.js';
import { boxAdapter } from './box.adapter.js';
import { adobeSignAdapter } from './adobe-sign.adapter.js';

// ─── Finance + Payments (12) ─────────────────────────────
import { quickbooksAdapter } from './quickbooks.adapter.js';
import { docusignAdapter } from './docusign.adapter.js';
import { xeroAdapter } from './xero.adapter.js';
import { freshbooksAdapter } from './freshbooks.adapter.js';
import { paypalAdapter } from './paypal.adapter.js';
import { squareAdapter } from './square.adapter.js';
import { brexAdapter } from './brex.adapter.js';
import { plaidAdapter } from './plaid.adapter.js';
import { chargebeeAdapter } from './chargebee.adapter.js';
import { paddleAdapter } from './paddle.adapter.js';
import { recurlyAdapter } from './recurly.adapter.js';
import { zuoraAdapter } from './zuora.adapter.js';

// ─── HR + Recruiting (8) ─────────────────────────────────
import { bamboohrAdapter } from './bamboohr.adapter.js';
import { workdayAdapter } from './workday.adapter.js';
import { gustoAdapter } from './gusto.adapter.js';
import { leverAdapter } from './lever.adapter.js';
import { greenhouseAdapter } from './greenhouse.adapter.js';
import { ripplingAdapter } from './rippling.adapter.js';
import { adpAdapter } from './adp.adapter.js';
import { personioAdapter } from './personio.adapter.js';
import { latticeAdapter } from './lattice.adapter.js';
import { hibobAdapter } from './hibob.adapter.js';

// ─── Social + Media (4) ──────────────────────────────────
import { twitterAdapter } from './twitter.adapter.js';
import { linkedinAdapter } from './linkedin.adapter.js';
import { youtubeAdapter } from './youtube.adapter.js';
import { redditAdapter } from './reddit.adapter.js';

// ─── E-commerce (3) ──────────────────────────────────────
import { shopifyAdapter } from './shopify.adapter.js';
import { woocommerceAdapter } from './woocommerce.adapter.js';
import { bigcommerceAdapter } from './bigcommerce.adapter.js';

// ─── CMS + Website (1) ──────────────────────────────────
import { wordpressAdapter } from './wordpress.adapter.js';

// ─── Enterprise ERP + Automation (3) ─────────────────────
import { sapAdapter } from './sap.adapter.js';
import { powerAutomateAdapter } from './power-automate.adapter.js';
import { netsuiteAdapter } from './netsuite.adapter.js';
import { servicenowAdapter } from './servicenow.adapter.js';

/** All available skill adapters (146 total) */
export const allAdapters: SkillAdapter[] = [
  // Phase 1: Flagship
  slackAdapter,
  githubAdapter,
  jiraAdapter,
  notionAdapter,
  googleDriveAdapter,
  stripeAdapter,
  discordAdapter,
  salesforceAdapter,
  linearAdapter,
  teamsAdapter,
  // Communication
  twilioAdapter,
  sendgridAdapter,
  zoomAdapter,
  whatsappAdapter,
  webexAdapter,
  ringcentralAdapter,
  telegramAdapter,
  miroAdapter,
  calendlyAdapter,
  loomAdapter,
  wherebyAdapter,
  gotomeetingAdapter,
  mailgunAdapter,
  postmarkAdapter,
  mailchimpAdapter,
  intercomAdapter,
  // CRM + Sales
  hubspotAdapter,
  pipedriveAdapter,
  zendeskAdapter,
  freshdeskAdapter,
  freshsalesAdapter,
  zohoCrmAdapter,
  closeAdapter,
  copperAdapter,
  apolloAdapter,
  gongAdapter,
  outreachAdapter,
  salesloftAdapter,
  driftAdapter,
  frontAdapter,
  // Customer Support
  crispAdapter,
  livechatAdapter,
  freshserviceAdapter,
  // Productivity + Project Management
  asanaAdapter,
  todoistAdapter,
  mondayAdapter,
  trelloAdapter,
  confluenceAdapter,
  airtableAdapter,
  dropboxAdapter,
  clickupAdapter,
  basecampAdapter,
  shortcutAdapter,
  smartsheetAdapter,
  teamworkAdapter,
  wrikeAdapter,
  // DevOps + CI/CD
  gitlabAdapter,
  bitbucketAdapter,
  circleciAdapter,
  vercelAdapter,
  githubActionsAdapter,
  dockerAdapter,
  azureDevopsAdapter,
  launchdarklyAdapter,
  // Cloud + Infrastructure
  awsAdapter,
  googleCloudAdapter,
  cloudflareAdapter,
  kubernetesAdapter,
  terraformAdapter,
  herokuAdapter,
  netlifyAdapter,
  renderAdapter,
  flyioAdapter,
  digitaloceanAdapter,
  hashicorpVaultAdapter,
  snowflakeAdapter,
  // Database + AI/ML
  mongodbAtlasAdapter,
  supabaseAdapter,
  firebaseAdapter,
  neonAdapter,
  weaviateAdapter,
  pineconeAdapter,
  openaiAdapter,
  huggingfaceAdapter,
  // Analytics + Monitoring
  datadogAdapter,
  mixpanelAdapter,
  googleAnalyticsAdapter,
  segmentAdapter,
  sentryAdapter,
  newrelicAdapter,
  grafanaAdapter,
  splunkAdapter,
  pagerdutyAdapter,
  opsgenieAdapter,
  statuspageAdapter,
  // Security + Identity
  snykAdapter,
  crowdstrikeAdapter,
  oktaAdapter,
  auth0Adapter,
  // Marketing + Content
  googleAdsAdapter,
  activecampaignAdapter,
  klaviyoAdapter,
  bufferAdapter,
  hootsuiteAdapter,
  contentfulAdapter,
  sanityAdapter,
  webflowAdapter,
  // Design + Documents
  figmaAdapter,
  canvaAdapter,
  pandadocAdapter,
  boxAdapter,
  adobeSignAdapter,
  // Finance + Payments
  quickbooksAdapter,
  docusignAdapter,
  xeroAdapter,
  freshbooksAdapter,
  paypalAdapter,
  squareAdapter,
  brexAdapter,
  plaidAdapter,
  chargebeeAdapter,
  paddleAdapter,
  recurlyAdapter,
  zuoraAdapter,
  // HR + Recruiting
  bamboohrAdapter,
  workdayAdapter,
  gustoAdapter,
  leverAdapter,
  greenhouseAdapter,
  ripplingAdapter,
  adpAdapter,
  personioAdapter,
  latticeAdapter,
  hibobAdapter,
  // Social + Media
  twitterAdapter,
  linkedinAdapter,
  youtubeAdapter,
  redditAdapter,
  // E-commerce
  shopifyAdapter,
  woocommerceAdapter,
  bigcommerceAdapter,
  // CMS + Website
  wordpressAdapter,
  // Enterprise ERP + Automation
  sapAdapter,
  powerAutomateAdapter,
  netsuiteAdapter,
  servicenowAdapter,
];

/** Adapter lookup by skill ID */
export const adapterMap = new Map<string, SkillAdapter>(
  allAdapters.map(a => [a.skillId, a]),
);

export {
  // Phase 1: Flagship
  slackAdapter,
  githubAdapter,
  jiraAdapter,
  notionAdapter,
  googleDriveAdapter,
  stripeAdapter,
  discordAdapter,
  salesforceAdapter,
  linearAdapter,
  teamsAdapter,
  // Communication
  twilioAdapter,
  sendgridAdapter,
  zoomAdapter,
  whatsappAdapter,
  webexAdapter,
  ringcentralAdapter,
  telegramAdapter,
  miroAdapter,
  calendlyAdapter,
  loomAdapter,
  wherebyAdapter,
  gotomeetingAdapter,
  mailgunAdapter,
  postmarkAdapter,
  mailchimpAdapter,
  intercomAdapter,
  // CRM + Sales
  hubspotAdapter,
  pipedriveAdapter,
  zendeskAdapter,
  freshdeskAdapter,
  freshsalesAdapter,
  zohoCrmAdapter,
  closeAdapter,
  copperAdapter,
  apolloAdapter,
  gongAdapter,
  outreachAdapter,
  salesloftAdapter,
  driftAdapter,
  frontAdapter,
  // Customer Support
  crispAdapter,
  livechatAdapter,
  freshserviceAdapter,
  // Productivity + Project Management
  asanaAdapter,
  todoistAdapter,
  mondayAdapter,
  trelloAdapter,
  confluenceAdapter,
  airtableAdapter,
  dropboxAdapter,
  clickupAdapter,
  basecampAdapter,
  shortcutAdapter,
  smartsheetAdapter,
  teamworkAdapter,
  wrikeAdapter,
  // DevOps + CI/CD
  gitlabAdapter,
  bitbucketAdapter,
  circleciAdapter,
  vercelAdapter,
  githubActionsAdapter,
  dockerAdapter,
  azureDevopsAdapter,
  launchdarklyAdapter,
  // Cloud + Infrastructure
  awsAdapter,
  googleCloudAdapter,
  cloudflareAdapter,
  kubernetesAdapter,
  terraformAdapter,
  herokuAdapter,
  netlifyAdapter,
  renderAdapter,
  flyioAdapter,
  digitaloceanAdapter,
  hashicorpVaultAdapter,
  snowflakeAdapter,
  // Database + AI/ML
  mongodbAtlasAdapter,
  supabaseAdapter,
  firebaseAdapter,
  neonAdapter,
  weaviateAdapter,
  pineconeAdapter,
  openaiAdapter,
  huggingfaceAdapter,
  // Analytics + Monitoring
  datadogAdapter,
  mixpanelAdapter,
  googleAnalyticsAdapter,
  segmentAdapter,
  sentryAdapter,
  newrelicAdapter,
  grafanaAdapter,
  splunkAdapter,
  pagerdutyAdapter,
  opsgenieAdapter,
  statuspageAdapter,
  // Security + Identity
  snykAdapter,
  crowdstrikeAdapter,
  oktaAdapter,
  auth0Adapter,
  // Marketing + Content
  googleAdsAdapter,
  activecampaignAdapter,
  klaviyoAdapter,
  bufferAdapter,
  hootsuiteAdapter,
  contentfulAdapter,
  sanityAdapter,
  webflowAdapter,
  // Design + Documents
  figmaAdapter,
  canvaAdapter,
  pandadocAdapter,
  boxAdapter,
  adobeSignAdapter,
  // Finance + Payments
  quickbooksAdapter,
  docusignAdapter,
  xeroAdapter,
  freshbooksAdapter,
  paypalAdapter,
  squareAdapter,
  brexAdapter,
  plaidAdapter,
  chargebeeAdapter,
  paddleAdapter,
  recurlyAdapter,
  zuoraAdapter,
  // HR + Recruiting
  bamboohrAdapter,
  workdayAdapter,
  gustoAdapter,
  leverAdapter,
  greenhouseAdapter,
  ripplingAdapter,
  adpAdapter,
  personioAdapter,
  latticeAdapter,
  hibobAdapter,
  // Social + Media
  twitterAdapter,
  linkedinAdapter,
  youtubeAdapter,
  redditAdapter,
  // E-commerce
  shopifyAdapter,
  woocommerceAdapter,
  bigcommerceAdapter,
  // CMS + Website
  wordpressAdapter,
  // Enterprise ERP + Automation
  sapAdapter,
  powerAutomateAdapter,
  netsuiteAdapter,
  servicenowAdapter,
};

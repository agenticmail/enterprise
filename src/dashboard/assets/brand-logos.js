/**
 * Brand logos as h() SVG elements for community skills page.
 * Each function takes (size) and returns an SVG element.
 */
import { h } from '../components/utils.js';

var sv = function(s) { return { viewBox: '0 0 24 24', width: s || 28, height: s || 28, style: { borderRadius: 4 } }; };

export var BrandLogo = {
  github: function(s) {
    return h('svg', Object.assign(sv(s), { fill: 'currentColor' }),
      h('path', { d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' })
    );
  },
  slack: function(s) {
    return h('svg', sv(s),
      h('path', { d: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z', fill: '#E01E5A' }),
      h('path', { d: 'M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z', fill: '#36C5F0' }),
      h('path', { d: 'M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312z', fill: '#2EB67D' }),
      h('path', { d: 'M15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z', fill: '#ECB22E' })
    );
  },
  jira: function(s) {
    return h('svg', sv(s),
      h('path', { d: 'M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84A.84.84 0 0021.16 2H11.53z', fill: '#2684FF' }),
      h('path', { d: 'M6.77 6.82a4.35 4.35 0 004.35 4.34h1.78v1.72a4.35 4.35 0 004.34 4.34V7.66a.84.84 0 00-.84-.84H6.77z', fill: 'url(#jg1)' }),
      h('path', { d: 'M2 11.65a4.35 4.35 0 004.35 4.35h1.78v1.71a4.35 4.35 0 004.35 4.34V12.49a.84.84 0 00-.84-.84H2z', fill: 'url(#jg2)' }),
      h('defs', null,
        h('linearGradient', { id: 'jg1', x1: '98%', y1: '0%', x2: '58%', y2: '90%' }, h('stop', { offset: '18%', stopColor: '#0052CC' }), h('stop', { offset: '100%', stopColor: '#2684FF' })),
        h('linearGradient', { id: 'jg2', x1: '100%', y1: '0%', x2: '55%', y2: '100%' }, h('stop', { offset: '18%', stopColor: '#0052CC' }), h('stop', { offset: '100%', stopColor: '#2684FF' }))
      )
    );
  },
  stripe: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#635BFF' }),
      h('path', { d: 'M13.3 11.2c0-.7.6-1 1.5-1 1.3 0 3 .4 4.3 1.1V7.6c-1.4-.6-2.9-.8-4.3-.8-3.5 0-5.8 1.8-5.8 4.9 0 4.8 6.5 4 6.5 6.1 0 .8-.7 1.1-1.7 1.1-1.5 0-3.4-.6-4.9-1.4v3.7c1.7.7 3.3 1 4.9 1 3.6 0 6-1.8 6-4.9-.1-5.1-6.5-4.3-6.5-6.1z', fill: '#fff' })
    );
  },
  notion: function(s) {
    return h('svg', Object.assign(sv(s), { fill: 'currentColor' }),
      h('path', { d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L2.58 2.514c-.467.047-.56.28-.374.466l2.253 1.228zm.793 2.99v13.874c0 .747.373 1.027 1.214.98l14.523-.84c.841-.047.934-.56.934-1.167V6.151c0-.607-.233-.933-.747-.887l-15.177.887c-.56.047-.747.327-.747.887v.16zm14.337.42c.094.42 0 .84-.42.887l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.934-.234-1.495-.933l-4.577-7.186v6.953l1.449.327s0 .84-1.168.84l-3.222.187c-.093-.187 0-.653.327-.747l.84-.22V8.944l-1.168-.093c-.094-.42.14-1.027.793-1.074l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933l3.222-.187h.002z' })
    );
  },
  discord: function(s) {
    return h('svg', sv(s),
      h('path', { d: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z', fill: '#5865F2' })
    );
  },
  salesforce: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#00A1E0' }),
      h('text', { x: 14, y: 18, textAnchor: 'middle', fill: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 11 }, 'SF')
    );
  },
  teams: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#6264A7' }),
      h('text', { x: 14, y: 19, textAnchor: 'middle', fill: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 14 }, 'T')
    );
  },
  zoom: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#2D8CFF' }),
      h('path', { d: 'M5 9.5v6.2c0 1.3 1 2.3 2.3 2.3h8.4l3.3 2.5V18h1.7c.7 0 1.3-.6 1.3-1.3v-7c0-.7-.6-1.2-1.3-1.2H7.3C6 8.5 5 9.2 5 9.5z', fill: '#fff' })
    );
  },
  terraform: function(s) {
    return h('svg', sv(s),
      h('path', { d: 'M1.5 1v7.7l6.7 3.9V4.8L1.5 1zm7.4 4v7.7l6.7-3.9V1.1L8.9 5zm7.4-3.9v7.7l6.7 3.9V4.9l-6.7-3.8zM8.9 13.6v7.7l6.7-3.9v-7.7l-6.7 3.9z', fill: '#7B42BC' })
    );
  },
  docker: function(s) {
    return h('svg', sv(s),
      h('path', { d: 'M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.888c0 .102.082.185.185.186zm0 2.716h2.118a.186.186 0 00.186-.185V6.29a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.888c0 .102.082.185.185.185zm-2.93 0h2.12a.186.186 0 00.184-.185V6.29a.186.186 0 00-.185-.185H8.1a.186.186 0 00-.185.185v1.888c0 .102.083.185.185.185zm-2.964 0h2.119a.186.186 0 00.185-.185V6.29a.186.186 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.888c0 .102.084.185.186.185zm5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm-2.93 0h2.12a.186.186 0 00.184-.185V9.006a.186.186 0 00-.184-.186h-2.12a.186.186 0 00-.184.186v1.887c0 .102.083.185.185.185zm-2.964 0h2.119a.186.186 0 00.185-.185V9.006a.186.186 0 00-.185-.186H5.136a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185zm-2.92 0h2.12a.186.186 0 00.184-.185V9.006a.186.186 0 00-.184-.186h-2.12a.186.186 0 00-.184.186v1.887c0 .102.082.185.185.185zM23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z', fill: '#2496ED' })
    );
  },
  gitlab: function(s) {
    return h('svg', sv(s),
      h('path', { d: 'M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 00-.867 0L1.387 9.452.045 13.587a.924.924 0 00.331 1.023L12 23.054l11.624-8.443a.92.92 0 00.331-1.024', fill: '#FC6D26' })
    );
  },
  sendgrid: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#1A82E2' }),
      h('text', { x: 14, y: 18, textAnchor: 'middle', fill: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 11 }, 'SG')
    );
  },
  linear: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#5E6AD2' }),
      h('path', { d: 'M7 17.5l3.5 3.5L21 10.5', fill: 'none', stroke: '#fff', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  },
  twilio: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#F22F46' }),
      h('circle', { cx: 11, cy: 11, r: 2.5, fill: '#fff' }),
      h('circle', { cx: 17, cy: 11, r: 2.5, fill: '#fff' }),
      h('circle', { cx: 11, cy: 17, r: 2.5, fill: '#fff' }),
      h('circle', { cx: 17, cy: 17, r: 2.5, fill: '#fff' })
    );
  },
  aws: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#232F3E' }),
      h('text', { x: 14, y: 18, textAnchor: 'middle', fill: '#FF9900', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 10 }, 'AWS')
    );
  },
  datadog: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#632CA6' }),
      h('text', { x: 14, y: 18, textAnchor: 'middle', fill: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 9 }, 'DD')
    );
  },
  kubernetes: function(s) {
    s = s || 28;
    return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
      h('rect', { width: 28, height: 28, rx: 4, fill: '#326CE5' }),
      h('text', { x: 14, y: 18, textAnchor: 'middle', fill: '#fff', fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: 10 }, 'K8s')
    );
  },
};

// More brand logos for skills with NULL icons in DB
var _pill = function(bg, text, label, s) {
  s = s || 28;
  return h('svg', { viewBox: '0 0 28 28', width: s, height: s, style: { borderRadius: 4 } },
    h('rect', { width: 28, height: 28, rx: 4, fill: bg }),
    h('text', { x: 14, y: 18, textAnchor: 'middle', fill: text, fontFamily: 'system-ui,sans-serif', fontWeight: 700, fontSize: label.length > 3 ? 8 : label.length > 2 ? 9 : 11 }, label)
  );
};

Object.assign(BrandLogo, {
  asana: function(s) { return _pill('#F06A6A', '#fff', 'A', s); },
  hubspot: function(s) { return _pill('#FF7A59', '#fff', 'HS', s); },
  figma: function(s) { return _pill('#F24E1E', '#fff', 'F', s); },
  trello: function(s) { return _pill('#0052CC', '#fff', 'T', s); },
  dropbox: function(s) { return _pill('#0061FF', '#fff', 'DB', s); },
  bitbucket: function(s) { return _pill('#0052CC', '#fff', 'BB', s); },
  circleci: function(s) { return _pill('#343434', '#fff', 'CI', s); },
  cloudflare: function(s) { return _pill('#F38020', '#fff', 'CF', s); },
  confluence: function(s) { return _pill('#172B4D', '#fff', 'CW', s); },
  intercom: function(s) { return _pill('#6AFDEF', '#000', 'IC', s); },
  mailchimp: function(s) { return _pill('#FFE01B', '#000', 'MC', s); },
  mixpanel: function(s) { return _pill('#7856FF', '#fff', 'MP', s); },
  quickbooks: function(s) { return _pill('#2CA01C', '#fff', 'QB', s); },
  snowflake: function(s) { return _pill('#29B5E8', '#fff', 'SF', s); },
  todoist: function(s) { return _pill('#E44332', '#fff', 'TD', s); },
  vercel: function(s) { return _pill('#000', '#fff', 'V', s); },
  zendesk: function(s) { return _pill('#03363D', '#fff', 'ZD', s); },
  airtable: function(s) { return _pill('#18BFFF', '#fff', 'AT', s); },
  monday: function(s) { return _pill('#FF3D57', '#fff', 'M', s); },
  google: function(s) { return _pill('#4285F4', '#fff', 'G', s); },
  shopify: function(s) { return _pill('#96BF48', '#fff', 'S', s); },
  wordpress: function(s) { return _pill('#21759B', '#fff', 'WP', s); },
  sentry: function(s) { return _pill('#362D59', '#fff', 'SN', s); },
  segment: function(s) { return _pill('#52BD95', '#fff', 'SG', s); },
  pagerduty: function(s) { return _pill('#06AC38', '#fff', 'PD', s); },
  okta: function(s) { return _pill('#007DC1', '#fff', 'OK', s); },
  twitch: function(s) { return _pill('#9146FF', '#fff', 'TW', s); },
  reddit: function(s) { return _pill('#FF4500', '#fff', 'R', s); },
  supabase: function(s) { return _pill('#3ECF8E', '#fff', 'SB', s); },
  netlify: function(s) { return _pill('#00C7B7', '#fff', 'NL', s); },
  heroku: function(s) { return _pill('#430098', '#fff', 'H', s); },
  firebase: function(s) { return _pill('#FFCA28', '#000', 'FB', s); },
  openai: function(s) { return _pill('#412991', '#fff', 'AI', s); },
  mongodb: function(s) { return _pill('#47A248', '#fff', 'MG', s); },
  paypal: function(s) { return _pill('#003087', '#fff', 'PP', s); },
  linkedin: function(s) { return _pill('#0A66C2', '#fff', 'in', s); },
  twitter: function(s) { return _pill('#000', '#fff', 'X', s); },
  whatsapp: function(s) { return _pill('#25D366', '#fff', 'WA', s); },
  telegram: function(s) { return _pill('#26A5E4', '#fff', 'TG', s); },
  youtube: function(s) { return _pill('#FF0000', '#fff', 'YT', s); },
  grafana: function(s) { return _pill('#F46800', '#fff', 'GF', s); },
  splunk: function(s) { return _pill('#000', '#65A637', 'SP', s); },
  wrike: function(s) { return _pill('#08CF65', '#fff', 'WR', s); },
  freshdesk: function(s) { return _pill('#25C16F', '#fff', 'FD', s); },
  freshsales: function(s) { return _pill('#EE5A24', '#fff', 'FS', s); },
  pipedrive: function(s) { return _pill('#1B1B1B', '#21D17C', 'PD', s); },
  clickup: function(s) { return _pill('#7B68EE', '#fff', 'CU', s); },
  xero: function(s) { return _pill('#13B5EA', '#fff', 'XR', s); },
  netsuite: function(s) { return _pill('#003D6B', '#fff', 'NS', s); },
  sap: function(s) { return _pill('#0FAAFF', '#fff', 'SAP', s); },
  workday: function(s) { return _pill('#005CB9', '#fff', 'WD', s); },
  servicenow: function(s) { return _pill('#81B5A1', '#fff', 'SN', s); },
  docusign: function(s) { return _pill('#FFC829', '#000', 'DS', s); },
  pandadoc: function(s) { return _pill('#45CE8D', '#fff', 'PD', s); },
  calendly: function(s) { return _pill('#006BFF', '#fff', 'CL', s); },
  loom: function(s) { return _pill('#625DF5', '#fff', 'LM', s); },
  miro: function(s) { return _pill('#FFD02F', '#050038', 'MR', s); },
  webflow: function(s) { return _pill('#4353FF', '#fff', 'WF', s); },
  square: function(s) { return _pill('#000', '#fff', 'SQ', s); },
  plaid: function(s) { return _pill('#000', '#fff', 'PL', s); },
  render: function(s) { return _pill('#46E3B7', '#000', 'R', s); },
  stripe2: function(s) { return _pill('#635BFF', '#fff', '$', s); },
});

// Map skill IDs to brand logos — comprehensive
export var SKILL_BRAND_MAP = {
  // GitHub
  'github-issues': 'github', 'github-repos': 'github', 'github-actions': 'github', 'github-ops': 'github', 'github': 'github',
  // Slack
  'slack-notifications': 'slack', 'slack-bridge': 'slack', 'slack': 'slack',
  // Atlassian
  'jira-integration': 'jira', 'jira': 'jira', 'confluence-wiki': 'confluence', 'bitbucket-repos': 'bitbucket',
  // Stripe
  'stripe-billing': 'stripe', 'stripe': 'stripe',
  // Notion
  'notion-sync': 'notion', 'notion': 'notion',
  // Discord
  'discord-bot': 'discord', 'discord': 'discord',
  // Microsoft
  'microsoft-teams': 'teams',
  // Zoom
  'zoom-meetings': 'zoom',
  // Salesforce
  'salesforce-crm': 'salesforce',
  // DevOps
  'terraform-iac': 'terraform', 'docker-containers': 'docker', 'gitlab-ci': 'gitlab',
  'kubernetes-cluster': 'kubernetes', 'kubernetes-ops': 'kubernetes',
  'circleci-pipelines': 'circleci', 'vercel-deployments': 'vercel',
  'heroku': 'heroku', 'netlify': 'netlify', 'render': 'render',
  // Communication
  'sendgrid-email': 'sendgrid', 'twilio-sms': 'twilio', 'intercom-support': 'intercom',
  'mailchimp-campaigns': 'mailchimp', 'telegram-bot': 'telegram', 'whatsapp-business': 'whatsapp',
  // PM
  'linear-tracker': 'linear', 'linear': 'linear', 'asana-tasks': 'asana',
  'trello-cards': 'trello', 'monday-boards': 'monday', 'clickup': 'clickup',
  'wrike': 'wrike', 'shortcut': 'linear', 'todoist-tasks': 'todoist',
  // Cloud
  'aws-services': 'aws', 'aws-s3': 'aws', 'aws-lambda': 'aws',
  'google-cloud': 'google', 'google-drive': 'google', 'google-ads': 'google',
  'google-analytics': 'google', 'azure-devops': 'teams', 'cloudflare-cdn': 'cloudflare',
  'firebase': 'firebase', 'supabase': 'supabase', 'digitalocean': 'docker',
  // Monitoring
  'datadog-monitoring': 'datadog', 'grafana': 'grafana', 'newrelic': 'sentry',
  'sentry': 'sentry', 'splunk': 'splunk', 'pagerduty': 'pagerduty', 'opsgenie': 'pagerduty',
  // CRM/Sales
  'hubspot-crm': 'hubspot', 'pipedrive-deals': 'pipedrive', 'close-crm': 'pipedrive',
  'copper-crm': 'pipedrive', 'zoho-crm': 'pipedrive', 'gong': 'pipedrive',
  'salesloft': 'pipedrive', 'outreach': 'pipedrive', 'apollo-io': 'pipedrive',
  'freshsales': 'freshsales',
  // Finance
  'quickbooks-accounting': 'quickbooks', 'xero': 'xero', 'netsuite': 'netsuite',
  'freshbooks': 'quickbooks', 'stripe-billing': 'stripe', 'paypal': 'paypal',
  'square': 'square', 'paddle': 'stripe2', 'brex': 'stripe2',
  'chargebee': 'stripe2', 'recurly': 'stripe2', 'zuora': 'stripe2',
  'invoice-processor': 'quickbooks',
  // HR
  'bamboohr': 'workday', 'gusto': 'workday', 'rippling': 'workday',
  'personio': 'workday', 'adp': 'workday', 'lattice': 'workday',
  'hibob': 'workday', 'greenhouse': 'workday', 'lever': 'workday',
  // Productivity
  'airtable-bases': 'airtable', 'figma-design': 'figma', 'canva-design': 'figma',
  'dropbox-storage': 'dropbox', 'box': 'dropbox', 'miro-boards': 'miro',
  'loom-video': 'loom', 'calendly': 'calendly', 'smartsheet': 'airtable',
  // Analytics
  'mixpanel-analytics': 'mixpanel', 'snowflake-warehouse': 'snowflake',
  'segment-cdp': 'segment', 'amplitude': 'mixpanel',
  // Support
  'zendesk-tickets': 'zendesk', 'freshdesk': 'freshdesk', 'freshservice': 'freshdesk',
  'crisp': 'freshdesk', 'front': 'freshdesk', 'livechat': 'freshdesk',
  'customer-support': 'zendesk', 'drift': 'intercom',
  // Docs/Sign
  'docusign-esign': 'docusign', 'pandadoc': 'pandadoc', 'adobe-sign': 'docusign',
  'document-drafting': 'notion',
  // E-commerce
  'shopify': 'shopify', 'woocommerce': 'wordpress', 'bigcommerce': 'shopify',
  // Auth
  'okta': 'okta', 'auth0': 'okta',
  // Social
  'linkedin': 'linkedin', 'twitter': 'twitter', 'reddit': 'reddit',
  'youtube': 'youtube', 'buffer': 'twitter', 'hootsuite': 'twitter',
  // AI/ML
  'openai': 'openai', 'huggingface': 'openai', 'pinecone': 'openai', 'weaviate': 'openai',
  // CMS
  'contentful': 'webflow', 'webflow': 'webflow', 'wordpress': 'wordpress', 'sanity': 'webflow',
  // DB
  'mongodb-atlas': 'mongodb', 'neon': 'supabase',
  // Security
  'crowdstrike': 'sentry', 'snyk': 'sentry', 'hashicorp-vault': 'terraform',
  'launchdarkly': 'terraform',
  // Misc
  'activecampaign': 'mailchimp', 'klaviyo': 'mailchimp', 'postmark': 'sendgrid',
  'mailgun': 'sendgrid', 'gotomeeting': 'zoom', 'webex': 'zoom', 'whereby': 'zoom',
  'ringcentral': 'twilio', 'power-automate': 'teams', 'servicenow': 'servicenow',
  'sap': 'sap', 'workday': 'workday', 'plaid': 'plaid',
  // Generic agent skills
  'web-researcher': 'openai', 'data-analyst': 'openai', 'email-triage': 'sendgrid',
  'calendar-scheduler': 'calendly', 'compliance-monitor': 'sentry',
  'statuspage': 'pagerduty', 'basecamp': 'trello', 'teamwork': 'trello',
};

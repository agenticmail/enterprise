import { h } from './utils.js';
import { I } from './icons.js';

/**
 * KnowledgeLink — A small button that links to the documentation page for a feature.
 * Usage: h(KnowledgeLink, { page: 'agents' })        → links to /docs/agents
 *        h(KnowledgeLink, { page: 'agent-budget' })   → links to /docs/agent-budget
 *        h(KnowledgeLink, { page: 'agents', label: 'Learn more' })
 */

var STYLE = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
  color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'none',
  marginLeft: 8, transition: 'all 0.15s ease', whiteSpace: 'nowrap',
};

export function KnowledgeLink(props) {
  var page = props.page;
  var label = props.label || 'Docs';
  var href = '/docs/' + page;
  return h('a', {
    href: href,
    target: '_blank',
    title: 'Open documentation for this page',
    style: STYLE,
    onMouseEnter: function(e) {
      e.currentTarget.style.borderColor = 'var(--accent, #6366f1)';
      e.currentTarget.style.color = 'var(--accent, #6366f1)';
      e.currentTarget.style.background = 'var(--accent-soft, rgba(99,102,241,0.12))';
    },
    onMouseLeave: function(e) {
      e.currentTarget.style.borderColor = 'var(--border)';
      e.currentTarget.style.color = 'var(--text-muted)';
      e.currentTarget.style.background = 'var(--bg-tertiary)';
    },
  }, I.help(), ' ', label);
}

/** Map of page IDs to doc filenames (for agent detail tabs) */
export var AGENT_TAB_DOCS = {
  overview: 'agent-overview',
  personal: 'agent-personal',
  email: 'agent-email',
  whatsapp: 'agent-whatsapp',
  channels: 'agent-channels',
  configuration: 'agent-configuration',
  manager: 'agent-manager',
  tools: 'agent-tools',
  skills: 'agent-skills',
  permissions: 'agent-permissions',
  activity: 'agent-activity',
  communication: 'agent-communication',
  workforce: 'agent-workforce',
  memory: 'agent-memory',
  guardrails: 'agent-guardrails',
  autonomy: 'agent-autonomy',
  budget: 'agent-budget',
  security: 'agent-security',
  'tool-security': 'agent-tool-security',
  deployment: 'agent-deployment',
  'memory-transfer': 'memory-transfer',
};

/** Map of settings tab IDs to doc filenames */
export var SETTINGS_TAB_DOCS = {
  general: 'settings',
  models: 'settings',
  'api-keys': 'settings',
  authentication: 'settings',
  platform: 'settings',
  email: 'settings',
  deployments: 'settings',
  'security-system': 'settings-security',
  'tool-security': 'settings-tool-security',
  network: 'settings-network',
  integrations: 'settings',
};

// SPA hash routing

import { updateNav } from './components/layout.js';
import { loadDashboard } from './pages/dashboard.js';
import { loadAgents } from './pages/agents.js';
import { loadUsers } from './pages/users.js';
import { loadApiKeys } from './pages/api-keys.js';
import { loadAudit } from './pages/audit.js';
import { loadSettings } from './pages/settings.js';
import { loadDlp } from './pages/dlp.js';
import { loadGuardrails } from './pages/guardrails.js';
import { loadJournal } from './pages/journal.js';
import { loadMessages } from './pages/messages.js';
import { loadCompliance } from './pages/compliance.js';
import { loadVault } from './pages/vault.js';
import { loadSkills } from './pages/skills.js';
// New pages
import { renderActivity } from './pages/activity.js';
import { renderApprovals } from './pages/approvals.js';
import { renderCommunitySkills } from './pages/community-skills.js';
import { renderDomainStatus } from './pages/domain-status.js';
import { renderKnowledge } from './pages/knowledge.js';
import { renderKnowledgeContributions } from './pages/knowledge-contributions.js';
import { renderSkillConnections } from './pages/skill-connections.js';
import { renderWorkforce } from './pages/workforce.js';

export let currentPage = 'dashboard';

// Wrapper functions for new pages
function loadActivity() {
  document.getElementById('page-content').innerHTML = renderActivity();
}

function loadApprovals() {
  document.getElementById('page-content').innerHTML = renderApprovals();
}

function loadCommunitySkills() {
  document.getElementById('page-content').innerHTML = renderCommunitySkills();
}

function loadDomainStatus() {
  document.getElementById('page-content').innerHTML = renderDomainStatus();
}

function loadKnowledge() {
  document.getElementById('page-content').innerHTML = renderKnowledge();
}

function loadKnowledgeContributions() {
  document.getElementById('page-content').innerHTML = renderKnowledgeContributions();
}

function loadSkillConnections() {
  document.getElementById('page-content').innerHTML = renderSkillConnections();
}

function loadWorkforce() {
  document.getElementById('page-content').innerHTML = renderWorkforce();
}

var pages = {
  dashboard: loadDashboard,
  agents: loadAgents,
  users: loadUsers,
  'api-keys': loadApiKeys,
  audit: loadAudit,
  settings: loadSettings,
  dlp: loadDlp,
  guardrails: loadGuardrails,
  journal: loadJournal,
  messages: loadMessages,
  compliance: loadCompliance,
  vault: loadVault,
  skills: loadSkills,
  // New pages
  activity: loadActivity,
  approvals: loadApprovals,
  'community-skills': loadCommunitySkills,
  'domain-status': loadDomainStatus,
  knowledge: loadKnowledge,
  'knowledge-contributions': loadKnowledgeContributions,
  'skill-connections': loadSkillConnections,
  workforce: loadWorkforce,
};

export function navigate(page) {
  currentPage = page;
  updateNav(page);
  (pages[page] || loadDashboard)();
}

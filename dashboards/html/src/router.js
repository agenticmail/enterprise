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

export let currentPage = 'dashboard';

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
};

export function navigate(page) {
  currentPage = page;
  updateNav(page);
  (pages[page] || loadDashboard)();
}

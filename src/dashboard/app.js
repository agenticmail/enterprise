// ─── Imports ─────────────────────────────────────────────
import { h, useState, useEffect, useCallback, useRef, Fragment, AppContext, useApp, apiCall, authCall, engineCall, applyBrandColor } from './components/utils.js';
import { I } from './components/icons.js';
import { ErrorBoundary } from './components/error-boundary.js';
import { Modal } from './components/modal.js';
import { LoginPage, OnboardingWizard } from './pages/login.js';
import { DashboardPage, SetupChecklist } from './pages/dashboard.js';
import { AgentsPage, AgentDetailPage, CreateAgentWizard, DeployModal } from './pages/agents.js';
import { SkillsPage } from './pages/skills.js';
import { KnowledgeBasePage } from './pages/knowledge.js';
import { ApprovalsPage } from './pages/approvals.js';
import { ActivityPage } from './pages/activity.js';
import { UsersPage } from './pages/users.js';
import { AuditPage } from './pages/audit.js';
import { SettingsPage } from './pages/settings.js';
import { DLPPage } from './pages/dlp.js';
import { GuardrailsPage } from './pages/guardrails.js';
import { JournalPage } from './pages/journal.js';
import { MessagesPage } from './pages/messages.js';
import { CompliancePage } from './pages/compliance.js';
import { CommunitySkillsPage } from './pages/community-skills.js';
import { DomainStatusPage } from './pages/domain-status.js';
import { WorkforcePage } from './pages/workforce.js';
import { KnowledgeContributionsPage } from './pages/knowledge-contributions.js';
import { SkillConnectionsPage } from './pages/skill-connections.js';
import { VaultPage } from './pages/vault.js';

// ─── Toast System ────────────────────────────────────────
let toastId = 0;
function ToastContainer() {
  const { toasts } = useApp();
  return h('div', { className: 'toast-container' }, toasts.map(t => h('div', { key: t.id, className: 'toast toast-' + t.type }, t.message)));
}

// ─── Shared Components ───────────────────────────────────

let confirmResolve = null;
export function ConfirmDialog() {
  const [state, setState] = useState(null);
  useEffect(() => { window.__showConfirm = (opts) => new Promise(resolve => { confirmResolve = resolve; setState(opts); }); return () => { window.__showConfirm = null; }; }, []);
  if (!state) return null;
  const close = (val) => { setState(null); if (confirmResolve) { confirmResolve(val); confirmResolve = null; } };
  return h('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) close(false); } },
    h('div', { className: 'modal', style: { width: 420 } },
      h('div', { className: 'modal-header' },
        h('h2', null, state.title || 'Confirm'),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: () => close(false) }, I.x())
      ),
      h('div', { className: 'modal-body' },
        h('p', { style: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 } }, state.message),
        state.warning && h('div', { style: { marginTop: 12, padding: 12, background: 'var(--danger-soft)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--danger)' } }, state.warning)
      ),
      h('div', { className: 'modal-footer' },
        h('button', { className: 'btn btn-secondary', onClick: () => close(false) }, 'Cancel'),
        h('button', { className: 'btn ' + (state.danger ? 'btn-danger' : 'btn-primary'), onClick: () => close(true), autoFocus: true }, state.confirmText || 'Confirm')
      )
    )
  );
}
export async function showConfirm(opts) { return window.__showConfirm ? window.__showConfirm(opts) : confirm(opts.message); }

// Modal imported from ./components/modal.js
export { Modal } from './components/modal.js';

// ─── Main App ────────────────────────────────────────────
function App() {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('em_theme') || 'dark');
  const [toasts, setToasts] = useState([]);
  const [user, setUser] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [needsSetup, setNeedsSetup] = useState(null);
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem('em_sidebar_pinned') === 'true');
  const [sidebarHovered, setSidebarHovered] = useState(false);

  // Check if already authenticated via cookie on mount, and check setup state
  useEffect(() => {
    // Check setup state
    if (window.__EM_SETUP_STATE__ !== undefined) {
      setNeedsSetup(!!window.__EM_SETUP_STATE__);
    } else {
      fetch('/auth/setup-status', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.needsSetup) setNeedsSetup(true);
        else setNeedsSetup(false);
      }).catch(() => setNeedsSetup(false));
    }
    // Only call /auth/me if a session cookie exists, to avoid unnecessary 401s
    if (document.cookie.match(/em_session|em_csrf/)) {
      authCall('/me').then(d => { setUser(d.user || d); setAuthed(true); setAuthChecked(true); }).catch(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  const toast = useCallback((message, type = 'info') => {
    const id = ++toastId;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('em_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('em_sidebar_pinned', sidebarPinned ? 'true' : 'false');
  }, [sidebarPinned]);

  useEffect(() => {
    if (!authed) return;
    engineCall('/approvals/pending').then(d => setPendingCount((d.requests || []).length)).catch(() => {});
    apiCall('/settings').then(d => { const s = d.settings || d || {}; if (s.primaryColor) applyBrandColor(s.primaryColor); }).catch(() => {});
  }, [authed]);

  const logout = useCallback(() => { authCall('/logout', { method: 'POST' }).catch(() => {}).finally(() => { setAuthed(false); setUser(null); }); }, []);
  const toggleSidebarPin = useCallback(() => setSidebarPinned(p => !p), []);
  const onSidebarEnter = useCallback(() => { if (!sidebarPinned) setSidebarHovered(true); }, [sidebarPinned]);
  const onSidebarLeave = useCallback(() => setSidebarHovered(false), []);

  // Register global logout so apiCall can trigger it on 401
  useEffect(() => { window.__emLogout = logout; return () => { window.__emLogout = null; }; }, [logout]);

  if (!authChecked) return h('div', { style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-muted)' } }, 'Loading...');
  if (needsSetup === true && !authed) return h(OnboardingWizard, { onComplete: () => { setNeedsSetup(false); setAuthed(true); authCall('/me').then(d => { setUser(d.user || d); }).catch(() => {}); } });
  if (!authed) return h(LoginPage, { onLogin: (d) => { setAuthed(true); if (d?.user) setUser(d.user); } });

  const nav = [
    { section: 'Overview', items: [{ id: 'dashboard', icon: I.dashboard, label: 'Dashboard' }] },
    { section: 'Management', items: [
      { id: 'agents', icon: I.agents, label: 'Agents' },
      { id: 'skills', icon: I.skills, label: 'Skills' },
      { id: 'community-skills', icon: I.marketplace, label: 'Community Skills' },
      { id: 'skill-connections', icon: I.link, label: 'Skill Connections' },
      { id: 'knowledge', icon: I.knowledge, label: 'Knowledge Bases' },
      { id: 'knowledge-contributions', icon: I.knowledge, label: 'Knowledge Hub' },
      { id: 'approvals', icon: I.approvals, label: 'Approvals', badge: pendingCount || null },
    ]},
    { section: 'Management', items: [
      { id: 'workforce', icon: I.clock, label: 'Workforce' },
      { id: 'messages', icon: I.messages, label: 'Messages' },
      { id: 'guardrails', icon: I.guardrails, label: 'Guardrails' },
      { id: 'journal', icon: I.journal, label: 'Journal' },
    ]},
    { section: 'Administration', items: [
      { id: 'dlp', icon: I.dlp, label: 'DLP' },
      { id: 'compliance', icon: I.compliance, label: 'Compliance' },
      { id: 'domain-status', icon: I.shield, label: 'Domain' },
      { id: 'users', icon: I.users, label: 'Users' },
      { id: 'vault', icon: I.lock, label: 'Vault' },
      { id: 'audit', icon: I.audit, label: 'Audit Log' },
      { id: 'settings', icon: I.settings, label: 'Settings' },
    ]}
  ];

  const pages = {
    dashboard: DashboardPage,
    agents: AgentsPage,
    skills: SkillsPage,
    knowledge: KnowledgeBasePage,
    approvals: ApprovalsPage,
    activity: ActivityPage,
    users: UsersPage,
    audit: AuditPage,
    settings: SettingsPage,
    dlp: DLPPage,
    guardrails: GuardrailsPage,
    journal: JournalPage,
    messages: MessagesPage,
    compliance: CompliancePage,
    'community-skills': CommunitySkillsPage,
    'domain-status': DomainStatusPage,
    workforce: WorkforcePage,
    'knowledge-contributions': KnowledgeContributionsPage,
    'skill-connections': SkillConnectionsPage,
    vault: VaultPage,
  };

  const navigateToAgent = (agentId) => { setSelectedAgentId(agentId); };
  const PageComponent = pages[page] || DashboardPage;
  const sidebarClass = 'sidebar' + (sidebarPinned ? ' expanded' : sidebarHovered ? ' hover-expanded' : '');

  return h(AppContext.Provider, { value: { toast, toasts, user, theme, setPage } },
    h('div', { className: 'app-layout' },
      // Sidebar
      h('div', { className: sidebarClass, onMouseEnter: onSidebarEnter, onMouseLeave: onSidebarLeave },
        h('div', { className: 'sidebar-brand' },
          h('img', { src: '/dashboard/assets/logo.png', alt: 'AgenticMail', style: { width: 28, height: 28, objectFit: 'contain' } }),
          h('div', { className: 'sidebar-brand-text' }, h('h2', null, 'AgenticMail'), h('span', null, 'Enterprise')),
          h('button', { className: 'sidebar-toggle' + (sidebarPinned ? ' pinned' : ''), onClick: toggleSidebarPin, title: sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar' }, sidebarPinned ? I.chevronLeft() : I.panelLeft())
        ),
        h('div', { className: 'sidebar-nav' },
          nav.map((section, si) =>
            h('div', { key: section.section + si, className: 'sidebar-section' },
              h('div', { className: 'sidebar-section-title' }, section.section),
              section.items.map(item =>
                h('div', { key: item.id, className: 'nav-item' + (page === item.id && !selectedAgentId ? ' active' : ''), onClick: () => { setPage(item.id); setSelectedAgentId(null); }, 'data-tooltip': item.label },
                  item.icon(),
                  h('span', { className: 'nav-label' }, item.label),
                  item.badge && h('span', { className: 'badge' }, item.badge)
                )
              )
            )
          )
        ),
        h('div', { className: 'sidebar-footer' },
          h('div', { className: 'sidebar-user' },
            h('div', { className: 'avatar' }, (user?.name || user?.email || '?').charAt(0).toUpperCase()),
            h('div', { className: 'user-info' },
              h('div', { className: 'user-name' }, user?.name || user?.email || 'Admin'),
              h('div', { className: 'user-role' }, user?.role || 'admin')
            )
          )
        )
      ),

      // Main
      h('div', { className: 'main-content' },
        h('div', { className: 'topbar' },
          h('div', { className: 'topbar-left' },
            h('span', { className: 'topbar-title' }, (nav.flatMap(s => s.items).find(i => i.id === page)?.label || 'Dashboard'))
          ),
          h('div', { className: 'topbar-right' },
            h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'), title: 'Toggle theme' }, theme === 'dark' ? I.sun() : I.moon()),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: logout, title: 'Sign out' }, I.logout())
          )
        ),
        h('div', { className: 'page-content' },
          selectedAgentId
            ? h(AgentDetailPage, { agentId: selectedAgentId, onBack: () => { setSelectedAgentId(null); setPage('agents'); } })
            : page === 'agents'
              ? h(AgentsPage, { onSelectAgent: navigateToAgent })
              : h(PageComponent)
        )
      )
    ),
    h(ToastContainer),
    h(ConfirmDialog)
  );
}

// ─── Mount ───────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(h(ErrorBoundary, null, h(App)));

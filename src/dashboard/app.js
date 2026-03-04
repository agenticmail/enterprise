// ─── Imports ─────────────────────────────────────────────
import { h, useState, useEffect, useCallback, useRef, Fragment, AppContext, useApp, apiCall, authCall, engineCall, applyBrandColor, setOrgId } from './components/utils.js';
import { I } from './components/icons.js?v=2';
import { ErrorBoundary } from './components/error-boundary.js';
import { Modal } from './components/modal.js';
import { setConfig as setTransportEncConfig, installFetchInterceptor } from './components/transport-encryption.js';
import { LoginPage, OnboardingWizard } from './pages/login.js';
import { DashboardPage, SetupChecklist } from './pages/dashboard.js';
import { AgentsPage, AgentDetailPage, CreateAgentWizard, DeployModal } from './pages/agents.js?v=5';
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
import { OrgChartPage } from './pages/org-chart.js';
import { TaskPipelinePage } from './pages/task-pipeline.js';
import { DatabaseAccessPage } from './pages/database-access.js';
import { OrganizationsPage } from './pages/organizations.js';
import { RolesPage } from './pages/roles.js';
import { MemoryTransferPage } from './pages/memory-transfer.js';

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
  // URL-synced routing
  function parseRoute() {
    const p = window.location.pathname.replace(/^\/dashboard\/?/, '') || '';
    const parts = p.split('/').filter(Boolean);
    if (parts[0] === 'agents' && parts[1]) return { page: 'agents', agentId: parts[1] };
    if (parts[0]) return { page: parts[0], agentId: null };
    return { page: 'dashboard', agentId: null };
  }
  const initial = parseRoute();
  const [page, _setPage] = useState(initial.page);
  const [selectedAgentId, _setSelectedAgentId] = useState(initial.agentId);

  // ─── Scroll Position Restoration ────────────────────
  const _scrollPositions = useRef({});
  const _saveScroll = () => {
    const el = document.querySelector('.main-content');
    if (el) _scrollPositions.current[page + (selectedAgentId ? '/' + selectedAgentId : '')] = el.scrollTop;
  };
  const _restoreScroll = (key) => {
    const pos = _scrollPositions.current[key];
    if (pos != null) {
      requestAnimationFrame(() => {
        const el = document.querySelector('.main-content');
        if (el) el.scrollTop = pos;
      });
    }
  };

  function setPage(p) {
    _saveScroll();
    _setPage(p); _setSelectedAgentId(null);
    history.pushState(null, '', '/dashboard/' + (p === 'dashboard' ? '' : p));
    // Scroll to top for new pages, restored for revisited ones
    requestAnimationFrame(() => {
      const el = document.querySelector('.main-content');
      if (el) el.scrollTop = _scrollPositions.current[p] || 0;
    });
  }
  function setSelectedAgentId(id) {
    _saveScroll();
    _setSelectedAgentId(id);
    if (id) history.pushState(null, '', '/dashboard/agents/' + id);
  }

  useEffect(() => {
    const onPop = () => {
      _saveScroll();
      const r = parseRoute();
      _setPage(r.page); _setSelectedAgentId(r.agentId);
      _restoreScroll(r.page + (r.agentId ? '/' + r.agentId : ''));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [theme, setTheme] = useState(localStorage.getItem('em_theme') || 'dark');
  const [toasts, setToasts] = useState([]);
  const [user, setUser] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [permissions, setPermissions] = useState('*'); // '*' = full access, or { pageId: true | ['tab1','tab2'] }
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [show2faReminder, setShow2faReminder] = useState(false);
  const [impersonating, setImpersonating] = useState(null); // { user, impersonatedBy }
  const [forceResetPw, setForceResetPw] = useState('');
  const [forceResetPw2, setForceResetPw2] = useState('');
  const [forceResetLoading, setForceResetLoading] = useState(false);
  const [forceResetError, setForceResetError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(null);
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem('em_sidebar_pinned') === 'true');
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Init transport encryption from security settings
  useEffect(() => {
    if (!authed) return;
    apiCall('/settings/security').then(d => {
      var te = d?.securityConfig?.transportEncryption;
      if (te && te.enabled) {
        setTransportEncConfig(te);
        installFetchInterceptor();
      }
    }).catch(() => {});
  }, [authed]);

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
    apiCall('/settings').then(d => { const s = d.settings || d || {}; if (s.primaryColor) applyBrandColor(s.primaryColor); if (s.orgId) setOrgId(s.orgId); }).catch(() => {});
    apiCall('/me/permissions').then(d => {
      if (d && d.permissions) setPermissions(d.permissions);
      // If user is assigned to a client org, auto-set org context
      if (d && d.clientOrgId) {
        localStorage.setItem('em_client_org_id', d.clientOrgId);
      } else {
        localStorage.removeItem('em_client_org_id');
      }
    }).catch(() => {});
  }, [authed]);

  const logout = useCallback(() => { authCall('/logout', { method: 'POST' }).catch(() => {}).finally(() => { setAuthed(false); setUser(null); }); }, []);
  const toggleSidebarPin = useCallback(() => setSidebarPinned(p => !p), []);
  const onSidebarEnter = useCallback(() => { if (!sidebarPinned) setSidebarHovered(true); }, [sidebarPinned]);
  const onSidebarLeave = useCallback(() => setSidebarHovered(false), []);

  // Register global logout so apiCall can trigger it on 401
  useEffect(() => { window.__emLogout = logout; return () => { window.__emLogout = null; }; }, [logout]);

  // Impersonation functions (must be before early returns to keep hook order stable)
  const startImpersonation = useCallback(async (userId) => {
    try {
      const d = await authCall('/impersonate/' + userId, { method: 'POST' });
      if (d.token && d.user) {
        setImpersonating({ user: d.user, impersonatedBy: d.impersonatedBy, originalToken: localStorage.getItem('em_token') });
        localStorage.setItem('em_token', d.token);
        setUser(d.user);
        if (d.user.permissions) setPermissions(d.user.permissions);
        if (d.user.clientOrgId) {
          localStorage.setItem('em_client_org_id', d.user.clientOrgId);
          apiCall('/organizations/' + d.user.clientOrgId).then(function(o) {
            if (o && o.name) setImpersonating(function(prev) { return prev ? Object.assign({}, prev, { user: Object.assign({}, prev.user, { clientOrgName: o.name }) }) : prev; });
          }).catch(function() {});
        } else localStorage.removeItem('em_client_org_id');
        toast('Now viewing as ' + d.user.name, 'info');
        setPage('dashboard');
      }
    } catch (e) { toast(e.message || 'Impersonation failed', 'error'); }
  }, []);

  const stopImpersonation = useCallback(() => {
    setImpersonating(prev => {
      if (prev && prev.originalToken) {
        localStorage.setItem('em_token', prev.originalToken);
      }
      return null;
    });
    localStorage.removeItem('em_client_org_id');
    authCall('/me').then(d => { setUser(d.user || d); }).catch(() => {});
    apiCall('/me/permissions').then(d => { if (d && d.permissions) setPermissions(d.permissions); }).catch(() => {});
    toast('Stopped impersonation', 'success');
    setPage('users');
  }, []);

  if (!authChecked) return h('div', { style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-muted)' } }, 'Loading...');
  if (needsSetup === true && !authed) return h(OnboardingWizard, { onComplete: () => { setNeedsSetup(false); setAuthed(true); authCall('/me').then(d => { setUser(d.user || d); }).catch(() => {}); } });
  if (!authed) return h(LoginPage, { onLogin: (d) => {
    setAuthed(true);
    if (d?.user) { setUser(d.user); if (!d.user.totpEnabled) setShow2faReminder(true); }
    if (d?.mustResetPassword) setMustResetPassword(true);
  } });

  // Force password reset modal
  const doForceReset = async () => {
    if (forceResetPw !== forceResetPw2) { setForceResetError('Passwords do not match'); return; }
    if (forceResetPw.length < 8) { setForceResetError('Password must be at least 8 characters'); return; }
    setForceResetLoading(true); setForceResetError('');
    try {
      await authCall('/force-reset-password', { method: 'POST', body: JSON.stringify({ newPassword: forceResetPw }) });
      setMustResetPassword(false);
      toast('Password updated successfully', 'success');
    } catch (e) { setForceResetError(e.message); }
    setForceResetLoading(false);
  };

  if (mustResetPassword) {
    return h('div', { style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: 20 } },
      h('div', { style: { maxWidth: 420, width: '100%', background: 'var(--bg-secondary)', borderRadius: 12, padding: 32, border: '1px solid var(--border)' } },
        h('div', { style: { textAlign: 'center', marginBottom: 24 } },
          h('div', { style: { width: 48, height: 48, borderRadius: '50%', background: 'var(--warning-soft, rgba(153,27,27,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' } },
            h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--warning, #991b1b)', strokeWidth: 2, strokeLinecap: 'round' },
              h('path', { d: 'M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' })
            )
          ),
          h('h2', { style: { fontSize: 18, fontWeight: 700 } }, 'Password Reset Required'),
          h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 } }, 'Your administrator created this account with a temporary password. Please set a new password to continue.')
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h('div', null,
            h('label', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 } }, 'New Password'),
            h('input', { className: 'input', type: 'password', value: forceResetPw, onChange: (e) => setForceResetPw(e.target.value), placeholder: 'Min 8 characters', autoFocus: true })
          ),
          h('div', null,
            h('label', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 } }, 'Confirm Password'),
            h('input', { className: 'input', type: 'password', value: forceResetPw2, onChange: (e) => setForceResetPw2(e.target.value), placeholder: 'Confirm new password', onKeyDown: (e) => { if (e.key === 'Enter') doForceReset(); } })
          ),
          forceResetError && h('div', { style: { color: 'var(--danger)', fontSize: 12 } }, forceResetError),
          h('button', { className: 'btn btn-primary', onClick: doForceReset, disabled: forceResetLoading || !forceResetPw || !forceResetPw2, style: { width: '100%', justifyContent: 'center', marginTop: 4 } },
            forceResetLoading ? 'Updating...' : 'Set New Password'
          )
        )
      )
    );
  }

  const nav = [
    { section: 'Overview', items: [{ id: 'dashboard', icon: I.dashboard, label: 'Dashboard' }] },
    { section: 'Management', items: [
      { id: 'agents', icon: I.agents, label: 'Agents' },
      { id: 'roles', icon: I.agents, label: 'Roles' },
      { id: 'organizations', icon: I.building, label: 'Organizations' },
      { id: 'skills', icon: I.skills, label: 'Skills' },
      { id: 'community-skills', icon: I.marketplace, label: 'Community Skills' },
      { id: 'skill-connections', icon: I.link, label: 'Integrations & MCP' },
      { id: 'database-access', icon: I.database, label: 'Database Access' },
      { id: 'knowledge', icon: I.knowledge, label: 'Knowledge Bases' },
      { id: 'knowledge-contributions', icon: I.knowledge, label: 'Knowledge Hub' },
      { id: 'memory-transfer', icon: I.brain, label: 'Memory Transfer' },
      { id: 'approvals', icon: I.approvals, label: 'Approvals', badge: pendingCount || null },
    ]},
    { section: 'Operations', items: [
      { id: 'org-chart', icon: I.orgChart, label: 'Org Chart' },
      { id: 'task-pipeline', icon: I.workflow, label: 'Task Pipeline' },
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
    'org-chart': OrgChartPage,
    'task-pipeline': TaskPipelinePage,
    'database-access': DatabaseAccessPage,
    organizations: OrganizationsPage,
    roles: RolesPage,
    'memory-transfer': MemoryTransferPage,
  };

  const navigateToAgent = (agentId) => { _setSelectedAgentId(agentId); history.pushState(null, '', '/dashboard/agents/' + agentId); };

  // Filter nav based on permissions
  const hasAccess = (pageId) => permissions === '*' || (permissions && pageId in permissions);
  const filteredNav = nav.map(section => ({
    ...section,
    items: section.items.filter(item => hasAccess(item.id))
  })).filter(section => section.items.length > 0);

  // Block access to pages user can't see — show unauthorized page
  const canAccessPage = hasAccess(page);
  const PageComponent = canAccessPage ? (pages[page] || DashboardPage) : null;
  const sidebarClass = 'sidebar' + (sidebarPinned ? ' expanded' : sidebarHovered ? ' hover-expanded' : '') + (mobileMenuOpen ? ' mobile-open' : '');

  return h(AppContext.Provider, { value: { toast, toasts, user, theme, setPage, permissions, impersonating, startImpersonation, stopImpersonation } },
    h('div', { className: 'app-layout' },
      // Mobile hamburger
      h('button', { className: 'mobile-hamburger', onClick: () => setMobileMenuOpen(true) },
        h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
          h('line', { x1: 3, y1: 6, x2: 21, y2: 6 }),
          h('line', { x1: 3, y1: 12, x2: 21, y2: 12 }),
          h('line', { x1: 3, y1: 18, x2: 21, y2: 18 })
        )
      ),
      // Mobile backdrop
      mobileMenuOpen && h('div', { className: 'mobile-backdrop visible', onClick: () => setMobileMenuOpen(false) }),
      // Sidebar
      h('div', { className: sidebarClass, onMouseEnter: onSidebarEnter, onMouseLeave: onSidebarLeave },
        h('div', { className: 'sidebar-brand' },
          h('img', { src: (window.__EM_BRANDING__ && window.__EM_BRANDING__.logo) || '/dashboard/assets/logo.png', alt: 'AgenticMail', style: { width: 28, height: 28, objectFit: 'contain' } }),
          h('div', { className: 'sidebar-brand-text' }, h('h2', null, (window.__EM_BRANDING__ && window.__EM_BRANDING__.companyName) || 'AgenticMail'), h('span', null, 'Enterprise')),
          h('button', { className: 'sidebar-toggle' + (sidebarPinned ? ' pinned' : ''), onClick: toggleSidebarPin, title: sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar' }, sidebarPinned ? I.chevronLeft() : I.panelLeft())
        ),
        h('div', { className: 'sidebar-nav' },
          filteredNav.map((section, si) =>
            h('div', { key: section.section + si, className: 'sidebar-section' },
              h('div', { className: 'sidebar-section-title' }, section.section),
              section.items.map(item =>
                h('div', { key: item.id, className: 'nav-item' + (page === item.id && !selectedAgentId ? ' active' : ''), onClick: () => { setPage(item.id); setSelectedAgentId(null); setMobileMenuOpen(false); }, 'data-tooltip': item.label },
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
            h('button', { className: 'btn btn-ghost btn-icon', onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'), title: 'Toggle theme', style: { width: 36, height: 36 } }, theme === 'dark' ? I.sun({ size: 22 }) : I.moon({ size: 22 })),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: logout, title: 'Sign out', style: { width: 36, height: 36 } }, I.logout({ size: 22 }))
          )
        ),
        h('div', { className: 'page-content' },
          // Impersonation banner
          impersonating && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', margin: '0 0 16px', background: 'rgba(99,102,241,0.12)', border: '2px solid var(--primary, #6366f1)', borderRadius: 8, fontSize: 13 } },
            I.agents(),
            h('div', { style: { flex: 1 } },
              h('strong', null, 'Viewing as: '),
              impersonating.user.name + ' (' + impersonating.user.email + ')',
              impersonating.user.role && h('span', { className: 'badge badge-neutral', style: { marginLeft: 8, fontSize: 10 } }, impersonating.user.role),
              impersonating.user.clientOrgName && h('span', { className: 'badge badge-info', style: { marginLeft: 8, fontSize: 10 } }, 'Org: ' + impersonating.user.clientOrgName),
              impersonating.user.clientOrgId && !impersonating.user.clientOrgName && h('span', { className: 'badge badge-info', style: { marginLeft: 8, fontSize: 10 } }, 'Client Org')
            ),
            h('button', { className: 'btn btn-primary btn-sm', onClick: stopImpersonation }, 'Stop Impersonating')
          ),
          // 2FA recommendation banner
          show2faReminder && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', margin: '0 0 16px', background: 'var(--warning-soft, rgba(153,27,27,0.1))', border: '1px solid var(--warning, #991b1b)', borderRadius: 8, fontSize: 13 } },
            I.shield(),
            h('div', { style: { flex: 1 } },
              h('strong', null, 'Enable Two-Factor Authentication'),
              h('span', { style: { color: 'var(--text-secondary)', marginLeft: 6 } }, 'Protect your account and enable self-service password reset.')
            ),
            h('button', { className: 'btn btn-warning btn-sm', onClick: () => { setPage('settings'); setShow2faReminder(false); history.pushState(null, '', '/dashboard/settings'); } }, 'Set Up 2FA'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: () => setShow2faReminder(false), style: { padding: '2px 6px', minWidth: 0 } }, '\u00d7')
          ),
          selectedAgentId
            ? h(AgentDetailPage, { agentId: selectedAgentId, onBack: () => { _setSelectedAgentId(null); _setPage('agents'); history.pushState(null, '', '/dashboard/agents'); } })
            : page === 'agents'
              ? h(AgentsPage, { onSelectAgent: navigateToAgent })
              : PageComponent ? h(PageComponent)
              : h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: 40 } },
                  h('div', { style: { width: 64, height: 64, borderRadius: '50%', background: 'var(--danger-soft, rgba(220,38,38,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 } },
                    h('svg', { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--danger, #dc2626)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                      h('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }),
                      h('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' })
                    )
                  ),
                  h('h2', { style: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' } }, 'Access Restricted'),
                  h('p', { style: { fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.6, marginBottom: 24 } },
                    'You don\'t have permission to access this page. If you believe this is an error, please contact your company administrator to request access.'
                  ),
                  h('div', { style: { display: 'flex', gap: 12 } },
                    filteredNav[0]?.items[0] && h('button', {
                      className: 'btn btn-primary',
                      onClick: () => { setPage(filteredNav[0].items[0].id); history.pushState(null, '', '/dashboard/' + filteredNav[0].items[0].id); }
                    }, 'Go to ' + filteredNav[0].items[0].label)
                  )
                )
        )
      )
    ),
    h(ToastContainer),
    h(ConfirmDialog)
  );
}

// ─── Mount ───────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(h(ErrorBoundary, null, h(App)));

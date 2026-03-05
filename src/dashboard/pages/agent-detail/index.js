import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, StatCard, ProgressBar, EmptyState, formatNumber, formatCost, riskBadgeClass, formatTime, MEMORY_CATEGORIES, memCatColor, memCatLabel, importanceBadgeColor } from './shared.js?v=5';
import { OverviewSection } from './overview.js?v=6';
import { PersonalDetailsSection } from './personal-details.js?v=5';
import { PermissionsSection } from './permissions.js?v=5';
import { BudgetSection } from './budget.js?v=5';
import { ActivitySection } from './activity.js?v=5';
import { CommunicationSection } from './communication.js?v=5';
import { MemorySection } from './memory.js?v=5';
import { WorkforceSection } from './workforce.js?v=5';
import { GuardrailsSection } from './guardrails.js?v=5';
import { ConfigurationSection } from './configuration.js?v=5';
import { ManagerCatchUpSection } from './manager.js?v=5';
import { SkillsSection } from './skills-section.js?v=5';
import { DeploymentSection } from './deployment.js?v=5';
import { ToolsSection } from './tools.js?v=5';
import { MeetingCapabilitiesSection, BrowserConfigCard, ToolRestrictionsCard } from './meeting-browser.js?v=5';
import { EmailSection } from './email.js?v=5';
import { ToolSecuritySection } from './tool-security.js?v=5';
import { AgentSecurityTab } from './security.js?v=5';
import { AutonomySection } from './autonomy.js?v=5';
import { ChannelsSection } from './channels.js?v=5';
import { WhatsAppSection } from './whatsapp.js?v=5';
import { KnowledgeLink, AGENT_TAB_DOCS } from '../../components/knowledge-link.js';

export function AgentDetailPage(props) {
  var agentId = props.agentId;
  var onBack = props.onBack;

  var app = useApp();
  var toast = app.toast;

  var _tab = useState('overview');
  var tab = _tab[0]; var setTab = _tab[1];
  var _agent = useState(null);
  var agent = _agent[0]; var setAgent = _agent[1];
  var _engineAgent = useState(null);
  var engineAgent = _engineAgent[0]; var setEngineAgent = _engineAgent[1];
  var _profile = useState(null);
  var profile = _profile[0]; var setProfile = _profile[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _agents = useState([]);
  var agents = _agents[0]; var setAgents = _agents[1];

  var ALL_TABS = ['overview', 'personal', 'email', 'whatsapp', 'channels', 'configuration', 'manager', 'tools', 'skills', 'permissions', 'activity', 'communication', 'workforce', 'memory', 'guardrails', 'autonomy', 'budget', 'security', 'tool-security', 'deployment'];
  var TAB_LABELS = { 'security': 'Security', 'tool-security': 'Tool Security', 'manager': 'Manager', 'email': 'Email', 'whatsapp': 'WhatsApp', 'channels': 'Channels', 'tools': 'Tools', 'autonomy': 'Autonomy' };

  // Filter tabs based on user permissions
  var app = useApp();
  var perms = app.permissions || '*';
  var agentGrant = perms === '*' ? true : (perms.agents || false);
  var TABS = ALL_TABS.filter(function(t) {
    if (perms === '*' || agentGrant === true) return true;
    if (Array.isArray(agentGrant)) return agentGrant.indexOf(t) !== -1;
    return false;
  });

  // Check agent-level access
  var allowedAgents = perms === '*' ? '*' : (perms._allowedAgents || '*');
  var hasAgentAccess = allowedAgents === '*' || (Array.isArray(allowedAgents) && allowedAgents.indexOf(agentId) >= 0);

  if (!hasAgentAccess) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: 40 } },
      h('div', { style: { width: 64, height: 64, borderRadius: '50%', background: 'var(--danger-soft, rgba(220,38,38,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 } },
        h('svg', { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--danger, #dc2626)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }),
          h('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' })
        )
      ),
      h('h2', { style: { fontSize: 20, fontWeight: 700, marginBottom: 8 } }, 'Agent Access Restricted'),
      h('p', { style: { fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.6 } },
        'You don\'t have permission to access this agent. Contact your organization administrator to request access.'
      ),
      h('button', { className: 'btn btn-primary', style: { marginTop: 16 }, onClick: onBack }, 'Back to Agents')
    );
  }

  var load = function() {
    setLoading(true);
    Promise.all([
      engineCall('/bridge/agents/' + agentId + '/full').catch(function() { return null; }),
      apiCall('/agents/' + agentId).catch(function() { return null; }),
      engineCall('/agents?orgId=' + getOrgId()).catch(function() { return { agents: [] }; })
    ]).then(function(results) {
      var fullData = results[0];
      var adminData = results[1];
      var allAgents = results[2]?.agents || results[2] || [];

      if (fullData) {
        setEngineAgent(fullData.agent || fullData);
        setProfile(fullData.permissions || null);
      }
      if (adminData) {
        setAgent(adminData);
      }
      setAgents(allAgents);
      setLoading(false);
    });
  };

  useEffect(function() { load(); }, [agentId]);

  // ─── Real-Time Status from Agent Process ────────────────
  var [liveStatus, setLiveStatus] = useState(null);
  useEffect(function() {
    var es = new EventSource('/api/engine/agent-status-stream?agentId=' + encodeURIComponent(agentId));
    es.onmessage = function(ev) {
      try {
        var d = JSON.parse(ev.data);
        if (d.type === 'status' && d.agentId === agentId) { setLiveStatus(d); }
      } catch(e) {}
    };
    es.onerror = function() { /* reconnects automatically */ };
    return function() { es.close(); };
  }, [agentId]);

  // ─── Derived Values ─────────────────────────────────────

  var ea = engineAgent || {};
  var a = agent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  // Prefer live process status over DB state
  var liveState = liveStatus ? liveStatus.status : null;
  var dbState = ea.state || ea.status || a.status || 'unknown';
  var state = liveState || dbState;
  // Map live statuses: online→running, idle→idle, offline→stopped, error→error
  if (state === 'online') state = 'running';
  if (state === 'idle') state = 'idle';
  if (state === 'offline') state = 'stopped';
  var stateColor = { running: 'success', active: 'success', idle: 'info', deploying: 'info', starting: 'info', provisioning: 'info', degraded: 'warning', error: 'danger', stopped: 'neutral', draft: 'neutral', ready: 'primary' }[state] || 'neutral';
  var displayName = identity.name || config.name || config.displayName || a.name || 'Unnamed Agent';
  var displayEmail = identity.email || config.email || a.email || '';
  var avatarUrl = identity.avatar && identity.avatar.length > 2 ? identity.avatar : null;
  var avatarInitial = (displayName || '?').charAt(0).toUpperCase();
  var role = identity.role || config.role || a.role || 'agent';
  var isPaused = ea.paused || false;

  // ─── Header Actions ─────────────────────────────────────

  var doAction = function(action) {
    engineCall('/agents/' + agentId + '/' + action, { method: 'POST', body: JSON.stringify({ by: 'dashboard' }) })
      .then(function() { toast(action.charAt(0).toUpperCase() + action.slice(1) + ' initiated', 'success'); setTimeout(load, 1000); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var doPause = function() {
    engineCall('/guardrails/pause/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual pause from dashboard' }) })
      .then(function() { toast('Agent paused', 'success'); load(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var doResume = function() {
    engineCall('/guardrails/resume/' + agentId, { method: 'POST', body: JSON.stringify({ reason: 'Manual resume from dashboard' }) })
      .then(function() { toast('Agent resumed', 'success'); load(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  if (loading && !agent && !engineAgent) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading agent...');
  }

  return h(Fragment, null,

    // ─── Header Bar (sticky) ────────────────────────────
    h('div', { style: {
      position: 'sticky', top: 56, zIndex: 20,
      background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)',
      padding: '12px 0', marginBottom: 0,
      marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24,
    } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },

      // Back Button
      h('button', { className: 'btn btn-ghost btn-sm', onClick: onBack, title: 'Back to agents', style: { flexShrink: 0 } },
        h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, h('polyline', { points: '15 18 9 12 15 6' })),
        ' Agents'
      ),

      // Avatar
      h('div', { style: {
        width: 44, height: 44, borderRadius: '50%', background: avatarUrl ? 'none' : 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: avatarUrl ? 22 : 18, fontWeight: 700, color: '#fff', flexShrink: 0,
        overflow: 'hidden'
      } },
        avatarUrl
          ? h('img', { src: avatarUrl, style: { width: '100%', height: '100%', objectFit: 'cover' } })
          : avatarInitial
      ),

      // Name + Info
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('h1', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, displayName),
          h('span', { className: 'badge badge-' + stateColor, style: { textTransform: 'capitalize' } }, state),
          liveStatus && liveStatus.currentActivity && h('span', { style: { fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' } }, liveStatus.currentActivity.detail || liveStatus.currentActivity.type)
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 } },
          displayEmail && h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-muted)' } }, displayEmail),
          h('span', { className: 'badge badge-neutral', style: { textTransform: 'capitalize' } }, role)
        )
      ),

      // Action Buttons
      h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
        (state !== 'running' && state !== 'active' && state !== 'deploying') && h('button', { className: 'btn btn-primary btn-sm', onClick: function() { doAction('deploy'); } }, I.play(), ' Deploy'),
        (state === 'running' || state === 'active' || state === 'degraded' || state === 'stopped') && h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { doAction('restart'); } }, I.refresh(), ' Restart'),
        (state === 'running' || state === 'active' || state === 'degraded') && h('button', { className: 'btn btn-danger btn-sm', onClick: function() { doAction('stop'); } }, I.stop(), ' Stop'),
        !isPaused && (state === 'running' || state === 'active') && h('button', { className: 'btn btn-secondary btn-sm', onClick: doPause }, I.pause(), ' Pause'),
        isPaused && h('button', { className: 'btn btn-secondary btn-sm', onClick: doResume }, I.play(), ' Resume')
      )
    ), // close header inner flex
    ), // close header sticky wrapper

    // ─── Tab Bar (sticky, scrollable) ───────────────────
    h('div', { style: {
      position: 'sticky', top: 124, zIndex: 19,
      background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)',
      marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24,
      marginBottom: 20,
    } },
    h('div', { className: 'tabs', style: { marginBottom: 0, overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' } },
      TABS.map(function(t) {
        return h('div', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: function() { setTab(t); } }, TAB_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1));
      })
    ),
    ), // close tab bar sticky wrapper

    // ─── Knowledge Link for current tab ─────────────────
    AGENT_TAB_DOCS[tab] && h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 8 } },
      h(KnowledgeLink, { page: AGENT_TAB_DOCS[tab], label: (TAB_LABELS[tab] || tab.charAt(0).toUpperCase() + tab.slice(1)) + ' Docs' })
    ),

    // ─── Tab Content ────────────────────────────────────
    tab === 'overview' && h(OverviewSection, { agentId: agentId, agent: agent, engineAgent: engineAgent, profile: profile, reload: load, agents: agents, onBack: onBack }),
    tab === 'personal' && h(PersonalDetailsSection, { agentId: agentId, agent: agent, engineAgent: engineAgent, reload: load }),
    tab === 'email' && h(EmailSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'whatsapp' && h(WhatsAppSection, { agentId: agentId, engineAgent: engineAgent, reload: load, setTab: setTab }),
    tab === 'channels' && h(ChannelsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'configuration' && h(ConfigurationSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'manager' && h(ManagerCatchUpSection, { agentId: agentId, engineAgent: engineAgent, agents: agents, reload: load }),
    tab === 'tools' && h(ToolsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'skills' && h(SkillsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'permissions' && h(PermissionsSection, { agentId: agentId, engineAgent: engineAgent, profile: profile, reload: load }),
    tab === 'activity' && h(ActivitySection, { agentId: agentId }),
    tab === 'communication' && h(CommunicationSection, { agentId: agentId, agents: agents }),
    tab === 'workforce' && h(WorkforceSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'memory' && h(MemorySection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'guardrails' && h(GuardrailsSection, { agentId: agentId, agents: agents }),
    tab === 'autonomy' && h(AutonomySection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'budget' && h(BudgetSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'security' && h(AgentSecurityTab, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'tool-security' && h(ToolSecuritySection, { agentId: agentId }),
    tab === 'deployment' && h(DeploymentSection, { agentId: agentId, engineAgent: engineAgent, agent: agent, reload: load, onBack: onBack })
  );
}


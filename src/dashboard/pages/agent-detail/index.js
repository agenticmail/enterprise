import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, StatCard, ProgressBar, EmptyState, formatNumber, formatCost, riskBadgeClass, formatTime, MEMORY_CATEGORIES, memCatColor, memCatLabel, importanceBadgeColor } from './shared.js?v=5';
import { OverviewSection } from './overview.js?v=5';
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
import { AutonomySection } from './autonomy.js?v=5';
import { ChannelsSection } from './channels.js?v=5';

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

  var TABS = ['overview', 'personal', 'email', 'channels', 'configuration', 'manager', 'tools', 'skills', 'permissions', 'activity', 'communication', 'workforce', 'memory', 'guardrails', 'autonomy', 'budget', 'tool-security', 'deployment'];
  var TAB_LABELS = { 'tool-security': 'Security', 'manager': 'Manager', 'email': 'Email', 'channels': 'Channels', 'tools': 'Tools', 'autonomy': 'Autonomy' };

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

  // ─── Derived Values ─────────────────────────────────────

  var ea = engineAgent || {};
  var a = agent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  var state = ea.state || ea.status || a.status || 'unknown';
  var stateColor = { running: 'success', active: 'success', deploying: 'info', starting: 'info', provisioning: 'info', degraded: 'warning', error: 'danger', stopped: 'neutral', draft: 'neutral', ready: 'primary' }[state] || 'neutral';
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
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
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
          h('span', { className: 'badge badge-' + stateColor, style: { textTransform: 'capitalize' } }, state)
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
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24,
      marginBottom: 20,
    } },
    h('div', { className: 'tabs', style: { marginBottom: 0, overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' } },
      TABS.map(function(t) {
        return h('div', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: function() { setTab(t); } }, TAB_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1));
      })
    ),
    ), // close tab bar sticky wrapper

    // ─── Tab Content ────────────────────────────────────
    tab === 'overview' && h(OverviewSection, { agentId: agentId, agent: agent, engineAgent: engineAgent, profile: profile, reload: load, agents: agents, onBack: onBack }),
    tab === 'personal' && h(PersonalDetailsSection, { agentId: agentId, agent: agent, engineAgent: engineAgent, reload: load }),
    tab === 'email' && h(EmailSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'channels' && h(ChannelsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'configuration' && h(ConfigurationSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'manager' && h(ManagerCatchUpSection, { agentId: agentId, engineAgent: engineAgent, agents: agents, reload: load }),
    tab === 'tools' && h(ToolsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'skills' && h(SkillsSection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'permissions' && h(PermissionsSection, { agentId: agentId, profile: profile, reload: load }),
    tab === 'activity' && h(ActivitySection, { agentId: agentId }),
    tab === 'communication' && h(CommunicationSection, { agentId: agentId, agents: agents }),
    tab === 'workforce' && h(WorkforceSection, { agentId: agentId }),
    tab === 'memory' && h(MemorySection, { agentId: agentId }),
    tab === 'guardrails' && h(GuardrailsSection, { agentId: agentId, agents: agents }),
    tab === 'autonomy' && h(AutonomySection, { agentId: agentId, engineAgent: engineAgent, reload: load }),
    tab === 'budget' && h(BudgetSection, { agentId: agentId }),
    tab === 'tool-security' && h(ToolSecuritySection, { agentId: agentId }),
    tab === 'deployment' && h(DeploymentSection, { agentId: agentId, engineAgent: engineAgent, agent: agent, reload: load, onBack: onBack })
  );
}


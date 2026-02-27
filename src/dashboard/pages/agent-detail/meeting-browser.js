import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, EmptyState } from './shared.js?v=4';

// ════════════════════════════════════════════════════════════
// BROWSER CONFIG CARD — Configurable browser settings per agent
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// MEETING CAPABILITIES — Simple toggle, everything auto-managed
// ════════════════════════════════════════════════════════════

export function MeetingCapabilitiesSection(props) {
  var agentId = props.agentId;
  var cfg = props.cfg;
  var update = props.update;
  var sectionStyle = props.sectionStyle;
  var sectionTitle = props.sectionTitle;
  var labelStyle = props.labelStyle;
  var helpStyle = props.helpStyle;
  var _d = useApp(); var toast = _d.toast;
  var _launching = useState(false); var launching = _launching[0]; var setLaunching = _launching[1];
  var _browserStatus = useState(null); var browserStatus = _browserStatus[0]; var setBrowserStatus = _browserStatus[1];
  var _sysCaps = useState(null); var sysCaps = _sysCaps[0]; var setSysCaps = _sysCaps[1];

  // Fetch system capabilities on mount
  useEffect(function() {
    engineCall('/bridge/system/capabilities')
      .then(function(d) { setSysCaps(d); })
      .catch(function() { setSysCaps(null); });
  }, []);

  function checkMeetingBrowser() {
    engineCall('/bridge/agents/' + agentId + '/browser-config/test', { method: 'POST' })
      .then(function(d) { setBrowserStatus(d); })
      .catch(function() { setBrowserStatus(null); });
  }

  useEffect(function() {
    if (cfg.meetingsEnabled) checkMeetingBrowser();
  }, [cfg.meetingsEnabled]);

  var _stopping = useState(false); var stopping = _stopping[0]; var setStopping = _stopping[1];

  function launchMeetingBrowser() {
    setLaunching(true);
    engineCall('/bridge/agents/' + agentId + '/browser-config/launch-meeting-browser', { method: 'POST' })
      .then(function(d) {
        if (d.error) { toast(d.error, 'error'); }
        else { toast('Meeting browser ready', 'success'); setBrowserStatus(d); }
        setLaunching(false);
      })
      .catch(function(e) { toast(e.message, 'error'); setLaunching(false); });
  }

  function stopMeetingBrowser() {
    setStopping(true);
    engineCall('/bridge/agents/' + agentId + '/browser-config/stop-meeting-browser', { method: 'POST' })
      .then(function(d) {
        if (d.error) { toast(d.error, 'error'); }
        else { toast('Meeting browser stopped', 'success'); setBrowserStatus(null); }
        setStopping(false);
      })
      .catch(function(e) { toast(e.message, 'error'); setStopping(false); });
  }

  var meetingsOn = cfg.meetingsEnabled === true;

  var isContainer = sysCaps && sysCaps.raw && (sysCaps.raw.deployment === 'container');
  var canJoinMeetings = sysCaps && sysCaps.raw && sysCaps.raw.canJoinMeetings;
  var isObserverOnly = sysCaps && sysCaps.raw && sysCaps.raw.isContainerWithFakeMedia;
  var canJoinFullMedia = sysCaps && sysCaps.raw && sysCaps.raw.canJoinMeetingsFullMedia;

  return h('div', { style: sectionStyle },
    sectionTitle('\uD83C\uDFA5', 'Meetings & Video Calls'),

    // Deployment capability warning — show for no-meeting OR observer-only
    sysCaps && (!canJoinMeetings || isObserverOnly) && h('div', { style: {
      background: isObserverOnly ? 'rgba(33,150,243,0.08)' : 'rgba(255,152,0,0.08)',
      border: '1px solid ' + (isObserverOnly ? 'rgba(33,150,243,0.3)' : 'rgba(255,152,0,0.3)'),
      borderRadius: 8, padding: '12px 16px', marginBottom: 16,
    } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
        h('span', { style: { display: 'inline-flex' } }, isObserverOnly ? E.eye(18) : E.warning(18)),
        h('div', null,
          h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 } },
            isObserverOnly
              ? 'Observer Mode — Container Deployment'
              : 'Limited on this deployment' + (isContainer ? ' (container)' : '')
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 } },
            isObserverOnly
              ? 'This container has Chromium + virtual display, but uses fake media devices. The agent can join meetings as an observer — it can see the screen, read chat, and take notes, but cannot send or receive real audio/video.'
              : 'Video meeting joining requires a display server, audio subsystem, and browser — which are not available on container deployments (Fly.io, Railway, etc.).'
          ),
          isObserverOnly && h('div', { style: { fontSize: 12, marginTop: 8, lineHeight: 1.5 } },
            h('strong', null, 'Works in observer mode: '),
            'Join meetings, read chat, see shared screens, take screenshots, capture meeting notes.'
          ),
          isObserverOnly && h('div', { style: { fontSize: 12, marginTop: 4, lineHeight: 1.5 } },
            h('strong', null, 'Does NOT work: '),
            'Speaking, sending audio, showing video/camera, screen sharing.'
          ),
          !isObserverOnly && h('div', { style: { fontSize: 12, marginTop: 8, lineHeight: 1.5 } },
            h('strong', null, 'What works here: '), 'Calendar management, meeting prep, Drive organization, notes, email scanning for invites, RSVP.'
          ),
          h('div', { style: { fontSize: 12, marginTop: 8, lineHeight: 1.5 } },
            h('strong', null, 'For full media (audio + video): '), 'Deploy on a VM (Hetzner, DigitalOcean, GCP) with our ',
            h('code', { style: { fontSize: 11, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 } }, 'vm-setup.sh'),
            ' script, or use a Remote Browser (CDP) provider.'
          )
        )
      )
    ),

    // Main toggle
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: meetingsOn ? 16 : 0 } },
      h('div', {
        onClick: function() { update('meetingsEnabled', !meetingsOn); },
        style: {
          width: 52, height: 28, borderRadius: 14, position: 'relative', cursor: 'pointer',
          background: meetingsOn ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', flexShrink: 0,
        },
      },
        h('div', { style: {
          width: 24, height: 24, borderRadius: 12, background: '#fff', position: 'absolute', top: 2,
          left: meetingsOn ? 26 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        } })
      ),
      h('div', null,
        h('div', { style: { fontWeight: 600, fontSize: 13 } }, meetingsOn ? 'Meeting participation enabled' : 'Meeting participation disabled'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } },
          meetingsOn
            ? 'Agent can join Google Meet, Microsoft Teams, and Zoom calls automatically'
            : 'Enable to let this agent join video calls and meetings on behalf of your organization'
        )
      )
    ),

    // When enabled, show status + options
    meetingsOn && h('div', null,

      // Status card
      h('div', { style: { display: 'flex', gap: 12, marginBottom: 16 } },
        h('div', { className: 'card', style: { flex: 1, padding: '12px 16px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('div', { style: {
              width: 8, height: 8, borderRadius: 4,
              background: browserStatus?.ok ? 'var(--success)' : 'var(--warning)',
            } }),
            h('span', { style: { fontSize: 13, fontWeight: 600 } }, 'Meeting Browser'),
            browserStatus?.ok && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--success-soft)', color: 'var(--success)' } }, 'Running')
          ),
          browserStatus?.ok
            ? h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                  h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, browserStatus.browserVersion || 'Chromium ready'),
                  isObserverOnly && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'rgba(33,150,243,0.15)', color: 'var(--accent)' } }, 'Observer Only'),
                  browserStatus.port && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Port ' + browserStatus.port)
                ),
                h('button', {
                  className: 'btn btn-sm',
                  disabled: stopping,
                  onClick: stopMeetingBrowser,
                  style: { background: 'var(--danger)', color: '#fff', border: 'none', marginTop: 4 },
                }, stopping ? 'Stopping...' : '\u23F9\uFE0F Stop Meeting Browser'),
                isContainer && !canJoinMeetings && !isObserverOnly && h('div', { style: { fontSize: 11, color: 'var(--warning)', marginTop: 4 } },
                  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, E.warning(14), ' Browser is headless-only on this container. It cannot join video calls (no display/audio).')
                )
              )
            : h('div', null,
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } },
                  isContainer && !canJoinMeetings
                    ? 'Meeting browser cannot join video calls on container deployments. Use a VM or Remote Browser (CDP) instead.'
                    : 'A dedicated browser instance will be launched for video calls with virtual display and audio.'
                ),
                h('button', {
                  className: 'btn btn-sm',
                  disabled: launching || (isContainer && !canJoinMeetings),
                  onClick: launchMeetingBrowser,
                  title: isContainer && !canJoinMeetings ? 'Not available on container deployments' : '',
                },
                  isContainer && !canJoinMeetings
                    ? '\u274C Not available on containers'
                    : launching ? 'Launching...' : '\u25B6\uFE0F Launch Meeting Browser'
                )
              )
        )
      ),

      // Supported platforms
      h('div', { style: { display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 } },
        [
          { name: 'Google Meet', icon: '\uD83D\uDFE2', enabled: cfg.meetingGoogleMeet !== false, key: 'meetingGoogleMeet', desc: 'Join via Google Calendar integration' },
          { name: 'Microsoft Teams', icon: '\uD83D\uDFE3', enabled: cfg.meetingTeams !== false, key: 'meetingTeams', desc: 'Join via meeting links' },
          { name: 'Zoom', icon: '\uD83D\uDD35', enabled: cfg.meetingZoom !== false, key: 'meetingZoom', desc: 'Join via meeting links' },
        ].map(function(p) {
          return h('div', { key: p.key, className: 'card', style: { padding: '10px 12px', cursor: 'pointer', border: '1px solid ' + (p.enabled ? 'var(--accent)' : 'var(--border)') },
            onClick: function() { update(p.key, !p.enabled); }
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
              h('span', null, p.icon),
              h('span', { style: { fontWeight: 600, fontSize: 12 } }, p.name),
              h('span', { style: { marginLeft: 'auto', fontSize: 11, color: p.enabled ? 'var(--success)' : 'var(--text-muted)' } }, p.enabled ? 'ON' : 'OFF')
            ),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, p.desc)
          );
        })
      ),

      // Meeting behavior
      h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Auto-Join Calendar Meetings'),
          h('select', { className: 'input', value: cfg.meetingAutoJoin || 'ask',
            onChange: function(e) { update('meetingAutoJoin', e.target.value); }
          },
            h('option', { value: 'always' }, 'Always — Join all meetings automatically'),
            h('option', { value: 'invited' }, 'When Invited — Only join meetings the agent is invited to'),
            h('option', { value: 'ask' }, 'Ask First — Request approval before joining'),
            h('option', { value: 'never' }, 'Manual Only — Agent only joins when explicitly told')
          ),
          h('div', { style: helpStyle }, 'How the agent decides when to join meetings.')
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Meeting Role'),
          h('select', { className: 'input', value: cfg.meetingRole || 'observer',
            onChange: function(e) { update('meetingRole', e.target.value); }
          },
            h('option', { value: 'observer' }, 'Observer — Listen and take notes only'),
            h('option', { value: 'participant' }, 'Participant — Can speak and interact'),
            h('option', { value: 'presenter' }, 'Presenter — Can share screen and present')
          ),
          h('div', { style: helpStyle }, 'What the agent is allowed to do in meetings.')
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Join Timing'),
          h('select', { className: 'input', value: cfg.meetingJoinTiming || 'ontime',
            onChange: function(e) { update('meetingJoinTiming', e.target.value); }
          },
            h('option', { value: 'early' }, 'Early — Join 2 minutes before start'),
            h('option', { value: 'ontime' }, 'On Time — Join at scheduled start'),
            h('option', { value: 'late' }, 'Fashionably Late — Join 2 minutes after start')
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'After Meeting'),
          h('select', { className: 'input', value: cfg.meetingAfterAction || 'notes',
            onChange: function(e) { update('meetingAfterAction', e.target.value); }
          },
            h('option', { value: 'notes' }, 'Send meeting notes to organizer'),
            h('option', { value: 'summary' }, 'Post summary to team channel'),
            h('option', { value: 'transcript' }, 'Save full transcript'),
            h('option', { value: 'nothing' }, 'Do nothing')
          ),
          h('div', { style: helpStyle }, 'What happens after the meeting ends.')
        )
      ),

      // Display name in meetings
      h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 12 } },
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Display Name in Meetings'),
          h('input', { className: 'input', placeholder: 'Agent name (e.g. "Fola - AI Assistant")',
            value: cfg.meetingDisplayName || '',
            onChange: function(e) { update('meetingDisplayName', e.target.value || undefined); }
          }),
          h('div', { style: helpStyle }, 'How the agent appears to other participants.')
        ),
        h('div', { className: 'form-group' },
          h('label', { style: labelStyle }, 'Max Meeting Duration (minutes)'),
          h('input', { className: 'input', type: 'number', min: 5, max: 480,
            value: cfg.meetingMaxDuration || 120,
            onChange: function(e) { update('meetingMaxDuration', parseInt(e.target.value) || 120); }
          }),
          h('div', { style: helpStyle }, 'Agent will leave after this duration to prevent runaway sessions.')
        )
      )
    )
  );
}

export function BrowserConfigCard(props) {
  var agentId = props.agentId;
  var _d = useApp(); var toast = _d.toast;
  var _cfg = useState(null); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _testing = useState(false); var testing = _testing[0]; var setTesting = _testing[1];
  var _testResult = useState(null); var testResult = _testResult[0]; var setTestResult = _testResult[1];
  var _collapsed = useState(false); var collapsed = _collapsed[0]; var setCollapsed = _collapsed[1];

  function load() {
    engineCall('/bridge/agents/' + agentId + '/browser-config')
      .then(function(d) { setCfg(d.config || { provider: 'local' }); })
      .catch(function() { setCfg({ provider: 'local' }); });
  }

  useEffect(function() { load(); }, [agentId]);

  function save() {
    setSaving(true);
    engineCall('/bridge/agents/' + agentId + '/browser-config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }).then(function() { toast('Browser config saved', 'success'); setSaving(false); })
      .catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  function testConnection() {
    setTesting(true); setTestResult(null);
    engineCall('/bridge/agents/' + agentId + '/browser-config/test', { method: 'POST' })
      .then(function(d) { setTestResult(d); setTesting(false); })
      .catch(function(e) { setTestResult({ error: e.message }); setTesting(false); });
  }

  function update(key, value) {
    setCfg(function(prev) { var n = Object.assign({}, prev); n[key] = value; return n; });
  }

  if (!cfg) return null;

  var provider = cfg.provider || 'local';
  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var helpStyle = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };
  var sectionStyle = { padding: '12px 0', borderBottom: '1px solid var(--border)' };
  var sectionTitle = function(icon, text) {
    return h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 } },
      h('span', null, icon), text);
  };

  // Provider descriptions
  var providers = [
    { id: 'local', name: 'Local Chromium', icon: '\uD83D\uDCBB', desc: 'Built-in headless Chromium on this server. Best for web automation, scraping, screenshots, form filling.' },
    { id: 'remote-cdp', name: 'Remote Browser (CDP)', icon: '\uD83C\uDF10', desc: 'Connect to a Chrome/Chromium instance via Chrome DevTools Protocol. Required for headed mode, video calls, persistent sessions.' },
    { id: 'browserless', name: 'Browserless.io', icon: '\u2601\uFE0F', desc: 'Cloud browser service. Scalable, managed infrastructure. Supports stealth mode, residential proxies, and concurrent sessions.' },
    { id: 'browserbase', name: 'Browserbase', icon: '\uD83D\uDE80', desc: 'AI-native cloud browser. Built for agent automation with session replay, anti-detection, and managed infrastructure.' },
    { id: 'steel', name: 'Steel.dev', icon: '\u26A1', desc: 'Open-source browser API designed for AI agents. Self-hostable, session management, built-in stealth.' },
    { id: 'scrapingbee', name: 'ScrapingBee', icon: '\uD83D\uDC1D', desc: 'Web scraping API with browser rendering, proxy rotation, and CAPTCHA solving.' },
  ];

  return h('div', { className: 'card', style: { marginTop: 16 } },
    h('div', {
      className: 'card-header',
      style: { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      onClick: function() { setCollapsed(!collapsed); }
    },
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        '\uD83C\uDF10 Browser & Web Automation',
        cfg.provider && cfg.provider !== 'local' && h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 6px', background: 'var(--accent-soft)', color: 'var(--accent)' } },
          providers.find(function(p) { return p.id === cfg.provider; })?.name || cfg.provider
        )
      ),
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, collapsed ? E.triangleDown(12) : E.triangleUp(12))
    ),
    !collapsed && h('div', { style: { padding: 16 } },

      // ─── Section 1: Browser Provider ─────────────────
      h('div', { style: sectionStyle },
        sectionTitle('\uD83D\uDD27', 'Browser Provider'),
        h('div', { style: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } },
          providers.map(function(p) {
            var selected = provider === p.id;
            return h('div', {
              key: p.id,
              onClick: function() { update('provider', p.id); },
              style: {
                padding: '12px 14px', borderRadius: 'var(--radius)', cursor: 'pointer',
                border: '2px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
                background: selected ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                transition: 'all 0.15s',
              }
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                h('span', { style: { fontSize: 18 } }, p.icon),
                h('span', { style: { fontWeight: 600, fontSize: 13 } }, p.name),
                selected && h('span', { style: { marginLeft: 'auto', color: 'var(--accent)', fontSize: 14 } }, '\u2713')
              ),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 } }, p.desc)
            );
          })
        )
      ),

      // ─── Section 2: Provider-Specific Config ─────────
      h('div', { style: sectionStyle },

        // Local Chromium
        provider === 'local' && h(Fragment, null,
          sectionTitle('\uD83D\uDCBB', 'Local Chromium Settings'),
          h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Display Mode'),
              h('select', { className: 'input', value: cfg.headless !== false ? 'true' : 'false',
                onChange: function(e) { update('headless', e.target.value === 'true'); }
              },
                h('option', { value: 'true' }, 'Headless (no window)'),
                h('option', { value: 'false' }, 'Headed (visible window)')
              ),
              h('div', { style: helpStyle }, 'Headed mode requires a display server (X11/Wayland).')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Executable Path'),
              h('input', { className: 'input', placeholder: 'Auto-detect (recommended)',
                value: cfg.executablePath || '',
                onChange: function(e) { update('executablePath', e.target.value || undefined); }
              }),
              h('div', { style: helpStyle }, 'Leave empty to use bundled Chromium.')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'User Data Directory'),
              h('input', { className: 'input', placeholder: 'Temporary (new profile each session)',
                value: cfg.userDataDir || '',
                onChange: function(e) { update('userDataDir', e.target.value || undefined); }
              }),
              h('div', { style: helpStyle }, 'Persist cookies, logins, and extensions across sessions.')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Extra Chrome Args'),
              h('input', { className: 'input', placeholder: '--no-sandbox, --disable-gpu',
                value: (cfg.extraArgs || []).join(', '),
                onChange: function(e) { update('extraArgs', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }
              }),
              h('div', { style: helpStyle }, 'Additional Chromium launch arguments.')
            )
          )
        ),

        // Remote CDP
        provider === 'remote-cdp' && h(Fragment, null,
          sectionTitle('\uD83C\uDF10', 'Remote Browser Connection'),
          h('div', { style: { padding: '10px 14px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 12, lineHeight: 1.5 } },
            h('strong', null, 'How it works: '),
            'The agent connects to a Chrome/Chromium browser running on another machine via the Chrome DevTools Protocol (CDP). ',
            'This is required for video calls (Google Meet, Teams, Zoom) where the browser needs a camera, microphone, and display. ',
            h('br', null), h('br', null),
            h('strong', null, 'Setup options:'), h('br', null),
            '\u2022 Run Chrome with --remote-debugging-port=9222 on a VM/desktop', h('br', null),
            '\u2022 Use a cloud desktop (AWS WorkSpaces, Azure Virtual Desktop, Hetzner)', h('br', null),
            '\u2022 Set up a dedicated browser VM with virtual camera/audio for meetings', h('br', null),
            '\u2022 Use SSH tunneling to expose Chrome DevTools securely'
          ),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'CDP WebSocket URL *'),
              h('input', { className: 'input', placeholder: 'ws://192.168.1.100:9222/devtools/browser/...',
                value: cfg.cdpUrl || '',
                onChange: function(e) { update('cdpUrl', e.target.value); }
              }),
              h('div', { style: helpStyle }, 'WebSocket URL from chrome://inspect or --remote-debugging-port output. Format: ws://host:port/devtools/browser/<id>')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Auth Token'),
                h('input', { className: 'input', type: 'password', placeholder: 'Optional — for authenticated CDP endpoints',
                  value: cfg.cdpAuthToken || '',
                  onChange: function(e) { update('cdpAuthToken', e.target.value || undefined); }
                })
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Connection Timeout (ms)'),
                h('input', { className: 'input', type: 'number', min: 5000, max: 60000,
                  value: cfg.cdpTimeout || 30000,
                  onChange: function(e) { update('cdpTimeout', parseInt(e.target.value) || 30000); }
                })
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'SSH Tunnel (auto-connect)'),
              h('input', { className: 'input', placeholder: 'ssh -L 9222:localhost:9222 user@remote-host (optional)',
                value: cfg.sshTunnel || '',
                onChange: function(e) { update('sshTunnel', e.target.value || undefined); }
              }),
              h('div', { style: helpStyle }, 'SSH command to establish tunnel before connecting. Agent will run this automatically.')
            )
          )
        ),

        // Browserless
        provider === 'browserless' && h(Fragment, null,
          sectionTitle('\u2601\uFE0F', 'Browserless.io Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Token *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your Browserless API token',
                value: cfg.browserlessToken || '',
                onChange: function(e) { update('browserlessToken', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://www.browserless.io/dashboard', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API token'), ' from the Browserless dashboard.')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Endpoint'),
                h('input', { className: 'input', placeholder: 'wss://chrome.browserless.io (default)',
                  value: cfg.browserlessEndpoint || '',
                  onChange: function(e) { update('browserlessEndpoint', e.target.value || undefined); }
                }),
                h('div', { style: helpStyle }, 'Custom endpoint for self-hosted or enterprise plans.')
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Concurrent Sessions'),
                h('input', { className: 'input', type: 'number', min: 1, max: 100,
                  value: cfg.browserlessConcurrency || 5,
                  onChange: function(e) { update('browserlessConcurrency', parseInt(e.target.value) || 5); }
                })
              )
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Stealth Mode'),
                h('select', { className: 'input', value: cfg.browserlessStealth ? 'true' : 'false',
                  onChange: function(e) { update('browserlessStealth', e.target.value === 'true'); }
                },
                  h('option', { value: 'false' }, 'Off'),
                  h('option', { value: 'true' }, 'On — Evade bot detection')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Proxy'),
                h('input', { className: 'input', placeholder: 'Optional proxy URL',
                  value: cfg.browserlessProxy || '',
                  onChange: function(e) { update('browserlessProxy', e.target.value || undefined); }
                })
              )
            )
          )
        ),

        // Browserbase
        provider === 'browserbase' && h(Fragment, null,
          sectionTitle('\uD83D\uDE80', 'Browserbase Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Key *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your Browserbase API key',
                value: cfg.browserbaseApiKey || '',
                onChange: function(e) { update('browserbaseApiKey', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://www.browserbase.com/settings', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API key'), ' from Browserbase settings.')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'Project ID *'),
              h('input', { className: 'input', placeholder: 'Your Browserbase project ID',
                value: cfg.browserbaseProjectId || '',
                onChange: function(e) { update('browserbaseProjectId', e.target.value); }
              })
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Session Recording'),
                h('select', { className: 'input', value: cfg.browserbaseRecording !== false ? 'true' : 'false',
                  onChange: function(e) { update('browserbaseRecording', e.target.value === 'true'); }
                },
                  h('option', { value: 'true' }, 'Enabled — Record sessions for replay'),
                  h('option', { value: 'false' }, 'Disabled')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Keep Session Alive'),
                h('select', { className: 'input', value: cfg.browserbaseKeepAlive ? 'true' : 'false',
                  onChange: function(e) { update('browserbaseKeepAlive', e.target.value === 'true'); }
                },
                  h('option', { value: 'false' }, 'Close after task'),
                  h('option', { value: 'true' }, 'Keep alive for reuse')
                )
              )
            )
          )
        ),

        // Steel
        provider === 'steel' && h(Fragment, null,
          sectionTitle('\u26A1', 'Steel.dev Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Key *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your Steel API key',
                value: cfg.steelApiKey || '',
                onChange: function(e) { update('steelApiKey', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://app.steel.dev', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API key'), ' — or self-host Steel for free.')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Endpoint'),
                h('input', { className: 'input', placeholder: 'https://api.steel.dev (default)',
                  value: cfg.steelEndpoint || '',
                  onChange: function(e) { update('steelEndpoint', e.target.value || undefined); }
                })
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Session Duration (min)'),
                h('input', { className: 'input', type: 'number', min: 1, max: 120,
                  value: cfg.steelSessionDuration || 15,
                  onChange: function(e) { update('steelSessionDuration', parseInt(e.target.value) || 15); }
                })
              )
            )
          )
        ),

        // ScrapingBee
        provider === 'scrapingbee' && h(Fragment, null,
          sectionTitle('\uD83D\uDC1D', 'ScrapingBee Configuration'),
          h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: labelStyle }, 'API Key *'),
              h('input', { className: 'input', type: 'password', placeholder: 'Your ScrapingBee API key',
                value: cfg.scrapingbeeApiKey || '',
                onChange: function(e) { update('scrapingbeeApiKey', e.target.value); }
              }),
              h('div', { style: helpStyle }, h('a', { href: 'https://www.scrapingbee.com/dashboard', target: '_blank', style: { color: 'var(--accent)' } }, 'Get your API key'), ' from ScrapingBee dashboard.')
            ),
            h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' } },
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'JavaScript Rendering'),
                h('select', { className: 'input', value: cfg.scrapingbeeJsRendering !== false ? 'true' : 'false',
                  onChange: function(e) { update('scrapingbeeJsRendering', e.target.value === 'true'); }
                },
                  h('option', { value: 'true' }, 'Enabled'),
                  h('option', { value: 'false' }, 'Disabled (faster)')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Premium Proxy'),
                h('select', { className: 'input', value: cfg.scrapingbeePremiumProxy ? 'true' : 'false',
                  onChange: function(e) { update('scrapingbeePremiumProxy', e.target.value === 'true'); }
                },
                  h('option', { value: 'false' }, 'Standard'),
                  h('option', { value: 'true' }, 'Premium (residential IPs)')
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { style: labelStyle }, 'Country'),
                h('input', { className: 'input', placeholder: 'us, gb, de...',
                  value: cfg.scrapingbeeCountry || '',
                  onChange: function(e) { update('scrapingbeeCountry', e.target.value || undefined); }
                })
              )
            )
          )
        )
      ),

      // ─── Section 3: Security & Limits ────────────────
      h('div', { style: sectionStyle },
        sectionTitle('\uD83D\uDD12', 'Security & Limits'),
        h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'URL Protection'),
            h('select', { className: 'input', value: cfg.ssrfProtection || 'permissive',
              onChange: function(e) { update('ssrfProtection', e.target.value); }
            },
              h('option', { value: 'off' }, 'Off — No URL restrictions'),
              h('option', { value: 'permissive' }, 'Permissive — Block dangerous URLs'),
              h('option', { value: 'strict' }, 'Strict — Allowlist only')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'JavaScript Evaluation'),
            h('select', { className: 'input', value: cfg.allowEvaluate !== false ? 'true' : 'false',
              onChange: function(e) { update('allowEvaluate', e.target.value === 'true'); }
            },
              h('option', { value: 'true' }, 'Allowed'),
              h('option', { value: 'false' }, 'Blocked')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'File URLs (file://)'),
            h('select', { className: 'input', value: cfg.allowFileUrls ? 'true' : 'false',
              onChange: function(e) { update('allowFileUrls', e.target.value === 'true'); }
            },
              h('option', { value: 'false' }, 'Blocked'),
              h('option', { value: 'true' }, 'Allowed')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Max Concurrent Tabs'),
            h('input', { className: 'input', type: 'number', min: 1, max: 50,
              value: cfg.maxContexts || 10,
              onChange: function(e) { update('maxContexts', parseInt(e.target.value) || 10); }
            })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Navigation Timeout (ms)'),
            h('input', { className: 'input', type: 'number', min: 5000, max: 120000, step: 1000,
              value: cfg.navigationTimeoutMs || 30000,
              onChange: function(e) { update('navigationTimeoutMs', parseInt(e.target.value) || 30000); }
            })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Idle Timeout (min)'),
            h('input', { className: 'input', type: 'number', min: 1, max: 60,
              value: Math.round((cfg.idleTimeoutMs || 300000) / 60000),
              onChange: function(e) { update('idleTimeoutMs', (parseInt(e.target.value) || 5) * 60000); }
            })
          )
        ),
        h('div', { className: 'form-group', style: { marginTop: 12 } },
          h('label', { style: labelStyle }, 'Blocked URL Patterns'),
          h('input', { className: 'input', placeholder: '*://169.254.*, *://metadata.google.*',
            value: (cfg.blockedUrlPatterns || []).join(', '),
            onChange: function(e) { update('blockedUrlPatterns', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }
          })
        ),
        cfg.ssrfProtection === 'strict' && h('div', { className: 'form-group', style: { marginTop: 8 } },
          h('label', { style: labelStyle }, 'Allowed URL Patterns'),
          h('input', { className: 'input', placeholder: '*://example.com/*, *://app.service.com/*',
            value: (cfg.allowedUrlPatterns || []).join(', '),
            onChange: function(e) { update('allowedUrlPatterns', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }
          })
        )
      ),

      // ─── Section 4: Meeting & Video Capabilities ─────
      h(MeetingCapabilitiesSection, { agentId: agentId, cfg: cfg, update: update, labelStyle: labelStyle, helpStyle: helpStyle, sectionStyle: sectionStyle, sectionTitle: sectionTitle }),

      // ─── Section 5: Persistent Sessions ──────────────
      h('div', { style: { paddingTop: 12 } },
        sectionTitle('\uD83D\uDD04', 'Session Persistence'),
        h('div', { style: { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' } },
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Persist Login Sessions'),
            h('select', { className: 'input', value: cfg.persistSessions ? 'true' : 'false',
              onChange: function(e) { update('persistSessions', e.target.value === 'true'); }
            },
              h('option', { value: 'false' }, 'No — Fresh session each time'),
              h('option', { value: 'true' }, 'Yes — Keep cookies, localStorage, logins')
            ),
            h('div', { style: helpStyle }, 'Persistent sessions let agents stay logged into web apps.')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: labelStyle }, 'Session Storage Path'),
            h('input', { className: 'input', placeholder: '/data/browser-sessions/' + agentId.slice(0, 8),
              value: cfg.sessionStoragePath || '',
              onChange: function(e) { update('sessionStoragePath', e.target.value || undefined); }
            }),
            h('div', { style: helpStyle }, 'Directory to store persistent browser state.')
          )
        )
      ),

      // ─── Actions Bar ─────────────────────────────────
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 8, borderTop: '1px solid var(--border)' } },
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-sm', disabled: testing, onClick: testConnection },
            testing ? 'Testing...' : '\u{1F50C} Test Connection'
          ),
          testResult && h('span', { style: { fontSize: 12, color: testResult.error ? 'var(--danger)' : 'var(--success)', alignSelf: 'center' } },
            testResult.error ? '\u274C ' + testResult.error : '\u2705 Connected — ' + (testResult.browserVersion || 'OK')
          )
        ),
        h('button', { className: 'btn', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Browser Config')
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// TOOL RESTRICTIONS CARD — Per-agent restrictions
// ════════════════════════════════════════════════════════════

export function ToolRestrictionsCard(props) {
  var agentId = props.agentId;
  var _d = useApp(); var toast = _d.toast;
  var _cfg = useState(null); var cfg = _cfg[0]; var setCfg = _cfg[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _collapsed = useState(true); var collapsed = _collapsed[0]; var setCollapsed = _collapsed[1];

  function load() {
    engineCall('/bridge/agents/' + agentId + '/tool-restrictions')
      .then(function(d) { setCfg(d.restrictions || {}); })
      .catch(function() { setCfg({}); });
  }

  useEffect(function() { load(); }, [agentId]);

  function save() {
    setSaving(true);
    engineCall('/bridge/agents/' + agentId + '/tool-restrictions', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }).then(function() { toast('Restrictions saved', 'success'); setSaving(false); })
      .catch(function(e) { toast(e.message, 'error'); setSaving(false); });
  }

  function update(key, value) {
    setCfg(function(prev) { var n = Object.assign({}, prev); n[key] = value; return n; });
  }

  if (!cfg) return null;

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var helpStyle = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };

  return h('div', { className: 'card', style: { marginTop: 16 } },
    h('div', {
      className: 'card-header',
      style: { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      onClick: function() { setCollapsed(!collapsed); }
    },
      h('span', null, '\uD83D\uDD12 Tool Restrictions'),
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, collapsed ? E.triangleDown(12) : E.triangleUp(12))
    ),
    !collapsed && h('div', { style: { padding: 16, display: 'grid', gap: 16 } },
      // Max file size for read/write
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Max File Size (MB)'),
        h('input', {
          className: 'input', type: 'number', min: 1, max: 1000,
          value: cfg.maxFileSizeMb || 50,
          onChange: function(e) { update('maxFileSizeMb', parseInt(e.target.value) || 50); }
        }),
        h('div', { style: helpStyle }, 'Maximum file size the agent can read or write.')
      ),

      // Shell command execution
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Shell Command Execution'),
        h('select', {
          className: 'input', value: cfg.shellExecution || 'allowed',
          onChange: function(e) { update('shellExecution', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Full shell access'),
          h('option', { value: 'sandboxed' }, 'Sandboxed — Limited to safe commands'),
          h('option', { value: 'blocked' }, 'Blocked — No shell execution')
        ),
        h('div', { style: helpStyle }, 'Controls whether the agent can run shell commands.')
      ),

      // Web fetch restrictions
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Web Fetch'),
        h('select', {
          className: 'input', value: cfg.webFetch || 'allowed',
          onChange: function(e) { update('webFetch', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Can fetch any URL'),
          h('option', { value: 'restricted' }, 'Restricted — Only allowed domains'),
          h('option', { value: 'blocked' }, 'Blocked — No web fetching')
        )
      ),

      // Email sending restrictions
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Email Sending'),
        h('select', {
          className: 'input', value: cfg.emailSending || 'allowed',
          onChange: function(e) { update('emailSending', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Can send to anyone'),
          h('option', { value: 'internal' }, 'Internal Only — Same domain only'),
          h('option', { value: 'approval' }, 'Requires Approval — Manager must approve'),
          h('option', { value: 'blocked' }, 'Blocked — No email sending')
        ),
        h('div', { style: helpStyle }, 'Controls who the agent can email.')
      ),

      // Database access
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Database Access'),
        h('select', {
          className: 'input', value: cfg.databaseAccess || 'readwrite',
          onChange: function(e) { update('databaseAccess', e.target.value); }
        },
          h('option', { value: 'readwrite' }, 'Read + Write — Full database access'),
          h('option', { value: 'readonly' }, 'Read Only — SELECT queries only'),
          h('option', { value: 'blocked' }, 'Blocked — No database access')
        )
      ),

      // Drive/file sharing
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'File Sharing (Drive)'),
        h('select', {
          className: 'input', value: cfg.fileSharing || 'allowed',
          onChange: function(e) { update('fileSharing', e.target.value); }
        },
          h('option', { value: 'allowed' }, 'Allowed — Can share files externally'),
          h('option', { value: 'internal' }, 'Internal Only — Share within org only'),
          h('option', { value: 'blocked' }, 'Blocked — No file sharing')
        )
      ),

      // Rate limiting
      h('div', { className: 'form-group' },
        h('label', { style: labelStyle }, 'Rate Limit (calls per minute)'),
        h('input', {
          className: 'input', type: 'number', min: 0, max: 1000,
          value: cfg.rateLimit || 0,
          onChange: function(e) { update('rateLimit', parseInt(e.target.value) || 0); }
        }),
        h('div', { style: helpStyle }, '0 = no limit. Applies across all tool calls.')
      ),

      // Save button
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', paddingTop: 8 } },
        h('button', { className: 'btn', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Restrictions')
      )
    )
  );
}


import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

export function SkillsPage() {
  var app = useApp();
  var toast = app.toast;
  var setPage = app.setPage;

  var _tab = useState('builtin');
  var tab = _tab[0]; var setTab = _tab[1];

  // Builtin skills
  var _skills = useState({});
  var skills = _skills[0]; var setSkills = _skills[1];
  var _search = useState('');
  var search = _search[0]; var setSearch = _search[1];

  // Installed community skills
  var _installed = useState([]);
  var installed = _installed[0]; var setInstalled = _installed[1];
  var _statuses = useState({});
  var statuses = _statuses[0]; var setStatuses = _statuses[1];
  var _installedLoading = useState(true);
  var installedLoading = _installedLoading[0]; var setInstalledLoading = _installedLoading[1];

  // Token modal
  var _tokenModal = useState(null);
  var tokenModal = _tokenModal[0]; var setTokenModal = _tokenModal[1];
  var _tokenValue = useState('');
  var tokenValue = _tokenValue[0]; var setTokenValue = _tokenValue[1];

  // Config modal
  var _configSkill = useState(null);
  var configSkill = _configSkill[0]; var setConfigSkill = _configSkill[1];
  var _configValues = useState({});
  var configValues = _configValues[0]; var setConfigValues = _configValues[1];
  var _configSaving = useState(false);
  var configSaving = _configSaving[0]; var setConfigSaving = _configSaving[1];

  // Connecting state
  var _connectingId = useState(null);
  var connectingId = _connectingId[0]; var setConnectingId = _connectingId[1];

  // Load builtin skills
  useEffect(function() {
    engineCall('/skills/by-category')
      .then(function(d) { setSkills(d.categories || {}); })
      .catch(function() {});
  }, []);

  // Load installed skills + statuses
  var loadInstalled = useCallback(function() {
    setInstalledLoading(true);
    engineCall('/community/installed?orgId=default')
      .then(function(d) {
        var items = d.installed || [];
        setInstalled(items);
        // Load statuses
        var promises = items.map(function(skill) {
          return engineCall('/oauth/status/' + skill.skillId)
            .then(function(s) { return { skillId: skill.skillId, status: s }; })
            .catch(function() { return { skillId: skill.skillId, status: { connected: false } }; });
        });
        Promise.all(promises).then(function(results) {
          var map = {};
          results.forEach(function(r) { map[r.skillId] = r.status; });
          setStatuses(map);
        });
      })
      .catch(function() {})
      .finally(function() { setInstalledLoading(false); });
  }, []);

  useEffect(function() { loadInstalled(); }, [loadInstalled]);

  // Listen for OAuth popup messages
  useEffect(function() {
    function handleMessage(event) {
      if (event.data && event.data.type === 'oauth-result') {
        if (event.data.status === 'success') {
          toast('Connected successfully', 'success');
          if (connectingId) {
            engineCall('/oauth/status/' + connectingId)
              .then(function(d) {
                setStatuses(function(prev) {
                  var u = Object.assign({}, prev);
                  u[connectingId] = d;
                  return u;
                });
              })
              .catch(function() {});
          }
          setConnectingId(null);
        } else {
          toast(event.data.message || 'Connection failed', 'error');
          setConnectingId(null);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return function() { window.removeEventListener('message', handleMessage); };
  }, [connectingId, toast]);

  // OAuth connect
  var connectOAuth = async function(skillId) {
    setConnectingId(skillId);
    try {
      var result = await engineCall('/oauth/authorize/' + skillId);
      if (result.authUrl) {
        var w = 600; var ht = 700;
        var left = (window.screen.width - w) / 2;
        var top = (window.screen.height - ht) / 2;
        window.open(result.authUrl, 'oauth_popup', 'width=' + w + ',height=' + ht + ',left=' + left + ',top=' + top + ',scrollbars=yes,resizable=yes');
      } else {
        toast('No authorization URL returned', 'error');
        setConnectingId(null);
      }
    } catch (e) {
      toast(e.message || 'Failed to start OAuth flow', 'error');
      setConnectingId(null);
    }
  };

  // Disconnect
  var disconnectSkill = async function(skillId) {
    try {
      await engineCall('/oauth/disconnect/' + skillId, { method: 'DELETE' });
      toast('Disconnected', 'success');
      setStatuses(function(prev) {
        var u = Object.assign({}, prev);
        u[skillId] = { connected: false };
        return u;
      });
    } catch (e) { toast(e.message || 'Disconnect failed', 'error'); }
  };

  // Save token
  var saveToken = async function() {
    if (!tokenModal || !tokenValue) return;
    try {
      await engineCall('/oauth/authorize/' + tokenModal.skillId, {
        method: 'POST',
        body: JSON.stringify({ token: tokenValue })
      });
      toast('Token saved', 'success');
      setStatuses(function(prev) {
        var u = Object.assign({}, prev);
        u[tokenModal.skillId] = { connected: true };
        return u;
      });
      setTokenModal(null);
      setTokenValue('');
    } catch (e) { toast(e.message || 'Save failed', 'error'); }
  };

  // Enable/Disable
  var toggleSkill = async function(skillId, enable) {
    try {
      await engineCall('/community/skills/' + skillId + '/' + (enable ? 'enable' : 'disable'), {
        method: 'PUT',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Skill ' + (enable ? 'enabled' : 'disabled'), 'success');
      loadInstalled();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Uninstall
  var uninstallSkill = async function(skillId) {
    var ok = await window.__showConfirm({
      title: 'Uninstall Skill',
      message: 'Remove this skill? Any active connections will be lost.',
      danger: true, confirmText: 'Uninstall'
    });
    if (!ok) return;
    try {
      await engineCall('/community/skills/' + skillId + '/uninstall', {
        method: 'DELETE',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Skill uninstalled', 'success');
      loadInstalled();
    } catch (e) { toast(e.message || 'Uninstall failed', 'error'); }
  };

  // Open config
  var openConfig = function(skill) {
    setConfigSkill(skill);
    setConfigValues(skill.config || {});
  };

  // Save config
  var saveConfig = async function() {
    if (!configSkill) return;
    setConfigSaving(true);
    try {
      await engineCall('/community/skills/' + configSkill.skillId + '/config', {
        method: 'PUT',
        body: JSON.stringify(configValues)
      });
      toast('Configuration saved', 'success');
      setInstalled(function(prev) {
        return prev.map(function(s) {
          if (s.skillId === configSkill.skillId) return Object.assign({}, s, { config: Object.assign({}, configValues) });
          return s;
        });
      });
      setConfigSkill(null);
    } catch (e) { toast(e.message || 'Save failed', 'error'); }
    setConfigSaving(false);
  };

  // Computed
  var allSkills = Object.entries(skills).flatMap(function(entry) {
    return entry[1].map(function(s) { return Object.assign({}, s, { category: entry[0] }); });
  });
  var filtered = search ? allSkills.filter(function(s) {
    return s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase());
  }) : allSkills;

  var connectedCount = installed.filter(function(s) { var st = statuses[s.skillId]; return st && st.connected; }).length;

  // Status badge for installed skill
  var statusBadge = function(skill) {
    var st = statuses[skill.skillId] || {};
    if (st.connected) return h('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--success)' } }, 'Connected');
    return h('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--text-muted)' } }, 'Not Connected');
  };

  // ── Builtin Tab ──
  var renderBuiltin = function() {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('div', { style: { position: 'relative', flex: 1, maxWidth: 320 } },
          h('input', {
            className: 'input', style: { width: '100%', paddingLeft: 32 },
            value: search, onChange: function(e) { setSearch(e.target.value); },
            placeholder: 'Search builtin skills...'
          }),
          h('span', { style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' } }, I.search())
        )
      ),
      (search ? [['Results', filtered]] : Object.entries(skills)).map(function(entry) {
        var cat = entry[0]; var list = entry[1];
        return h('div', { key: cat, style: { marginBottom: 24 } },
          h('h3', { style: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 } }, cat.replace(/-/g, ' ')),
          h('div', { className: 'skill-grid' }, list.map(function(s) {
            return h('div', { key: s.id, className: 'skill-card' },
              h('div', { className: 'skill-cat' }, s.category || cat),
              h('div', { className: 'skill-name' }, s.name),
              h('div', { className: 'skill-desc' }, s.description),
              s.tools && h('div', { style: { marginTop: 6, fontSize: 11, color: 'var(--text-muted)' } }, s.tools.length + ' tools')
            );
          }))
        );
      })
    );
  };

  // ── Installed Tab ──
  var renderInstalled = function() {
    if (installedLoading) return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading installed skills...');

    if (installed.length === 0) return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } },
      h('div', { style: { marginBottom: 12 } }, I.marketplace()),
      h('p', { style: { fontSize: 15, fontWeight: 500, marginBottom: 8 } }, 'No community skills installed yet'),
      h('p', { style: { fontSize: 13, marginBottom: 16 } }, 'Install skills from the Community Marketplace to connect them with external services.'),
      h('button', { className: 'btn btn-primary', onClick: function() { setPage('community-skills'); } }, I.marketplace(), ' Browse Marketplace')
    );

    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 16 } },
        h('button', { className: 'btn btn-secondary', onClick: function() { setPage('community-skills'); } }, I.marketplace(), ' Browse Marketplace')
      ),
      h('div', { style: { display: 'grid', gap: 12 } },
        installed.map(function(skill) {
          var meta = skill.skill || skill.manifest || skill;
          var skillName = meta.name || skill.skillId;
          var skillDesc = meta.description || '';
          var st = statuses[skill.skillId] || {};
          var isConnecting = connectingId === skill.skillId;

          return h('div', { key: skill.skillId, className: 'card', style: { padding: 16 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                  h('span', { style: { fontWeight: 600, fontSize: 15 } }, skillName),
                  statusBadge(skill),
                  h('span', {
                    style: {
                      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                      fontSize: 11, fontWeight: 600, color: '#fff',
                      background: skill.enabled ? 'var(--success)' : 'var(--warning)'
                    }
                  }, skill.enabled ? 'Enabled' : 'Disabled')
                ),
                skillDesc && h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 } }, skillDesc),
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
                  'v' + skill.version + (meta.author ? ' by ' + meta.author : '') + ' \u00B7 Installed ' + new Date(skill.installedAt).toLocaleDateString()
                )
              ),
              st.connected && st.provider && h('div', {
                style: { padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', marginLeft: 12 }
              },
                h('div', null, 'Provider: ', h('strong', null, st.provider)),
                st.expiresAt && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Expires: ' + new Date(st.expiresAt).toLocaleDateString())
              )
            ),

            // Actions
            h('div', { style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } },
              st.connected
                ? h('button', { className: 'btn btn-danger btn-sm', onClick: function() { disconnectSkill(skill.skillId); } }, 'Disconnect')
                : h('button', {
                    className: 'btn btn-primary btn-sm',
                    disabled: isConnecting,
                    onClick: function() {
                      if (st.provider === null || st.provider === undefined) {
                        setTokenModal(skill);
                      } else {
                        connectOAuth(skill.skillId);
                      }
                    }
                  }, isConnecting ? 'Connecting...' : 'Connect'),
              h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { openConfig(skill); } }, I.settings(), ' Configure'),
              h('button', {
                className: 'btn btn-ghost btn-sm',
                onClick: function() { toggleSkill(skill.skillId, !skill.enabled); }
              }, skill.enabled ? 'Disable' : 'Enable'),
              h('button', {
                className: 'btn btn-ghost btn-sm',
                style: { color: 'var(--danger)' },
                onClick: function() { uninstallSkill(skill.skillId); }
              }, I.trash())
            )
          );
        })
      )
    );
  };

  return h(Fragment, null,
    // Header with stats
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Skills'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } },
          allSkills.length + ' builtin \u00B7 ' + installed.length + ' installed \u00B7 ' + connectedCount + ' connected'
        )
      ),
      h('button', { className: 'btn btn-secondary', onClick: function() { loadInstalled(); } }, I.refresh(), ' Refresh')
    ),

    // Tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [
        { id: 'builtin', label: 'Builtin Skills (' + allSkills.length + ')' },
        { id: 'installed', label: 'Installed (' + installed.length + ')' }
      ].map(function(t) {
        return h('button', {
          key: t.id,
          className: 'tab' + (tab === t.id ? ' active' : ''),
          onClick: function() { setTab(t.id); }
        }, t.label);
      })
    ),

    // Tab Content
    tab === 'builtin' && renderBuiltin(),
    tab === 'installed' && renderInstalled(),

    // Token Modal
    tokenModal && h(Modal, {
      title: 'Enter API Key / Token',
      onClose: function() { setTokenModal(null); setTokenValue(''); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setTokenModal(null); setTokenValue(''); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: saveToken, disabled: !tokenValue }, 'Save Token')
      )
    },
      h('div', null,
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 } },
          'Enter the API key or bot token for ', h('strong', null, tokenModal.skill?.name || tokenModal.skillId), '. You can find this in the service\'s developer console.'
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Token / API Key'),
          h('input', {
            className: 'input', style: { width: '100%' },
            type: 'password',
            placeholder: 'Paste token here...',
            value: tokenValue,
            onChange: function(e) { setTokenValue(e.target.value); }
          })
        )
      )
    ),

    // Config Modal
    configSkill && h(Modal, {
      title: 'Configure ' + (configSkill.skill?.name || configSkill.manifest?.name || configSkill.skillId),
      onClose: function() { setConfigSkill(null); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setConfigSkill(null); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: saveConfig, disabled: configSaving }, configSaving ? 'Saving...' : 'Save Configuration')
      )
    },
      h('div', null,
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 } },
          'Configure settings for this skill. Changes take effect immediately.'
        ),
        Object.keys(configValues).length > 0
          ? Object.entries(configValues).map(function(entry) {
              return h('div', { className: 'form-group', key: entry[0] },
                h('label', { className: 'form-label' }, entry[0]),
                h('input', {
                  className: 'input', style: { width: '100%' },
                  value: entry[1] || '',
                  onChange: function(e) {
                    setConfigValues(function(prev) {
                      var u = Object.assign({}, prev);
                      u[entry[0]] = e.target.value;
                      return u;
                    });
                  }
                })
              );
            })
          : h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'No configuration options available for this skill.')
      )
    )
  );
}

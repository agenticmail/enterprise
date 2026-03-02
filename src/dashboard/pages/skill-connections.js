import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

// Auth help: where to get API keys/tokens for each skill
var AUTH_HELP = {
  'intercom-support': { provider: 'Intercom', url: 'https://developers.intercom.com/docs/build-an-integration/getting-started/', steps: 'Create an Intercom app at developers.intercom.com, then copy the Access Token from Authentication.' },
  'zendesk-tickets': { provider: 'Zendesk', url: 'https://support.zendesk.com/hc/en-us/articles/4408889192858', steps: 'Go to Zendesk Admin > Apps & Integrations > APIs > Zendesk API, then generate an API token.' },
  'github-issues': { provider: 'GitHub', url: 'https://github.com/settings/tokens', steps: 'Go to GitHub Settings > Developer Settings > Personal Access Tokens > Generate new token. Select repo and issues scopes.' },
  'github-actions': { provider: 'GitHub', url: 'https://github.com/settings/tokens', steps: 'Generate a Personal Access Token with workflow and actions:read scopes.' },
  'slack-notifications': { provider: 'Slack', url: 'https://api.slack.com/apps', steps: 'Create a Slack app at api.slack.com/apps, install to workspace, copy the Bot User OAuth Token (xoxb-...).' },
  'jira-integration': { provider: 'Atlassian', url: 'https://id.atlassian.com/manage-profile/security/api-tokens', steps: 'Go to Atlassian account > Security > API tokens > Create API token. Use with your email as username.' },
  'stripe-billing': { provider: 'Stripe', url: 'https://dashboard.stripe.com/apikeys', steps: 'Go to Stripe Dashboard > Developers > API keys. Copy the Secret key (sk_live_... or sk_test_...).' },
  'notion-sync': { provider: 'Notion', url: 'https://www.notion.so/my-integrations', steps: 'Create an integration at notion.so/my-integrations. Copy the Internal Integration Secret. Share pages with the integration.' },
  'salesforce-crm': { provider: 'Salesforce', url: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm', steps: 'Create a Connected App in Salesforce Setup. Use OAuth 2.0 client credentials flow. Copy Consumer Key and Secret.' },
  'hubspot-crm': { provider: 'HubSpot', url: 'https://developers.hubspot.com/docs/api/private-apps', steps: 'Go to HubSpot Settings > Integrations > Private Apps > Create. Select required scopes and copy the access token.' },
  'twilio-sms': { provider: 'Twilio', url: 'https://console.twilio.com/', steps: 'Sign up at twilio.com. Copy Account SID and Auth Token from the Console dashboard. Get a phone number for SMS.' },
  'sendgrid-email': { provider: 'SendGrid', url: 'https://app.sendgrid.com/settings/api_keys', steps: 'Go to SendGrid Settings > API Keys > Create API Key. Select Full Access or restricted permissions.' },
  'google-workspace': { provider: 'Google', url: 'https://console.cloud.google.com/apis/credentials', steps: 'Create a project in Google Cloud Console. Enable required APIs. Create OAuth 2.0 credentials or a Service Account key.' },
  'shopify-store': { provider: 'Shopify', url: 'https://partners.shopify.com/', steps: 'Create a custom app in your Shopify admin > Settings > Apps. Copy the Admin API access token.' },
  'openai-models': { provider: 'OpenAI', url: 'https://platform.openai.com/api-keys', steps: 'Go to platform.openai.com > API Keys > Create new secret key. Copy it immediately — it won\'t be shown again.' },
  'anthropic-models': { provider: 'Anthropic', url: 'https://console.anthropic.com/settings/keys', steps: 'Go to console.anthropic.com > Settings > API Keys > Create Key.' },
};

function getAuthHelp(skillId) {
  if (AUTH_HELP[skillId]) return AUTH_HELP[skillId];
  // Fallback: check if skill manifest has authHelp
  return null;
}

export function SkillConnectionsPage() {
  const { toast } = useApp();
  const [installed, setInstalled] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Config modal state
  const [configSkill, setConfigSkill] = useState(null);
  const [configSchema, setConfigSchema] = useState(null);
  const [configValues, setConfigValues] = useState({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // OAuth popup ref
  const [connectingSkillId, setConnectingSkillId] = useState(null);

  const loadStatuses = useCallback(function(skills) {
    var promises = skills.map(function(skill) {
      return engineCall('/oauth/status/' + skill.skillId)
        .then(function(d) { return { skillId: skill.skillId, status: d }; })
        .catch(function() { return { skillId: skill.skillId, status: { connected: false, provider: null, expiresAt: null } }; });
    });
    Promise.all(promises).then(function(results) {
      var map = {};
      results.forEach(function(r) { map[r.skillId] = r.status; });
      setStatuses(map);
    });
  }, []);

  const load = useCallback(function() {
    setLoading(true);
    setError(null);

    engineCall('/community/installed')
      .then(function(d) {
        var skills = d.installed || [];
        setInstalled(skills);
        loadStatuses(skills);
      })
      .catch(function(e) { setError(e.message || 'Failed to load installed skills'); })
      .finally(function() { setLoading(false); });

    engineCall('/oauth/providers')
      .then(function(d) { setProviders(d.providers || []); })
      .catch(function() {});
  }, [loadStatuses]);

  useEffect(function() { load(); }, [load]);

  // Listen for OAuth popup messages
  useEffect(function() {
    function handleMessage(event) {
      if (event.data && event.data.type === 'oauth-result') {
        if (event.data.status === 'success') {
          toast('OAuth connected successfully', 'success');
          // Refresh status for the skill that was being connected
          if (connectingSkillId) {
            engineCall('/oauth/status/' + connectingSkillId)
              .then(function(d) {
                setStatuses(function(prev) {
                  var updated = Object.assign({}, prev);
                  updated[connectingSkillId] = d;
                  return updated;
                });
              })
              .catch(function() {});
          }
          setConnectingSkillId(null);
        } else {
          toast(event.data.message || 'OAuth connection failed', 'error');
          setConnectingSkillId(null);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return function() { window.removeEventListener('message', handleMessage); };
  }, [connectingSkillId, toast]);

  // Connect OAuth
  var connectOAuth = async function(skillId) {
    setConnectingSkillId(skillId);
    try {
      var result = await engineCall('/oauth/authorize/' + skillId);
      if (result.authUrl) {
        var w = 600;
        var ht = 700;
        var left = (window.screen.width - w) / 2;
        var top = (window.screen.height - ht) / 2;
        window.open(
          result.authUrl,
          'oauth_popup',
          'width=' + w + ',height=' + ht + ',left=' + left + ',top=' + top + ',scrollbars=yes,resizable=yes'
        );
      } else {
        toast('No authorization URL returned', 'error');
        setConnectingSkillId(null);
      }
    } catch (e) {
      toast(e.message || 'Failed to start OAuth flow', 'error');
      setConnectingSkillId(null);
    }
  };

  // Disconnect OAuth
  var disconnectOAuth = async function(skillId) {
    try {
      await engineCall('/oauth/disconnect/' + skillId, { method: 'DELETE' });
      toast('Disconnected successfully', 'success');
      setStatuses(function(prev) {
        var updated = Object.assign({}, prev);
        updated[skillId] = { connected: false, provider: null, expiresAt: null };
        return updated;
      });
    } catch (e) {
      toast(e.message || 'Disconnect failed', 'error');
    }
  };

  // Open config modal
  var openConfig = async function(skill) {
    setConfigSkill(skill);
    setConfigLoading(true);
    setConfigSchema(null);
    setConfigValues(skill.config || {});

    try {
      var d = await engineCall('/community/skills/' + skill.skillId + '/config-schema');
      setConfigSchema(d.configSchema || {});
    } catch (e) {
      toast(e.message || 'Failed to load config schema', 'error');
      setConfigSchema({});
    }
    setConfigLoading(false);
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
      // Update local installed list with new config
      setInstalled(function(prev) {
        return prev.map(function(s) {
          if (s.skillId === configSkill.skillId) {
            return Object.assign({}, s, { config: Object.assign({}, configValues) });
          }
          return s;
        });
      });
      setConfigSkill(null);
    } catch (e) {
      toast(e.message || 'Failed to save configuration', 'error');
    }
    setConfigSaving(false);
  };

  // Helpers
  var providerMap = {};
  providers.forEach(function(p) { providerMap[p.id] = p; });

  var getSkillStatus = function(skillId) {
    return statuses[skillId] || { connected: false, provider: null, expiresAt: null };
  };

  var hasOAuthProvider = function(skill) {
    var status = getSkillStatus(skill.skillId);
    return !!status.provider || providers.some(function(p) { return p.id === skill.skillId; });
  };

  var hasConfigFields = function(skill) {
    return skill.config && typeof skill.config === 'object' && Object.keys(skill.config).length > 0;
  };

  var needsConfig = function(skill) {
    var status = getSkillStatus(skill.skillId);
    return !status.connected && hasConfigFields(skill);
  };

  // Computed stats
  var totalInstalled = installed.length;
  var connectedCount = installed.filter(function(s) { return getSkillStatus(s.skillId).connected; }).length;
  var needsConfigCount = installed.filter(function(s) { return needsConfig(s); }).length;

  // Status badge
  var statusBadge = function(skill) {
    var status = getSkillStatus(skill.skillId);
    if (status.connected) {
      return h('span', {
        className: 'badge',
        style: { background: 'var(--success)', color: '#fff', fontSize: 11 }
      }, 'Connected');
    }
    if (needsConfig(skill)) {
      return h('span', {
        className: 'badge',
        style: { background: 'var(--warning)', color: '#fff', fontSize: 11 }
      }, 'Needs Config');
    }
    return h('span', {
      className: 'badge',
      style: { background: 'var(--text-muted)', color: '#fff', fontSize: 11 }
    }, 'Not Connected');
  };

  // Render config form field
  var renderConfigField = function(fieldName, schema) {
    var value = configValues[fieldName];
    var type = schema.type || 'string';

    if (type === 'boolean') {
      return h('div', { className: 'form-group', key: fieldName },
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: !!value,
            onChange: function(e) {
              setConfigValues(function(prev) {
                var updated = Object.assign({}, prev);
                updated[fieldName] = e.target.checked;
                return updated;
              });
            }
          }),
          h('span', { className: 'form-label', style: { marginBottom: 0 } }, schema.label || fieldName)
        ),
        schema.description && h('p', { className: 'form-help' }, schema.description)
      );
    }

    if (type === 'select') {
      return h('div', { className: 'form-group', key: fieldName },
        h('label', { className: 'form-label' },
          schema.label || fieldName,
          schema.required && h('span', { style: { color: 'var(--danger)', marginLeft: 4 } }, '*')
        ),
        h('select', {
          className: 'input',
          value: value || schema.default || '',
          onChange: function(e) {
            setConfigValues(function(prev) {
              var updated = Object.assign({}, prev);
              updated[fieldName] = e.target.value;
              return updated;
            });
          }
        },
          h('option', { value: '' }, '-- Select --'),
          (schema.options || []).map(function(opt) {
            var optValue = typeof opt === 'string' ? opt : opt.value;
            var optLabel = typeof opt === 'string' ? opt : opt.label;
            return h('option', { key: optValue, value: optValue }, optLabel);
          })
        ),
        schema.description && h('p', { className: 'form-help' }, schema.description)
      );
    }

    // Default: string or secret
    return h('div', { className: 'form-group', key: fieldName },
      h('label', { className: 'form-label' },
        schema.label || fieldName,
        schema.required && h('span', { style: { color: 'var(--danger)', marginLeft: 4 } }, '*')
      ),
      h('input', {
        className: 'input',
        type: type === 'secret' ? 'password' : 'text',
        value: value || '',
        placeholder: schema.placeholder || schema.default || '',
        onChange: function(e) {
          setConfigValues(function(prev) {
            var updated = Object.assign({}, prev);
            updated[fieldName] = e.target.value;
            return updated;
          });
        }
      }),
      schema.description && h('p', { className: 'form-help' }, schema.description)
    );
  };

  // Loading state
  if (loading) {
    return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading skill connections...');
  }

  // Error state
  if (error) {
    return h(Fragment, null,
      h('div', { style: { marginBottom: 20 } },
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Skill Connections'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Connect external services and configure skill settings')
      ),
      h('div', { style: { textAlign: 'center', padding: 60 } },
        h('p', { style: { color: 'var(--danger)', marginBottom: 12 } }, error),
        h('button', { className: 'btn btn-primary', onClick: load }, I.refresh(), ' Retry')
      )
    );
  }

  return h(Fragment, null,
    // Page Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Skill Connections'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Connect external services and configure skill settings')
      ),
      h('button', { className: 'btn btn-secondary', onClick: load }, I.refresh(), ' Refresh')
    ),

    // Stats Bar
    h('div', { className: 'stat-grid', style: { marginBottom: 20 } },
      h('div', { className: 'stat-card' },
        h('div', { className: 'stat-label' }, 'Total Installed'),
        h('div', { className: 'stat-value' }, totalInstalled)
      ),
      h('div', { className: 'stat-card' },
        h('div', { className: 'stat-label' }, 'Connected'),
        h('div', { className: 'stat-value', style: { color: 'var(--success)' } }, connectedCount)
      ),
      h('div', { className: 'stat-card' },
        h('div', { className: 'stat-label' }, 'Needs Configuration'),
        h('div', { className: 'stat-value', style: { color: needsConfigCount > 0 ? 'var(--warning)' : 'var(--text-muted)' } }, needsConfigCount)
      )
    ),

    // Empty state
    installed.length === 0 && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } },
      h('div', { style: { fontSize: 48, marginBottom: 16 } }, '\uD83D\uDD17'),
      h('p', { style: { fontSize: 15, fontWeight: 500, marginBottom: 8 } }, 'No community skills installed'),
      h('p', { style: { fontSize: 13 } }, 'Install skills from the Community Marketplace to manage their connections here.')
    ),

    // Skill Cards Grid
    installed.length > 0 && h('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }
    },
      installed.map(function(skill) {
        var status = getSkillStatus(skill.skillId);
        var meta = skill.skill || skill.manifest || skill;
        var skillName = meta.name || skill.skillId;
        var skillDesc = meta.description || '';
        var isConnecting = connectingSkillId === skill.skillId;

        return h('div', { key: skill.skillId, className: 'card', style: { padding: 20 } },
          // Card header: name + status badge
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontWeight: 600, fontSize: 15, marginBottom: 4 } }, skillName),
              skillDesc && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 } }, skillDesc)
            ),
            h('div', { style: { marginLeft: 12, flexShrink: 0 } }, statusBadge(skill))
          ),

          // Connection info
          status.connected && status.provider && h('div', {
            style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 6 }
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('span', null, 'Provider: ', h('strong', null, status.provider)),
              status.expiresAt && h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } },
                'Expires: ' + new Date(status.expiresAt).toLocaleDateString()
              )
            )
          ),

          // Auth help info (show when not connected)
          !status.connected && (function() {
            var help = getAuthHelp(skill.skillId) || (meta.authHelp ? meta.authHelp : null);
            if (!help) return null;
            return h('div', {
              style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border)' }
            },
              h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', color: 'var(--primary)' } }, 'How to connect'),
              h('div', { style: { lineHeight: 1.5, marginBottom: 6 } }, help.steps || help.description),
              help.url && h('a', { href: help.url, target: '_blank', rel: 'noopener', style: { color: 'var(--primary)', fontSize: 12, textDecoration: 'none' } }, 'Get credentials at ' + (help.provider || 'provider') + ' \u2192')
            );
          })(),

          // Action buttons
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' } },
            // Connect / Disconnect
            status.connected
              ? h('button', {
                  className: 'btn btn-danger btn-sm',
                  onClick: function() { disconnectOAuth(skill.skillId); }
                }, 'Disconnect')
              : hasOAuthProvider(skill) && h('button', {
                  className: 'btn btn-primary btn-sm',
                  disabled: isConnecting,
                  onClick: function() { connectOAuth(skill.skillId); }
                }, isConnecting ? 'Connecting...' : 'Connect'),

            // Configure button (always available if skill has config potential)
            h('button', {
              className: 'btn btn-secondary btn-sm',
              onClick: function() { openConfig(skill); }
            }, I.settings(), ' Configure')
          )
        );
      })
    ),

    // Config Modal
    configSkill && h(Modal, {
      title: 'Configure ' + (configSkill.skill?.name || configSkill.manifest?.name || configSkill.skillId),
      onClose: function() { setConfigSkill(null); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setConfigSkill(null); } }, 'Cancel'),
        h('button', {
          className: 'btn btn-primary',
          onClick: saveConfig,
          disabled: configSaving || configLoading
        }, configSaving ? 'Saving...' : 'Save Configuration')
      )
    },
      configLoading
        ? h('div', { style: { textAlign: 'center', padding: 24, color: 'var(--text-muted)' } }, 'Loading configuration schema...')
        : configSchema && Object.keys(configSchema).length > 0
          ? h('div', null,
              // Show auth help in modal too
              (function() {
                var help = getAuthHelp(configSkill.skillId) || (configSkill.skill?.authHelp || configSkill.manifest?.authHelp);
                if (!help) return null;
                return h('div', {
                  style: { marginBottom: 16, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }
                },
                  h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 12, color: 'var(--primary)' } }, 'Where to get credentials'),
                  h('div', { style: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: 6 } }, help.steps || help.description),
                  help.url && h('a', { href: help.url, target: '_blank', rel: 'noopener', style: { color: 'var(--primary)', fontSize: 13 } }, 'Open ' + (help.provider || 'provider') + ' developer portal \u2192')
                );
              })(),
              h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 } },
                'Configure the settings for this skill. Fields marked with * are required.'
              ),
              Object.entries(configSchema).map(function(entry) {
                return renderConfigField(entry[0], entry[1]);
              })
            )
          : h('div', null,
              h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 } },
                'This skill accepts custom configuration. Enter key-value pairs below.'
              ),
              // Fallback: show existing config as editable key-value pairs
              Object.entries(configValues).map(function(entry) {
                return h('div', { className: 'form-group', key: entry[0] },
                  h('label', { className: 'form-label' }, entry[0]),
                  h('input', {
                    className: 'input',
                    value: entry[1] || '',
                    onChange: function(e) {
                      setConfigValues(function(prev) {
                        var updated = Object.assign({}, prev);
                        updated[entry[0]] = e.target.value;
                        return updated;
                      });
                    }
                  })
                );
              }),
              Object.keys(configValues).length === 0 && h('div', {
                style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' }
              }, 'No configuration schema available for this skill.')
            )
    )
  );
}

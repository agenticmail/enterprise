import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { Modal } from '../components/modal.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';
import { useOrgContext } from '../components/org-switcher.js';
import { LANGUAGES, getLanguageName, LanguageSelect, ROLE_TAGS, TagPicker } from '../components/persona-fields.js';

var engineCall = function(path, opts) { return apiCall('/engine' + path, opts); };

// ─── Personality Parsing Helpers (mirrors agents.js wizard) ─────

var parseSections = function(text) {
  if (!text) return {};
  var sections = {};
  var parts = text.split(/^## /m);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (!part.trim()) continue;
    var nl = part.indexOf('\n');
    if (nl === -1) continue;
    sections[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
  }
  return sections;
};

var rewriteForUser = function(text) {
  if (!text) return '';
  return text
    .replace(/(^|[.!?]\s+)You are /g, '$1This agent is ')
    .replace(/(^|[.!?]\s+)You do not /g, '$1This agent does not ')
    .replace(/(^|[.!?]\s+)You don't /g, "$1This agent won't ")
    .replace(/(^|[.!?]\s+)You never /g, '$1This agent never ')
    .replace(/(^|[.!?]\s+)You always /g, '$1This agent always ')
    .replace(/(^|[.!?]\s+)You can /g, '$1This agent can ')
    .replace(/(^|[.!?]\s+)You will /g, '$1This agent will ')
    .replace(/(^|[.!?]\s+)You have /g, '$1This agent has ')
    .replace(/(^|[.!?]\s+)You treat /g, '$1This agent treats ')
    .replace(/(^|[.!?]\s+)You use /g, '$1This agent uses ')
    .replace(/(^|[.!?]\s+)You apply /g, '$1This agent applies ')
    .replace(/(^|[.!?]\s+)You rely /g, '$1This agent relies ')
    .replace(/(^|[.!?]\s+)You prioritize /g, '$1This agent prioritizes ')
    .replace(/(^|[.!?]\s+)You write /g, '$1This agent writes ')
    .replace(/(^|[.!?]\s+)You keep /g, '$1This agent keeps ')
    .replace(/(^|[.!?]\s+)You work /g, '$1This agent works ')
    .replace(/(^|[.!?]\s+)You gather /g, '$1This agent gathers ')
    .replace(/(^|[.!?]\s+)You begin /g, '$1This agent begins ')
    .replace(/(^|[.!?]\s+)You maintain /g, '$1This agent maintains ')
    .replace(/(^|[.!?]\s+)You watch /g, '$1This agent watches ')
    .replace(/(^|[.!?]\s+)You guard /g, '$1This agent guards ')
    .replace(/(^|[.!?]\s+)You distinguish /g, '$1This agent distinguishes ')
    .replace(/(^|[.!?]\s+)You open /g, '$1This agent opens ')
    .replace(/(^|[.!?]\s+)You structure /g, '$1This agent structures ')
    .replace(/(^|[.!?]\s+)You communicate /g, '$1This agent communicates ')
    .replace(/(^|[.!?]\s+)You triage /g, '$1This agent triages ')
    .replace(/(^|[.!?]\s+)You (\w)/g, function(m, pre, c) { return pre + 'This agent ' + c.toLowerCase(); })
    .replace(/ you /g, ' this agent ')
    .replace(/ your /g, " this agent's ")
    .replace(/ Your /g, " This agent's ")
    .replace(/(^|[.!?]\s+)Your /g, "$1This agent's ");
};

var firstSentences = function(text, n) {
  if (!text) return '';
  var rewritten = rewriteForUser(text);
  var sentences = rewritten.match(/[^.!?]+[.!?]+/g) || [rewritten];
  return sentences.slice(0, n).join(' ').trim();
};

var extractItems = function(text) {
  if (!text) return [];
  var bullets = text.split('\n').filter(function(l) { return l.trim().indexOf('- ') === 0; }).map(function(l) { return rewriteForUser(l.trim().slice(2).trim()); });
  if (bullets.length > 0) return bullets;
  if (text.indexOf(',') >= 0) return text.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  return [rewriteForUser(text)];
};

// ─── Categories (mirrors soul-templates.json) ─────

var CATEGORIES = {
  support: { name: 'Support', icon: 'headset' },
  sales: { name: 'Sales', icon: 'handshake' },
  engineering: { name: 'Engineering', icon: 'code' },
  operations: { name: 'Operations', icon: 'settings' },
  hr: { name: 'Human Resources', icon: 'people' },
  finance: { name: 'Finance', icon: 'account-balance' },
  marketing: { name: 'Marketing', icon: 'campaign' },
  legal: { name: 'Legal', icon: 'gavel' },
  research: { name: 'Research', icon: 'search' },
  creative: { name: 'Creative', icon: 'palette' },
  executive: { name: 'Executive', icon: 'star' },
  data: { name: 'Data', icon: 'bar-chart' },
  security: { name: 'Security', icon: 'shield' },
  education: { name: 'Education', icon: 'school' },
};

var TONES = [
  { value: 'formal', label: 'Formal & Structured' },
  { value: 'casual', label: 'Casual & Conversational' },
  { value: 'professional', label: 'Professional & Clear' },
  { value: 'friendly', label: 'Friendly & Warm' },
];

var ROLE_BUILDER_PROMPT = 'I need you to help me create an AI agent role template. This template defines the personality, expertise, and behavior of an AI agent.\n\nPlease ask me the following questions one at a time, then generate the complete template at the end:\n\n1. **What is this agent\'s job title/role?** (e.g., Customer Support Specialist, Sales Engineer, Legal Advisor)\n2. **What department/category does it belong to?** (support, sales, engineering, marketing, operations, finance, hr, legal, product, data, security, executive, creative, other)\n3. **What is the agent\'s primary responsibility?** (1-2 sentences)\n4. **What tone should it use?** (professional, friendly, technical, casual, formal)\n5. **What language(s) should it speak?**\n6. **What are its key areas of expertise?** (list 3-5)\n7. **What tools/integrations might it need?** (e.g., email, calendar, CRM, database, web search)\n8. **Any specific personality traits or communication style notes?**\n\nAfter gathering my answers, generate the template in this EXACT format (I will copy-paste it into a dashboard):\n\n---\n**Name:** [Role Name]\n**Category:** [one of: support, sales, engineering, marketing, operations, finance, hr, legal, product, data, security, executive, creative, other]\n**Description:** [1-2 sentence summary]\n**Job Title:** [formal title]\n**Tone:** [professional/friendly/technical/casual/formal]\n**Language:** [e.g., English]\n**Tags:** [comma-separated keywords]\n\n**Personality (SOUL.md):**\n```\n## Identity\n[Who this agent is — role, expertise, background]\n\n## Approach\n[How it works — methodology, priorities, style]\n\n## Expertise\n[Specific knowledge areas and capabilities]\n\n## Communication Style\n[How it talks — tone, format preferences, do\'s and don\'ts]\n\n## Boundaries\n[What it won\'t do, escalation rules, limitations]\n```\n\n**Suggested Skills:** [comma-separated skill IDs like: email, calendar, web-search, github]\n**Permission Preset:** [one of: restrictive, standard, permissive, full-access]\n---\n\nLet\'s start! What is this agent\'s job title/role?';

// ─── Role Form Modal ───────────────────────────────

function RoleFormModal({ role, allSkills, skillsLoaded, orgId, onSave, onClose }) {
  var isEdit = !!role;
  var [form, setForm] = useState({
    name: role ? role.name : '',
    category: role ? role.category : 'operations',
    description: role ? role.description || '' : '',
    personality: role ? role.personality || '' : '',
    identity: role ? (role.identity || {}) : { role: '', tone: 'professional', language: 'en' },
    suggestedSkills: role ? (role.suggestedSkills || []) : [],
    suggestedPreset: role ? role.suggestedPreset || '' : '',
    tags: role ? (role.tags || []) : [],
    orgId: role ? role.orgId || orgId || '' : orgId || '',
    isActive: role ? role.isActive !== false : true,
  });
  var [tab, setTab] = useState('general');
  var [saving, setSaving] = useState(false);
  var [orgs, setOrgs] = useState([]);
    useEffect(function() {
    apiCall('/organizations').then(function(d) { setOrgs(d.organizations || []); }).catch(function() {});
  }, []);

  var set = function(key, val) { setForm(function(f) { return Object.assign({}, f, { [key]: val }); }); };
  var setIdentity = function(key, val) { setForm(function(f) { return Object.assign({}, f, { identity: Object.assign({}, f.identity, { [key]: val }) }); }); };

  var toggleSkill = function(skill) {
    setForm(function(f) {
      var arr = (f.suggestedSkills || []).slice();
      var idx = arr.indexOf(skill);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(skill);
      return Object.assign({}, f, { suggestedSkills: arr });
    });
  };

  // Tags managed by TagPicker component

  var doSave = async function() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(Object.assign({}, form, { orgId: form.orgId || null }));
    } catch(e) { /* parent handles */ }
    setSaving(false);
  };

  var slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  var tabBtns = [
    { id: 'general', label: 'General' },
    { id: 'personality', label: 'Personality' },
    { id: 'skills', label: 'Skills & Preset' },
    { id: 'preview', label: 'Preview' },
  ];

  // ─── Full Resume Preview (matches Create Agent wizard exactly) ─────
  var ps = parseSections(form.personality || '');
  var expertiseItems = extractItems(ps['Expertise'] || '');
  var principleItems = extractItems(ps['Principles'] || '');
  var boundaryItems = extractItems(ps['Boundaries'] || '');
  var skills = form.suggestedSkills || [];

  var sectionHead = function(title) {
    return h('div', { style: { marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' } },
      h('span', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' } }, title)
    );
  };
  var prose = function(text, n) {
    return h('p', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 } }, firstSentences(text, n));
  };

  var previewResume = h('div', { style: { border: '2px solid var(--accent)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-primary)' } },
    // ── Header ──
    h('div', { style: { padding: '16px 20px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'flex-start', gap: 14 } },
      h('div', { style: { width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 } },
        (form.name || '?').charAt(0)
      ),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontWeight: 800, fontSize: 16 } }, form.name || 'Untitled Role'),
        h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 } }, form.description || 'No description'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 } },
          h('span', { className: 'badge badge-primary' }, form.identity.role || form.name || 'Role'),
          h('span', { className: 'badge badge-neutral' }, (TONES.find(function(t) { return t.value === form.identity.tone; }) || {}).label || 'Professional'),
          h('span', { className: 'badge badge-neutral' }, 'Language: ' + getLanguageName(form.identity.language || 'en-us')),
          form.suggestedPreset && h('span', { className: 'badge badge-info' }, 'Preset: ' + form.suggestedPreset),
          form.orgId && h('span', { style: { padding: '2px 8px', borderRadius: 10, fontSize: 10, background: 'var(--info-soft)', color: 'var(--info)', display: 'inline-flex', alignItems: 'center', gap: 4 } }, I.building(), ' Org-scoped')
        )
      )
    ),

    // ── Resume Body ──
    h('div', { style: { padding: '16px 20px 20px' } },
      // What this agent does
      ps['Identity'] && h('div', { style: { marginBottom: 18 } },
        sectionHead('What this agent does'),
        prose(ps['Identity'], 3)
      ),

      // How it works
      ps['Approach'] && h('div', { style: { marginBottom: 18 } },
        sectionHead('How it works'),
        prose(ps['Approach'], 3)
      ),

      // Two-column: Thinking + Decision making
      (ps['Mental Models'] || ps['Decision Framework']) && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 } },
        ps['Mental Models'] && h('div', null,
          sectionHead('How it thinks'),
          prose(ps['Mental Models'], 3)
        ),
        ps['Decision Framework'] && h('div', null,
          sectionHead('How it prioritizes'),
          prose(ps['Decision Framework'], 3)
        )
      ),

      // Communication style
      ps['Communication Style'] && h('div', { style: { marginBottom: 18 } },
        sectionHead('How it communicates'),
        prose(ps['Communication Style'], 3)
      ),

      // Expertise — pill tags
      expertiseItems.length > 0 && h('div', { style: { marginBottom: 18 } },
        sectionHead('Areas of expertise'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          expertiseItems.map(function(item, i) {
            return h('span', { key: i, style: { padding: '4px 12px', fontSize: 12, background: 'var(--bg-tertiary)', borderRadius: 20, color: 'var(--text-primary)', border: '1px solid var(--border)' } }, item);
          })
        )
      ),

      // Skills auto-enabled
      skills.length > 0 && h('div', { style: { marginBottom: 18 } },
        sectionHead('Tools this agent will use (' + skills.length + ')'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          skills.map(function(s) {
            return h('span', { key: s, style: { padding: '4px 12px', fontSize: 12, background: 'var(--accent-soft)', borderRadius: 20, color: 'var(--accent)', border: '1px solid var(--accent)', fontWeight: 500 } }, s.replace(/-/g, ' '));
          })
        )
      ),

      // Core principles
      principleItems.length > 0 && h('div', { style: { marginBottom: 18 } },
        sectionHead('Operating principles'),
        h('ol', { style: { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } },
          principleItems.slice(0, 6).map(function(p, i) { return h('li', { key: i, style: { marginBottom: 2 } }, p); })
        )
      ),

      // Limitations
      boundaryItems.length > 0 && h('div', { style: { padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' } },
        sectionHead('Limitations'),
        h('ul', { style: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } },
          boundaryItems.map(function(b, i) { return h('li', { key: i, style: { marginBottom: 2 } }, b); })
        )
      ),

      // Fallback: if no sections parsed, show raw text
      !ps['Identity'] && !ps['Approach'] && form.personality && h('div', null,
        sectionHead('Personality'),
        h('p', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' } }, rewriteForUser(form.personality.substring(0, 1500)))
      ),

      // Empty state
      !form.personality && h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } },
        'Write a personality in the Personality tab to see the full preview here.'
      )
    )
  );

  return h(Modal, {
    title: (isEdit ? 'Edit Role' : 'Create Role') + (form.name ? ' — ' + form.name : ''),
    onClose: onClose,
    width: 1100,
    footer: h(Fragment, null,
      h('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
      h('button', { className: 'btn btn-primary', onClick: doSave, disabled: saving || !form.name.trim() }, saving ? 'Saving...' : (isEdit ? 'Update Role' : 'Create Role'))
    )
  },
    // Tab bar
    h('div', { style: { display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--border)' } },
      tabBtns.map(function(t) {
        return h('button', {
          key: t.id, className: 'btn btn-ghost btn-sm',
          style: { borderRadius: '6px 6px 0 0', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab === t.id ? 600 : 400 },
          onClick: function() { setTab(t.id); }
        }, t.label);
      })
    ),

    // ─── General ──────────────────────────────────────
    tab === 'general' && h('div', null,
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Role Name *'),
          h('input', { className: 'input', value: form.name, onChange: function(e) { set('name', e.target.value); if (!form.identity.role) setIdentity('role', e.target.value); }, placeholder: 'e.g., Customer Support Lead', autoFocus: true }),
          slug && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'ID: ', h('code', null, slug))
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Category *'),
          h('select', { className: 'input', value: form.category, onChange: function(e) { set('category', e.target.value); } },
            Object.keys(CATEGORIES).map(function(k) { return h('option', { key: k, value: k }, CATEGORIES[k].name); })
          )
        )
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Description'),
        h('textarea', { className: 'input', value: form.description, rows: 2, onChange: function(e) { set('description', e.target.value); }, placeholder: 'Brief description of what this agent role does...' })
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Job Title'),
          h('input', { className: 'input', value: (form.identity || {}).role || '', onChange: function(e) { setIdentity('role', e.target.value); }, placeholder: 'e.g., Support Lead' })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Tone'),
          h('select', { className: 'input', value: (form.identity || {}).tone || 'professional', onChange: function(e) { setIdentity('tone', e.target.value); } },
            TONES.map(function(t) { return h('option', { key: t.value, value: t.value }, t.label); })
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Language'),
          h(LanguageSelect, { value: (form.identity || {}).language || 'en-us', onChange: function(e) { setIdentity('language', e.target.value); } })
        )
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Organization Scope'),
        h('select', { className: 'input', value: form.orgId || '', onChange: function(e) { set('orgId', e.target.value); } },
          h('option', { value: '' }, 'Global (available to all organizations)'),
          orgs.filter(function(o) { return o.is_active !== false; }).map(function(o) {
            return h('option', { key: o.id, value: o.id }, o.name);
          })
        ),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, form.orgId ? 'Only users in this organization see this role in the Create Agent wizard' : 'This role appears for all users in the Create Agent wizard')
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Tags'),
        h(TagPicker, { value: form.tags || [], onChange: function(newTags) { set('tags', newTags); } })
      )
    ),

    // ─── Personality ──────────────────────────────────
    tab === 'personality' && h('div', null,
      h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 } }, 'The personality is a comprehensive SOUL.md prompt that defines who this agent is — their approach, communication style, expertise, decision framework, principles, and boundaries. This is the core of the role template.'),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Personality / SOUL.md *'),
        h('textarea', {
          className: 'input', value: form.personality, rows: 20,
          onChange: function(e) { set('personality', e.target.value); },
          placeholder: '# Role Name\n\n## Identity\nYou are the...\n\n## Approach\nYou...\n\n## Communication Style\n...\n\n## Expertise\n...\n\n## Principles\n- ...\n\n## Boundaries\n- ...',
          style: { fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, minHeight: 400 }
        })
      ),
      h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
        form.personality.length + ' characters',
        form.personality.length < 200 && form.personality.length > 0 && ' — aim for at least 500 characters for a well-defined role'
      )
    ),

    // ─── Skills & Preset ──────────────────────────────
    tab === 'skills' && h('div', null,
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Suggested Permission Preset'),
        h('input', { className: 'input', value: form.suggestedPreset, onChange: function(e) { set('suggestedPreset', e.target.value); }, placeholder: 'e.g., Customer Support Agent' }),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Auto-applied permission preset when this role is selected in the Create Agent wizard')
      ),
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Suggested Skills (' + (form.suggestedSkills || []).length + ' selected)'),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } }, 'Skills auto-enabled when this role is selected. Agents can be further customized after creation.'),
        (form.suggestedSkills || []).length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 } },
          form.suggestedSkills.map(function(s) {
            return h('span', { key: s, style: { padding: '4px 12px', fontSize: 12, background: 'var(--accent-soft)', borderRadius: 20, color: 'var(--accent)', border: '1px solid var(--accent)', fontWeight: 500, cursor: 'pointer' }, onClick: function() { toggleSkill(s); }, title: 'Click to remove' }, s.replace(/-/g, ' '), ' \u00d7');
          })
        ),
        h('div', { style: { maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 } },
          allSkills && Object.keys(allSkills).length > 0
            ? Object.entries(allSkills).map(function(entry) {
                var cat = entry[0]; var skills = entry[1];
                return h('div', { key: cat },
                  h('div', { style: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 12px 2px' } }, cat),
                  (skills || []).map(function(s) {
                    var skillId = s.id || s.name;
                    var checked = (form.suggestedSkills || []).indexOf(skillId) >= 0;
                    return h('div', { key: skillId, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', background: checked ? 'var(--bg-tertiary)' : 'transparent', fontSize: 13 }, onClick: function() { toggleSkill(skillId); } },
                      h('input', { type: 'checkbox', checked: checked, readOnly: true, style: { width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' } }),
                      h('span', { style: { flex: 1 } }, s.name || skillId),
                      s.description && h('span', { style: { fontSize: 11, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.description)
                    );
                  })
                );
              })
            : h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 } }, skillsLoaded ? 'No skills available. Install skills from the Skills page first.' : 'Loading skills...')
        )
      )
    ),

    // ─── Preview ──────────────────────────────────────
    tab === 'preview' && h('div', null,
      h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 } }, 'This is how the role will appear in the Create Agent wizard when selected:'),
      previewResume
    )
  );
}

// ─── Role Card ─────────────────────────────────────

function RoleCard({ role, onEdit, onDuplicate, onDelete, onView }) {
  var isBuiltIn = !role.isCustom;
  var skills = role.suggestedSkills || [];
  var tags = role.tags || [];

  return h('div', {
    style: {
      padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color 0.15s',
    }
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      h('div', { style: { width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: 'var(--accent)', flexShrink: 0 } },
        (role.name || '?').charAt(0)
      ),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('strong', { style: { fontSize: 14 } }, role.name),
          isBuiltIn && h('span', { className: 'badge badge-neutral', style: { fontSize: 9 } }, 'Built-in'),
          role.orgId && h('span', { style: { fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'var(--info-soft)', color: 'var(--info)', display: 'inline-flex', alignItems: 'center', gap: 3 } }, I.building(), 'Org'),
        ),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, role.description || 'No description')
      ),
      h('span', { className: 'badge badge-neutral', style: { fontSize: 10, textTransform: 'capitalize' } }, CATEGORIES[role.category] ? CATEGORIES[role.category].name : role.category)
    ),
    // Stats
    h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
      skills.length > 0 && h('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)' } }, skills.length + ' skills'),
      (role.identity || {}).tone && h('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }, (role.identity || {}).tone),
      tags.slice(0, 4).map(function(t) {
        return h('span', { key: t, style: { fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }, t);
      }),
      tags.length > 4 && h('span', { style: { fontSize: 10, color: 'var(--text-muted)' } }, '+' + (tags.length - 4))
    ),
    // Actions
    h('div', { style: { display: 'flex', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 } },
      h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { onView(role); } }, I.eye(), ' Preview'),
      !isBuiltIn && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { onEdit(role); } }, I.edit(), ' Edit'),
      h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { onDuplicate(role); } }, I.copy(), ' Duplicate'),
      !isBuiltIn && h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)', marginLeft: 'auto' }, onClick: function() { onDelete(role); } }, I.trash(), ' Delete'),
    )
  );
}

// ─── Main Roles Page ───────────────────────────────

export function RolesPage() {
  var app = useApp();
  var toast = app.toast;
  var orgCtx = useOrgContext();
  var effectiveOrgId = orgCtx.selectedOrgId;

  var [builtInRoles, setBuiltInRoles] = useState([]);
  var [builtInMeta, setBuiltInMeta] = useState({});
  var [customRoles, setCustomRoles] = useState([]);
  var [loading, setLoading] = useState(true);
  var [editRole, setEditRole] = useState(null);       // null | role obj | 'new'
  var [previewRole, setPreviewRole] = useState(null); // role to preview
  var [allSkills, setAllSkills] = useState({});
  var [skillsLoaded, setSkillsLoaded] = useState(false);
  var [showPrompt, setShowPrompt] = useState(false);
  var [search, setSearch] = useState('');
  var [filterCat, setFilterCat] = useState('');

  var loadBuiltIn = useCallback(function() {
    engineCall('/souls/by-category').then(function(d) {
      setBuiltInRoles(Object.values(d.categories || {}).flat());
      setBuiltInMeta(d.categoryMeta || {});
    }).catch(function() {});
  }, []);

  var loadCustom = useCallback(function() {
    var url = '/roles' + (effectiveOrgId ? '?orgId=' + effectiveOrgId : '');
    apiCall(url).then(function(d) { setCustomRoles(d.roles || []); }).catch(function() {});
  }, [effectiveOrgId]);

  useEffect(function() {
    setLoading(true);
    Promise.all([
      engineCall('/souls/by-category'),
      apiCall('/roles' + (effectiveOrgId ? '?orgId=' + effectiveOrgId : '')),
      engineCall('/skills/by-category'),
    ]).then(function(results) {
      var soulData = results[0];
      var rolesData = results[1];
      var skillsData = results[2];
      setBuiltInRoles(Object.values(soulData.categories || {}).flat());
      setBuiltInMeta(soulData.categoryMeta || {});
      setCustomRoles(rolesData.roles || []);
      setAllSkills(skillsData.categories || {});
      setSkillsLoaded(true);
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, [effectiveOrgId]);

  var handleSave = async function(formData) {
    try {
      if (editRole && editRole !== 'new' && editRole.id && editRole.isCustom) {
        await apiCall('/roles/' + editRole.id, { method: 'PUT', body: JSON.stringify(formData) });
        toast('Role updated', 'success');
      } else {
        await apiCall('/roles', { method: 'POST', body: JSON.stringify(formData) });
        toast('Role created', 'success');
      }
      setEditRole(null);
      loadCustom();
    } catch (e) { toast(e.message || 'Failed to save role', 'error'); throw e; }
  };

  var handleDuplicate = async function(role) {
    if (role.isCustom && role.id) {
      try {
        await apiCall('/roles/' + role.id + '/duplicate', { method: 'POST', body: JSON.stringify({}) });
        toast('Role duplicated', 'success');
        loadCustom();
      } catch (e) { toast(e.message, 'error'); }
    } else {
      // Duplicate built-in: open create form pre-filled
      setEditRole({
        name: role.name + ' (Custom)',
        category: role.category,
        description: role.description,
        personality: role.personality || '',
        identity: role.identity || {},
        suggestedSkills: role.suggestedSkills || [],
        suggestedPreset: role.suggestedPreset || '',
        tags: role.tags || [],
        isCustom: true,
      });
    }
  };

  var handleDelete = async function(role) {
    if (!role.isCustom || !role.id) return;
    var ok = await (window.__showConfirm || function() { return Promise.resolve(confirm('Delete role "' + role.name + '"?')); })({
      title: 'Delete Role', message: 'Permanently delete "' + role.name + '"? This cannot be undone.', danger: true, confirmText: 'Delete Role'
    });
    if (!ok) return;
    try {
      await apiCall('/roles/' + role.id, { method: 'DELETE' });
      toast('Role deleted', 'success');
      loadCustom();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Merge and filter
  var allRoles = builtInRoles.map(function(r) { return Object.assign({}, r, { isCustom: false }); }).concat(customRoles);
  if (search) {
    var q = search.toLowerCase();
    allRoles = allRoles.filter(function(r) {
      return (r.name || '').toLowerCase().indexOf(q) >= 0 || (r.description || '').toLowerCase().indexOf(q) >= 0 || (r.tags || []).some(function(t) { return t.indexOf(q) >= 0; });
    });
  }
  if (filterCat) {
    allRoles = allRoles.filter(function(r) { return r.category === filterCat; });
  }

  // Group by category
  var grouped = {};
  allRoles.forEach(function(r) {
    var cat = r.category || 'operations';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } },
          'Agent Roles',
          h(KnowledgeLink, { page: 'roles' }),
          h(HelpButton, { label: 'Agent Roles' },
            h('p', null, 'Manage the role templates that appear in the Create Agent wizard. Each role defines a complete agent identity — personality, skills, communication style, and expertise.'),
            h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Built-in vs Custom'),
            h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
              h('li', null, h('strong', null, 'Built-in'), ' — 51 pre-built templates across 14 categories. Cannot be edited but can be duplicated.'),
              h('li', null, h('strong', null, 'Custom'), ' — Your own role templates. Fully editable. Can be organization-scoped so only that org sees them.')
            ),
            h('p', null, 'When creating a new agent, the role template auto-configures personality, skills, permissions, and communication tone — saving time and ensuring consistency.')
          )
        ),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, builtInRoles.length + ' built-in + ' + customRoles.length + ' custom role templates')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h(orgCtx.Switcher),
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowPrompt(!showPrompt); } }, I.copy(), showPrompt ? ' Hide Prompt' : ' AI Prompt'),
        h('button', { className: 'btn btn-primary', onClick: function() { setEditRole('new'); } }, I.plus(), ' Create Role')
      )
    ),

    // AI Prompt Template
    showPrompt && h('div', { style: { marginBottom: 16, padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 } },
        h('div', null,
          h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 4 } }, 'Role Builder Prompt'),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: 0 } }, 'Copy this prompt and paste it into any AI chatbot (ChatGPT, Claude, etc.) to help you design a complete agent role template. Then paste the result back here.')
        ),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() {
          var prompt = ROLE_BUILDER_PROMPT;
          navigator.clipboard.writeText(prompt).then(function() { toast('Prompt copied to clipboard!', 'success'); });
        } }, I.copy(), ' Copy Prompt')
      ),
      h('pre', { style: { background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.5, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: 'var(--text-primary)' } }, ROLE_BUILDER_PROMPT)
    ),

    // Filters
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
      h('input', { className: 'input', value: search, onChange: function(e) { setSearch(e.target.value); }, placeholder: 'Search roles...', style: { flex: 1, maxWidth: 300 } }),
      h('select', { className: 'input', value: filterCat, onChange: function(e) { setFilterCat(e.target.value); }, style: { width: 180 } },
        h('option', { value: '' }, 'All Categories'),
        Object.keys(CATEGORIES).map(function(k) { return h('option', { key: k, value: k }, CATEGORIES[k].name); })
      )
    ),

    loading
      ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading roles...')
      : Object.keys(grouped).length === 0
        ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No roles match your search')
        : Object.entries(grouped).map(function(entry) {
            var cat = entry[0]; var roles = entry[1];
            var meta = CATEGORIES[cat] || builtInMeta[cat] || { name: cat };
            return h('div', { key: cat, style: { marginBottom: 24 } },
              h('h3', { style: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 } },
                meta.name || cat,
                h('span', { style: { fontWeight: 400, opacity: 0.6 } }, '(' + roles.length + ')')
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 10 } },
                roles.map(function(role) {
                  return h(RoleCard, {
                    key: role.id || role.slug,
                    role: role,
                    onView: function() { setPreviewRole(role); },
                    onEdit: function() { setEditRole(role); },
                    onDuplicate: function() { handleDuplicate(role); },
                    onDelete: function() { handleDelete(role); }
                  });
                })
              )
            );
          }),

    // Role preview modal
    previewRole && h(Modal, {
      title: previewRole.name,
      onClose: function() { setPreviewRole(null); },
      width: 1100,
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setPreviewRole(null); } }, 'Close'),
        !previewRole.isCustom && h('button', { className: 'btn btn-primary', onClick: function() { setPreviewRole(null); handleDuplicate(previewRole); } }, I.copy(), ' Duplicate as Custom'),
        previewRole.isCustom && h('button', { className: 'btn btn-primary', onClick: function() { setPreviewRole(null); setEditRole(previewRole); } }, I.edit(), ' Edit')
      )
    }, (function() {
      var r = previewRole;
      var rps = parseSections(r.personality || '');
      var rExpertise = extractItems(rps['Expertise'] || '');
      var rPrinciples = extractItems(rps['Principles'] || '');
      var rBoundaries = extractItems(rps['Boundaries'] || '');
      var rSkills = r.suggestedSkills || [];
      var identity = r.identity || {};
      var toneLabels = { formal: 'Formal & structured', casual: 'Casual & conversational', professional: 'Professional & clear', friendly: 'Friendly & warm' };

      var sh = function(title) {
        return h('div', { style: { marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' } },
          h('span', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' } }, title)
        );
      };
      var pr = function(text, n) {
        return h('p', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 } }, firstSentences(text, n));
      };

      return h('div', { style: { border: '2px solid var(--accent)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-primary)' } },
        h('div', { style: { padding: '16px 20px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'flex-start', gap: 14 } },
          h('div', { style: { width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 } }, (r.name || '?').charAt(0)),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontWeight: 800, fontSize: 16 } }, r.name),
            h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 } }, r.description || 'No description'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 } },
              h('span', { className: 'badge badge-primary' }, identity.role || r.name),
              h('span', { className: 'badge badge-neutral' }, toneLabels[identity.tone] || 'Professional'),
              h('span', { className: 'badge badge-neutral' }, 'Language: ' + getLanguageName(identity.language || 'en-us')),
              r.suggestedPreset && h('span', { className: 'badge badge-info' }, 'Preset: ' + r.suggestedPreset),
              r.isCustom && h('span', { className: 'badge badge-warning', style: { fontSize: 9 } }, 'Custom'),
              !r.isCustom && h('span', { className: 'badge badge-neutral', style: { fontSize: 9 } }, 'Built-in')
            )
          )
        ),
        h('div', { style: { padding: '16px 20px 20px' } },
          rps['Identity'] && h('div', { style: { marginBottom: 18 } }, sh('What this agent does'), pr(rps['Identity'], 3)),
          rps['Approach'] && h('div', { style: { marginBottom: 18 } }, sh('How it works'), pr(rps['Approach'], 3)),
          (rps['Mental Models'] || rps['Decision Framework']) && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 } },
            rps['Mental Models'] && h('div', null, sh('How it thinks'), pr(rps['Mental Models'], 3)),
            rps['Decision Framework'] && h('div', null, sh('How it prioritizes'), pr(rps['Decision Framework'], 3))
          ),
          rps['Communication Style'] && h('div', { style: { marginBottom: 18 } }, sh('How it communicates'), pr(rps['Communication Style'], 3)),
          rExpertise.length > 0 && h('div', { style: { marginBottom: 18 } },
            sh('Areas of expertise'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              rExpertise.map(function(item, i) { return h('span', { key: i, style: { padding: '4px 12px', fontSize: 12, background: 'var(--bg-tertiary)', borderRadius: 20, color: 'var(--text-primary)', border: '1px solid var(--border)' } }, item); })
            )
          ),
          rSkills.length > 0 && h('div', { style: { marginBottom: 18 } },
            sh('Tools this agent will use (' + rSkills.length + ')'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              rSkills.map(function(s) { return h('span', { key: s, style: { padding: '4px 12px', fontSize: 12, background: 'var(--accent-soft)', borderRadius: 20, color: 'var(--accent)', border: '1px solid var(--accent)', fontWeight: 500 } }, s.replace(/-/g, ' ')); })
            )
          ),
          rPrinciples.length > 0 && h('div', { style: { marginBottom: 18 } },
            sh('Operating principles'),
            h('ol', { style: { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } },
              rPrinciples.slice(0, 6).map(function(p, i) { return h('li', { key: i, style: { marginBottom: 2 } }, p); })
            )
          ),
          rBoundaries.length > 0 && h('div', { style: { padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' } },
            sh('Limitations'),
            h('ul', { style: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } },
              rBoundaries.map(function(b, i) { return h('li', { key: i, style: { marginBottom: 2 } }, b); })
            )
          ),
          !rps['Identity'] && !rps['Approach'] && r.personality && h('div', null,
            sh('Personality'),
            h('p', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' } }, rewriteForUser(r.personality.substring(0, 2000)))
          )
        )
      );
    })()),

    // Role form modal
    editRole && h(RoleFormModal, {
      role: editRole === 'new' ? null : editRole,
      allSkills: allSkills,
      skillsLoaded: skillsLoaded,
      orgId: effectiveOrgId,
      onSave: handleSave,
      onClose: function() { setEditRole(null); }
    })
  );
}

import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, EmptyState } from './shared.js?v=4';

// ════════════════════════════════════════════════════════════
// SKILLS SECTION — View and manage agent skills
// ════════════════════════════════════════════════════════════

export function SkillsSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var currentSkills = Array.isArray(config.skills) ? config.skills : [];

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _selectedSkills = useState(currentSkills);
  var selectedSkills = _selectedSkills[0]; var setSelectedSkills = _selectedSkills[1];
  var _allSkills = useState({});
  var allSkills = _allSkills[0]; var setAllSkills = _allSkills[1];
  var _suites = useState([]);
  var suites = _suites[0]; var setSuites = _suites[1];
  var _skillSearch = useState('');
  var skillSearch = _skillSearch[0]; var setSkillSearch = _skillSearch[1];

  useEffect(function() {
    engineCall('/skills/by-category').then(function(d) { setAllSkills(d.categories || {}); }).catch(function() {});
    engineCall('/skills/suites').then(function(d) { setSuites(d.suites || []); }).catch(function() {});
  }, []);

  // Reset selected skills when entering edit mode
  var startEdit = function() {
    setSelectedSkills(Array.isArray(config.skills) ? config.skills.slice() : []);
    setEditing(true);
  };

  var toggleSkill = function(id) {
    setSelectedSkills(function(prev) {
      return prev.includes(id) ? prev.filter(function(s) { return s !== id; }) : prev.concat([id]);
    });
  };

  var toggleSuite = function(suite) {
    setSelectedSkills(function(prev) {
      var allIn = suite.skills.every(function(id) { return prev.includes(id); });
      if (allIn) return prev.filter(function(id) { return !suite.skills.includes(id); });
      var merged = prev.slice();
      suite.skills.forEach(function(id) { if (!merged.includes(id)) merged.push(id); });
      return merged;
    });
  };

  var save = function() {
    setSaving(true);
    var updates = { skills: selectedSkills };
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Skills updated', 'success'); setEditing(false); setSaving(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSaving(false); });
  };

  if (editing) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Skills'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('span', { className: 'badge badge-primary' }, selectedSkills.length + ' selected'),
          selectedSkills.length > 0 && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setSelectedSkills([]); } }, 'Clear all'),
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Skills')
        )
      ),

      // Suites
      suites.length > 0 && h('div', { style: { marginBottom: 24 } },
        h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } }, 'Suites'),
        h('div', { className: 'suite-grid' }, suites.map(function(s) {
          var allIn = s.skills.every(function(id) { return selectedSkills.includes(id); });
          var someIn = s.skills.some(function(id) { return selectedSkills.includes(id); });
          return h('div', { key: s.id, className: 'suite-card' + (allIn ? ' selected' : someIn ? ' partial' : ''), onClick: function() { toggleSuite(s); }, style: { cursor: 'pointer' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
              h('span', { style: { fontSize: 20 } }, s.icon),
              allIn && h('span', { style: { color: 'var(--accent)' } }, I.check())
            ),
            h('div', { className: 'suite-name' }, s.name),
            h('div', { className: 'suite-desc' }, s.skills.length + ' apps')
          );
        }))
      ),

      // Search
      h('div', { style: { marginBottom: 14 } },
        h('input', { className: 'input', type: 'text', placeholder: 'Search skills...', value: skillSearch, onChange: function(e) { setSkillSearch(e.target.value); }, style: { maxWidth: 300 } })
      ),

      // Skills by category
      Object.entries(allSkills).map(function(entry) {
        var cat = entry[0]; var skills = entry[1];
        var filtered = skillSearch ? skills.filter(function(s) { return s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()); }) : skills;
        if (filtered.length === 0) return null;
        return h('div', { key: cat, style: { marginBottom: 20 } },
          h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } }, cat.replace(/-/g, ' ')),
          h('div', { className: 'skill-grid' }, filtered.map(function(s) {
            var isSelected = selectedSkills.includes(s.id);
            return h('div', { key: s.id, className: 'skill-card' + (isSelected ? ' selected' : ''), onClick: function() { toggleSkill(s.id); }, style: { cursor: 'pointer' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { className: 'skill-name' }, (s.icon || '') + ' ' + s.name),
                isSelected && h('span', { style: { color: 'var(--accent)' } }, I.check())
              ),
              h('div', { className: 'skill-desc' }, s.description)
            );
          }))
        );
      })
    );
  }

  // View mode
  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Skills & Capabilities'),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { className: 'badge badge-primary' }, currentSkills.length + ' skills'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit Skills')
      )
    ),

    currentSkills.length > 0
      ? h('div', { className: 'card', style: { padding: 20 } },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
            currentSkills.map(function(skillId) {
              return h('div', { key: skillId, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 13, fontWeight: 500, color: 'var(--accent-text)' } },
                h('span', null, skillId.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }))
              );
            })
          )
        )
      : h('div', { className: 'card', style: { padding: 40, textAlign: 'center' } },
          h('div', { style: { color: 'var(--text-muted)', marginBottom: 12 } }, 'No skills assigned to this agent.'),
          h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, 'Add Skills')
        )
  );
}


// Skills page — builtin catalog + installed community skills

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { renderTable } from '../components/table.js';

export function loadSkills() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div><h2 class="page-title">Skills</h2><p class="page-desc">Builtin capabilities and community skill extensions</p></div>' +
    '<div class="card"><h3>Builtin Skills</h3><div class="page-desc">Loading...</div></div>' +
    '<div class="card"><h3>Installed Community Skills</h3><div class="page-desc">Loading...</div></div>';

  var cards = el.querySelectorAll('.card');

  // Load builtin skills by category
  api('/engine/skills/by-category').then(function(d) {
    var categories = d.categories || d || {};
    var entries = typeof categories === 'object' && !Array.isArray(categories) ? Object.entries(categories) : [];

    if (entries.length === 0) {
      cards[0].innerHTML = '<h3>Builtin Skills</h3><div class="empty"><div class="empty-icon">&#9889;</div>No builtin skills found.</div>';
      return;
    }

    var html = '<h3>Builtin Skills</h3>';
    entries.forEach(function(entry) {
      var catName = entry[0];
      var skills = Array.isArray(entry[1]) ? entry[1] : [];
      var skillCards = skills.map(function(s) {
        return '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">' +
          '<div style="font-weight:600;font-size:14px;margin-bottom:4px">' + esc(s.name || s.id || '-') + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;line-height:1.4">' + esc(s.description || '') + '</div>' +
          (s.version ? '<span style="font-size:11px;color:var(--text-muted)">v' + esc(s.version) + '</span>' : '') +
          '</div>';
      }).join('');

      html += '<div style="margin-bottom:20px">' +
        '<h4 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">' + esc(catName) + '</h4>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:12px">' + skillCards + '</div>' +
        '</div>';
    });

    cards[0].innerHTML = html;
  }).catch(function() {
    cards[0].innerHTML = '<h3>Builtin Skills</h3><div class="empty"><div class="empty-icon">&#9889;</div>No builtin skills found.</div>';
  });

  // Load installed community skills
  api('/engine/community/installed?orgId=default').then(function(d) {
    var installed = d.skills || (Array.isArray(d) ? d : []);

    if (installed.length === 0) {
      cards[1].innerHTML = '<h3>Installed Community Skills</h3><div class="empty"><div class="empty-icon">&#128230;</div>No community skills installed.</div>';
      return;
    }

    var rows = installed.map(function(s) {
      var isEnabled = s.enabled !== false && s.status !== 'disabled';
      var toggleBtn = isEnabled
        ? '<button class="btn btn-sm" data-disable-skill="' + s.id + '">Disable</button>'
        : '<button class="btn btn-sm btn-primary" data-enable-skill="' + s.id + '">Enable</button>';
      var uninstallBtn = '<button class="btn btn-sm btn-danger" data-uninstall-skill="' + s.id + '">Uninstall</button>';

      return '<tr>' +
        '<td style="font-weight:600">' + esc(s.name || s.id || '-') + '</td>' +
        '<td style="color:var(--text-muted);font-size:12px">' + esc(s.version || '-') + '</td>' +
        '<td>' + (isEnabled ? '<span class="badge badge-success">enabled</span>' : '<span class="badge badge-danger">disabled</span>') + '</td>' +
        '<td>' + toggleBtn + ' ' + uninstallBtn + '</td>' +
        '</tr>';
    }).join('');

    cards[1].innerHTML = '<h3>Installed Community Skills (' + installed.length + ')</h3>' + renderTable(['Name', 'Version', 'Status', 'Actions'], rows);

    el.querySelectorAll('[data-enable-skill]').forEach(function(btn) {
      btn.onclick = function() {
        enableSkill(btn.getAttribute('data-enable-skill'));
      };
    });

    el.querySelectorAll('[data-disable-skill]').forEach(function(btn) {
      btn.onclick = function() {
        disableSkill(btn.getAttribute('data-disable-skill'));
      };
    });

    el.querySelectorAll('[data-uninstall-skill]').forEach(function(btn) {
      btn.onclick = function() {
        uninstallSkill(btn.getAttribute('data-uninstall-skill'));
      };
    });
  }).catch(function() {
    cards[1].innerHTML = '<h3>Installed Community Skills</h3><div class="empty"><div class="empty-icon">&#128230;</div>No community skills installed.</div>';
  });
}

function enableSkill(id) {
  api('/engine/community/skills/' + id + '/enable', { method: 'PUT', body: {} })
    .then(function() { toast('Skill enabled', 'success'); loadSkills(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function disableSkill(id) {
  api('/engine/community/skills/' + id + '/disable', { method: 'PUT', body: {} })
    .then(function() { toast('Skill disabled', 'success'); loadSkills(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function uninstallSkill(id) {
  if (!confirm('Uninstall this skill?')) return;
  api('/engine/community/skills/' + id + '/uninstall', { method: 'DELETE' })
    .then(function() { toast('Skill uninstalled', 'success'); loadSkills(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

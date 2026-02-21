/**
 * AgenticMail Enterprise Dashboard — Layout View
 * Main layout wrapper with sidebar, head, scripts, dark mode toggle
 */

const { esc } = require('../utils/helpers');

function layout(activePage, user, content, flash) {
  const nav = (href, icon, label, key) =>
    `<a href="${href}" class="nav-item ${activePage === key ? 'active' : ''}">
      ${icon} <span>${label}</span>
    </a>`;

  let flashHtml = '';
  if (flash && flash.message) {
    const type = flash.type || 'info';
    flashHtml = `<div class="flash flash-${esc(type)}">${esc(flash.message)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgenticMail Enterprise - Express</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>AgenticMail</h2>
      <p>Enterprise Dashboard</p>
    </div>
    <nav class="nav">
      <div class="nav-section">Overview</div>
      ${nav('/', '📊', 'Dashboard', 'dashboard')}
      
      <div class="nav-section">Management</div>
      ${nav('/agents', '🤖', 'Agents', 'agents')}
      ${nav('/skills', '⚡', 'Skills', 'skills')}
      ${nav('/community-skills', '🏪', 'Community Skills', 'community-skills')}
      ${nav('/skill-connections', '🔗', 'Skill Connections', 'skill-connections')}
      ${nav('/knowledge', '📚', 'Knowledge Bases', 'knowledge')}
      ${nav('/knowledge-contributions', '🧠', 'Knowledge Hub', 'knowledge-contributions')}
      ${nav('/approvals', '✅', 'Approvals', 'approvals')}
      
      <div class="nav-section">Management</div>
      ${nav('/workforce', '⏰', 'Workforce', 'workforce')}
      ${nav('/messages', '💬', 'Messages', 'messages')}
      ${nav('/guardrails', '🛡️', 'Guardrails', 'guardrails')}
      ${nav('/journal', '📝', 'Journal', 'journal')}
      
      <div class="nav-section">Administration</div>
      ${nav('/dlp', '🔍', 'DLP', 'dlp')}
      ${nav('/compliance', '✔️', 'Compliance', 'compliance')}
      ${nav('/domain-status', '🛡️', 'Domain', 'domain-status')}
      ${nav('/users', '👥', 'Users', 'users')}
      ${nav('/vault', '🔐', 'Vault', 'vault')}
      ${nav('/audit', '📋', 'Audit Log', 'audit')}
      ${nav('/settings', '⚙️', 'Settings', 'settings')}
    </nav>
  </aside>
  
  <main class="main-content">
    <div class="topbar">
      <div class="topbar-left">
        <div class="topbar-title">AgenticMail Enterprise</div>
      </div>
      <div class="topbar-right">
        <span>${esc(user?.email || user?.name || 'Admin')}</span>
        <a href="/logout" class="btn btn-secondary btn-sm">Sign Out</a>
        <button class="btn btn-secondary btn-sm theme-toggle" title="Toggle theme">🌙</button>
      </div>
    </div>
    <div class="page-content">
      ${flashHtml}
      ${content}
    </div>
  </main>
</div>
<script>
if(localStorage.getItem('dark')==='1') document.documentElement.setAttribute('data-theme','dark');
document.querySelector('.theme-toggle')?.addEventListener('click',function(){
  var d=document.documentElement.hasAttribute('data-theme');
  if(d){document.documentElement.removeAttribute('data-theme');localStorage.removeItem('dark')}
  else{document.documentElement.setAttribute('data-theme','dark');localStorage.setItem('dark','1')}
});
</script>
</body>
</html>`;
}

module.exports = { layout };

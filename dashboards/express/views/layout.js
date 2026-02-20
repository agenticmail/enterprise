/**
 * AgenticMail Enterprise Dashboard — Layout View
 * Main layout wrapper with sidebar, head, scripts, dark mode toggle
 */

const { esc } = require('../utils/helpers');

function layout(activePage, user, content, flash) {
  const nav = (href, icon, label, key) =>
    `<a href="${href}" class="${activePage === key ? 'active' : ''}">
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
<aside class="sidebar">
  <div class="sidebar-brand">
    &#127970; AgenticMail Enterprise
    <small>Admin Dashboard &middot; Express</small>
  </div>
  <nav class="sidebar-nav">
    ${nav('/', '&#128202;', 'Dashboard', 'dashboard')}
    ${nav('/agents', '&#129302;', 'Agents', 'agents')}
    ${nav('/users', '&#128101;', 'Users', 'users')}
    ${nav('/api-keys', '&#128273;', 'API Keys', 'keys')}
    ${nav('/vault', '&#128274;', 'Vault', 'vault')}
    ${nav('/skills', '&#9889;', 'Skills', 'skills')}
    <div style="margin:12px 16px 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">Management</div>
    ${nav('/messages', '&#9993;', 'Messages', 'messages')}
    ${nav('/guardrails', '&#128737;', 'Guardrails', 'guardrails')}
    ${nav('/journal', '&#128216;', 'Journal', 'journal')}
    ${nav('/dlp', '&#128274;', 'DLP', 'dlp')}
    ${nav('/compliance', '&#128203;', 'Compliance', 'compliance')}
    ${nav('/audit', '&#128220;', 'Audit Log', 'audit')}
    ${nav('/settings', '&#9881;&#65039;', 'Settings', 'settings')}
  </nav>
  <div class="sidebar-footer">
    <div style="margin-bottom:6px">${esc(user?.email || user?.name || 'Admin')}</div>
    <a href="/logout">Sign out</a>
    &nbsp;&middot;&nbsp;
    <button class="theme-toggle" title="Toggle dark mode">&#127763;</button>
  </div>
</aside>
<main class="main">
  ${flashHtml}
  ${content}
</main>
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

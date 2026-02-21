<?php
/**
 * AgenticMail Layout Component
 * Provides layout_start() and layout_end() for the sidebar + header/footer chrome.
 */

/**
 * Render the opening HTML, head, sidebar, and content area start.
 *
 * @param string $title Page title suffix
 * @param string $page  Current page slug (for nav highlighting)
 */
function layout_start(string $title = 'Dashboard', string $page = 'dashboard'): void {
    $user = $_SESSION['am_user'] ?? null;
    $flash = get_flash();
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= e($title) ?> — AgenticMail Enterprise</title>
  <link rel="stylesheet" href="public/styles.css">
</head>
<body>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>&#127970; <em>Agentic</em>Mail</h2>
      <small>Enterprise &middot; PHP</small>
    </div>
    <div class="nav">
      <div class="nav-sec">Overview</div>
      <a href="?page=dashboard" class="<?= $page === 'dashboard' ? 'active' : '' ?>">📊 <span>Dashboard</span></a>
      <div class="nav-sec">Management</div>
      <a href="?page=agents" class="<?= $page === 'agents' ? 'active' : '' ?>">🤖 <span>Agents</span></a>
      <a href="?page=skills" class="<?= $page === 'skills' ? 'active' : '' ?>">🛠️ <span>Skills</span></a>
      <a href="?page=community-skills" class="<?= $page === 'community-skills' ? 'active' : '' ?>">🏪 <span>Community Skills</span></a>
      <a href="?page=skill-connections" class="<?= $page === 'skill-connections' ? 'active' : '' ?>">🔗 <span>Skill Connections</span></a>
      <a href="?page=knowledge" class="<?= $page === 'knowledge' ? 'active' : '' ?>">📚 <span>Knowledge Bases</span></a>
      <a href="?page=knowledge-contributions" class="<?= $page === 'knowledge-contributions' ? 'active' : '' ?>">📚 <span>Knowledge Hub</span></a>
      <a href="?page=approvals" class="<?= $page === 'approvals' ? 'active' : '' ?>">✅ <span>Approvals</span></a>
      <div class="nav-sec">Management</div>
      <a href="?page=workforce" class="<?= $page === 'workforce' ? 'active' : '' ?>">🕐 <span>Workforce</span></a>
      <a href="?page=messages" class="<?= $page === 'messages' ? 'active' : '' ?>">💬 <span>Messages</span></a>
      <a href="?page=guardrails" class="<?= $page === 'guardrails' ? 'active' : '' ?>">🛡️ <span>Guardrails</span></a>
      <a href="?page=journal" class="<?= $page === 'journal' ? 'active' : '' ?>">📖 <span>Journal</span></a>
      <div class="nav-sec">Administration</div>
      <a href="?page=dlp" class="<?= $page === 'dlp' ? 'active' : '' ?>">🔒 <span>DLP</span></a>
      <a href="?page=compliance" class="<?= $page === 'compliance' ? 'active' : '' ?>">📋 <span>Compliance</span></a>
      <a href="?page=domain-status" class="<?= $page === 'domain-status' ? 'active' : '' ?>">🛡️ <span>Domain</span></a>
      <a href="?page=users" class="<?= $page === 'users' ? 'active' : '' ?>">👥 <span>Users</span></a>
      <a href="?page=vault" class="<?= $page === 'vault' ? 'active' : '' ?>">🔐 <span>Vault</span></a>
      <a href="?page=audit" class="<?= $page === 'audit' ? 'active' : '' ?>">📋 <span>Audit Log</span></a>
      <a href="?page=settings" class="<?= $page === 'settings' ? 'active' : '' ?>">⚙️ <span>Settings</span></a>
    </div>
    <div class="sidebar-footer">
      <div style="color:var(--dim)"><?= e($user['name'] ?? '') ?></div>
      <div style="color:var(--muted);font-size:11px"><?= e($user['email'] ?? '') ?></div>
      <a href="?action=logout" style="color:var(--muted);font-size:11px;margin-top:6px;display:inline-block">Sign out</a>
    </div>
  </div>

  <div class="content">
    <?php if ($flash): ?>
      <?php if ($flash['type'] === 'error'): ?>
        <div class="alert alert-e"><?= e($flash['msg']) ?></div>
      <?php else: ?>
        <div class="alert alert-s"><?= e($flash['msg']) ?></div>
      <?php endif; ?>
    <?php endif; ?>
<?php
}

/**
 * Render the closing content div, layout div, body, and html tags.
 */
function layout_end(): void {
?>
  </div>
</div>
</body>
</html>
<?php
}

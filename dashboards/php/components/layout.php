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
      <a href="?page=dashboard" class="<?= $page === 'dashboard' ? 'active' : '' ?>">&#128202; <span>Dashboard</span></a>
      <div class="nav-sec">Manage</div>
      <a href="?page=agents" class="<?= $page === 'agents' ? 'active' : '' ?>">&#129302; <span>Agents</span></a>
      <a href="?page=users" class="<?= $page === 'users' ? 'active' : '' ?>">&#128101; <span>Users</span></a>
      <a href="?page=api-keys" class="<?= $page === 'api-keys' ? 'active' : '' ?>">&#128273; <span>API Keys</span></a>
      <a href="?page=vault" class="<?= $page === 'vault' ? 'active' : '' ?>">&#128274; <span>Vault</span></a>
      <a href="?page=skills" class="<?= $page === 'skills' ? 'active' : '' ?>">&#128268; <span>Skills</span></a>
      <div class="nav-sec">Management</div>
      <a href="?page=messages" class="<?= $page === 'messages' ? 'active' : '' ?>">&#128231; <span>Messages</span></a>
      <a href="?page=guardrails" class="<?= $page === 'guardrails' ? 'active' : '' ?>">&#128737; <span>Guardrails</span></a>
      <a href="?page=journal" class="<?= $page === 'journal' ? 'active' : '' ?>">&#128214; <span>Journal</span></a>
      <div class="nav-sec">Admin</div>
      <a href="?page=dlp" class="<?= $page === 'dlp' ? 'active' : '' ?>">&#128274; <span>DLP</span></a>
      <a href="?page=compliance" class="<?= $page === 'compliance' ? 'active' : '' ?>">&#128196; <span>Compliance</span></a>
      <div class="nav-sec">System</div>
      <a href="?page=audit" class="<?= $page === 'audit' ? 'active' : '' ?>">&#128203; <span>Audit Log</span></a>
      <a href="?page=settings" class="<?= $page === 'settings' ? 'active' : '' ?>">&#9881;&#65039; <span>Settings</span></a>
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

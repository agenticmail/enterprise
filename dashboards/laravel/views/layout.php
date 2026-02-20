<?php
/**
 * Layout — full HTML shell with sidebar navigation.
 * Expects: $title (string), $page (string), $content (string)
 */
$_user = Helpers::e($_SESSION['user']['email'] ?? $_SESSION['user']['name'] ?? 'User');
$_flash = Helpers::renderFlash();

$_navLinks = [
    '/'           => ['label' => 'Dashboard',   'icon' => '&#9632;',  'page' => 'dashboard'],
    '/agents'     => ['label' => 'Agents',      'icon' => '&#9670;',  'page' => 'agents'],
    '/users'      => ['label' => 'Users',       'icon' => '&#9862;',  'page' => 'users'],
    '/api-keys'   => ['label' => 'API Keys',    'icon' => '&#9919;',  'page' => 'api-keys'],
    '/vault'      => ['label' => 'Vault',       'icon' => '&#128274;', 'page' => 'vault'],
    '/skills'     => ['label' => 'Skills',      'icon' => '&#128268;', 'page' => 'skills'],
    '_mgmt'       => ['label' => 'Management',  'icon' => '',         'page' => '_section'],
    '/messages'   => ['label' => 'Messages',    'icon' => '&#9993;',  'page' => 'messages'],
    '/guardrails' => ['label' => 'Guardrails',  'icon' => '&#9888;',  'page' => 'guardrails'],
    '/journal'    => ['label' => 'Journal',     'icon' => '&#9998;',  'page' => 'journal'],
    '_admin'      => ['label' => 'Admin',       'icon' => '',         'page' => '_section'],
    '/dlp'        => ['label' => 'DLP',         'icon' => '&#9730;',  'page' => 'dlp'],
    '/compliance' => ['label' => 'Compliance',  'icon' => '&#9745;',  'page' => 'compliance'],
    '/audit'      => ['label' => 'Audit Log',   'icon' => '&#9776;',  'page' => 'audit'],
    '/settings'   => ['label' => 'Settings',    'icon' => '&#9881;',  'page' => 'settings'],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= Helpers::e($title) ?> &mdash; AgenticMail Enterprise</title>
    <link rel="stylesheet" href="/public/styles.css">
</head>
<body>
    <aside class="sidebar">
        <div class="sidebar-brand">
            &#x1F3E2; AgenticMail Enterprise
            <small>Laravel Dashboard</small>
        </div>
        <nav class="sidebar-nav">
<?php foreach ($_navLinks as $_href => $_link): ?>
<?php if ($_link['page'] === '_section'): ?>
            <div class="nav-section"><?= $_link['label'] ?></div>
<?php else: ?>
            <a href="<?= $_href ?>"<?= ($page === $_link['page']) ? ' class="active"' : '' ?>>
                <span class="nav-icon"><?= $_link['icon'] ?></span>
                <span><?= $_link['label'] ?></span>
            </a>
<?php endif; ?>
<?php endforeach; ?>
        </nav>
        <div class="sidebar-footer">
            <div style="margin-bottom: 6px"><?= $_user ?></div>
            <a href="/logout">Sign Out</a>
            &nbsp;&middot;&nbsp;
            <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark mode">&#9790;</button>
        </div>
    </aside>

    <main class="main">
        <div class="page-header">
            <h1><?= Helpers::e($title) ?></h1>
        </div>
        <?= $_flash ?>
        <?= $content ?>
    </main>

    <script>
    (function() {
        var saved = localStorage.getItem('theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
    })();
    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme');
        var next = (current === 'dark') ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }
    </script>
</body>
</html>

<?php
/**
 * Layout — full HTML shell with sidebar navigation.
 * Expects: $title (string), $page (string), $content (string)
 */
$_user = Helpers::e($_SESSION['user']['email'] ?? $_SESSION['user']['name'] ?? 'User');
$_flash = Helpers::renderFlash();

$_navLinks = [
    '_overview'           => ['label' => 'Overview',              'icon' => '',        'page' => '_section'],
    '/'                   => ['label' => 'Dashboard',             'icon' => '📊',     'page' => 'dashboard'],
    '_mgmt1'              => ['label' => 'Management',            'icon' => '',        'page' => '_section'],
    '/agents'             => ['label' => 'Agents',               'icon' => '🤖',     'page' => 'agents'],
    '/skills'             => ['label' => 'Skills',               'icon' => '⚡',     'page' => 'skills'],
    '/community-skills'   => ['label' => 'Community Skills',     'icon' => '🏪',     'page' => 'community-skills'],
    '/skill-connections'  => ['label' => 'Skill Connections',    'icon' => '🔗',     'page' => 'skill-connections'],
    '/knowledge'          => ['label' => 'Knowledge Bases',      'icon' => '📚',     'page' => 'knowledge'],
    '/knowledge-contributions' => ['label' => 'Knowledge Hub',  'icon' => '🧠',     'page' => 'knowledge-contributions'],
    '/approvals'          => ['label' => 'Approvals',            'icon' => '✅',     'page' => 'approvals'],
    '_mgmt2'              => ['label' => 'Management',            'icon' => '',        'page' => '_section'],
    '/workforce'          => ['label' => 'Workforce',            'icon' => '⏰',     'page' => 'workforce'],
    '/messages'           => ['label' => 'Messages',             'icon' => '💬',     'page' => 'messages'],
    '/guardrails'         => ['label' => 'Guardrails',           'icon' => '🛡️',     'page' => 'guardrails'],
    '/journal'            => ['label' => 'Journal',              'icon' => '📝',     'page' => 'journal'],
    '_admin'              => ['label' => 'Administration',       'icon' => '',        'page' => '_section'],
    '/dlp'                => ['label' => 'DLP',                  'icon' => '🔍',     'page' => 'dlp'],
    '/compliance'         => ['label' => 'Compliance',           'icon' => '✔️',     'page' => 'compliance'],
    '/domain-status'      => ['label' => 'Domain',               'icon' => '🛡️',     'page' => 'domain-status'],
    '/users'              => ['label' => 'Users',                'icon' => '👥',     'page' => 'users'],
    '/vault'              => ['label' => 'Vault',                'icon' => '🔐',     'page' => 'vault'],
    '/audit'              => ['label' => 'Audit Log',            'icon' => '📋',     'page' => 'audit'],
    '/settings'           => ['label' => 'Settings',             'icon' => '⚙️',     'page' => 'settings'],
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
    <div class="layout">
        <aside class="sidebar">
            <div class="sidebar-header">
                <h2>AgenticMail</h2>
                <p>Enterprise Dashboard</p>
            </div>
            <nav class="nav">
<?php foreach ($_navLinks as $_href => $_link): ?>
<?php if ($_link['page'] === '_section'): ?>
                <div class="nav-section"><?= $_link['label'] ?></div>
<?php else: ?>
                <button class="nav-item<?= ($page === $_link['page']) ? ' active' : '' ?>" onclick="window.location.href='<?= $_href ?>'">
                    <span><?= $_link['icon'] ?></span>
                    <span><?= $_link['label'] ?></span>
                </button>
<?php endif; ?>
<?php endforeach; ?>
            </nav>
        </aside>

        <main class="main-content">
            <div class="topbar">
                <div class="topbar-left">
                    <div class="topbar-title"><?= Helpers::e($title) ?></div>
                </div>
                <div class="topbar-right">
                    <span><?= $_user ?></span>
                    <a href="/logout" class="btn btn-secondary btn-sm">Sign Out</a>
                    <button class="btn btn-secondary btn-sm" onclick="toggleTheme()" title="Toggle theme">🌙</button>
                </div>
            </div>
            <div class="page-content">
                <?= $_flash ?>
                <?= $content ?>
            </div>
        </main>
    </div>

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

<?php
/**
 * Dashboard page content.
 * Expects: $stats (array), $auditItems (array)
 */
include_once __DIR__ . '/components/stats.php';
include_once __DIR__ . '/components/table.php';

$statCards = [
    ['label' => 'Agents',   'value' => $stats['agents'] ?? $stats['total_agents'] ?? '0'],
    ['label' => 'Users',    'value' => $stats['users'] ?? $stats['total_users'] ?? '0'],
    ['label' => 'API Keys', 'value' => $stats['api_keys'] ?? $stats['total_api_keys'] ?? '0'],
    ['label' => 'Events',   'value' => $stats['events'] ?? $stats['total_events'] ?? '0'],
];

echo renderStats($statCards);

// Recent activity table
$headers = ['Action', 'Actor', 'Time'];
$rows = [];
foreach ($auditItems as $ev) {
    $action = Helpers::e($ev['action'] ?? $ev['event'] ?? '-');
    $actor  = Helpers::e($ev['actor'] ?? $ev['user'] ?? '-');
    $time   = Helpers::timeAgo($ev['created_at'] ?? $ev['timestamp'] ?? '-');
    $rows[] = [$action, $actor, $time];
}
?>
<div class="card">
    <h3>Recent Activity</h3>
    <?= renderTable($headers, $rows) ?>
</div>

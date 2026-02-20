<?php
/**
 * Skills page — builtin skills grid + installed community skills table.
 * Expects: $categories (array of category => skills[]), $installedItems (array of installed skills)
 */
include_once __DIR__ . '/components/table.php';
?>

<!-- Builtin Skills -->
<div class="card">
    <h3>Builtin Skills</h3>
    <?php if (empty($categories)): ?>
        <div class="empty"><span class="icon">&#128268;</span>No builtin skills found.</div>
    <?php else: ?>
        <?php foreach ($categories as $cat => $skills): ?>
            <div style="margin-bottom:16px">
                <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px"><?= Helpers::e(str_replace('-', ' ', $cat)) ?></div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
                    <?php foreach ($skills as $sk): ?>
                        <div style="padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff)">
                            <div style="font-weight:600;font-size:14px;margin-bottom:4px"><?= Helpers::e($sk['name'] ?? '') ?></div>
                            <div style="font-size:12px;color:var(--text-muted);line-height:1.4"><?= Helpers::e($sk['description'] ?? '') ?></div>
                            <?php if (!empty($sk['tools'])): ?>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:6px"><?= count($sk['tools']) ?> tools</div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<!-- Installed Community Skills -->
<?php
$headers = ['Name', 'Version', 'Status', 'Installed', 'Actions'];
$rows = [];
foreach ($installedItems as $sk) {
    $meta      = $sk['skill'] ?? $sk['manifest'] ?? $sk;
    $skillId   = Helpers::e($sk['skillId'] ?? '');
    $skillName = '<strong>' . Helpers::e($meta['name'] ?? $sk['skillId'] ?? '-') . '</strong>';
    $version   = 'v' . Helpers::e($sk['version'] ?? '0.0.0');
    $enabled   = $sk['enabled'] ?? false;
    $badge     = $enabled ? Helpers::statusBadge('active') : Helpers::statusBadge('archived');
    $installed = isset($sk['installedAt']) ? Helpers::timeAgo($sk['installedAt']) : '-';

    if ($enabled) {
        $toggleForm  = '<form method="post" action="/skills" style="display:inline">';
        $toggleForm .= '<input type="hidden" name="_action" value="disable">';
        $toggleForm .= '<input type="hidden" name="skill_id" value="' . $skillId . '">';
        $toggleForm .= '<button type="submit" class="btn btn-sm btn-secondary">Disable</button>';
        $toggleForm .= '</form>';
    } else {
        $toggleForm  = '<form method="post" action="/skills" style="display:inline">';
        $toggleForm .= '<input type="hidden" name="_action" value="enable">';
        $toggleForm .= '<input type="hidden" name="skill_id" value="' . $skillId . '">';
        $toggleForm .= '<button type="submit" class="btn btn-sm btn-primary">Enable</button>';
        $toggleForm .= '</form>';
    }

    $uninstallForm  = '<form method="post" action="/skills" style="display:inline">';
    $uninstallForm .= '<input type="hidden" name="_action" value="uninstall">';
    $uninstallForm .= '<input type="hidden" name="skill_id" value="' . $skillId . '">';
    $uninstallForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Uninstall this skill? Any active connections will be lost.\')">Uninstall</button>';
    $uninstallForm .= '</form>';

    $rows[] = [$skillName, $version, $badge, $installed, $toggleForm . ' ' . $uninstallForm];
}
?>

<div class="card">
    <h3>Installed Community Skills</h3>
    <?= renderTable($headers, $rows) ?>
</div>

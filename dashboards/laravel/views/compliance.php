<?php
/**
 * Compliance page — reports table, generate form, and download links.
 * Expects: $items (array of compliance reports)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Generate Report</h3>
    <form method="post" action="/compliance" class="inline-form">
        <input type="hidden" name="_action" value="generate">
        <div class="form-group" style="min-width:140px;margin-bottom:0">
            <select name="type">
                <option value="soc2">SOC 2</option>
                <option value="gdpr">GDPR</option>
                <option value="audit">Audit</option>
            </select>
        </div>
        <div class="form-group" style="min-width:140px;margin-bottom:0">
            <input type="date" name="start_date" placeholder="Start date" required>
        </div>
        <div class="form-group" style="min-width:140px;margin-bottom:0">
            <input type="date" name="end_date" placeholder="End date" required>
        </div>
        <button type="submit" class="btn btn-primary">Generate</button>
    </form>
</div>

<?php
$headers = ['Report', 'Type', 'Status', 'Generated', 'Download'];
$rows = [];
foreach ($items as $r) {
    $name   = '<strong>' . Helpers::e($r['name'] ?? $r['title'] ?? '-') . '</strong>';
    $type   = Helpers::statusBadge($r['type'] ?? 'soc2');
    $status = Helpers::statusBadge($r['status'] ?? 'pending');
    $time   = Helpers::timeAgo($r['created_at'] ?? $r['generatedAt'] ?? '-');

    $downloadUrl = Helpers::e($r['downloadUrl'] ?? $r['url'] ?? '#');
    $download = '<a href="' . $downloadUrl . '" class="btn btn-sm btn-primary" target="_blank">Download</a>';

    $rows[] = [$name, $type, $status, $time, $download];
}
?>

<div class="card">
    <h3>Compliance Reports</h3>
    <?= renderTable($headers, $rows) ?>
</div>

<?php
/**
 * Guardrails page — agent controls, interventions, and anomaly rules.
 * Expects: $interventionItems (array of interventions), $anomalyRuleItems (array of anomaly rules)
 */
include_once __DIR__ . '/components/table.php';

$headers = ['Agent', 'Reason', 'Status', 'Time', 'Actions'];
$rows = [];
foreach ($interventionItems as $i) {
    $id     = Helpers::e($i['id'] ?? '');
    $agent  = '<strong>' . Helpers::e($i['agent'] ?? $i['agentName'] ?? '-') . '</strong>';
    $reason = Helpers::e($i['reason'] ?? '-');
    $status = Helpers::statusBadge($i['status'] ?? 'active');
    $time   = Helpers::timeAgo($i['created_at'] ?? $i['timestamp'] ?? '-');

    $actions = '';

    $pauseForm  = '<form method="post" action="/guardrails" style="display:inline">';
    $pauseForm .= '<input type="hidden" name="_action" value="pause">';
    $pauseForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $pauseForm .= '<button type="submit" class="btn btn-sm btn-warning">Pause</button>';
    $pauseForm .= '</form> ';

    $resumeForm  = '<form method="post" action="/guardrails" style="display:inline">';
    $resumeForm .= '<input type="hidden" name="_action" value="resume">';
    $resumeForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $resumeForm .= '<button type="submit" class="btn btn-sm btn-primary">Resume</button>';
    $resumeForm .= '</form> ';

    $killForm  = '<form method="post" action="/guardrails" style="display:inline">';
    $killForm .= '<input type="hidden" name="_action" value="kill">';
    $killForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $killForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Kill this guardrail?\')">Kill</button>';
    $killForm .= '</form>';

    $actions = $pauseForm . $resumeForm . $killForm;

    $rows[] = [$agent, $reason, $status, $time, $actions];
}
?>

<div class="card">
    <h3>Interventions</h3>
    <?= renderTable($headers, $rows) ?>
</div>

<div class="card">
    <h3>Create Anomaly Rule</h3>
    <form method="post" action="/guardrails" class="inline-form">
        <input type="hidden" name="_action" value="create_rule">
        <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0">
            <input type="text" name="name" placeholder="Rule name" required>
        </div>
        <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0">
            <input type="text" name="condition" placeholder="Condition" required>
        </div>
        <div class="form-group" style="min-width:120px;margin-bottom:0">
            <select name="action">
                <option value="alert">Alert</option>
                <option value="block">Block</option>
                <option value="pause">Pause</option>
            </select>
        </div>
        <div class="form-group" style="min-width:100px;margin-bottom:0">
            <input type="number" name="threshold" placeholder="Threshold" min="0" value="0">
        </div>
        <button type="submit" class="btn btn-primary">Create</button>
    </form>
</div>

<?php
$aHeaders = ['Name', 'Condition', 'Action', 'Threshold', 'Actions'];
$aRows = [];
foreach ($anomalyRuleItems as $r) {
    $id        = Helpers::e($r['id'] ?? '');
    $name      = '<strong>' . Helpers::e($r['name'] ?? '-') . '</strong>';
    $condition = Helpers::e($r['condition'] ?? '-');
    $action    = Helpers::statusBadge($r['action'] ?? 'alert');
    $threshold = Helpers::e((string)($r['threshold'] ?? '0'));

    $deleteForm  = '<form method="post" action="/guardrails" style="display:inline">';
    $deleteForm .= '<input type="hidden" name="_action" value="delete_rule">';
    $deleteForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $deleteForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Delete this rule?\')">Delete</button>';
    $deleteForm .= '</form>';

    $aRows[] = [$name, $condition, $action, $threshold, $deleteForm];
}
?>

<div class="card">
    <h3>Anomaly Rules</h3>
    <?= renderTable($aHeaders, $aRows) ?>
</div>

<?php
/**
 * Messages page — message table and send form.
 * Expects: $items (array of message records)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Send Message</h3>
    <form method="post" action="/messages" class="inline-form">
        <input type="hidden" name="_action" value="send">
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="to" placeholder="Recipient" required>
        </div>
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="subject" placeholder="Subject" required>
        </div>
        <div class="form-group" style="flex:2;min-width:200px;margin-bottom:0">
            <input type="text" name="body" placeholder="Message body" required>
        </div>
        <button type="submit" class="btn btn-primary">Send</button>
    </form>
</div>

<?php
$headers = ['To', 'Subject', 'Direction', 'Channel', 'Status', 'Time'];
$rows = [];
foreach ($items as $m) {
    $to      = Helpers::e($m['to'] ?? $m['recipient'] ?? '-');
    $subject = '<strong>' . Helpers::e($m['subject'] ?? '-') . '</strong>';

    $direction = $m['direction'] ?? 'inbound';
    $dirVariant = match (strtolower($direction)) {
        'inbound'  => 'primary',
        'outbound' => 'success',
        'internal' => 'default',
        default    => 'default',
    };
    $dirBadge = Helpers::badge($direction, $dirVariant);

    $channel = $m['channel'] ?? 'email';
    $chanVariant = match (strtolower($channel)) {
        'email'    => 'primary',
        'api'      => 'warning',
        'internal' => 'default',
        'webhook'  => 'info',
        default    => 'default',
    };
    $chanBadge = Helpers::badge($channel, $chanVariant);

    $status  = Helpers::statusBadge($m['status'] ?? 'pending');
    $time    = Helpers::timeAgo($m['created_at'] ?? $m['timestamp'] ?? '-');
    $rows[]  = [$to, $subject, $dirBadge, $chanBadge, $status, $time];
}
?>

<div class="card">
    <h3>Messages</h3>
    <?= renderTable($headers, $rows) ?>
</div>

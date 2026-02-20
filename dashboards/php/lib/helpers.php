<?php
/**
 * AgenticMail Helper Functions
 */

/**
 * HTML-escape a string.
 */
function e(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

/**
 * Render a colored badge for status/role values.
 */
function badge(string $status): string {
    $colors = [
        'active' => '#22c55e',
        'archived' => '#888',
        'suspended' => '#ef4444',
        'owner' => '#f59e0b',
        'admin' => '#e84393',
        'member' => '#888',
        'viewer' => '#555',
    ];
    $c = $colors[$status] ?? '#888';
    return "<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:{$c}20;color:$c'>$status</span>";
}

/**
 * Render a status badge (alias with semantic naming).
 */
function status_badge(string $status): string {
    return badge($status);
}

/**
 * Format an ISO timestamp as a relative time string.
 */
function time_ago(string $iso): string {
    $ts = strtotime($iso);
    if ($ts === false) return $iso;
    $diff = time() - $ts;
    if ($diff < 60) return 'just now';
    if ($diff < 3600) return floor($diff / 60) . 'm ago';
    if ($diff < 86400) return floor($diff / 3600) . 'h ago';
    if ($diff < 604800) return floor($diff / 86400) . 'd ago';
    return date('M j, Y', $ts);
}

/**
 * Set a flash message in the session.
 */
function set_flash(string $msg, string $type = 'success'): void {
    $_SESSION['flash'] = ['msg' => $msg, 'type' => $type];
}

/**
 * Get and clear the flash message from session.
 * Returns null if no flash message is set.
 */
function get_flash(): ?array {
    if (isset($_SESSION['flash'])) {
        $flash = $_SESSION['flash'];
        unset($_SESSION['flash']);
        return $flash;
    }
    return null;
}

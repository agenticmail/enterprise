<?php
/**
 * Helpers — utility functions for the dashboard.
 */
class Helpers
{
    /**
     * HTML-escape a string.
     */
    public static function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    }

    /**
     * Render a badge span.
     */
    public static function badge(string $text, string $type = 'default'): string
    {
        $safe = self::e($text);
        return '<span class="badge badge-' . self::e($type) . '">' . $safe . '</span>';
    }

    /**
     * Render a status badge with automatic color mapping.
     */
    public static function statusBadge(string $status): string
    {
        $map = [
            'active'   => 'success',
            'archived' => 'danger',
            'revoked'  => 'danger',
            'pending'  => 'warning',
            'admin'    => 'primary',
            'owner'    => 'warning',
            'member'   => 'member',
            'viewer'   => 'viewer',
        ];
        $type = $map[strtolower($status)] ?? 'default';
        return self::badge($status, $type);
    }

    /**
     * Convert an ISO datetime string to a human-readable "time ago" format.
     */
    public static function timeAgo(string $iso): string
    {
        if (empty($iso) || $iso === '-') return $iso;
        try {
            $time = new DateTime($iso);
            $now  = new DateTime('now', new DateTimeZone('UTC'));
            $diff = $now->getTimestamp() - $time->getTimestamp();

            if ($diff < 60) return 'just now';
            if ($diff < 3600) return floor($diff / 60) . 'm ago';
            if ($diff < 86400) return floor($diff / 3600) . 'h ago';
            if ($diff < 604800) return floor($diff / 86400) . 'd ago';
            return $time->format('M j, Y');
        } catch (Exception $e) {
            return self::e($iso);
        }
    }

    /**
     * Set a flash message in the session.
     */
    public static function setFlash(string $message, string $type = 'success'): void
    {
        $_SESSION['flash'] = ['message' => $message, 'type' => $type];
    }

    /**
     * Get and clear the flash message from the session.
     * Returns null if no flash is set.
     */
    public static function getFlash(): ?array
    {
        if (!isset($_SESSION['flash'])) return null;
        $flash = $_SESSION['flash'];
        unset($_SESSION['flash']);
        return $flash;
    }

    /**
     * Render flash message HTML (if any).
     */
    public static function renderFlash(): string
    {
        $flash = self::getFlash();
        if (!$flash) return '';
        $msg  = self::e($flash['message']);
        $type = self::e($flash['type']);
        return '<div class="flash flash-' . $type . '">' . $msg . '</div>';
    }

    /**
     * Check if current user is authenticated.
     */
    public static function authenticated(): bool
    {
        return !empty($_SESSION['token']) && !empty($_SESSION['user']);
    }

    /**
     * Redirect to login if not authenticated.
     */
    public static function requireAuth(): void
    {
        if (!self::authenticated()) {
            header('Location: /login');
            exit;
        }
    }

    /**
     * Redirect to a URL.
     */
    public static function redirect(string $url): void
    {
        header('Location: ' . $url);
        exit;
    }
}

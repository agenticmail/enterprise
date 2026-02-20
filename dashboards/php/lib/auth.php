<?php
/**
 * AgenticMail Authentication Helpers
 */

/**
 * Handle login POST action.
 * Sets session token and user on success, sets flash error on failure.
 */
function handle_login(): void {
    $data = am_api('/auth/login', 'POST', [
        'email' => $_POST['email'] ?? '',
        'password' => $_POST['password'] ?? '',
    ]);
    if (isset($data['token'])) {
        $_SESSION['am_token'] = $data['token'];
        $_SESSION['am_user'] = $data['user'];
    } else {
        set_flash($data['error'] ?? 'Login failed', 'error');
    }
}

/**
 * Handle logout: destroy session and redirect.
 */
function handle_logout(): void {
    session_destroy();
    header('Location: ?');
    exit;
}

/**
 * Check if user is currently logged in.
 */
function is_logged_in(): bool {
    return !empty($_SESSION['am_token']);
}

/**
 * Require authentication. Redirects to login if not authenticated.
 */
function require_auth(): void {
    if (!is_logged_in()) {
        header('Location: ?page=login');
        exit;
    }
}

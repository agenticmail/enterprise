<?php
/**
 * AuthController — login, doLogin, logout
 */
class AuthController
{
    /**
     * Show the login form.
     */
    public function login(): void
    {
        $error = '';
        include __DIR__ . '/../views/login.php';
    }

    /**
     * Handle login form submission.
     */
    public function doLogin(): void
    {
        $email    = $_POST['email'] ?? '';
        $password = $_POST['password'] ?? '';

        $res = Api::request('POST', '/auth/login', compact('email', 'password'));

        if (Api::ok($res) && !empty($res['token'])) {
            $_SESSION['token'] = $res['token'];
            $_SESSION['user']  = $res['user'] ?? ['email' => $email];
            Helpers::redirect('/');
        }

        $error = $res['message'] ?? $res['_error'] ?? 'Login failed. Check credentials.';
        include __DIR__ . '/../views/login.php';
    }

    /**
     * Log out and redirect to login.
     */
    public function logout(): void
    {
        session_destroy();
        Helpers::redirect('/login');
    }
}

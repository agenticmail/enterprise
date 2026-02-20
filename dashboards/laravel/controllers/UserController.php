<?php
/**
 * UserController — list and create users.
 */
class UserController
{
    /**
     * List all users.
     */
    public function index(): void
    {
        $users = Api::request('GET', '/api/users');

        $title   = 'Users';
        $page    = 'users';
        $content = $this->render($users);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Create a new user.
     */
    public function store(): void
    {
        $payload = [
            'name'  => $_POST['name'] ?? '',
            'email' => $_POST['email'] ?? '',
            'role'  => $_POST['role'] ?? 'member',
        ];
        $res = Api::request('POST', '/api/users', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('User created successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error creating user.', 'danger');
        }
        Helpers::redirect('/users');
    }

    private function render(array $users): string
    {
        ob_start();
        $items = Api::items($users);
        include __DIR__ . '/../views/users.php';
        return ob_get_clean();
    }
}

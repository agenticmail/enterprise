<?php
/**
 * VaultController — list secrets, create, delete, rotate.
 */
class VaultController
{
    /**
     * List all vault secrets.
     */
    public function index(): void
    {
        $secrets = Api::request('GET', '/engine/vault/secrets?orgId=default');

        $title   = 'Vault';
        $page    = 'vault';
        $content = $this->render($secrets);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Create a new secret.
     */
    public function store(): void
    {
        $payload = [
            'orgId'    => 'default',
            'name'     => $_POST['name'] ?? '',
            'value'    => $_POST['value'] ?? '',
            'category' => $_POST['category'] ?? 'custom',
        ];
        $res = Api::request('POST', '/engine/vault/secrets', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('Secret stored securely.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error storing secret.', 'danger');
        }
        Helpers::redirect('/vault');
    }

    /**
     * Delete a secret by ID.
     */
    public function delete(string $id): void
    {
        $res = Api::request('DELETE', '/engine/vault/secrets/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('Secret deleted.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error deleting secret.', 'danger');
        }
        Helpers::redirect('/vault');
    }

    /**
     * Rotate a single secret by ID.
     */
    public function rotate(string $id): void
    {
        $res = Api::request('POST', '/engine/vault/secrets/' . urlencode($id) . '/rotate');

        if (Api::ok($res)) {
            Helpers::setFlash('Secret rotated.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error rotating secret.', 'danger');
        }
        Helpers::redirect('/vault');
    }

    /**
     * Rotate all secrets.
     */
    public function rotateAll(): void
    {
        $res = Api::request('POST', '/engine/vault/rotate-all', ['orgId' => 'default']);

        if (Api::ok($res)) {
            $count = $res['rotated'] ?? 0;
            Helpers::setFlash("Rotated $count secrets.", 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error rotating secrets.', 'danger');
        }
        Helpers::redirect('/vault');
    }

    private function render(array $secrets): string
    {
        ob_start();
        $items = $secrets['secrets'] ?? $secrets['entries'] ?? Api::items($secrets);
        include __DIR__ . '/../views/vault.php';
        return ob_get_clean();
    }
}

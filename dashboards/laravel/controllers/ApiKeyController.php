<?php
/**
 * ApiKeyController — list, create, and revoke API keys.
 */
class ApiKeyController
{
    /**
     * List all API keys.
     */
    public function index(): void
    {
        $keys = Api::request('GET', '/api/api-keys');

        // Check for a newly created key in the session (show-once banner)
        $newKey = null;
        if (isset($_SESSION['new_api_key'])) {
            $newKey = $_SESSION['new_api_key'];
            unset($_SESSION['new_api_key']);
        }

        $title   = 'API Keys';
        $page    = 'api-keys';
        $content = $this->render($keys, $newKey);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Create a new API key.
     */
    public function store(): void
    {
        $payload = [
            'name'   => $_POST['name'] ?? '',
            'scopes' => $_POST['scopes'] ?? 'read',
        ];
        $res = Api::request('POST', '/api/api-keys', $payload);

        if (Api::ok($res)) {
            // Store the full key for show-once banner display
            $fullKey = $res['key'] ?? $res['api_key'] ?? $res['token'] ?? null;
            if ($fullKey) {
                $_SESSION['new_api_key'] = $fullKey;
            }
            Helpers::setFlash('API key created successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error creating API key.', 'danger');
        }
        Helpers::redirect('/api-keys');
    }

    /**
     * Revoke an API key by ID.
     */
    public function revoke(string $id): void
    {
        $res = Api::request('DELETE', '/api/api-keys/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('API key revoked successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error revoking API key.', 'danger');
        }
        Helpers::redirect('/api-keys');
    }

    private function render(array $keys, ?string $newKey): string
    {
        ob_start();
        $items = Api::items($keys);
        include __DIR__ . '/../views/api-keys.php';
        return ob_get_clean();
    }
}

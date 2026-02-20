<?php
/**
 * DlpController — list rules, create/delete rules, and run scans.
 */
class DlpController
{
    /**
     * List DLP rules and violations.
     */
    public function index(): void
    {
        $rules      = Api::request('GET', '/engine/dlp/rules?orgId=default');
        $violations = Api::request('GET', '/engine/dlp/violations');

        $title   = 'Data Loss Prevention';
        $page    = 'dlp';
        $content = $this->render($rules, $violations);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Create a new DLP rule.
     */
    public function createRule(): void
    {
        $payload = [
            'name'     => $_POST['name'] ?? '',
            'pattern'  => $_POST['pattern'] ?? '',
            'action'   => $_POST['action'] ?? 'block',
            'severity' => $_POST['severity'] ?? 'high',
        ];
        $res = Api::request('POST', '/engine/dlp/rules?orgId=default', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('DLP rule created successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error creating DLP rule.', 'danger');
        }
        Helpers::redirect('/dlp');
    }

    /**
     * Delete a DLP rule by ID.
     */
    public function deleteRule(string $id): void
    {
        $res = Api::request('DELETE', '/engine/dlp/rules/' . urlencode($id) . '?orgId=default');

        if (Api::ok($res)) {
            Helpers::setFlash('DLP rule deleted successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error deleting DLP rule.', 'danger');
        }
        Helpers::redirect('/dlp');
    }

    /**
     * Run a DLP scan on provided content.
     */
    public function scan(): void
    {
        $payload = [
            'content' => $_POST['content'] ?? '',
        ];
        $res = Api::request('POST', '/engine/dlp/scan', $payload);

        if (Api::ok($res)) {
            $matches = $res['matches'] ?? $res['violations'] ?? [];
            if (empty($matches)) {
                Helpers::setFlash('Scan complete — no violations found.', 'success');
            } else {
                Helpers::setFlash('Scan complete — ' . count($matches) . ' violation(s) detected.', 'warning');
            }
        } else {
            Helpers::setFlash($res['message'] ?? 'Error running DLP scan.', 'danger');
        }
        Helpers::redirect('/dlp');
    }

    private function render(array $rules, array $violations): string
    {
        ob_start();
        $ruleItems      = Api::items($rules);
        $violationItems = Api::items($violations);
        include __DIR__ . '/../views/dlp.php';
        return ob_get_clean();
    }
}

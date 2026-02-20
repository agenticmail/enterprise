<?php
/**
 * AuditController — paginated audit log.
 */
class AuditController
{
    /**
     * Show paginated audit events.
     */
    public function index(): void
    {
        $currentPage = max(1, intval($_GET['page'] ?? 1));
        $limit       = 25;
        $offset      = ($currentPage - 1) * $limit;

        $audit = Api::request('GET', "/api/audit?limit={$limit}&offset={$offset}");

        $title   = 'Audit Log';
        $page    = 'audit';
        $content = $this->render($audit, $currentPage);
        include __DIR__ . '/../views/layout.php';
    }

    private function render(array $audit, int $currentPage): string
    {
        ob_start();
        $items = Api::items($audit);
        include __DIR__ . '/../views/audit.php';
        return ob_get_clean();
    }
}

<?php
/**
 * DashboardController — main dashboard with stats and recent audit.
 */
class DashboardController
{
    /**
     * Show the dashboard page.
     */
    public function index(): void
    {
        $stats = Api::request('GET', '/api/stats');
        $audit = Api::request('GET', '/api/audit?limit=8');

        $title   = 'Dashboard';
        $page    = 'dashboard';
        $content = $this->render($stats, $audit);
        include __DIR__ . '/../views/layout.php';
    }

    private function render(array $stats, array $audit): string
    {
        ob_start();
        $auditItems = Api::items($audit);
        include __DIR__ . '/../views/dashboard.php';
        return ob_get_clean();
    }
}

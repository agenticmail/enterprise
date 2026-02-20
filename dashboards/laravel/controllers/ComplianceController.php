<?php
/**
 * ComplianceController — list reports, generate new reports, and download.
 */
class ComplianceController
{
    /**
     * List compliance reports.
     */
    public function index(): void
    {
        $reports = Api::request('GET', '/engine/compliance/reports');

        $title   = 'Compliance';
        $page    = 'compliance';
        $content = $this->render($reports);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Generate a new compliance report.
     */
    public function generate(): void
    {
        $type = $_POST['type'] ?? 'soc2';
        $endpoints = [
            'soc2' => '/engine/compliance/reports/soc2',
            'gdpr' => '/gdpr',
            'audit' => '/audit',
        ];
        $path = $endpoints[$type] ?? '/engine/compliance/reports/' . urlencode($type);

        $payload = [
            'type'      => $type,
            'startDate' => $_POST['start_date'] ?? '',
            'endDate'   => $_POST['end_date'] ?? '',
        ];
        $res = Api::request('POST', $path, $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('Compliance report generated successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error generating compliance report.', 'danger');
        }
        Helpers::redirect('/compliance');
    }

    private function render(array $reports): string
    {
        ob_start();
        $items = Api::items($reports);
        include __DIR__ . '/../views/compliance.php';
        return ob_get_clean();
    }
}

<?php
/**
 * JournalController — list journal entries, stats, and rollback.
 */
class JournalController
{
    /**
     * List journal entries and stats.
     */
    public function index(): void
    {
        $stats   = Api::request('GET', '/engine/journal/stats/default');
        $entries = Api::request('GET', '/engine/journal');

        $title   = 'Journal';
        $page    = 'journal';
        $content = $this->render($stats, $entries);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Rollback a journal entry by ID.
     */
    public function rollback(string $id): void
    {
        $res = Api::request('POST', '/engine/journal/' . urlencode($id) . '/rollback');

        if (Api::ok($res)) {
            Helpers::setFlash('Journal entry rolled back successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error rolling back journal entry.', 'danger');
        }
        Helpers::redirect('/journal');
    }

    private function render(array $stats, array $entries): string
    {
        ob_start();
        $statData    = $stats;
        $entryItems  = Api::items($entries);
        include __DIR__ . '/../views/journal.php';
        return ob_get_clean();
    }
}

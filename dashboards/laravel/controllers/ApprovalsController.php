<?php
/**
 * ApprovalsController — Manage pending approvals and approval history
 */
class ApprovalsController
{
    public function index()
    {
        $title = 'Approvals';
        $page = 'approvals';
        
        ob_start();
        include __DIR__ . '/../views/approvals.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
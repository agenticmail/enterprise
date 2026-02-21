<?php
/**
 * DomainStatusController — Domain health and email security status
 */
class DomainStatusController
{
    public function index()
    {
        $title = 'Domain Status';
        $page = 'domain-status';
        
        ob_start();
        include __DIR__ . '/../views/domain-status.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
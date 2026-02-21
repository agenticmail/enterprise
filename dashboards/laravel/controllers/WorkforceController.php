<?php
/**
 * WorkforceController — Agent workforce management and scheduling
 */
class WorkforceController
{
    public function index()
    {
        $title = 'Workforce';
        $page = 'workforce';
        
        ob_start();
        include __DIR__ . '/../views/workforce.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
<?php
/**
 * ActivityController — Shows recent agent activity and system events
 */
class ActivityController
{
    public function index()
    {
        $title = 'Activity';
        $page = 'activity';
        
        ob_start();
        include __DIR__ . '/../views/activity.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
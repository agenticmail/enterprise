<?php
/**
 * SkillConnectionsController — Manage skill integrations and connections
 */
class SkillConnectionsController
{
    public function index()
    {
        $title = 'Skill Connections';
        $page = 'skill-connections';
        
        ob_start();
        include __DIR__ . '/../views/skill-connections.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
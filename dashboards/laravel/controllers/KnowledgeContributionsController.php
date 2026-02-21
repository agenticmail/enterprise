<?php
/**
 * KnowledgeContributionsController — Community knowledge sharing hub
 */
class KnowledgeContributionsController
{
    public function index()
    {
        $title = 'Knowledge Hub';
        $page = 'knowledge-contributions';
        
        ob_start();
        include __DIR__ . '/../views/knowledge-contributions.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
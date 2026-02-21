<?php
/**
 * KnowledgeController — Knowledge base management
 */
class KnowledgeController
{
    public function index()
    {
        $title = 'Knowledge Bases';
        $page = 'knowledge';
        
        ob_start();
        include __DIR__ . '/../views/knowledge.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
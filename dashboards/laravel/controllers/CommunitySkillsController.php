<?php
/**
 * CommunitySkillsController — Browse and install community-contributed skills
 */
class CommunitySkillsController
{
    public function index()
    {
        $title = 'Community Skills';
        $page = 'community-skills';
        
        ob_start();
        include __DIR__ . '/../views/community-skills.php';
        $content = ob_get_clean();
        
        include __DIR__ . '/../views/layout.php';
    }
}
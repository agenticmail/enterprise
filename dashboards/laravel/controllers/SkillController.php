<?php
/**
 * SkillController — list builtin skills, manage installed community skills.
 */
class SkillController
{
    /**
     * List builtin and installed skills.
     */
    public function index(): void
    {
        $builtin   = Api::request('GET', '/engine/skills/by-category');
        $installed = Api::request('GET', '/engine/community/installed?orgId=default');

        $title   = 'Skills';
        $page    = 'skills';
        $content = $this->render($builtin, $installed);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Enable a community skill.
     */
    public function enable(string $skillId): void
    {
        $res = Api::request('PUT', '/engine/community/skills/' . urlencode($skillId) . '/enable', ['orgId' => 'default']);

        if (Api::ok($res)) {
            Helpers::setFlash('Skill enabled.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error enabling skill.', 'danger');
        }
        Helpers::redirect('/skills');
    }

    /**
     * Disable a community skill.
     */
    public function disable(string $skillId): void
    {
        $res = Api::request('PUT', '/engine/community/skills/' . urlencode($skillId) . '/disable', ['orgId' => 'default']);

        if (Api::ok($res)) {
            Helpers::setFlash('Skill disabled.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error disabling skill.', 'danger');
        }
        Helpers::redirect('/skills');
    }

    /**
     * Uninstall a community skill.
     */
    public function uninstall(string $skillId): void
    {
        $res = Api::request('DELETE', '/engine/community/skills/' . urlencode($skillId) . '/uninstall', ['orgId' => 'default']);

        if (Api::ok($res)) {
            Helpers::setFlash('Skill uninstalled.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? $res['error'] ?? 'Error uninstalling skill.', 'danger');
        }
        Helpers::redirect('/skills');
    }

    private function render(array $builtin, array $installed): string
    {
        ob_start();
        $categories    = $builtin['categories'] ?? [];
        $installedItems = $installed['installed'] ?? Api::items($installed);
        include __DIR__ . '/../views/skills.php';
        return ob_get_clean();
    }
}

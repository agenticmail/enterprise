<?php
/**
 * AgentController — list, create, and archive agents.
 */
class AgentController
{
    /**
     * List all agents.
     */
    public function index(): void
    {
        $agents = Api::request('GET', '/api/agents');

        $title   = 'Agents';
        $page    = 'agents';
        $content = $this->render($agents);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Create a new agent.
     */
    public function store(): void
    {
        $payload = [
            'name'        => $_POST['name'] ?? '',
            'description' => $_POST['description'] ?? '',
            'provider'    => $_POST['provider'] ?? 'anthropic',
        ];
        $soulId = $_POST['soul_id'] ?? '';
        if (!empty($soulId)) {
            $payload['soul_id'] = $soulId;
        }
        $persona = [
            'gender' => $_POST['gender'] ?: null,
            'dateOfBirth' => !empty($_POST['date_of_birth']) ? $_POST['date_of_birth'] : null,
            'maritalStatus' => $_POST['marital_status'] ?: null,
            'culturalBackground' => $_POST['cultural_background'] ?: null,
            'language' => $_POST['language'] ?: null,
            'traits' => [
                'communication' => $_POST['trait_communication'] ?? 'direct',
                'detail' => $_POST['trait_detail'] ?? 'detail-oriented',
                'energy' => $_POST['trait_energy'] ?? 'calm',
                'humor' => $_POST['humor'] ?? 'warm',
                'formality' => $_POST['formality'] ?? 'adaptive',
                'empathy' => $_POST['empathy'] ?? 'moderate',
                'patience' => $_POST['patience'] ?? 'patient',
                'creativity' => $_POST['creativity'] ?? 'creative',
            ],
        ];
        $payload['persona'] = $persona;
        $res = Api::request('POST', '/api/agents', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('Agent created successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error creating agent.', 'danger');
        }
        Helpers::redirect('/agents');
    }

    /**
     * Archive an agent by ID.
     */
    public function archive(string $id): void
    {
        $res = Api::request('DELETE', '/api/agents/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('Agent archived successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error archiving agent.', 'danger');
        }
        Helpers::redirect('/agents');
    }

    /**
     * Show a single agent's detail page.
     */
    public function show(string $id): void
    {
        $agent = Api::request('GET', '/api/agents/' . urlencode($id));

        // Fetch activity data
        $events = [];
        $tool_calls = [];
        $journal_entries = [];
        try {
            $evRes = Api::request('GET', '/api/engine/activity/events?agentId=' . urlencode($id) . '&limit=50');
            $events = Api::ok($evRes) ? Api::items($evRes) : [];
        } catch (\Exception $ex) { /* ignore */ }
        try {
            $tcRes = Api::request('GET', '/api/engine/activity/tool-calls?agentId=' . urlencode($id) . '&limit=50');
            $tool_calls = Api::ok($tcRes) ? Api::items($tcRes) : [];
        } catch (\Exception $ex) { /* ignore */ }
        try {
            $jRes = Api::request('GET', '/api/engine/journal?agentId=' . urlencode($id) . '&orgId=default&limit=50');
            $journal_entries = Api::ok($jRes) ? Api::items($jRes) : [];
        } catch (\Exception $ex) { /* ignore */ }

        // Fetch tool security data
        $toolSecData = [];
        try {
            $toolSecData = Api::request('GET', '/engine/agents/' . urlencode($id) . '/tool-security');
        } catch (\Exception $ex) { /* ignore */ }

        $title   = 'Agent Detail';
        $page    = 'agents';
        $content = $this->renderDetail($agent, $id, $events, $tool_calls, $journal_entries, $toolSecData);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Save agent-level tool security overrides.
     */
    public function saveToolSecurity(string $id): void
    {
        $parseList = function(string $field): array {
            $val = trim($_POST[$field] ?? '');
            if ($val === '') return [];
            return array_values(array_filter(array_map('trim', explode(',', $val))));
        };

        $body = [
            'toolSecurity' => [
                'security' => [
                    'pathSandbox' => [
                        'enabled' => isset($_POST['ps_enabled']),
                        'allowedDirs' => $parseList('ps_allowedDirs'),
                        'blockedPatterns' => $parseList('ps_blockedPatterns'),
                    ],
                    'ssrf' => [
                        'enabled' => isset($_POST['ssrf_enabled']),
                        'allowedHosts' => $parseList('ssrf_allowedHosts'),
                        'blockedCidrs' => $parseList('ssrf_blockedCidrs'),
                    ],
                    'commandSanitizer' => [
                        'enabled' => isset($_POST['cs_enabled']),
                        'mode' => $_POST['cs_mode'] ?? 'blocklist',
                        'allowedCommands' => $parseList('cs_allowedCommands'),
                        'blockedPatterns' => $parseList('cs_blockedPatterns'),
                    ],
                ],
                'middleware' => [
                    'audit' => [
                        'enabled' => isset($_POST['audit_enabled']),
                        'redactKeys' => $parseList('audit_redactKeys'),
                    ],
                    'rateLimit' => [
                        'enabled' => isset($_POST['rl_enabled']),
                    ],
                    'circuitBreaker' => [
                        'enabled' => isset($_POST['cb_enabled']),
                    ],
                    'telemetry' => [
                        'enabled' => isset($_POST['tel_enabled']),
                    ],
                ],
            ],
            'updatedBy' => 'dashboard',
        ];

        $res = Api::request('PATCH', '/engine/agents/' . urlencode($id) . '/tool-security', $body);

        if (Api::ok($res)) {
            Helpers::setFlash('Agent tool security saved successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error saving agent tool security.', 'danger');
        }
        Helpers::redirect('/agents/' . urlencode($id));
    }

    /**
     * Reset agent-level tool security to org defaults.
     */
    public function resetToolSecurity(string $id): void
    {
        $res = Api::request('PATCH', '/engine/agents/' . urlencode($id) . '/tool-security', [
            'toolSecurity' => (object)[],
            'updatedBy' => 'dashboard',
        ]);

        if (Api::ok($res)) {
            Helpers::setFlash('Agent tool security reset to org defaults.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error resetting agent tool security.', 'danger');
        }
        Helpers::redirect('/agents/' . urlencode($id));
    }

    /**
     * Deploy an agent by ID.
     */
    public function deploy(string $id): void
    {
        $res = Api::request('POST', '/engine/agents/' . urlencode($id) . '/deploy');

        if (Api::ok($res)) {
            Helpers::setFlash('Agent deployed successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error deploying agent.', 'danger');
        }
        Helpers::redirect('/agents/' . urlencode($id));
    }

    /**
     * Stop an agent by ID.
     */
    public function stop(string $id): void
    {
        $res = Api::request('POST', '/engine/agents/' . urlencode($id) . '/stop');

        if (Api::ok($res)) {
            Helpers::setFlash('Agent stopped successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error stopping agent.', 'danger');
        }
        Helpers::redirect('/agents/' . urlencode($id));
    }

    /**
     * Restart an agent by ID.
     */
    public function restart(string $id): void
    {
        $res = Api::request('POST', '/engine/agents/' . urlencode($id) . '/restart');

        if (Api::ok($res)) {
            Helpers::setFlash('Agent restarted successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error restarting agent.', 'danger');
        }
        Helpers::redirect('/agents/' . urlencode($id));
    }

    private function render(array $agents): string
    {
        ob_start();
        $items = Api::items($agents);
        include __DIR__ . '/../views/agents.php';
        return ob_get_clean();
    }

    private function renderDetail(array $agent, string $agentId, array $events = [], array $tool_calls = [], array $journal_entries = [], array $toolSecData = []): string
    {
        ob_start();
        include __DIR__ . '/../views/agent-detail.php';
        return ob_get_clean();
    }
}

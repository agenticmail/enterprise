<?php
/**
 * SettingController — read and update settings + tool security.
 */
class SettingController
{
    /**
     * Show settings form.
     */
    public function index(): void
    {
        $settings = Api::request('GET', '/api/settings');
        $tab = $_GET['tab'] ?? 'general';

        // Load tool security config for the security tab
        $toolSecConfig = [];
        if ($tab === 'security') {
            $toolSecRes = Api::request('GET', '/api/settings/tool-security');
            $toolSecConfig = $toolSecRes['toolSecurityConfig'] ?? [];
        }

        // Load firewall config for the firewall tab
        $firewallConfig = [];
        if ($tab === 'firewall') {
            $fwRes = Api::request('GET', '/api/settings/firewall');
            $firewallConfig = $fwRes['firewallConfig'] ?? $fwRes ?? [];
        }

        // Load model pricing config for the pricing tab
        $modelPricingConfig = [];
        if ($tab === 'pricing') {
            $mpRes = Api::request('GET', '/api/settings/model-pricing');
            $modelPricingConfig = $mpRes['modelPricingConfig'] ?? [];
        }

        $title   = 'Settings';
        $page    = 'settings';
        $content = $this->render($settings, $tab, $toolSecConfig, $firewallConfig, $modelPricingConfig);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Save settings changes.
     */
    public function update(): void
    {
        $payload = [];
        foreach ($_POST as $k => $v) {
            if ($k[0] !== '_') {
                $payload[$k] = $v;
            }
        }

        $res = Api::request('PATCH', '/api/settings', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('Settings saved successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error saving settings.', 'danger');
        }
        Helpers::redirect('/settings');
    }

    /**
     * Save tool security settings.
     */
    public function updateToolSecurity(): void
    {
        $parseList = function(string $field): array {
            $val = trim($_POST[$field] ?? '');
            if ($val === '') return [];
            return array_values(array_filter(array_map('trim', explode(',', $val))));
        };

        $body = [
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
                    'overrides' => (object)[],
                ],
                'circuitBreaker' => [
                    'enabled' => isset($_POST['cb_enabled']),
                ],
                'telemetry' => [
                    'enabled' => isset($_POST['tel_enabled']),
                ],
            ],
        ];

        $res = Api::request('PUT', '/api/settings/tool-security', $body);

        if (Api::ok($res)) {
            Helpers::setFlash('Tool security settings saved successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error saving tool security settings.', 'danger');
        }
        Helpers::redirect('/settings?tab=security');
    }

    /**
     * Save network & firewall settings.
     */
    public function updateFirewall(): void
    {
        $parseList = function(string $field): array {
            $val = trim($_POST[$field] ?? '');
            if ($val === '') return [];
            return array_values(array_filter(array_map('trim', explode(',', $val))));
        };
        $parseIntList = function(string $field) use ($parseList): array {
            return array_map('intval', $parseList($field));
        };

        $body = [
            'ipAccess' => [
                'enabled' => isset($_POST['fw_ip_enabled']),
                'mode' => $_POST['fw_ip_mode'] ?? 'allowlist',
                'allowlist' => $parseList('fw_ip_allowlist'),
                'blocklist' => $parseList('fw_ip_blocklist'),
                'bypassPaths' => $parseList('fw_ip_bypass_paths'),
            ],
            'egress' => [
                'enabled' => isset($_POST['fw_egress_enabled']),
                'mode' => $_POST['fw_egress_mode'] ?? 'blocklist',
                'allowedHosts' => $parseList('fw_egress_allowed_hosts'),
                'blockedHosts' => $parseList('fw_egress_blocked_hosts'),
                'allowedPorts' => $parseIntList('fw_egress_allowed_ports'),
                'blockedPorts' => $parseIntList('fw_egress_blocked_ports'),
            ],
            'proxy' => [
                'httpProxy' => $_POST['fw_proxy_http'] ?? '',
                'httpsProxy' => $_POST['fw_proxy_https'] ?? '',
                'noProxy' => $parseList('fw_proxy_no_proxy'),
            ],
            'trustedProxies' => [
                'enabled' => isset($_POST['fw_tp_enabled']),
                'ips' => $parseList('fw_tp_ips'),
            ],
            'network' => [
                'corsOrigins' => $parseList('fw_cors_origins'),
                'rateLimit' => [
                    'enabled' => isset($_POST['fw_rl_enabled']),
                    'requestsPerMinute' => (int)($_POST['fw_rl_rpm'] ?? 120),
                    'skipPaths' => $parseList('fw_rl_skip_paths'),
                ],
                'httpsEnforcement' => [
                    'enabled' => isset($_POST['fw_https_enabled']),
                    'excludePaths' => $parseList('fw_https_exclude_paths'),
                ],
                'securityHeaders' => [
                    'hsts' => isset($_POST['fw_hsts_enabled']),
                    'hstsMaxAge' => (int)($_POST['fw_hsts_max_age'] ?? 31536000),
                    'xFrameOptions' => $_POST['fw_x_frame_options'] ?? 'DENY',
                    'xContentTypeOptions' => isset($_POST['fw_xcto_enabled']),
                    'referrerPolicy' => $_POST['fw_referrer_policy'] ?? 'strict-origin-when-cross-origin',
                    'permissionsPolicy' => $_POST['fw_permissions_policy'] ?? 'camera=(), microphone=(), geolocation=()',
                ],
            ],
        ];

        $res = Api::request('PUT', '/api/settings/firewall', $body);

        if (Api::ok($res)) {
            Helpers::setFlash('Network & firewall settings saved successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error saving firewall settings.', 'danger');
        }
        Helpers::redirect('/settings?tab=firewall');
    }

    /**
     * Add a model to pricing config.
     */
    public function addModelPricing(): void
    {
        $currentRes = Api::request('GET', '/api/settings/model-pricing');
        $currentConfig = $currentRes['modelPricingConfig'] ?? [];
        $currentModels = $currentConfig['models'] ?? [];
        $currency = $currentConfig['currency'] ?? 'USD';

        $newModel = [
            'provider' => $_POST['mp_provider'] ?? '',
            'modelId' => $_POST['mp_model_id'] ?? '',
            'displayName' => $_POST['mp_display_name'] ?? '',
            'inputCostPerMillion' => (float)($_POST['mp_input_cost'] ?? 0),
            'outputCostPerMillion' => (float)($_POST['mp_output_cost'] ?? 0),
            'contextWindow' => (int)($_POST['mp_context_window'] ?? 0),
        ];

        $currentModels[] = $newModel;
        $body = ['models' => $currentModels, 'currency' => $currency];
        $res = Api::request('PUT', '/api/settings/model-pricing', $body);

        if (Api::ok($res)) {
            Helpers::setFlash('Model pricing added successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error saving model pricing.', 'danger');
        }
        Helpers::redirect('/settings?tab=pricing');
    }

    /**
     * Remove a model from pricing config.
     */
    public function deleteModelPricing(): void
    {
        $currentRes = Api::request('GET', '/api/settings/model-pricing');
        $currentConfig = $currentRes['modelPricingConfig'] ?? [];
        $currentModels = $currentConfig['models'] ?? [];
        $currency = $currentConfig['currency'] ?? 'USD';

        $delProvider = $_POST['mp_delete_provider'] ?? '';
        $delModelId = $_POST['mp_delete_model_id'] ?? '';

        $filtered = array_values(array_filter($currentModels, function($m) use ($delProvider, $delModelId) {
            return !(($m['provider'] ?? '') === $delProvider && ($m['modelId'] ?? '') === $delModelId);
        }));

        $body = ['models' => $filtered, 'currency' => $currency];
        $res = Api::request('PUT', '/api/settings/model-pricing', $body);

        if (Api::ok($res)) {
            Helpers::setFlash('Model removed from pricing.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error removing model pricing.', 'danger');
        }
        Helpers::redirect('/settings?tab=pricing');
    }

    private function render(array $settings, string $tab = 'general', array $toolSecConfig = [], array $firewallConfig = [], array $modelPricingConfig = []): string
    {
        ob_start();
        include __DIR__ . '/../views/settings.php';
        return ob_get_clean();
    }
}

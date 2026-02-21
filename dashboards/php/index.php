<?php
/**
 * AgenticMail Enterprise Dashboard -- PHP Edition
 *
 * ZERO dependencies. No Composer, no Laravel, no framework.
 * Just PHP 7.4+ and a web server.
 *
 * Setup:
 *   1. Set AGENTICMAIL_URL env var (or defaults to localhost:3000)
 *   2. php -S localhost:8080 index.php
 *
 * This file is the entry point: session management, routing, POST action
 * dispatch, and inclusion of the appropriate page file.
 */

// ─── Serve Static Files ─────────────────────────────────
// When using PHP's built-in server, serve static assets directly.
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($uri, PHP_URL_PATH);
if ($path && $path !== '/' && $path !== '/index.php') {
    $file = __DIR__ . $path;
    if (is_file($file)) {
        $ext = pathinfo($file, PATHINFO_EXTENSION);
        $types = ['css' => 'text/css', 'js' => 'application/javascript', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon'];
        if (isset($types[$ext])) {
            header('Content-Type: ' . $types[$ext]);
        }
        readfile($file);
        return true;
    }
}

// ─── Bootstrap ──────────────────────────────────────────
session_start();

// Load libraries
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/api.php';
require_once __DIR__ . '/lib/auth.php';

// Load components
require_once __DIR__ . '/components/layout.php';
require_once __DIR__ . '/components/modal.php';
require_once __DIR__ . '/components/table.php';
require_once __DIR__ . '/components/stats.php';

// ─── Handle POST/GET Actions ────────────────────────────
$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'login') {
    handle_login();
    // If login succeeded, redirect to dashboard to avoid re-POST
    if (is_logged_in()) {
        header('Location: ?page=dashboard');
        exit;
    }
}

if ($action === 'logout') {
    handle_logout();
    // handle_logout() calls exit internally
}

// All remaining actions require authentication
if ($action && is_logged_in()) {
    if ($action === 'create_agent') {
        $body = ['name' => $_POST['name'] ?? '', 'role' => $_POST['role'] ?? 'assistant', 'provider' => $_POST['provider'] ?? 'anthropic'];
        if (!empty($_POST['email'])) $body['email'] = $_POST['email'];
        if (!empty($_POST['soul_id'])) $body['soul_id'] = $_POST['soul_id'];
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
        $body['persona'] = $persona;
        $result = am_api('/api/agents', 'POST', $body);
        if (isset($result['id'])) {
            set_flash("Agent '{$body['name']}' created!");
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=agents');
        exit;
    }

    if ($action === 'agent_deploy') {
        $id = $_POST['id'] ?? '';
        $result = am_api("/engine/agents/$id/deploy", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent deployed');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header("Location: ?page=agent-detail&id=$id");
        exit;
    }

    if ($action === 'agent_stop') {
        $id = $_POST['id'] ?? '';
        $result = am_api("/engine/agents/$id/stop", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent stopped');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header("Location: ?page=agent-detail&id=$id");
        exit;
    }

    if ($action === 'agent_restart') {
        $id = $_POST['id'] ?? '';
        $result = am_api("/engine/agents/$id/restart", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent restarted');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header("Location: ?page=agent-detail&id=$id");
        exit;
    }

    if ($action === 'archive_agent') {
        $id = $_GET['id'] ?? '';
        $result = am_api("/api/agents/$id/archive", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent archived');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=agents');
        exit;
    }

    if ($action === 'create_user') {
        $result = am_api('/api/users', 'POST', [
            'name' => $_POST['name'] ?? '',
            'email' => $_POST['email'] ?? '',
            'role' => $_POST['role'] ?? 'member',
            'password' => $_POST['password'] ?? '',
        ]);
        if (isset($result['id'])) {
            set_flash('User created!');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=users');
        exit;
    }

    if ($action === 'create_key') {
        $result = am_api('/api/api-keys', 'POST', ['name' => $_POST['name'] ?? '']);
        if (isset($result['plaintext'])) {
            set_flash("Key created: " . $result['plaintext'] . " (SAVE THIS NOW)");
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=api-keys');
        exit;
    }

    if ($action === 'revoke_key') {
        $id = $_GET['id'] ?? '';
        am_api("/api/api-keys/$id", 'DELETE');
        set_flash('Key revoked');
        header('Location: ?page=api-keys');
        exit;
    }

    if ($action === 'save_settings') {
        $result = am_api('/api/settings', 'PATCH', [
            'name' => $_POST['name'] ?? '',
            'domain' => $_POST['domain'] ?? '',
            'primaryColor' => $_POST['primaryColor'] ?? '#e84393',
        ]);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Settings saved!');
        }
        header('Location: ?page=settings');
        exit;
    }

    if ($action === 'save_tool_security') {
        // Parse comma-separated fields into arrays
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
        $result = am_api('/api/settings/tool-security', 'PUT', $body);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Tool security settings saved!');
        }
        header('Location: ?page=settings&tab=security');
        exit;
    }

    if ($action === 'save_firewall') {
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
        $result = am_api('/api/settings/firewall', 'PUT', $body);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Network & firewall settings saved!');
        }
        header('Location: ?page=settings&tab=firewall');
        exit;
    }

    if ($action === 'save_model_pricing') {
        // Load current pricing, append new model, save back
        $currentRes = am_api('/api/settings/model-pricing');
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
        $result = am_api('/api/settings/model-pricing', 'PUT', $body);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Model pricing added!');
        }
        header('Location: ?page=settings&tab=pricing');
        exit;
    }

    if ($action === 'delete_model_pricing') {
        // Load current pricing, remove matching model, save back
        $currentRes = am_api('/api/settings/model-pricing');
        $currentConfig = $currentRes['modelPricingConfig'] ?? [];
        $currentModels = $currentConfig['models'] ?? [];
        $currency = $currentConfig['currency'] ?? 'USD';

        $delProvider = $_POST['mp_delete_provider'] ?? '';
        $delModelId = $_POST['mp_delete_model_id'] ?? '';

        $filtered = array_values(array_filter($currentModels, function($m) use ($delProvider, $delModelId) {
            return !(($m['provider'] ?? '') === $delProvider && ($m['modelId'] ?? '') === $delModelId);
        }));

        $body = ['models' => $filtered, 'currency' => $currency];
        $result = am_api('/api/settings/model-pricing', 'PUT', $body);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Model removed from pricing.');
        }
        header('Location: ?page=settings&tab=pricing');
        exit;
    }

    if ($action === 'save_agent_tool_security') {
        $id = $_POST['agent_id'] ?? '';
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
        $result = am_api("/engine/agents/$id/tool-security", 'PATCH', $body);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Agent tool security saved!');
        }
        header("Location: ?page=agent-detail&id=$id");
        exit;
    }

    if ($action === 'reset_agent_tool_security') {
        $id = $_POST['agent_id'] ?? '';
        $result = am_api("/engine/agents/$id/tool-security", 'PATCH', [
            'toolSecurity' => (object)[],
            'updatedBy' => 'dashboard',
        ]);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Agent tool security reset to org defaults!');
        }
        header("Location: ?page=agent-detail&id=$id");
        exit;
    }

    if ($action === 'create_dlp_rule') {
        $result = am_api('/engine/dlp/rules', 'POST', [
            'name' => $_POST['name'] ?? '',
            'pattern' => $_POST['pattern'] ?? '',
            'action' => $_POST['action_type'] ?? 'block',
            'severity' => $_POST['severity'] ?? 'medium',
            'orgId' => 'default',
        ]);
        if (isset($result['id'])) {
            set_flash('DLP rule created!');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=dlp');
        exit;
    }

    if ($action === 'delete_dlp_rule') {
        $id = $_GET['id'] ?? '';
        am_api("/engine/dlp/rules/$id", 'DELETE');
        set_flash('DLP rule deleted');
        header('Location: ?page=dlp');
        exit;
    }

    if ($action === 'dlp_scan') {
        $result = am_api('/engine/dlp/scan', 'POST', [
            'content' => $_POST['content'] ?? '',
            'orgId' => 'default',
        ]);
        if (isset($result['violations']) && count($result['violations']) > 0) {
            set_flash('Scan found ' . count($result['violations']) . ' violation(s)');
        } elseif (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Scan clean — no violations found');
        }
        header('Location: ?page=dlp');
        exit;
    }

    if ($action === 'guardrail_pause') {
        $id = $_POST['id'] ?? '';
        $result = am_api("/engine/guardrails/pause/$id", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent paused');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=guardrails');
        exit;
    }

    if ($action === 'guardrail_resume') {
        $id = $_POST['id'] ?? '';
        $result = am_api("/engine/guardrails/resume/$id", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent resumed');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=guardrails');
        exit;
    }

    if ($action === 'guardrail_kill') {
        $id = $_POST['id'] ?? '';
        $result = am_api("/engine/guardrails/kill/$id", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Agent killed');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=guardrails');
        exit;
    }

    if ($action === 'create_anomaly_rule') {
        $result = am_api('/engine/anomaly-rules', 'POST', [
            'name' => $_POST['name'] ?? '',
            'metric' => $_POST['metric'] ?? '',
            'threshold' => (int)($_POST['threshold'] ?? 0),
            'action' => $_POST['action_type'] ?? 'alert',
            'orgId' => 'default',
        ]);
        if (isset($result['id'])) {
            set_flash('Anomaly rule created!');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=guardrails');
        exit;
    }

    if ($action === 'journal_rollback') {
        $id = $_GET['id'] ?? '';
        $result = am_api("/engine/journal/$id/rollback", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Entry rolled back');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=journal');
        exit;
    }

    if ($action === 'send_message') {
        $result = am_api('/engine/messages', 'POST', [
            'from' => $_POST['from'] ?? '',
            'to' => $_POST['to'] ?? '',
            'subject' => $_POST['subject'] ?? '',
            'body' => $_POST['body'] ?? '',
            'orgId' => 'default',
        ]);
        if (isset($result['id'])) {
            set_flash('Message sent!');
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=messages');
        exit;
    }

    if ($action === 'generate_report') {
        $type = $_POST['report_type'] ?? 'soc2';
        $result = am_api("/engine/compliance/reports/$type", 'POST', [
            'periodStart' => $_POST['period_start'] ?? '',
            'periodEnd' => $_POST['period_end'] ?? '',
            'orgId' => 'default',
        ]);
        if (isset($result['id'])) {
            set_flash("$type report generated!");
        } else {
            set_flash($result['error'] ?? 'Failed', 'error');
        }
        header('Location: ?page=compliance');
        exit;
    }

    if ($action === 'download_report') {
        $id = $_GET['id'] ?? '';
        $result = am_api("/engine/compliance/reports/$id/download");
        if (isset($result['url'])) {
            header('Location: ' . $result['url']);
            exit;
        }
        set_flash($result['error'] ?? 'Download not available', 'error');
        header('Location: ?page=compliance');
        exit;
    }

    // ── Vault Actions ───────────────────────────────────────
    if ($action === 'create_secret') {
        $result = am_api('/engine/vault/secrets', 'POST', [
            'orgId' => 'default',
            'name' => $_POST['name'] ?? '',
            'value' => $_POST['value'] ?? '',
            'category' => $_POST['category'] ?? 'custom',
        ]);
        if (isset($result['id'])) {
            set_flash('Secret stored securely!');
        } else {
            set_flash($result['error'] ?? 'Failed to store secret', 'error');
        }
        header('Location: ?page=vault');
        exit;
    }

    if ($action === 'delete_secret') {
        $id = $_GET['id'] ?? '';
        $result = am_api("/engine/vault/secrets/$id", 'DELETE');
        if ($result['ok'] ?? false) {
            set_flash('Secret deleted');
        } else {
            set_flash($result['error'] ?? 'Failed to delete secret', 'error');
        }
        header('Location: ?page=vault');
        exit;
    }

    if ($action === 'rotate_secret') {
        $id = $_GET['id'] ?? '';
        $result = am_api("/engine/vault/secrets/$id/rotate", 'POST');
        if ($result['ok'] ?? false) {
            set_flash('Secret rotated');
        } else {
            set_flash($result['error'] ?? 'Failed to rotate secret', 'error');
        }
        header('Location: ?page=vault');
        exit;
    }

    if ($action === 'rotate_all_secrets') {
        $result = am_api('/engine/vault/rotate-all', 'POST', ['orgId' => 'default']);
        $count = $result['rotated'] ?? 0;
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash("Rotated $count secrets");
        }
        header('Location: ?page=vault');
        exit;
    }

    // ── Skills Actions ──────────────────────────────────────
    if ($action === 'enable_skill') {
        $skillId = $_POST['skill_id'] ?? '';
        $result = am_api("/engine/community/skills/$skillId/enable", 'PUT', ['orgId' => 'default']);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Skill enabled');
        }
        header('Location: ?page=skills');
        exit;
    }

    if ($action === 'disable_skill') {
        $skillId = $_POST['skill_id'] ?? '';
        $result = am_api("/engine/community/skills/$skillId/disable", 'PUT', ['orgId' => 'default']);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Skill disabled');
        }
        header('Location: ?page=skills');
        exit;
    }

    if ($action === 'uninstall_skill') {
        $skillId = $_POST['skill_id'] ?? '';
        $result = am_api("/engine/community/skills/$skillId/uninstall", 'DELETE', ['orgId' => 'default']);
        if (isset($result['error'])) {
            set_flash($result['error'], 'error');
        } else {
            set_flash('Skill uninstalled');
        }
        header('Location: ?page=skills');
        exit;
    }
}

// ─── Routing ────────────────────────────────────────────
$page = $_GET['page'] ?? 'dashboard';

// If not logged in, show the login page
if (!is_logged_in()) {
    require __DIR__ . '/pages/login.php';
    exit;
}

// Authenticated pages
$validPages = ['dashboard', 'agents', 'agent-detail', 'users', 'api-keys', 'vault', 'skills', 'audit', 'settings', 'dlp', 'guardrails', 'journal', 'messages', 'compliance', 'activity', 'approvals', 'community-skills', 'domain-status', 'knowledge', 'knowledge-contributions', 'skill-connections', 'workforce'];
if (!in_array($page, $validPages)) {
    $page = 'dashboard';
}

// Map page slug to file
$pageFile = __DIR__ . '/pages/' . $page . '.php';
require $pageFile;

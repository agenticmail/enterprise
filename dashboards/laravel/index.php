<?php
/**
 * AgenticMail Enterprise Dashboard — Laravel-Style MVC Micro-Framework
 *
 * Entry point: session bootstrap, require lib files, route dispatch.
 * Run: php -S localhost:8080 index.php
 */

// ── Bootstrap ────────────────────────────────────────────────────────────────
session_start();
date_default_timezone_set('UTC');

define('API_BASE', rtrim(getenv('AGENTICMAIL_URL') ?: 'http://localhost:3000', '/'));
define('APP_NAME', 'AgenticMail Enterprise');
define('BASE_PATH', __DIR__);

// ── Load Libraries ───────────────────────────────────────────────────────────
require_once __DIR__ . '/lib/Api.php';
require_once __DIR__ . '/lib/Helpers.php';

// ── Serve Static Files ───────────────────────────────────────────────────────
// When using PHP built-in server, serve CSS and other static assets directly.
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/public/.+#', $uri)) {
    $filePath = __DIR__ . $uri;
    if (is_file($filePath)) {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mimeTypes = [
            'css'  => 'text/css',
            'js'   => 'application/javascript',
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'gif'  => 'image/gif',
            'svg'  => 'image/svg+xml',
            'ico'  => 'image/x-icon',
            'woff' => 'font/woff',
            'woff2'=> 'font/woff2',
        ];
        header('Content-Type: ' . ($mimeTypes[$ext] ?? 'application/octet-stream'));
        readfile($filePath);
        exit;
    }
}

// ── Load Controllers ─────────────────────────────────────────────────────────
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/DashboardController.php';
require_once __DIR__ . '/controllers/AgentController.php';
require_once __DIR__ . '/controllers/UserController.php';
require_once __DIR__ . '/controllers/ApiKeyController.php';
require_once __DIR__ . '/controllers/AuditController.php';
require_once __DIR__ . '/controllers/SettingController.php';
require_once __DIR__ . '/controllers/DlpController.php';
require_once __DIR__ . '/controllers/GuardrailController.php';
require_once __DIR__ . '/controllers/JournalController.php';
require_once __DIR__ . '/controllers/MessageController.php';
require_once __DIR__ . '/controllers/ComplianceController.php';
require_once __DIR__ . '/controllers/VaultController.php';
require_once __DIR__ . '/controllers/SkillController.php';

// ── Routing ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];

// --- Auth routes (no auth required) ---
if ($uri === '/login') {
    $ctrl = new AuthController();
    if ($method === 'POST') {
        $ctrl->doLogin();
    } else {
        $ctrl->login();
    }
    exit;
}

if ($uri === '/logout') {
    (new AuthController())->logout();
    exit;
}

// --- All routes below require authentication ---
Helpers::requireAuth();

// --- Dashboard ---
if ($uri === '/' || $uri === '/dashboard') {
    (new DashboardController())->index();
    exit;
}

// --- Agents ---
if ($uri === '/agents') {
    $ctrl = new AgentController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'create';
        if ($action === 'archive' && !empty($_POST['id'])) {
            $ctrl->archive($_POST['id']);
        } else {
            $ctrl->store();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Agent Detail ---
if (preg_match('#^/agents/([^/]+)$#', $uri, $matches)) {
    $ctrl = new AgentController();
    $agentId = $matches[1];
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? '';
        if ($action === 'deploy') {
            $ctrl->deploy($agentId);
        } elseif ($action === 'stop') {
            $ctrl->stop($agentId);
        } elseif ($action === 'restart') {
            $ctrl->restart($agentId);
        } elseif ($action === 'save_tool_security') {
            $ctrl->saveToolSecurity($agentId);
        } elseif ($action === 'reset_tool_security') {
            $ctrl->resetToolSecurity($agentId);
        } else {
            $ctrl->show($agentId);
        }
    } else {
        $ctrl->show($agentId);
    }
    exit;
}

// --- Users ---
if ($uri === '/users') {
    $ctrl = new UserController();
    if ($method === 'POST') {
        $ctrl->store();
    } else {
        $ctrl->index();
    }
    exit;
}

// --- API Keys ---
if ($uri === '/api-keys') {
    $ctrl = new ApiKeyController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'create';
        if ($action === 'revoke' && !empty($_POST['id'])) {
            $ctrl->revoke($_POST['id']);
        } else {
            $ctrl->store();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Vault ---
if ($uri === '/vault') {
    $ctrl = new VaultController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'create';
        if ($action === 'delete' && !empty($_POST['id'])) {
            $ctrl->delete($_POST['id']);
        } elseif ($action === 'rotate' && !empty($_POST['id'])) {
            $ctrl->rotate($_POST['id']);
        } elseif ($action === 'rotate_all') {
            $ctrl->rotateAll();
        } else {
            $ctrl->store();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Skills ---
if ($uri === '/skills') {
    $ctrl = new SkillController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? '';
        $skillId = $_POST['skill_id'] ?? '';
        if ($action === 'enable' && $skillId) {
            $ctrl->enable($skillId);
        } elseif ($action === 'disable' && $skillId) {
            $ctrl->disable($skillId);
        } elseif ($action === 'uninstall' && $skillId) {
            $ctrl->uninstall($skillId);
        } else {
            $ctrl->index();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Audit Log ---
if ($uri === '/audit') {
    (new AuditController())->index();
    exit;
}

// --- Settings ---
if ($uri === '/settings') {
    $ctrl = new SettingController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'update';
        if ($action === 'save_tool_security') {
            $ctrl->updateToolSecurity();
        } elseif ($action === 'save_firewall') {
            $ctrl->updateFirewall();
        } elseif ($action === 'save_model_pricing') {
            $ctrl->addModelPricing();
        } elseif ($action === 'delete_model_pricing') {
            $ctrl->deleteModelPricing();
        } else {
            $ctrl->update();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- DLP ---
if ($uri === '/dlp') {
    $ctrl = new DlpController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'create_rule';
        if ($action === 'delete_rule' && !empty($_POST['id'])) {
            $ctrl->deleteRule($_POST['id']);
        } elseif ($action === 'scan') {
            $ctrl->scan();
        } else {
            $ctrl->createRule();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Guardrails ---
if ($uri === '/guardrails') {
    $ctrl = new GuardrailController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'create_rule';
        if ($action === 'pause' && !empty($_POST['id'])) {
            $ctrl->pause($_POST['id']);
        } elseif ($action === 'resume' && !empty($_POST['id'])) {
            $ctrl->resume($_POST['id']);
        } elseif ($action === 'kill' && !empty($_POST['id'])) {
            $ctrl->kill($_POST['id']);
        } elseif ($action === 'delete_rule' && !empty($_POST['id'])) {
            $ctrl->deleteRule($_POST['id']);
        } else {
            $ctrl->createRule();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Journal ---
if ($uri === '/journal') {
    $ctrl = new JournalController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? '';
        if ($action === 'rollback' && !empty($_POST['id'])) {
            $ctrl->rollback($_POST['id']);
        } else {
            $ctrl->index();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Messages ---
if ($uri === '/messages') {
    $ctrl = new MessageController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'send';
        if ($action === 'send') {
            $ctrl->send();
        } else {
            $ctrl->index();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// --- Compliance ---
if ($uri === '/compliance') {
    $ctrl = new ComplianceController();
    if ($method === 'POST') {
        $action = $_POST['_action'] ?? 'generate';
        if ($action === 'generate') {
            $ctrl->generate();
        } else {
            $ctrl->index();
        }
    } else {
        $ctrl->index();
    }
    exit;
}

// ── 404 ──────────────────────────────────────────────────────────────────────
http_response_code(404);
$title   = 'Not Found';
$page    = '';
$content = '<div class="card"><h3>404 &mdash; Page Not Found</h3><p>The requested route does not exist.</p></div>';
include __DIR__ . '/views/layout.php';

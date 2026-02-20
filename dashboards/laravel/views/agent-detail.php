<?php
/**
 * Agent Detail page — full agent profile with actions.
 * Expects: $agent (array), $agentId (string)
 */

// Resolve config from agent response
$config = $agent['config'] ?? $agent['configuration'] ?? [];

// Resolve display name
$displayName = $config['identity']['name']
    ?? $config['name']
    ?? $config['displayName']
    ?? $agent['name']
    ?? 'Unknown';

// Resolve email — never display raw UUIDs
$email = $config['identity']['email']
    ?? $config['email']
    ?? $agent['email']
    ?? '';

// Filter out UUID emails
if ($email && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $email)) {
    $email = '';
}

// Avatar initial
$avatarInitial = strtoupper(mb_substr($displayName, 0, 1));

// Status and role
$status = $agent['status'] ?? $config['status'] ?? 'active';
$role = $agent['role'] ?? $config['role'] ?? '-';

// Model — handle array or string
$model = $config['model'] ?? $agent['model'] ?? '-';
if (is_array($model)) {
    $model = $model['modelId'] ?? $model['provider'] ?? '-';
}

// Created date
$createdAt = $agent['createdAt'] ?? $agent['created_at'] ?? '';
$createdFormatted = $createdAt ? (new DateTime($createdAt))->format('M j, Y') : '-';

// Description
$description = $config['description'] ?? $agent['description'] ?? '';

// Personality traits (associative array)
$persona = $config['persona'] ?? $agent['persona'] ?? [];
$traits = $persona['traits'] ?? $config['traits'] ?? [];

// Personal details
$gender = $persona['gender'] ?? $config['gender'] ?? '';
$dob = $persona['dateOfBirth'] ?? $config['dateOfBirth'] ?? '';
$maritalStatus = $persona['maritalStatus'] ?? $config['maritalStatus'] ?? '';
$culturalBackground = $persona['culturalBackground'] ?? $config['culturalBackground'] ?? '';
$language = $persona['language'] ?? $config['language'] ?? '';

// Permission profile
$permissions = $config['permissions'] ?? $agent['permissions'] ?? null;
?>

<div style="margin-bottom:24px">
    <a href="/agents" style="color:var(--text-muted);font-size:13px;text-decoration:none">&larr; Back to Agents</a>
</div>

<!-- Agent Header -->
<div class="card" style="display:flex;align-items:center;gap:20px">
    <div style="width:56px;height:56px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;flex-shrink:0"><?= Helpers::e($avatarInitial) ?></div>
    <div style="flex:1">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px"><?= Helpers::e($displayName) ?></h2>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <?= Helpers::statusBadge($status) ?>
            <?= Helpers::badge($role, 'default') ?>
            <?php if ($email): ?>
                <span style="color:var(--text-dim);font-size:13px"><?= Helpers::e($email) ?></span>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Summary Card -->
<div class="card">
    <h3>Summary</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">
        <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Status</div><div style="font-weight:600;margin-top:4px"><?= Helpers::statusBadge($status) ?></div></div>
        <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Role</div><div style="font-weight:600;margin-top:4px"><?= Helpers::e($role) ?></div></div>
        <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Model</div><div style="font-weight:600;margin-top:4px"><?= Helpers::e((string)$model) ?></div></div>
        <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Created</div><div style="font-weight:600;margin-top:4px"><?= Helpers::e($createdFormatted) ?></div></div>
    </div>
</div>

<?php if ($description): ?>
<!-- Description -->
<div class="card">
    <h3>Description</h3>
    <p style="font-size:14px;color:var(--text-dim);line-height:1.6"><?= Helpers::e($description) ?></p>
</div>
<?php endif; ?>

<?php if (!empty($traits) && is_array($traits)): ?>
<!-- Personality Traits -->
<div class="card">
    <h3>Personality Traits</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
        <?php foreach ($traits as $key => $value): ?>
            <span class="badge badge-primary" style="font-size:12px;text-transform:none;letter-spacing:0"><?= Helpers::e((string)$key) ?>: <?= Helpers::e((string)$value) ?></span>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<!-- Actions -->
<div class="card">
    <h3>Actions</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
        <form method="post" action="/agents/<?= Helpers::e($agentId) ?>" style="display:inline">
            <input type="hidden" name="_action" value="deploy">
            <button type="submit" class="btn btn-primary">Deploy</button>
        </form>
        <form method="post" action="/agents/<?= Helpers::e($agentId) ?>" style="display:inline">
            <input type="hidden" name="_action" value="stop">
            <button type="submit" class="btn btn-danger">Stop</button>
        </form>
        <form method="post" action="/agents/<?= Helpers::e($agentId) ?>" style="display:inline">
            <input type="hidden" name="_action" value="restart">
            <button type="submit" class="btn">Restart</button>
        </form>
    </div>
</div>

<!-- Personal Details -->
<?php
$hasPersonalDetails = !empty($persona['gender'] ?? '') || !empty($persona['dateOfBirth'] ?? '') || !empty($persona['maritalStatus'] ?? '') || !empty($persona['culturalBackground'] ?? '') || !empty($persona['language'] ?? '');
if ($hasPersonalDetails): ?>
<div class="card">
    <h3>Personal Details</h3>
    <div class="table-wrap">
        <table>
            <tbody>
                <?php if ($gender): ?><tr><td style="font-weight:600;width:200px;color:var(--text-muted)">Gender</td><td><?= Helpers::e($gender) ?></td></tr><?php endif; ?>
                <?php if ($dob): ?><tr><td style="font-weight:600;width:200px;color:var(--text-muted)">Date of Birth</td><td><?= Helpers::e($dob) ?></td></tr><?php endif; ?>
                <?php if ($maritalStatus): ?><tr><td style="font-weight:600;width:200px;color:var(--text-muted)">Marital Status</td><td><?= Helpers::e($maritalStatus) ?></td></tr><?php endif; ?>
                <?php if ($culturalBackground): ?><tr><td style="font-weight:600;width:200px;color:var(--text-muted)">Cultural Background</td><td><?= Helpers::e($culturalBackground) ?></td></tr><?php endif; ?>
                <?php if ($language): ?><tr><td style="font-weight:600;width:200px;color:var(--text-muted)">Language</td><td><?= Helpers::e($language) ?></td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php endif; ?>

<!-- Permission Profile -->
<?php if ($permissions && is_array($permissions)):
    $profileName = $permissions['name'] ?? $permissions['preset'] ?? 'Custom';
    $maxRisk = $permissions['maxRiskLevel'] ?? $permissions['max_risk_level'] ?? '';
    $sandboxMode = $permissions['sandboxMode'] ?? $permissions['sandbox_mode'] ?? false;
    $rateLimits = $permissions['rateLimits'] ?? $permissions['rate_limits'] ?? [];
    $blockedEffects = $permissions['blockedSideEffects'] ?? $permissions['blocked_side_effects'] ?? [];

    $riskColors = ['low' => '#22c55e', 'medium' => '#f59e0b', 'high' => '#ef4444', 'critical' => '#ef4444'];
    $riskColor = $riskColors[strtolower($maxRisk)] ?? 'var(--text-muted)';

    $callsMin = $rateLimits['toolCallsPerMinute'] ?? $rateLimits['calls_per_minute'] ?? null;
    $callsHr  = $rateLimits['toolCallsPerHour']   ?? $rateLimits['calls_per_hour']   ?? null;
?>
<div class="card">
    <h3>Permission Profile</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Profile Name</div>
            <div style="font-weight:600;margin-top:4px"><?= Helpers::e($profileName) ?></div>
        </div>
        <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Max Risk Level</div>
            <div style="margin-top:4px">
                <?php if ($maxRisk): ?>
                    <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:<?= $riskColor ?>;color:#fff"><?= Helpers::e(ucfirst($maxRisk)) ?></span>
                <?php else: ?>
                    <span style="color:var(--text-muted)">-</span>
                <?php endif; ?>
            </div>
        </div>
        <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Sandbox Mode</div>
            <div style="font-weight:600;margin-top:4px"><?= $sandboxMode ? 'Enabled' : 'Disabled' ?></div>
        </div>
        <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Rate Limits</div>
            <div style="font-weight:600;margin-top:4px">
                <?php if ($callsMin !== null || $callsHr !== null): ?>
                    <?php if ($callsMin !== null): ?><span><?= Helpers::e($callsMin) ?>/min</span><?php endif; ?>
                    <?php if ($callsMin !== null && $callsHr !== null): ?><span style="color:var(--text-muted);margin:0 4px">&middot;</span><?php endif; ?>
                    <?php if ($callsHr !== null): ?><span><?= Helpers::e($callsHr) ?>/hr</span><?php endif; ?>
                <?php else: ?>
                    <span style="color:var(--text-muted)">None set</span>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <?php if (!empty($blockedEffects) && is_array($blockedEffects)): ?>
    <div style="margin-top:16px">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Blocked Side Effects</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
            <?php foreach ($blockedEffects as $effect): ?>
                <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:500;background:#ef4444;color:#fff"><?= Helpers::e((string)$effect) ?></span>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>
</div>
<?php endif; ?>

<!-- Tool Security -->
<?php
$agentToolSec = $toolSecData['toolSecurity'] ?? [];
$tsOrgDefaults = $toolSecData['orgDefaults'] ?? [];
$tsAgentOverrides = $toolSecData['agentOverrides'] ?? [];
$tsSec = $agentToolSec['security'] ?? $tsOrgDefaults['security'] ?? ['pathSandbox' => ['enabled' => true, 'allowedDirs' => [], 'blockedPatterns' => []], 'ssrf' => ['enabled' => true, 'allowedHosts' => [], 'blockedCidrs' => []], 'commandSanitizer' => ['enabled' => true, 'mode' => 'blocklist', 'allowedCommands' => [], 'blockedPatterns' => []]];
$tsMw = $agentToolSec['middleware'] ?? $tsOrgDefaults['middleware'] ?? ['audit' => ['enabled' => true, 'redactKeys' => []], 'rateLimit' => ['enabled' => true], 'circuitBreaker' => ['enabled' => true], 'telemetry' => ['enabled' => true]];
$tsHasOverrides = !empty($tsAgentOverrides) && (isset($tsAgentOverrides['security']) || isset($tsAgentOverrides['middleware']));
$tsOverrideSections = [];
if (!empty($tsAgentOverrides['security'])) $tsOverrideSections = array_merge($tsOverrideSections, array_keys($tsAgentOverrides['security']));
if (!empty($tsAgentOverrides['middleware'])) $tsOverrideSections = array_merge($tsOverrideSections, array_keys($tsAgentOverrides['middleware']));
?>
<div class="card">
    <h3>Tool Security</h3>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <p style="font-size:13px;color:var(--text-muted);margin:0">Configure tool security overrides for this agent. Unmodified settings inherit from <strong>org defaults</strong>.</p>
        <?php if ($tsHasOverrides): ?>
        <form method="post" action="/agents/<?= Helpers::e($agentId) ?>" style="display:inline">
            <input type="hidden" name="_action" value="reset_tool_security">
            <button type="submit" class="btn" style="font-size:12px" onclick="return confirm('Reset all tool security overrides to org defaults?')">Reset to Org Defaults</button>
        </form>
        <?php endif; ?>
    </div>

    <?php if ($tsHasOverrides): ?>
    <div style="padding:8px 12px;border-radius:6px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);font-size:12px;color:var(--text-dim);margin-bottom:16px;display:flex;align-items:center;gap:8px">
        &#9432; This agent has custom overrides for: <strong><?= Helpers::e(implode(', ', $tsOverrideSections) ?: 'none') ?></strong>
    </div>
    <?php endif; ?>

    <form method="post" action="/agents/<?= Helpers::e($agentId) ?>">
        <input type="hidden" name="_action" value="save_tool_security">

        <!-- Security Sandboxes -->
        <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Security Sandboxes</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

            <!-- Path Sandbox -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">Path Sandbox</div>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Controls which directories this agent can read/write.</p>
                <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                    <label style="margin:0;font-weight:500">Enable path sandboxing</label>
                    <input type="checkbox" name="ps_enabled" <?= ($tsSec['pathSandbox']['enabled'] ?? true) ? 'checked' : '' ?>>
                </div>
                <div class="form-group">
                    <label>Allowed Directories (comma-separated)</label>
                    <input type="text" name="ps_allowedDirs" value="<?= Helpers::e(implode(', ', $tsSec['pathSandbox']['allowedDirs'] ?? [])) ?>" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px">
                </div>
                <div class="form-group">
                    <label>Blocked Patterns (comma-separated)</label>
                    <input type="text" name="ps_blockedPatterns" value="<?= Helpers::e(implode(', ', $tsSec['pathSandbox']['blockedPatterns'] ?? [])) ?>" placeholder="\.env$" style="font-family:monospace;font-size:12px">
                </div>
            </div>

            <!-- SSRF Protection -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">SSRF Protection</div>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Blocks this agent from accessing internal networks and metadata endpoints.</p>
                <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                    <label style="margin:0;font-weight:500">Enable SSRF protection</label>
                    <input type="checkbox" name="ssrf_enabled" <?= ($tsSec['ssrf']['enabled'] ?? true) ? 'checked' : '' ?>>
                </div>
                <div class="form-group">
                    <label>Allowed Hosts (comma-separated)</label>
                    <input type="text" name="ssrf_allowedHosts" value="<?= Helpers::e(implode(', ', $tsSec['ssrf']['allowedHosts'] ?? [])) ?>" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
                </div>
                <div class="form-group">
                    <label>Blocked CIDRs (comma-separated)</label>
                    <input type="text" name="ssrf_blockedCidrs" value="<?= Helpers::e(implode(', ', $tsSec['ssrf']['blockedCidrs'] ?? [])) ?>" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px">
                </div>
            </div>
        </div>

        <!-- Command Sanitizer (full width) -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:16px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Command Sanitizer</div>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Controls which shell commands this agent can execute.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable command validation</label>
                <input type="checkbox" name="cs_enabled" <?= ($tsSec['commandSanitizer']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>Mode</label>
                <select name="cs_mode" style="width:250px">
                    <option value="blocklist" <?= ($tsSec['commandSanitizer']['mode'] ?? 'blocklist') === 'blocklist' ? 'selected' : '' ?>>Blocklist</option>
                    <option value="allowlist" <?= ($tsSec['commandSanitizer']['mode'] ?? 'blocklist') === 'allowlist' ? 'selected' : '' ?>>Allowlist</option>
                </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div class="form-group">
                    <label>Allowed Commands (comma-separated)</label>
                    <input type="text" name="cs_allowedCommands" value="<?= Helpers::e(implode(', ', $tsSec['commandSanitizer']['allowedCommands'] ?? [])) ?>" placeholder="git, npm, node" style="font-family:monospace;font-size:12px">
                </div>
                <div class="form-group">
                    <label>Blocked Patterns (comma-separated)</label>
                    <input type="text" name="cs_blockedPatterns" value="<?= Helpers::e(implode(', ', $tsSec['commandSanitizer']['blockedPatterns'] ?? [])) ?>" placeholder="curl.*\|.*sh" style="font-family:monospace;font-size:12px">
                </div>
            </div>
        </div>

        <!-- Middleware & Observability -->
        <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:20px">Middleware &amp; Observability</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

            <!-- Audit Logging -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">Audit Logging</div>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Logs every tool invocation for this agent.</p>
                <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                    <label style="margin:0;font-weight:500">Enable audit logging</label>
                    <input type="checkbox" name="audit_enabled" <?= ($tsMw['audit']['enabled'] ?? true) ? 'checked' : '' ?>>
                </div>
                <div class="form-group">
                    <label>Keys to Redact (comma-separated)</label>
                    <input type="text" name="audit_redactKeys" value="<?= Helpers::e(implode(', ', $tsMw['audit']['redactKeys'] ?? [])) ?>" placeholder="custom_secret" style="font-family:monospace;font-size:12px">
                </div>
            </div>

            <!-- Rate Limiting -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">Rate Limiting</div>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Per-tool rate limits for this agent.</p>
                <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                    <label style="margin:0;font-weight:500">Enable rate limiting</label>
                    <input type="checkbox" name="rl_enabled" <?= ($tsMw['rateLimit']['enabled'] ?? true) ? 'checked' : '' ?>>
                </div>
            </div>

            <!-- Circuit Breaker -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">Circuit Breaker</div>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Auto-stops calling failing tools after consecutive failures.</p>
                <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                    <label style="margin:0;font-weight:500">Enable circuit breaker</label>
                    <input type="checkbox" name="cb_enabled" <?= ($tsMw['circuitBreaker']['enabled'] ?? true) ? 'checked' : '' ?>>
                </div>
            </div>

            <!-- Telemetry -->
            <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">Telemetry</div>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Collects execution timing and metrics for this agent's tools.</p>
                <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                    <label style="margin:0;font-weight:500">Enable telemetry</label>
                    <input type="checkbox" name="tel_enabled" <?= ($tsMw['telemetry']['enabled'] ?? true) ? 'checked' : '' ?>>
                </div>
            </div>
        </div>

        <div style="margin-top:16px;display:flex;justify-content:flex-end">
            <button class="btn btn-primary" type="submit">Save Tool Security Overrides</button>
        </div>
    </form>
</div>

<!-- Activity -->
<div class="card">
    <h3>Activity</h3>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:0">
        <button data-activity-tab="events" onclick="switchActivityTab('events')" class="active" style="padding:8px 16px;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid var(--primary);color:var(--primary)">Events</button>
        <button data-activity-tab="toolcalls" onclick="switchActivityTab('toolcalls')" style="padding:8px 16px;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted)">Tool Calls</button>
        <button data-activity-tab="journal" onclick="switchActivityTab('journal')" style="padding:8px 16px;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted)">Journal</button>
    </div>

    <!-- Events Panel -->
    <div id="panel-events" class="activity-panel" style="display:block">
        <?php if (empty($events)): ?>
            <p style="padding:16px;color:var(--text-muted);font-size:13px">No events found.</p>
        <?php else: ?>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($events as $ev): ?>
                            <tr onclick="showActivityDetail('<?= htmlspecialchars(json_encode($ev), ENT_QUOTES) ?>', 'Event Detail')" style="cursor:pointer">
                                <td><?= Helpers::e($ev['type'] ?? $ev['event'] ?? '-') ?></td>
                                <td><?= Helpers::statusBadge($ev['status'] ?? 'unknown') ?></td>
                                <td><?= Helpers::timeAgo($ev['createdAt'] ?? $ev['created_at'] ?? $ev['timestamp'] ?? '-') ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>

    <!-- Tool Calls Panel -->
    <div id="panel-toolcalls" class="activity-panel" style="display:none">
        <?php if (empty($tool_calls)): ?>
            <p style="padding:16px;color:var(--text-muted);font-size:13px">No tool calls found.</p>
        <?php else: ?>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Tool</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($tool_calls as $tc): ?>
                            <tr onclick="showActivityDetail('<?= htmlspecialchars(json_encode($tc), ENT_QUOTES) ?>', 'Tool Call Detail')" style="cursor:pointer">
                                <td style="font-weight:600"><?= Helpers::e($tc['toolName'] ?? $tc['tool_name'] ?? $tc['name'] ?? '-') ?></td>
                                <td><?= Helpers::statusBadge($tc['status'] ?? 'unknown') ?></td>
                                <td><?= Helpers::e(isset($tc['duration']) ? $tc['duration'] . 'ms' : '-') ?></td>
                                <td><?= Helpers::timeAgo($tc['createdAt'] ?? $tc['created_at'] ?? $tc['timestamp'] ?? '-') ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>

    <!-- Journal Panel -->
    <div id="panel-journal" class="activity-panel" style="display:none">
        <?php if (empty($journal_entries)): ?>
            <p style="padding:16px;color:var(--text-muted);font-size:13px">No journal entries found.</p>
        <?php else: ?>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Action</th>
                            <th>Status</th>
                            <th>Time</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($journal_entries as $je): ?>
                            <tr>
                                <td onclick="showActivityDetail('<?= htmlspecialchars(json_encode($je), ENT_QUOTES) ?>', 'Journal Entry')" style="cursor:pointer"><?= Helpers::e($je['action'] ?? $je['type'] ?? '-') ?></td>
                                <td onclick="showActivityDetail('<?= htmlspecialchars(json_encode($je), ENT_QUOTES) ?>', 'Journal Entry')" style="cursor:pointer"><?= Helpers::statusBadge($je['status'] ?? 'unknown') ?></td>
                                <td onclick="showActivityDetail('<?= htmlspecialchars(json_encode($je), ENT_QUOTES) ?>', 'Journal Entry')" style="cursor:pointer"><?= Helpers::timeAgo($je['createdAt'] ?? $je['created_at'] ?? $je['timestamp'] ?? '-') ?></td>
                                <td>
                                    <?php if (!empty($je['reversible'])): ?>
                                        <button onclick="rollbackJournal('<?= Helpers::e($je['id'] ?? '') ?>')" class="btn btn-danger" style="padding:4px 10px;font-size:11px">Rollback</button>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Activity Detail Modal -->
<div id="activity-detail-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:none;align-items:center;justify-content:center" onclick="if(event.target===this)closeActivityModal()">
    <div style="background:var(--card-bg,#fff);border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 id="activity-modal-title" style="font-size:16px;font-weight:700;margin:0">Detail</h3>
            <button onclick="closeActivityModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);padding:4px 8px">&times;</button>
        </div>
        <div id="activity-modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px"></div>
    </div>
</div>

<script>
function switchActivityTab(tab) {
    document.querySelectorAll('.activity-panel').forEach(function(p) { p.style.display = 'none'; });
    document.querySelectorAll('[data-activity-tab]').forEach(function(t) {
        t.classList.remove('active');
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'var(--text-muted)';
    });
    document.getElementById('panel-' + tab).style.display = 'block';
    var activeTab = document.querySelector('[data-activity-tab="' + tab + '"]');
    activeTab.classList.add('active');
    activeTab.style.borderBottomColor = 'var(--primary)';
    activeTab.style.color = 'var(--primary)';
}

function showActivityDetail(jsonStr, title) {
    var data = JSON.parse(jsonStr);
    var modal = document.getElementById('activity-detail-modal');
    var body = document.getElementById('activity-modal-body');
    document.getElementById('activity-modal-title').textContent = title;
    var html = '';
    for (var key in data) {
        if (key === 'agentId') continue;
        var label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
        label = label.charAt(0).toUpperCase() + label.slice(1);
        var val = data[key];
        if (val === null || val === undefined) val = '—';
        else if (typeof val === 'object') val = '<pre style="margin:0;font-size:11px;background:var(--bg-secondary,#f5f5f5);padding:6px;border-radius:4px;white-space:pre-wrap;max-height:150px;overflow:auto">' + JSON.stringify(val, null, 2) + '</pre>';
        else if (typeof val === 'boolean') val = '<span class="badge badge-' + (val ? 'success' : 'default') + '">' + (val ? 'Yes' : 'No') + '</span>';
        else if ((key.includes('At') || key.includes('time') || key.includes('date')) && !isNaN(Date.parse(val))) val = new Date(val).toLocaleString();
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">' + label + '</div>';
        html += '<div style="font-size:13px;word-break:break-word">' + val + '</div>';
    }
    body.innerHTML = html;
    modal.style.display = 'flex';
}

function closeActivityModal() {
    document.getElementById('activity-detail-modal').style.display = 'none';
}

function rollbackJournal(id) {
    if (!confirm('Rollback this journal entry?')) return;
    fetch('/api/engine/journal/' + id + '/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (d.success) location.reload(); else alert('Failed: ' + (d.error || 'Unknown')); })
    .catch(function(e) { alert(e.message); });
}
</script>

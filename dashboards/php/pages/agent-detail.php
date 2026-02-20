<?php
/**
 * Agent Detail Page — Shows full agent profile with actions
 */
$id = $_GET['id'] ?? '';
if (empty($id)) {
    header('Location: ?page=agents');
    exit;
}

$agent = am_api("/api/agents/$id");

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
$createdFormatted = $createdAt ? date('M j, Y', strtotime($createdAt)) : '-';

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

// Fetch tool security data
$toolSecData = [];
try {
    $toolSecData = am_api("/engine/agents/$id/tool-security");
} catch (Exception $ex) { /* ignore */ }
$agentToolSec = $toolSecData['toolSecurity'] ?? [];
$orgDefaults = $toolSecData['orgDefaults'] ?? [];
$agentOverrides = $toolSecData['agentOverrides'] ?? [];
$tsSec = $agentToolSec['security'] ?? $orgDefaults['security'] ?? ['pathSandbox' => ['enabled' => true, 'allowedDirs' => [], 'blockedPatterns' => []], 'ssrf' => ['enabled' => true, 'allowedHosts' => [], 'blockedCidrs' => []], 'commandSanitizer' => ['enabled' => true, 'mode' => 'blocklist', 'allowedCommands' => [], 'blockedPatterns' => []]];
$tsMw = $agentToolSec['middleware'] ?? $orgDefaults['middleware'] ?? ['audit' => ['enabled' => true, 'redactKeys' => []], 'rateLimit' => ['enabled' => true], 'circuitBreaker' => ['enabled' => true], 'telemetry' => ['enabled' => true]];
$hasOverrides = !empty($agentOverrides) && (isset($agentOverrides['security']) || isset($agentOverrides['middleware']));
$overrideSections = [];
if (!empty($agentOverrides['security'])) $overrideSections = array_merge($overrideSections, array_keys($agentOverrides['security']));
if (!empty($agentOverrides['middleware'])) $overrideSections = array_merge($overrideSections, array_keys($agentOverrides['middleware']));

// Fetch activity data
$events = [];
$tool_calls = [];
$journal_entries = [];
try {
    $evRes = am_api("/api/engine/activity/events?agentId=" . urlencode($id) . "&limit=50");
    $events = $evRes['data'] ?? $evRes['items'] ?? (is_array($evRes) && !isset($evRes['error']) ? $evRes : []);
} catch (Exception $ex) { /* ignore */ }
try {
    $tcRes = am_api("/api/engine/activity/tool-calls?agentId=" . urlencode($id) . "&limit=50");
    $tool_calls = $tcRes['data'] ?? $tcRes['items'] ?? (is_array($tcRes) && !isset($tcRes['error']) ? $tcRes : []);
} catch (Exception $ex) { /* ignore */ }
try {
    $jRes = am_api("/api/engine/journal?agentId=" . urlencode($id) . "&orgId=default&limit=50");
    $journal_entries = $jRes['data'] ?? $jRes['items'] ?? (is_array($jRes) && !isset($jRes['error']) ? $jRes : []);
} catch (Exception $ex) { /* ignore */ }

layout_start('Agent: ' . $displayName, 'agents');
?>
  <div style="margin-bottom:24px">
    <a href="?page=agents" style="color:var(--muted);font-size:13px;text-decoration:none">&larr; Back to Agents</a>
  </div>

  <!-- Agent Header -->
  <div class="card" style="display:flex;align-items:center;gap:20px">
    <div style="width:56px;height:56px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;flex-shrink:0"><?= e($avatarInitial) ?></div>
    <div style="flex:1">
      <h2 style="font-size:20px;font-weight:700;margin-bottom:4px"><?= e($displayName) ?></h2>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <?= badge($status) ?>
        <?= badge($role) ?>
        <?php if ($email): ?>
          <span style="color:var(--dim);font-size:13px"><?= e($email) ?></span>
        <?php endif; ?>
      </div>
    </div>
  </div>

  <!-- Summary Card -->
  <div class="card">
    <div class="card-t">Summary</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">
      <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Status</div><div style="font-weight:600;margin-top:4px"><?= badge($status) ?></div></div>
      <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Role</div><div style="font-weight:600;margin-top:4px"><?= e($role) ?></div></div>
      <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Model</div><div style="font-weight:600;margin-top:4px"><?= e((string)$model) ?></div></div>
      <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Created</div><div style="font-weight:600;margin-top:4px"><?= e($createdFormatted) ?></div></div>
    </div>
  </div>

  <?php if ($description): ?>
  <!-- Description -->
  <div class="card">
    <div class="card-t">Description</div>
    <p style="font-size:14px;color:var(--dim);line-height:1.6"><?= e($description) ?></p>
  </div>
  <?php endif; ?>

  <?php if (!empty($traits) && is_array($traits)): ?>
  <!-- Personality Traits -->
  <div class="card">
    <div class="card-t">Personality Traits</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <?php foreach ($traits as $key => $value): ?>
        <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;background:var(--primary);color:#fff;opacity:0.85"><?= e((string)$key) ?>: <?= e((string)$value) ?></span>
      <?php endforeach; ?>
    </div>
  </div>
  <?php endif; ?>

  <!-- Actions -->
  <div class="card">
    <div class="card-t">Actions</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <form method="POST" style="display:inline"><input type="hidden" name="action" value="agent_deploy"><input type="hidden" name="id" value="<?= e($id) ?>"><button class="btn btn-p" type="submit">Deploy</button></form>
      <form method="POST" style="display:inline"><input type="hidden" name="action" value="agent_stop"><input type="hidden" name="id" value="<?= e($id) ?>"><button class="btn btn-d" type="submit">Stop</button></form>
      <form method="POST" style="display:inline"><input type="hidden" name="action" value="agent_restart"><input type="hidden" name="id" value="<?= e($id) ?>"><button class="btn" type="submit">Restart</button></form>
    </div>
  </div>

  <!-- Personal Details -->
  <?php if ($gender || $dob || $maritalStatus || $culturalBackground || $language): ?>
  <div class="card">
    <div class="card-t">Personal Details</div>
    <table>
      <tbody>
        <?php if ($gender): ?><tr><td style="font-weight:600;width:200px;color:var(--muted)">Gender</td><td><?= e($gender) ?></td></tr><?php endif; ?>
        <?php if ($dob): ?><tr><td style="font-weight:600;width:200px;color:var(--muted)">Date of Birth</td><td><?= e($dob) ?></td></tr><?php endif; ?>
        <?php if ($maritalStatus): ?><tr><td style="font-weight:600;width:200px;color:var(--muted)">Marital Status</td><td><?= e($maritalStatus) ?></td></tr><?php endif; ?>
        <?php if ($culturalBackground): ?><tr><td style="font-weight:600;width:200px;color:var(--muted)">Cultural Background</td><td><?= e($culturalBackground) ?></td></tr><?php endif; ?>
        <?php if ($language): ?><tr><td style="font-weight:600;width:200px;color:var(--muted)">Language</td><td><?= e($language) ?></td></tr><?php endif; ?>
      </tbody>
    </table>
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
    $riskColor = $riskColors[strtolower($maxRisk)] ?? 'var(--muted)';

    $callsMin = $rateLimits['toolCallsPerMinute'] ?? $rateLimits['calls_per_minute'] ?? null;
    $callsHr  = $rateLimits['toolCallsPerHour']   ?? $rateLimits['calls_per_hour']   ?? null;
  ?>
  <div class="card">
    <div class="card-t">Permission Profile</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Profile Name</div>
        <div style="font-weight:600;margin-top:4px"><?= e($profileName) ?></div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Max Risk Level</div>
        <div style="margin-top:4px">
          <?php if ($maxRisk): ?>
            <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:<?= $riskColor ?>;color:#fff"><?= e(ucfirst($maxRisk)) ?></span>
          <?php else: ?>
            <span style="color:var(--muted)">-</span>
          <?php endif; ?>
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Sandbox Mode</div>
        <div style="font-weight:600;margin-top:4px"><?= $sandboxMode ? 'Enabled' : 'Disabled' ?></div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Rate Limits</div>
        <div style="font-weight:600;margin-top:4px">
          <?php if ($callsMin !== null || $callsHr !== null): ?>
            <?php if ($callsMin !== null): ?><span><?= e($callsMin) ?>/min</span><?php endif; ?>
            <?php if ($callsMin !== null && $callsHr !== null): ?><span style="color:var(--muted);margin:0 4px">&middot;</span><?php endif; ?>
            <?php if ($callsHr !== null): ?><span><?= e($callsHr) ?>/hr</span><?php endif; ?>
          <?php else: ?>
            <span style="color:var(--muted)">None set</span>
          <?php endif; ?>
        </div>
      </div>
    </div>
    <?php if (!empty($blockedEffects) && is_array($blockedEffects)): ?>
    <div style="margin-top:16px">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Blocked Side Effects</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        <?php foreach ($blockedEffects as $effect): ?>
          <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:500;background:#ef4444;color:#fff"><?= e((string)$effect) ?></span>
        <?php endforeach; ?>
      </div>
    </div>
    <?php endif; ?>
  </div>
  <?php endif; ?>

  <!-- Tool Security -->
  <div class="card">
    <div class="card-t">Tool Security</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <p style="font-size:13px;color:var(--dim);margin:0">Configure tool security overrides for this agent. Unmodified settings inherit from <strong>org defaults</strong>.</p>
      <div style="display:flex;gap:8px">
        <?php if ($hasOverrides): ?>
        <form method="POST" style="display:inline"><input type="hidden" name="action" value="reset_agent_tool_security"><input type="hidden" name="agent_id" value="<?= e($id) ?>"><button class="btn btn-sm" type="submit" onclick="return confirm('Reset all tool security overrides to org defaults?')">Reset to Org Defaults</button></form>
        <?php endif; ?>
      </div>
    </div>

    <?php if ($hasOverrides): ?>
    <div style="padding:8px 12px;border-radius:6px;background:rgba(232,67,147,0.08);border:1px solid rgba(232,67,147,0.2);font-size:12px;color:var(--dim);margin-bottom:16px;display:flex;align-items:center;gap:8px">
      &#9432; This agent has custom overrides for: <strong><?= e(implode(', ', $overrideSections) ?: 'none') ?></strong>
    </div>
    <?php endif; ?>

    <form method="POST">
      <input type="hidden" name="action" value="save_agent_tool_security">
      <input type="hidden" name="agent_id" value="<?= e($id) ?>">

      <!-- Security Sandboxes -->
      <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Security Sandboxes</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Path Sandbox -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">Path Sandbox</div>
          <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Controls which directories this agent can read/write.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:13px;font-weight:500">Enable path sandboxing</span>
            <input type="checkbox" name="ps_enabled" <?= ($tsSec['pathSandbox']['enabled'] ?? true) ? 'checked' : '' ?>>
          </div>
          <div class="fg" style="margin-bottom:8px">
            <label class="fl">Allowed Directories (comma-separated)</label>
            <input class="input" name="ps_allowedDirs" value="<?= e(implode(', ', $tsSec['pathSandbox']['allowedDirs'] ?? [])) ?>" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px">
          </div>
          <div class="fg">
            <label class="fl">Blocked Patterns (comma-separated)</label>
            <input class="input" name="ps_blockedPatterns" value="<?= e(implode(', ', $tsSec['pathSandbox']['blockedPatterns'] ?? [])) ?>" placeholder="\.env$" style="font-family:monospace;font-size:12px">
          </div>
        </div>

        <!-- SSRF Protection -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">SSRF Protection</div>
          <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Blocks this agent from accessing internal networks and metadata endpoints.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:13px;font-weight:500">Enable SSRF protection</span>
            <input type="checkbox" name="ssrf_enabled" <?= ($tsSec['ssrf']['enabled'] ?? true) ? 'checked' : '' ?>>
          </div>
          <div class="fg" style="margin-bottom:8px">
            <label class="fl">Allowed Hosts (comma-separated)</label>
            <input class="input" name="ssrf_allowedHosts" value="<?= e(implode(', ', $tsSec['ssrf']['allowedHosts'] ?? [])) ?>" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
          </div>
          <div class="fg">
            <label class="fl">Blocked CIDRs (comma-separated)</label>
            <input class="input" name="ssrf_blockedCidrs" value="<?= e(implode(', ', $tsSec['ssrf']['blockedCidrs'] ?? [])) ?>" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px">
          </div>
        </div>
      </div>

      <!-- Command Sanitizer (full width) -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Command Sanitizer</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Controls which shell commands this agent can execute.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:13px;font-weight:500">Enable command validation</span>
          <input type="checkbox" name="cs_enabled" <?= ($tsSec['commandSanitizer']['enabled'] ?? true) ? 'checked' : '' ?>>
        </div>
        <div class="fg" style="margin-bottom:10px">
          <label class="fl">Mode</label>
          <select class="input" name="cs_mode" style="width:250px">
            <option value="blocklist" <?= ($tsSec['commandSanitizer']['mode'] ?? 'blocklist') === 'blocklist' ? 'selected' : '' ?>>Blocklist</option>
            <option value="allowlist" <?= ($tsSec['commandSanitizer']['mode'] ?? 'blocklist') === 'allowlist' ? 'selected' : '' ?>>Allowlist</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="fg">
            <label class="fl">Allowed Commands (comma-separated)</label>
            <input class="input" name="cs_allowedCommands" value="<?= e(implode(', ', $tsSec['commandSanitizer']['allowedCommands'] ?? [])) ?>" placeholder="git, npm, node" style="font-family:monospace;font-size:12px">
          </div>
          <div class="fg">
            <label class="fl">Blocked Patterns (comma-separated)</label>
            <input class="input" name="cs_blockedPatterns" value="<?= e(implode(', ', $tsSec['commandSanitizer']['blockedPatterns'] ?? [])) ?>" placeholder="curl.*\|.*sh" style="font-family:monospace;font-size:12px">
          </div>
        </div>
      </div>

      <!-- Middleware & Observability -->
      <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:20px">Middleware &amp; Observability</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Audit Logging -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">Audit Logging</div>
          <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Logs every tool invocation for this agent.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:13px;font-weight:500">Enable audit logging</span>
            <input type="checkbox" name="audit_enabled" <?= ($tsMw['audit']['enabled'] ?? true) ? 'checked' : '' ?>>
          </div>
          <div class="fg">
            <label class="fl">Keys to Redact (comma-separated)</label>
            <input class="input" name="audit_redactKeys" value="<?= e(implode(', ', $tsMw['audit']['redactKeys'] ?? [])) ?>" placeholder="custom_secret" style="font-family:monospace;font-size:12px">
          </div>
        </div>

        <!-- Rate Limiting -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">Rate Limiting</div>
          <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Per-tool rate limits for this agent.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:13px;font-weight:500">Enable rate limiting</span>
            <input type="checkbox" name="rl_enabled" <?= ($tsMw['rateLimit']['enabled'] ?? true) ? 'checked' : '' ?>>
          </div>
        </div>

        <!-- Circuit Breaker -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">Circuit Breaker</div>
          <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Auto-stops calling failing tools after consecutive failures.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:13px;font-weight:500">Enable circuit breaker</span>
            <input type="checkbox" name="cb_enabled" <?= ($tsMw['circuitBreaker']['enabled'] ?? true) ? 'checked' : '' ?>>
          </div>
        </div>

        <!-- Telemetry -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">Telemetry</div>
          <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Collects execution timing and metrics for this agent's tools.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:13px;font-weight:500">Enable telemetry</span>
            <input type="checkbox" name="tel_enabled" <?= ($tsMw['telemetry']['enabled'] ?? true) ? 'checked' : '' ?>>
          </div>
        </div>
      </div>

      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-p" type="submit">Save Tool Security Overrides</button>
      </div>
    </form>
  </div>

  <!-- Activity -->
  <div class="card">
    <div class="card-t">Activity</div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:0">
      <button data-activity-tab="events" onclick="switchActivityTab('events')" class="active" style="padding:8px 16px;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid var(--primary);color:var(--primary)">Events</button>
      <button data-activity-tab="toolcalls" onclick="switchActivityTab('toolcalls')" style="padding:8px 16px;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;color:var(--muted)">Tool Calls</button>
      <button data-activity-tab="journal" onclick="switchActivityTab('journal')" style="padding:8px 16px;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;color:var(--muted)">Journal</button>
    </div>

    <!-- Events Panel -->
    <div id="panel-events" class="activity-panel" style="display:block">
      <?php if (empty($events)): ?>
        <p style="padding:16px;color:var(--muted);font-size:13px">No events found.</p>
      <?php else: ?>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Type</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Status</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Time</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($events as $ev): ?>
                <tr onclick="showActivityDetail('<?= htmlspecialchars(json_encode($ev), ENT_QUOTES) ?>', 'Event Detail')" style="cursor:pointer;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
                  <td style="padding:8px 12px;font-size:13px"><?= e($ev['type'] ?? $ev['event'] ?? '-') ?></td>
                  <td style="padding:8px 12px;font-size:13px"><?= badge($ev['status'] ?? 'unknown') ?></td>
                  <td style="padding:8px 12px;font-size:13px;color:var(--muted)"><?= e(time_ago($ev['createdAt'] ?? $ev['created_at'] ?? $ev['timestamp'] ?? '')) ?></td>
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
        <p style="padding:16px;color:var(--muted);font-size:13px">No tool calls found.</p>
      <?php else: ?>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Tool</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Status</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Duration</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Time</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($tool_calls as $tc): ?>
                <tr onclick="showActivityDetail('<?= htmlspecialchars(json_encode($tc), ENT_QUOTES) ?>', 'Tool Call Detail')" style="cursor:pointer;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
                  <td style="padding:8px 12px;font-size:13px;font-weight:600"><?= e($tc['toolName'] ?? $tc['tool_name'] ?? $tc['name'] ?? '-') ?></td>
                  <td style="padding:8px 12px;font-size:13px"><?= badge($tc['status'] ?? 'unknown') ?></td>
                  <td style="padding:8px 12px;font-size:13px;color:var(--muted)"><?= e(isset($tc['duration']) ? $tc['duration'] . 'ms' : '-') ?></td>
                  <td style="padding:8px 12px;font-size:13px;color:var(--muted)"><?= e(time_ago($tc['createdAt'] ?? $tc['created_at'] ?? $tc['timestamp'] ?? '')) ?></td>
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
        <p style="padding:16px;color:var(--muted);font-size:13px">No journal entries found.</p>
      <?php else: ?>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Action</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Status</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Time</th>
                <th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--muted);text-transform:uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($journal_entries as $je): ?>
                <tr style="border-bottom:1px solid var(--border)">
                  <td onclick="showActivityDetail('<?= htmlspecialchars(json_encode($je), ENT_QUOTES) ?>', 'Journal Entry')" style="cursor:pointer;padding:8px 12px;font-size:13px"><?= e($je['action'] ?? $je['type'] ?? '-') ?></td>
                  <td onclick="showActivityDetail('<?= htmlspecialchars(json_encode($je), ENT_QUOTES) ?>', 'Journal Entry')" style="cursor:pointer;padding:8px 12px;font-size:13px"><?= badge($je['status'] ?? 'unknown') ?></td>
                  <td onclick="showActivityDetail('<?= htmlspecialchars(json_encode($je), ENT_QUOTES) ?>', 'Journal Entry')" style="cursor:pointer;padding:8px 12px;font-size:13px;color:var(--muted)"><?= e(time_ago($je['createdAt'] ?? $je['created_at'] ?? $je['timestamp'] ?? '')) ?></td>
                  <td style="padding:8px 12px">
                    <?php if (!empty($je['reversible'])): ?>
                      <button onclick="rollbackJournal('<?= e($je['id'] ?? '') ?>')" style="padding:4px 10px;font-size:11px;font-weight:600;border:1px solid #ef4444;color:#ef4444;background:none;border-radius:4px;cursor:pointer">Rollback</button>
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
        <button onclick="closeActivityModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);padding:4px 8px">&times;</button>
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
    t.style.color = 'var(--muted)';
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
    else if (typeof val === 'boolean') val = '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:' + (val ? '#22c55e20' : '#88888820') + ';color:' + (val ? '#22c55e' : '#888') + '">' + (val ? 'Yes' : 'No') + '</span>';
    else if ((key.includes('At') || key.includes('time') || key.includes('date')) && !isNaN(Date.parse(val))) val = new Date(val).toLocaleString();
    html += '<div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase">' + label + '</div>';
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
  fetch('<?= $API_URL ?>/api/engine/journal/' + id + '/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  .then(function(r) { return r.json(); })
  .then(function(d) { if (d.success) location.reload(); else alert('Failed: ' + (d.error || 'Unknown')); })
  .catch(function(e) { alert(e.message); });
}
</script>

<?php
layout_end();

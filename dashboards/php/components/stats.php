<?php
/**
 * AgenticMail Stats Component
 */

/**
 * Render the stats card grid.
 *
 * @param array $stats Associative array with keys: totalAgents, activeAgents, totalUsers, totalAuditEvents
 */
function render_stats(array $stats): void {
?>
<div class="stats">
  <div class="stat"><div class="l">Total Agents</div><div class="v" style="color:var(--primary)"><?= (int)($stats['totalAgents'] ?? 0) ?></div></div>
  <div class="stat"><div class="l">Active Agents</div><div class="v" style="color:var(--success)"><?= (int)($stats['activeAgents'] ?? 0) ?></div></div>
  <div class="stat"><div class="l">Users</div><div class="v"><?= (int)($stats['totalUsers'] ?? 0) ?></div></div>
  <div class="stat"><div class="l">Audit Events</div><div class="v"><?= (int)($stats['totalAuditEvents'] ?? 0) ?></div></div>
</div>
<?php
}

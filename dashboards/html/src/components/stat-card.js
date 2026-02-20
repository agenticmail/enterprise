// Stats card grid rendering

export function stat(label, value, color) {
  return '<div class="stat-card"><div class="label">' + label + '</div><div class="value" style="color:' + color + '">' + value + '</div></div>';
}

export function renderStats(statsObj) {
  return '<div class="stats-row">' +
    stat('Total Agents', statsObj.totalAgents, 'var(--primary)') +
    stat('Active Agents', statsObj.activeAgents, 'var(--success)') +
    stat('Users', statsObj.totalUsers, 'var(--text)') +
    stat('Audit Events', statsObj.totalAuditEvents, 'var(--text)') +
    '</div>';
}

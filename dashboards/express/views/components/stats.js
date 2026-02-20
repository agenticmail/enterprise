/**
 * AgenticMail Enterprise Dashboard — Stat Card Grid Builder
 */

const { esc } = require('../../utils/helpers');

/**
 * Build a stats grid from an array of { label, value, pink? } objects.
 */
function statsGrid(items) {
  const cards = items.map(item => {
    const cls = item.pink ? ' pink' : '';
    return `<div class="stat-card">
      <div class="label">${esc(item.label)}</div>
      <div class="value${cls}">${esc(String(item.value))}</div>
    </div>`;
  }).join('\n');

  return `<div class="stats-grid">${cards}</div>`;
}

module.exports = { statsGrid };

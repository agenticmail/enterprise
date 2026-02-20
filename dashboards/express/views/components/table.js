/**
 * AgenticMail Enterprise Dashboard — Table Builder Helper
 */

/**
 * Build an HTML table from headers and rows.
 * @param {string[]} headers - Column header labels
 * @param {string[][]} rows - Array of row arrays (already escaped/formatted HTML strings)
 * @param {string} emptyIcon - Icon for empty state
 * @param {string} emptyText - Text for empty state
 */
function buildTable(headers, rows, emptyIcon, emptyText) {
  if (!rows || rows.length === 0) {
    return `<div class="empty"><span class="icon">${emptyIcon}</span>${emptyText}</div>`;
  }

  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = rows.map(row => {
    const cells = row.map(cell => `<td>${cell}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `<div class="table-wrap">
    <table>
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>`;
}

module.exports = { buildTable };

// Pagination controls

export function renderPagination(page, total, limit, onPrevId, onNextId) {
  var pages = Math.ceil(total / limit) || 1;
  var prevDisabled = page === 0 ? 'disabled' : '';
  var nextDisabled = (page + 1) * limit >= total ? 'disabled' : '';
  return '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px">' +
    '<button class="btn btn-sm" ' + prevDisabled + ' id="' + onPrevId + '">\u2190 Prev</button>' +
    '<span style="padding:6px 12px;font-size:12px;color:var(--text-muted)">Page ' + (page + 1) + ' of ' + pages + '</span>' +
    '<button class="btn btn-sm" ' + nextDisabled + ' id="' + onNextId + '">Next \u2192</button>' +
    '</div>';
}

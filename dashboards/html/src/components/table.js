// Generic table builder

export function renderTable(headers, rows) {
  var ths = headers.map(function(h) { return '<th>' + h + '</th>'; }).join('');
  return '<div class="table-wrap"><table><thead><tr>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

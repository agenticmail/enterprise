// Badge rendering utilities

export function badge(text, type) {
  return '<span class="badge badge-' + type + '">' + text + '</span>';
}

export function statusBadge(status) {
  return badge(status, status);
}

export function roleBadge(role) {
  return badge(role, role);
}

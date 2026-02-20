// Navigation and page header rendering

export function updateNav(page) {
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-page') === page);
  });
}

export function renderPageHeader(title, desc) {
  return '<h2 class="page-title">' + title + '</h2><p class="page-desc">' + desc + '</p>';
}

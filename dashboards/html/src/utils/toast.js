// Toast notification

export function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type || '';
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.style.display = 'none'; }, 3000);
}

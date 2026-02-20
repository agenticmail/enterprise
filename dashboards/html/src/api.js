// API configuration and fetch wrapper

export let API_URL = 'http://localhost:3000';
export let token = localStorage.getItem('am_token');

export function getApiUrl() {
  return localStorage.getItem('am_api_url') || API_URL;
}

export function setApiUrl(url) {
  API_URL = url;
}

export function setToken(t) {
  token = t;
}

export function clearToken() {
  token = null;
}

export function api(path, opts) {
  opts = opts || {};
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(getApiUrl() + '/api' + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(function(r) {
    return r.json().then(function(d) {
      if (!r.ok) throw new Error(d.error || 'Request failed');
      return d;
    });
  });
}

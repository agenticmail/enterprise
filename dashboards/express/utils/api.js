/**
 * AgenticMail Enterprise Dashboard — API Client
 * Uses built-in fetch (Node 18+)
 */

const API_URL = process.env.AGENTICMAIL_URL || 'http://localhost:3000';

async function api(path, token, method = 'GET', body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${API_URL}${path}`, opts);
    const data = await r.json();
    return { status: r.status, body: data };
  } catch (e) {
    return { status: 0, body: { error: e.message } };
  }
}

function apiGet(path, token) {
  return api(path, token, 'GET');
}

function apiPost(path, token, body) {
  return api(path, token, 'POST', body);
}

function apiPatch(path, token, body) {
  return api(path, token, 'PATCH', body);
}

function apiPut(path, token, body) {
  return api(path, token, 'PUT', body);
}

function apiDelete(path, token) {
  return api(path, token, 'DELETE');
}

module.exports = { API_URL, api, apiGet, apiPost, apiPatch, apiPut, apiDelete };

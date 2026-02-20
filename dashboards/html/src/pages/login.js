// Login page — form handler

import { getApiUrl, setToken } from '../api.js';

export var currentUser = null;

var _showAppCallback = null;

export function setShowAppCallback(fn) {
  _showAppCallback = fn;
}

export function setCurrentUser(u) {
  currentUser = u;
}

export function initLogin() {
  var form = document.querySelector('#login-box form');
  if (form) {
    form.onsubmit = function(e) {
      doLogin(e);
    };
  }
}

function doLogin(e) {
  e.preventDefault();
  var btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  fetch(getApiUrl() + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    }),
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) throw new Error(d.error);
      setToken(d.token);
      localStorage.setItem('am_token', d.token);
      currentUser = d.user;
      if (_showAppCallback) _showAppCallback();
    })
    .catch(function(err) {
      document.getElementById('login-error').style.display = 'block';
      document.getElementById('login-error').textContent = err.message;
    })
    .finally(function() {
      btn.textContent = 'Sign In';
      btn.disabled = false;
    });
}

export function doLogout() {
  localStorage.removeItem('am_token');
  setToken(null);
  currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

export function checkAuth() {
  var storedToken = localStorage.getItem('am_token');
  if (!storedToken) return;
  setToken(storedToken);
  fetch(getApiUrl() + '/auth/me', {
    headers: { 'Authorization': 'Bearer ' + storedToken },
  })
    .then(function(r) {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then(function(u) {
      currentUser = u;
      if (_showAppCallback) _showAppCallback();
    })
    .catch(function() {
      localStorage.removeItem('am_token');
      setToken(null);
    });
}

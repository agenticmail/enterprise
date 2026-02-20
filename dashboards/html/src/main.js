// Entry point: import all modules, check auth on load, init router

import { getApiUrl, setApiUrl } from './api.js';
import { navigate } from './router.js';
import * as login from './pages/login.js';
import { initAgentModal } from './pages/agents.js';
import { initUserModal } from './pages/users.js';
import { initApiKeyModal } from './pages/api-keys.js';
import { initDlpModal } from './pages/dlp.js';
import { initAnomalyRuleModal } from './pages/guardrails.js';
import { initMessageModal } from './pages/messages.js';
import { initComplianceModal } from './pages/compliance.js';

// --- Show App (called after successful auth) ---

function showApp() {
  var user = login.currentUser;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-email').textContent = user.email;
  navigate('dashboard');
}

// Register the showApp callback with the login module
login.setShowAppCallback(showApp);

// --- Setup Banner ---

function initSetup() {
  if (getApiUrl() === 'http://localhost:3000' && !localStorage.getItem('am_api_url')) {
    document.getElementById('setup-banner').style.display = 'block';
  }
  var setupBtn = document.querySelector('#setup-banner button');
  if (setupBtn) {
    setupBtn.onclick = function() {
      var url = document.getElementById('setup-url').value.trim().replace(/\/+$/, '');
      if (!url) return;
      localStorage.setItem('am_api_url', url);
      setApiUrl(url);
      document.getElementById('setup-banner').style.display = 'none';
      location.reload();
    };
  }
}

// --- Nav Button Wiring ---

function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(function(el) {
    el.onclick = function() {
      navigate(el.getAttribute('data-page'));
    };
  });

  // Logout link
  var logoutLink = document.querySelector('.sidebar-footer a');
  if (logoutLink) {
    logoutLink.onclick = function() {
      login.doLogout();
    };
  }
}

// --- Init Modal Forms ---

function initModals() {
  initAgentModal();
  initUserModal();
  initApiKeyModal();
  initDlpModal();
  initAnomalyRuleModal();
  initMessageModal();
  initComplianceModal();
}

// --- Boot ---

initSetup();
login.initLogin();
initNav();
initModals();
login.checkAuth();

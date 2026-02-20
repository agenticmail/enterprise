/**
 * AgenticMail Enterprise Dashboard — Express.js Edition
 *
 * Modular multi-file structure with full CRUD feature parity.
 *
 * Setup:
 *   npm install express express-session
 *   node app.js
 *
 * Or: AGENTICMAIL_URL=https://your-company.agenticmail.io node app.js
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const { randomUUID } = require('crypto');
const { API_URL } = require('./utils/api');

const app = express();

// ─── Body Parsing ────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── Session ─────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || randomUUID(),
  resave: false,
  saveUninitialized: false,
}));

// ─── Static Files ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Routes ──────────────────────────────────────────────
app.use(require('./routes/auth'));
app.use(require('./routes/dashboard'));
app.use(require('./routes/agents'));
app.use(require('./routes/users'));
app.use(require('./routes/apiKeys'));
app.use(require('./routes/audit'));
app.use(require('./routes/settings'));
app.use(require('./routes/dlp'));
app.use(require('./routes/guardrails'));
app.use(require('./routes/journal'));
app.use(require('./routes/messages'));
app.use(require('./routes/compliance'));
app.use(require('./routes/vault'));
app.use(require('./routes/skills'));

// ─── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`\n  AgenticMail Enterprise Dashboard (Express.js)`);
  console.log(`  API:       ${API_URL}`);
  console.log(`  Dashboard: http://localhost:${PORT}\n`);
});

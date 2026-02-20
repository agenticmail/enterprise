/**
 * AgenticMail Enterprise Dashboard — Auth Routes
 * GET /login, POST /login, GET /logout
 */

const { Router } = require('express');
const { apiPost } = require('../utils/api');
const { loginPage } = require('../views/login');

const router = Router();

router.get('/login', (req, res) => {
  if (req.session.token) return res.redirect('/');
  res.send(loginPage(null));
});

router.post('/login', async (req, res) => {
  const result = await apiPost('/auth/login', null, {
    email: req.body.email,
    password: req.body.password,
  });

  if (result.status === 200 && result.body && result.body.token) {
    req.session.token = result.body.token;
    req.session.user = result.body.user || { email: req.body.email };
    return res.redirect('/');
  }

  const error = (result.body && result.body.error) || 'Invalid credentials';
  res.send(loginPage(error));
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;

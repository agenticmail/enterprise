/**
 * AgenticMail Enterprise Dashboard — Auth Middleware
 */

function requireAuth(req, res, next) {
  if (!req.session.token) return res.redirect('/login');
  next();
}

module.exports = { requireAuth };

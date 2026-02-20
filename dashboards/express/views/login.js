/**
 * AgenticMail Enterprise Dashboard — Login View
 */

const { esc } = require('../utils/helpers');

function loginPage(error) {
  const errorHtml = error
    ? `<div class="login-error">${esc(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign In - AgenticMail Enterprise</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="login-screen">
  <div class="login-box">
    <h1>&#127970; AgenticMail Enterprise</h1>
    <p class="subtitle">Admin Dashboard &middot; Express</p>
    <div class="login-card">
      ${errorHtml}
      <form method="post" action="/login">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" required autofocus placeholder="admin@company.com">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="Enter password">
        </div>
        <button class="btn btn-primary btn-block" type="submit">Sign In</button>
      </form>
    </div>
  </div>
</div>
</body>
</html>`;
}

module.exports = { loginPage };

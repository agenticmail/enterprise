<?php
/**
 * Login Page
 */
global $API_URL;
$flash = get_flash();
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — AgenticMail Enterprise</title>
  <link rel="stylesheet" href="public/styles.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-box">
    <h1>&#127970; <em>AgenticMail</em> Enterprise</h1>
    <p class="sub">Sign in to your dashboard</p>
    <?php if ($flash && $flash['type'] === 'error'): ?>
      <div class="alert alert-e"><?= e($flash['msg']) ?></div>
    <?php endif; ?>
    <form method="POST">
      <input type="hidden" name="action" value="login">
      <div class="fg"><label class="fl">Email</label><input class="input" type="email" name="email" required autofocus></div>
      <div class="fg"><label class="fl">Password</label><input class="input" type="password" name="password" required></div>
      <button class="btn btn-p" style="width:100%;justify-content:center" type="submit">Sign In</button>
    </form>
    <p style="text-align:center;margin-top:16px;font-size:11px;color:var(--muted)">Connected to: <?= e($API_URL) ?></p>
  </div>
</div>
</body>
</html>

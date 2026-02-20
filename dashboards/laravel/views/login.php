<?php
/**
 * Login — standalone login form page.
 * Expects: $error (string, may be empty)
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login &mdash; AgenticMail Enterprise</title>
    <link rel="stylesheet" href="/public/styles.css">
</head>
<body>
    <div class="login-screen">
        <div class="login-box">
            <h1>&#x1F3E2; AgenticMail Enterprise</h1>
            <p class="subtitle">Sign in to your account</p>
            <div class="login-card">
<?php if (!empty($error)): ?>
                <div class="login-error"><?= Helpers::e($error) ?></div>
<?php endif; ?>
                <form method="post" action="/login">
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input id="email" type="email" name="email" required autofocus>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input id="password" type="password" name="password" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block">Sign In</button>
                </form>
            </div>
        </div>
    </div>
    <script>
    (function() {
        var saved = localStorage.getItem('theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
    })();
    </script>
</body>
</html>

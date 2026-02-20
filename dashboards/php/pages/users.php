<?php
/**
 * Users Page — Create form + list table
 */
$users = am_api('/api/users');

layout_start('Users', 'users');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Users</h2><p class="desc" style="margin:0">Manage team members</p></div>
    <button class="btn btn-p" onclick="document.getElementById('modal-user').style.display='flex'">+ New User</button>
  </div>
  <div class="card">
    <?php $list = $users['users'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#128101;</div>No users yet</div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr></thead><tbody>
      <?php foreach ($list as $u2): ?>
        <tr><td style="font-weight:600"><?= e($u2['name']) ?></td><td style="color:var(--dim)"><?= e($u2['email']) ?></td><td><?= badge($u2['role']) ?></td><td style="color:var(--muted);font-size:12px"><?= isset($u2['lastLoginAt']) ? date('M j, Y g:i A', strtotime($u2['lastLoginAt'])) : 'Never' ?></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <div id="modal-user" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Create User</h3>
      <form method="POST"><input type="hidden" name="action" value="create_user">
        <div class="fg"><label class="fl">Name</label><input class="input" name="name" required></div>
        <div class="fg"><label class="fl">Email</label><input class="input" type="email" name="email" required></div>
        <div class="fg"><label class="fl">Role</label><select class="input" name="role"><option>member</option><option>admin</option><option>owner</option><option>viewer</option></select></div>
        <div class="fg"><label class="fl">Password</label><input class="input" type="password" name="password" required minlength="8"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Create</button></div>
      </form>
    </div>
  </div>
<?php
layout_end();

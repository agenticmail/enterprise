<?php
/**
 * Users page — create form + user list.
 * Expects: $items (array of user records)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Create User</h3>
    <form method="post" action="/users" class="inline-form">
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="name" placeholder="Full name" required>
        </div>
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="email" name="email" placeholder="Email" required>
        </div>
        <div class="form-group" style="min-width:120px;margin-bottom:0">
            <select name="role">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">Create</button>
    </form>
</div>

<?php
$headers = ['Name', 'Email', 'Role'];
$rows = [];
foreach ($items as $u) {
    $name  = Helpers::e($u['name'] ?? '-');
    $email = Helpers::e($u['email'] ?? '-');
    $role  = $u['role'] ?? 'member';
    $badge = Helpers::statusBadge($role);
    $rows[] = [$name, $email, $badge];
}
?>

<div class="card">
    <h3>Users</h3>
    <?= renderTable($headers, $rows) ?>
</div>

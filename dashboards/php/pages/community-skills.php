<?php
/**
 * Community Skills Page — Browse and install community skills
 */

layout_start('Community Skills', 'community-skills');
?>

<h2 class="title">Community Skills</h2>
<p class="desc">Browse and install skills shared by the community</p>

<div class="card">
  <div class="card-t">Featured Skills</div>
  <div class="empty">
    <div class="empty-i">🏪</div>
    <p>No community skills available</p>
    <small>Community-shared skills will appear here</small>
  </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
  <div class="card">
    <div class="card-t">Popular Categories</div>
    <div class="empty">
      <div class="empty-i">🏷️</div>
      <p>No categories</p>
    </div>
  </div>
  
  <div class="card">
    <div class="card-t">My Contributions</div>
    <div class="empty">
      <div class="empty-i">📤</div>
      <p>No contributions</p>
    </div>
  </div>
</div>

<?php layout_end(); ?>
<?php
/**
 * Knowledge Hub Page — Community knowledge sharing and contributions
 */

layout_start('Knowledge Hub', 'knowledge-contributions');
?>

<h2 class="title">Knowledge Hub</h2>
<p class="desc">Share knowledge and learn from the community</p>

<div class="tabs">
  <div class="tab active">Community</div>
  <div class="tab">My Contributions</div>
  <div class="tab">Bookmarks</div>
</div>

<div class="card">
  <div class="card-t">Featured Knowledge</div>
  <div class="empty">
    <div class="empty-i">🌟</div>
    <p>No featured knowledge available</p>
    <small>Community-shared knowledge will appear here</small>
  </div>
</div>

<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 20px;">
  <div class="card">
    <div class="card-t">Latest Contributions</div>
    <div class="empty">
      <div class="empty-i">📝</div>
      <p>No contributions yet</p>
      <small>Recent knowledge contributions will appear here</small>
    </div>
  </div>
  
  <div class="card">
    <div class="card-t">Trending Topics</div>
    <div class="empty">
      <div class="empty-i">🔥</div>
      <p>No trending topics</p>
      <small>Popular knowledge topics will appear here</small>
    </div>
  </div>
</div>

<?php layout_end(); ?>
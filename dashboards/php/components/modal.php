<?php
/**
 * AgenticMail Modal Component
 */

/**
 * Render a modal overlay with a card inside.
 *
 * @param string $id    The modal element ID
 * @param string $title Modal heading text
 * @param string $body  Inner HTML of the modal (typically a form)
 */
function render_modal(string $id, string $title, string $body): void {
?>
<div id="<?= e($id) ?>" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
  <div class="card" style="width:440px;max-width:90vw">
    <h3 style="margin-bottom:16px"><?= e($title) ?></h3>
    <?= $body ?>
  </div>
</div>
<?php
}

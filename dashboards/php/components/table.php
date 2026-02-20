<?php
/**
 * AgenticMail Table Component
 */

/**
 * Render an HTML table.
 *
 * @param array $headers Array of header strings
 * @param array $rows    Array of row arrays (each row is an array of cell HTML strings)
 */
function render_table(array $headers, array $rows): void {
?>
<table>
  <thead>
    <tr>
      <?php foreach ($headers as $h): ?>
        <th><?= $h ?></th>
      <?php endforeach; ?>
    </tr>
  </thead>
  <tbody>
    <?php foreach ($rows as $row): ?>
      <tr>
        <?php foreach ($row as $cell): ?>
          <td><?= $cell ?></td>
        <?php endforeach; ?>
      </tr>
    <?php endforeach; ?>
  </tbody>
</table>
<?php
}

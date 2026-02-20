<?php
/**
 * Render an HTML table.
 *
 * @param array $headers  Array of header labels: ['Name', 'Email', 'Role']
 * @param array $rows     Array of row arrays: [['John', 'john@example.com', '<span class="badge">admin</span>']]
 * @return string  HTML string
 */
function renderTable(array $headers, array $rows): string
{
    $html = '<div class="table-wrap"><table><thead><tr>';
    foreach ($headers as $header) {
        $html .= '<th>' . Helpers::e($header) . '</th>';
    }
    $html .= '</tr></thead><tbody>';

    if (empty($rows)) {
        $colSpan = count($headers);
        $html .= '<tr><td colspan="' . $colSpan . '">';
        $html .= '<div class="empty"><span class="icon">&#128196;</span>No records found.</div>';
        $html .= '</td></tr>';
    } else {
        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($row as $cell) {
                // Cells may contain raw HTML (badges, buttons), so don't escape
                $html .= '<td>' . $cell . '</td>';
            }
            $html .= '</tr>';
        }
    }

    $html .= '</tbody></table></div>';
    return $html;
}

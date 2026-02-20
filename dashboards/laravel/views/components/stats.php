<?php
/**
 * Render a grid of stat cards.
 *
 * @param array $stats  Array of ['label' => '...', 'value' => '...'] items
 * @return string  HTML string
 */
function renderStats(array $stats): string
{
    $html = '<div class="stats-grid">';
    foreach ($stats as $stat) {
        $label = Helpers::e($stat['label'] ?? '');
        $value = Helpers::e((string)($stat['value'] ?? '0'));
        $html .= '<div class="stat-card">';
        $html .= '<div class="label">' . $label . '</div>';
        $html .= '<div class="value pink">' . $value . '</div>';
        $html .= '</div>';
    }
    $html .= '</div>';
    return $html;
}

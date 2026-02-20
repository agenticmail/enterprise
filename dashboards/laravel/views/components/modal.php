<?php
/**
 * Render a modal dialog.
 *
 * @param string $id          Modal ID for JS toggling
 * @param string $modalTitle  Modal heading text
 * @param string $formAction  Form action URL
 * @param array  $fields      Array of field definitions:
 *                             [['name'=>'...', 'label'=>'...', 'type'=>'text', 'required'=>true, 'options'=>[...]]]
 * @return string  HTML string
 */
function renderModal(string $id, string $modalTitle, string $formAction, array $fields): string
{
    $h = Helpers::e($modalTitle);
    $a = Helpers::e($formAction);

    $html = '<div class="modal-overlay" id="' . Helpers::e($id) . '">';
    $html .= '<div class="modal">';
    $html .= '<h3>' . $h . '</h3>';
    $html .= '<form method="post" action="' . $a . '">';

    foreach ($fields as $field) {
        $name     = Helpers::e($field['name'] ?? '');
        $label    = Helpers::e($field['label'] ?? ucwords(str_replace('_', ' ', $field['name'] ?? '')));
        $type     = $field['type'] ?? 'text';
        $required = !empty($field['required']) ? ' required' : '';
        $value    = Helpers::e($field['value'] ?? '');

        $html .= '<div class="form-group">';
        $html .= '<label for="modal_' . $name . '">' . $label . '</label>';

        if ($type === 'select' && isset($field['options'])) {
            $html .= '<select id="modal_' . $name . '" name="' . $name . '"' . $required . '>';
            foreach ($field['options'] as $optVal => $optLabel) {
                $sel = ($optVal === ($field['value'] ?? '')) ? ' selected' : '';
                $html .= '<option value="' . Helpers::e($optVal) . '"' . $sel . '>' . Helpers::e($optLabel) . '</option>';
            }
            $html .= '</select>';
        } elseif ($type === 'textarea') {
            $html .= '<textarea id="modal_' . $name . '" name="' . $name . '"' . $required . '>' . $value . '</textarea>';
        } elseif ($type === 'hidden') {
            $html .= '<input type="hidden" name="' . $name . '" value="' . $value . '">';
        } else {
            $html .= '<input id="modal_' . $name . '" type="' . Helpers::e($type) . '" name="' . $name . '" value="' . $value . '"' . $required . '>';
        }

        $html .= '</div>';
    }

    $html .= '<div class="modal-actions">';
    $html .= '<button type="button" class="btn" onclick="this.closest(\'.modal-overlay\').classList.remove(\'open\')">Cancel</button>';
    $html .= '<button type="submit" class="btn btn-primary">Save</button>';
    $html .= '</div>';
    $html .= '</form>';
    $html .= '</div>';
    $html .= '</div>';

    return $html;
}

<?php
/**
 * GuardrailController — agent controls, interventions, and anomaly rules.
 */
class GuardrailController
{
    /**
     * List interventions and anomaly rules.
     */
    public function index(): void
    {
        $interventions = Api::request('GET', '/engine/guardrails/interventions');
        $anomalyRules  = Api::request('GET', '/engine/anomaly-rules');

        $title   = 'Guardrails';
        $page    = 'guardrails';
        $content = $this->render($interventions, $anomalyRules);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Pause a guardrail by ID.
     */
    public function pause(string $id): void
    {
        $res = Api::request('POST', '/engine/guardrails/pause/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('Guardrail paused successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error pausing guardrail.', 'danger');
        }
        Helpers::redirect('/guardrails');
    }

    /**
     * Resume a guardrail by ID.
     */
    public function resume(string $id): void
    {
        $res = Api::request('POST', '/engine/guardrails/resume/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('Guardrail resumed successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error resuming guardrail.', 'danger');
        }
        Helpers::redirect('/guardrails');
    }

    /**
     * Kill a guardrail by ID.
     */
    public function kill(string $id): void
    {
        $res = Api::request('POST', '/engine/guardrails/kill/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('Guardrail killed successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error killing guardrail.', 'danger');
        }
        Helpers::redirect('/guardrails');
    }

    /**
     * Create a new anomaly rule.
     */
    public function createRule(): void
    {
        $payload = [
            'name'      => $_POST['name'] ?? '',
            'condition' => $_POST['condition'] ?? '',
            'action'    => $_POST['action'] ?? 'alert',
            'threshold' => intval($_POST['threshold'] ?? 0),
        ];
        $res = Api::request('POST', '/engine/anomaly-rules', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('Anomaly rule created successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error creating anomaly rule.', 'danger');
        }
        Helpers::redirect('/guardrails');
    }

    /**
     * Delete an anomaly rule by ID.
     */
    public function deleteRule(string $id): void
    {
        $res = Api::request('DELETE', '/engine/anomaly-rules/' . urlencode($id));

        if (Api::ok($res)) {
            Helpers::setFlash('Anomaly rule deleted successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error deleting anomaly rule.', 'danger');
        }
        Helpers::redirect('/guardrails');
    }

    private function render(array $interventions, array $anomalyRules): string
    {
        ob_start();
        $interventionItems = Api::items($interventions);
        $anomalyRuleItems  = Api::items($anomalyRules);
        include __DIR__ . '/../views/guardrails.php';
        return ob_get_clean();
    }
}

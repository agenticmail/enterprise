<?php
/**
 * MessageController — list messages and send new messages.
 */
class MessageController
{
    /**
     * List all messages.
     */
    public function index(): void
    {
        $messages = Api::request('GET', '/engine/messages');

        $title   = 'Messages';
        $page    = 'messages';
        $content = $this->render($messages);
        include __DIR__ . '/../views/layout.php';
    }

    /**
     * Send a new message.
     */
    public function send(): void
    {
        $payload = [
            'to'      => $_POST['to'] ?? '',
            'subject' => $_POST['subject'] ?? '',
            'body'    => $_POST['body'] ?? '',
        ];
        $res = Api::request('POST', '/engine/messages', $payload);

        if (Api::ok($res)) {
            Helpers::setFlash('Message sent successfully.', 'success');
        } else {
            Helpers::setFlash($res['message'] ?? 'Error sending message.', 'danger');
        }
        Helpers::redirect('/messages');
    }

    private function render(array $messages): string
    {
        ob_start();
        $items = Api::items($messages);
        include __DIR__ . '/../views/messages.php';
        return ob_get_clean();
    }
}

<?php
/**
 * AgenticMail API Client
 * HTTP helper using file_get_contents with stream_context_create.
 */

$API_URL = getenv('AGENTICMAIL_URL') ?: 'http://localhost:3000';

/**
 * Make an API request to the AgenticMail server.
 *
 * @param string     $path   API path (e.g. '/api/agents')
 * @param string     $method HTTP method
 * @param array|null $body   Request body (will be JSON-encoded)
 * @return array Decoded JSON response
 */
function am_api(string $path, string $method = 'GET', ?array $body = null): array {
    global $API_URL;
    $token = $_SESSION['am_token'] ?? null;

    $opts = [
        'http' => [
            'method' => $method,
            'header' => "Content-Type: application/json\r\n" .
                        ($token ? "Authorization: Bearer $token\r\n" : ''),
            'timeout' => 10,
            'ignore_errors' => true,
        ],
    ];
    if ($body !== null) {
        $opts['http']['content'] = json_encode($body);
    }
    $ctx = stream_context_create($opts);
    $response = @file_get_contents($API_URL . $path, false, $ctx);
    if ($response === false) return ['error' => 'Could not connect to AgenticMail server'];
    return json_decode($response, true) ?: ['error' => 'Invalid response'];
}

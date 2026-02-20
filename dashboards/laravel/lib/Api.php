<?php
/**
 * Api — cURL HTTP client for the AgenticMail backend.
 */
class Api
{
    /**
     * Send an HTTP request to the backend API.
     *
     * @param string      $method  HTTP method (GET, POST, PATCH, DELETE)
     * @param string      $path    API path (e.g. /api/agents)
     * @param array|null  $body    Request body (JSON-encoded)
     * @param string|null $token   Bearer token (falls back to session)
     * @return array  Decoded JSON + '_status' key
     */
    public static function request(string $method, string $path, array $body = null, string $token = null): array
    {
        $url = API_BASE . $path;
        $ch  = curl_init($url);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
        ]);

        $headers = ['Content-Type: application/json', 'Accept: application/json'];

        $tok = $token ?: ($_SESSION['token'] ?? null);
        if ($tok) {
            $headers[] = 'Authorization: Bearer ' . $tok;
        }

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $raw  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return ['_error' => $err, '_status' => 0];
        }

        $data = json_decode($raw, true) ?? [];
        $data['_status'] = $code;
        return $data;
    }

    /**
     * Check if a response indicates success (2xx status).
     */
    public static function ok(array $res): bool
    {
        $s = $res['_status'] ?? 0;
        return $s >= 200 && $s < 300;
    }

    /**
     * Extract the list of items from an API response.
     * Handles {data:[...]}, {items:[...]}, or plain arrays.
     */
    public static function items(array $res): array
    {
        if (isset($res['data']) && is_array($res['data'])) return $res['data'];
        if (isset($res['items']) && is_array($res['items'])) return $res['items'];
        return array_filter($res, fn($k) => !str_starts_with($k, '_'), ARRAY_FILTER_USE_KEY) ?: [];
    }
}

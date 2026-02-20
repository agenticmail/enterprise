"""
HTTP client for AgenticMail API communication.
"""

import os
import requests as http_client

API_URL = os.getenv('AGENTICMAIL_URL', 'http://localhost:3000')


def api_request(method, path, body=None, token=None):
    """Make an HTTP request to the AgenticMail API."""
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        r = http_client.request(method, f'{API_URL}{path}', headers=headers, json=body, timeout=10)
        return r.json()
    except Exception as e:
        return {'error': str(e)}

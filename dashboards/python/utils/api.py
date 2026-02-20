"""
API client for communicating with the AgenticMail backend.
Reads the bearer token from the Flask session automatically.
"""

import os
import requests
from flask import session

API_URL = os.getenv('AGENTICMAIL_URL', 'http://localhost:3000')


def api_request(method, path, body=None):
    """Make an HTTP request to the AgenticMail API.

    Args:
        method: HTTP method (GET, POST, PATCH, DELETE, etc.)
        path: API path, e.g. '/api/agents'
        body: Optional JSON body (dict)

    Returns:
        Parsed JSON response as dict, or {'error': '...'} on failure.
    """
    headers = {'Content-Type': 'application/json'}
    token = session.get('token')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        r = requests.request(
            method, f'{API_URL}{path}',
            headers=headers, json=body, timeout=10,
        )
        return r.json()
    except Exception as e:
        return {'error': str(e)}

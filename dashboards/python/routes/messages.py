"""
Messages routes: list and send messages.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

messages_bp = Blueprint('messages_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@messages_bp.route('/messages')
@login_required
def messages():
    data = api_request('GET', '/engine/messages?orgId=default')
    return render_template(
        'messages.html',
        active_page='messages',
        user=session.get('user', {}),
        messages=data.get('messages', []),
    )


@messages_bp.route('/messages/send', methods=['POST'])
@login_required
def send_message():
    body = {
        'type': request.form.get('type', 'email'),
        'from': request.form['from_addr'],
        'to': request.form['to_addr'],
        'subject': request.form['subject'],
        'body': request.form.get('body', ''),
        'priority': request.form.get('priority', 'normal'),
    }
    result = api_request('POST', '/engine/messages', body)
    flash('Message sent!' if 'id' in result else result.get('error', 'Failed'))
    return redirect(url_for('messages_bp.messages'))

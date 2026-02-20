"""
Users routes: list and create team members.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

users_bp = Blueprint('users_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@users_bp.route('/users')
@login_required
def users():
    data = api_request('GET', '/api/users')
    return render_template(
        'users.html',
        active_page='users',
        user=session.get('user', {}),
        users=data.get('users', []),
    )


@users_bp.route('/users/create', methods=['POST'])
@login_required
def create_user():
    result = api_request('POST', '/api/users', {
        'name': request.form['name'],
        'email': request.form['email'],
        'role': request.form.get('role', 'member'),
        'password': request.form['password'],
    })
    flash('User created!' if 'id' in result else result.get('error', 'Failed'))
    return redirect(url_for('users_bp.users'))

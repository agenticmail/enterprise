"""
Authentication routes: login and logout.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for
from utils.api import api_request, API_URL

auth_bp = Blueprint('auth_bp', __name__)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        data = api_request('POST', '/auth/login', {
            'email': request.form['email'],
            'password': request.form['password'],
        })
        if 'token' in data:
            session['token'] = data['token']
            session['user'] = data['user']
            return redirect(url_for('dashboard_bp.dashboard'))
        error = data.get('error', 'Login failed')
    return render_template('login.html', error=error, api_url=API_URL)


@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth_bp.login'))

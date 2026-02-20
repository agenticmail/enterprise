"""
Skills routes: browse builtin skills and manage installed community skills.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

skills_bp = Blueprint('skills_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@skills_bp.route('/skills')
@login_required
def skills():
    categories_data = api_request('GET', '/engine/skills/by-category')
    installed_data = api_request('GET', '/engine/community/installed?orgId=default')
    return render_template(
        'skills.html',
        active_page='skills',
        user=session.get('user', {}),
        categories=categories_data.get('categories', {}),
        installed=installed_data.get('skills', []),
    )


@skills_bp.route('/skills/enable', methods=['POST'])
@login_required
def enable_skill():
    skill_id = request.form['skill_id']
    result = api_request('POST', f'/engine/community/{skill_id}/enable')
    flash('Skill enabled!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('skills_bp.skills'))


@skills_bp.route('/skills/disable', methods=['POST'])
@login_required
def disable_skill():
    skill_id = request.form['skill_id']
    result = api_request('POST', f'/engine/community/{skill_id}/disable')
    flash('Skill disabled!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('skills_bp.skills'))


@skills_bp.route('/skills/uninstall', methods=['POST'])
@login_required
def uninstall_skill():
    skill_id = request.form['skill_id']
    result = api_request('DELETE', f'/engine/community/{skill_id}')
    flash('Skill uninstalled!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('skills_bp.skills'))

"""Skill Connections Routes — Manage skill integrations and connections"""

from flask import Blueprint, render_template
from utils.auth import require_auth

skill_connections_bp = Blueprint('skill_connections_bp', __name__)

@skill_connections_bp.route('/skill-connections')
@require_auth
def skill_connections():
    return render_template('skill-connections.html', active_page='skill_connections')
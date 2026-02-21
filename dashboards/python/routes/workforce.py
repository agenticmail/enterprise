"""Workforce Routes — Agent workforce management and scheduling"""

from flask import Blueprint, render_template
from utils.auth import require_auth

workforce_bp = Blueprint('workforce_bp', __name__)

@workforce_bp.route('/workforce')
@require_auth
def workforce():
    return render_template('workforce.html', active_page='workforce')
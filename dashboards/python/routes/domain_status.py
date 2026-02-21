"""Domain Status Routes — Domain health and email security status"""

from flask import Blueprint, render_template
from utils.auth import require_auth

domain_status_bp = Blueprint('domain_status_bp', __name__)

@domain_status_bp.route('/domain-status')
@require_auth
def domain_status():
    return render_template('domain-status.html', active_page='domain_status')
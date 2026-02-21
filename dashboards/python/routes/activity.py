"""Activity Routes — Shows recent agent activity and system events"""

from flask import Blueprint, render_template
from utils.auth import require_auth

activity_bp = Blueprint('activity_bp', __name__)

@activity_bp.route('/activity')
@require_auth
def activity():
    return render_template('activity.html', active_page='activity')
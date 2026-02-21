"""Community Skills Routes — Browse and install community-contributed skills"""

from flask import Blueprint, render_template
from utils.auth import require_auth

community_skills_bp = Blueprint('community_skills_bp', __name__)

@community_skills_bp.route('/community-skills')
@require_auth
def community_skills():
    return render_template('community-skills.html', active_page='community_skills')
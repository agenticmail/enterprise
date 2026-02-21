"""Knowledge Contributions Routes — Community knowledge sharing hub"""

from flask import Blueprint, render_template
from utils.auth import require_auth

knowledge_contributions_bp = Blueprint('knowledge_contributions_bp', __name__)

@knowledge_contributions_bp.route('/knowledge-contributions')
@require_auth
def knowledge_contributions():
    return render_template('knowledge-contributions.html', active_page='knowledge_contributions')
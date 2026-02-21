"""Knowledge Routes — Knowledge base management"""

from flask import Blueprint, render_template
from utils.auth import require_auth

knowledge_bp = Blueprint('knowledge_bp', __name__)

@knowledge_bp.route('/knowledge')
@require_auth
def knowledge():
    return render_template('knowledge.html', active_page='knowledge')
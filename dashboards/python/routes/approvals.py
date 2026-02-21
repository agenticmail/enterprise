"""Approvals Routes — Pending approvals and approval history"""

from flask import Blueprint, render_template
from utils.auth import require_auth

approvals_bp = Blueprint('approvals_bp', __name__)

@approvals_bp.route('/approvals')
@require_auth
def approvals():
    return render_template('approvals.html', active_page='approvals')
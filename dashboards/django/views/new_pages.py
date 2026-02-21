"""
Views for new pages added to match main dashboard
"""
from django.shortcuts import render
from utils.api import api_call
from utils.auth import require_auth

@require_auth
def activity_view(request):
    return render(request, 'activity.html', {'page_name': 'activity'})

@require_auth
def approvals_view(request):
    return render(request, 'approvals.html', {'page_name': 'approvals'})

@require_auth
def community_skills_view(request):
    return render(request, 'community-skills.html', {'page_name': 'community-skills'})

@require_auth
def domain_status_view(request):
    return render(request, 'domain-status.html', {'page_name': 'domain-status'})

@require_auth
def knowledge_view(request):
    return render(request, 'knowledge.html', {'page_name': 'knowledge'})

@require_auth
def knowledge_contributions_view(request):
    return render(request, 'knowledge-contributions.html', {'page_name': 'knowledge-contributions'})

@require_auth
def skill_connections_view(request):
    return render(request, 'skill-connections.html', {'page_name': 'skill-connections'})

@require_auth
def workforce_view(request):
    return render(request, 'workforce.html', {'page_name': 'workforce'})
"""
Settings routes: view and update organization settings.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

settings_bp = Blueprint('settings_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


def _default_tool_security():
    """Return the default tool security config shape."""
    return {
        'security': {
            'pathSandbox': {'enabled': True, 'allowedDirs': [], 'blockedPatterns': []},
            'ssrf': {'enabled': True, 'allowedHosts': [], 'blockedCidrs': []},
            'commandSanitizer': {'enabled': True, 'mode': 'blocklist', 'allowedCommands': [], 'blockedPatterns': []},
        },
        'middleware': {
            'audit': {'enabled': True, 'redactKeys': []},
            'rateLimit': {'enabled': True, 'overrides': {}},
            'circuitBreaker': {'enabled': True},
            'telemetry': {'enabled': True},
        },
    }


def _parse_comma_list(value):
    """Parse a comma-separated string into a list, stripping whitespace."""
    if not value:
        return []
    return [item.strip() for item in value.split(',') if item.strip()]


def _default_firewall():
    """Return the default firewall config shape."""
    return {
        'ipAccess': {'enabled': False, 'mode': 'allowlist', 'allowlist': [], 'blocklist': [], 'bypassPaths': ['/health', '/ready']},
        'egress': {'enabled': False, 'mode': 'blocklist', 'allowedHosts': [], 'blockedHosts': [], 'allowedPorts': [], 'blockedPorts': []},
        'proxy': {'httpProxy': '', 'httpsProxy': '', 'noProxy': ['localhost', '127.0.0.1']},
        'trustedProxies': {'enabled': False, 'ips': []},
        'network': {
            'corsOrigins': [],
            'rateLimit': {'enabled': True, 'requestsPerMinute': 120, 'skipPaths': ['/health', '/ready']},
            'httpsEnforcement': {'enabled': False, 'excludePaths': []},
            'securityHeaders': {'hsts': True, 'hstsMaxAge': 31536000, 'xFrameOptions': 'DENY', 'xContentTypeOptions': True, 'referrerPolicy': 'strict-origin-when-cross-origin', 'permissionsPolicy': 'camera=(), microphone=(), geolocation()'},
        },
    }


def _parse_comma_int_list(value):
    """Parse a comma-separated string into a list of integers."""
    if not value:
        return []
    result = []
    for item in value.split(','):
        item = item.strip()
        if item:
            try:
                result.append(int(item))
            except ValueError:
                pass
    return result


@settings_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'POST':
        action = request.form.get('_action', 'general')
        if action == 'firewall':
            fw_payload = {
                'ipAccess': {
                    'enabled': 'fw_ip_enabled' in request.form,
                    'mode': request.form.get('fw_ip_mode', 'allowlist'),
                    'allowlist': _parse_comma_list(request.form.get('fw_ip_allowlist', '')),
                    'blocklist': _parse_comma_list(request.form.get('fw_ip_blocklist', '')),
                    'bypassPaths': _parse_comma_list(request.form.get('fw_ip_bypassPaths', '')),
                },
                'egress': {
                    'enabled': 'fw_egress_enabled' in request.form,
                    'mode': request.form.get('fw_egress_mode', 'blocklist'),
                    'allowedHosts': _parse_comma_list(request.form.get('fw_egress_allowedHosts', '')),
                    'blockedHosts': _parse_comma_list(request.form.get('fw_egress_blockedHosts', '')),
                    'allowedPorts': _parse_comma_int_list(request.form.get('fw_egress_allowedPorts', '')),
                    'blockedPorts': _parse_comma_int_list(request.form.get('fw_egress_blockedPorts', '')),
                },
                'proxy': {
                    'httpProxy': request.form.get('fw_proxy_http', ''),
                    'httpsProxy': request.form.get('fw_proxy_https', ''),
                    'noProxy': _parse_comma_list(request.form.get('fw_proxy_noProxy', '')),
                },
                'trustedProxies': {
                    'enabled': 'fw_tp_enabled' in request.form,
                    'ips': _parse_comma_list(request.form.get('fw_tp_ips', '')),
                },
                'network': {
                    'corsOrigins': _parse_comma_list(request.form.get('fw_net_corsOrigins', '')),
                    'rateLimit': {
                        'enabled': 'fw_net_rl_enabled' in request.form,
                        'requestsPerMinute': int(request.form.get('fw_net_rl_rpm', '120') or '120'),
                        'skipPaths': _parse_comma_list(request.form.get('fw_net_rl_skipPaths', '')),
                    },
                    'httpsEnforcement': {
                        'enabled': 'fw_net_https_enabled' in request.form,
                        'excludePaths': _parse_comma_list(request.form.get('fw_net_https_excludePaths', '')),
                    },
                    'securityHeaders': {
                        'hsts': 'fw_sh_hsts' in request.form,
                        'hstsMaxAge': int(request.form.get('fw_sh_hstsMaxAge', '31536000') or '31536000'),
                        'xFrameOptions': request.form.get('fw_sh_xFrameOptions', 'DENY'),
                        'xContentTypeOptions': 'fw_sh_xContentTypeOptions' in request.form,
                        'referrerPolicy': request.form.get('fw_sh_referrerPolicy', 'strict-origin-when-cross-origin'),
                        'permissionsPolicy': request.form.get('fw_sh_permissionsPolicy', ''),
                    },
                },
            }
            result = api_request('PUT', '/api/settings/firewall', fw_payload)
            flash('Network & firewall settings saved!' if 'error' not in result else result.get('error', 'Failed'))
        elif action == 'model_pricing':
            # Collect existing models from hidden fields
            model_count = int(request.form.get('mp_model_count', '0') or '0')
            models = []
            for i in range(model_count):
                provider = request.form.get(f'mp_provider_{i}', '').strip()
                model_id = request.form.get(f'mp_modelId_{i}', '').strip()
                if provider and model_id:
                    models.append({
                        'provider': provider,
                        'modelId': model_id,
                        'displayName': request.form.get(f'mp_displayName_{i}', '').strip(),
                        'inputCostPerMillion': float(request.form.get(f'mp_input_{i}', '0') or '0'),
                        'outputCostPerMillion': float(request.form.get(f'mp_output_{i}', '0') or '0'),
                        'contextWindow': int(request.form.get(f'mp_context_{i}', '0') or '0'),
                    })
            # Check for new model being added
            new_provider = request.form.get('mp_new_provider', '').strip()
            new_model_id = request.form.get('mp_new_modelId', '').strip()
            if new_provider and new_model_id:
                models.append({
                    'provider': new_provider,
                    'modelId': new_model_id,
                    'displayName': request.form.get('mp_new_displayName', '').strip(),
                    'inputCostPerMillion': float(request.form.get('mp_new_input', '0') or '0'),
                    'outputCostPerMillion': float(request.form.get('mp_new_output', '0') or '0'),
                    'contextWindow': int(request.form.get('mp_new_context', '0') or '0'),
                })
            mp_payload = {
                'models': models,
                'currency': request.form.get('mp_currency', 'USD'),
            }
            result = api_request('PUT', '/api/settings/model-pricing', mp_payload)
            flash('Model pricing saved!' if 'error' not in result else result.get('error', 'Failed'))
        elif action == 'tool_security':
            tool_sec = {
                'security': {
                    'pathSandbox': {
                        'enabled': 'ps_enabled' in request.form,
                        'allowedDirs': _parse_comma_list(request.form.get('ps_allowedDirs', '')),
                        'blockedPatterns': _parse_comma_list(request.form.get('ps_blockedPatterns', '')),
                    },
                    'ssrf': {
                        'enabled': 'ssrf_enabled' in request.form,
                        'allowedHosts': _parse_comma_list(request.form.get('ssrf_allowedHosts', '')),
                        'blockedCidrs': _parse_comma_list(request.form.get('ssrf_blockedCidrs', '')),
                    },
                    'commandSanitizer': {
                        'enabled': 'cs_enabled' in request.form,
                        'mode': request.form.get('cs_mode', 'blocklist'),
                        'allowedCommands': _parse_comma_list(request.form.get('cs_allowedCommands', '')),
                        'blockedPatterns': _parse_comma_list(request.form.get('cs_blockedPatterns', '')),
                    },
                },
                'middleware': {
                    'audit': {
                        'enabled': 'audit_enabled' in request.form,
                        'redactKeys': _parse_comma_list(request.form.get('audit_redactKeys', '')),
                    },
                    'rateLimit': {
                        'enabled': 'rl_enabled' in request.form,
                        'overrides': {},
                    },
                    'circuitBreaker': {
                        'enabled': 'cb_enabled' in request.form,
                    },
                    'telemetry': {
                        'enabled': 'tel_enabled' in request.form,
                    },
                },
            }
            result = api_request('PUT', '/api/settings/tool-security', tool_sec)
            flash('Tool security saved!' if 'error' not in result else result.get('error', 'Failed'))
        else:
            result = api_request('PATCH', '/api/settings', {
                'name': request.form.get('name', ''),
                'domain': request.form.get('domain', ''),
                'primaryColor': request.form.get('primaryColor', '#e84393'),
            })
            flash('Settings saved!' if 'error' not in result else result['error'])
    settings_data = api_request('GET', '/api/settings')
    retention = api_request('GET', '/api/retention')

    # Fetch tool security config
    ts_data = api_request('GET', '/api/settings/tool-security')
    ts_config = ts_data.get('toolSecurityConfig') or {}
    defaults = _default_tool_security()
    tool_security = {
        'security': ts_config.get('security') or defaults['security'],
        'middleware': ts_config.get('middleware') or defaults['middleware'],
    }

    # Fetch firewall config
    fw_data = api_request('GET', '/api/settings/firewall')
    fw_config = fw_data.get('firewallConfig') or {}
    fw_defaults = _default_firewall()
    firewall = {
        'ipAccess': fw_config.get('ipAccess') or fw_defaults['ipAccess'],
        'egress': fw_config.get('egress') or fw_defaults['egress'],
        'proxy': fw_config.get('proxy') or fw_defaults['proxy'],
        'trustedProxies': fw_config.get('trustedProxies') or fw_defaults['trustedProxies'],
        'network': fw_config.get('network') or fw_defaults['network'],
    }

    # Fetch model pricing config
    mp_data = api_request('GET', '/api/settings/model-pricing')
    mp_config = mp_data.get('modelPricingConfig') or {}
    model_pricing = {
        'models': mp_config.get('models') or [],
        'currency': mp_config.get('currency') or 'USD',
    }

    # Group models by provider for display
    mp_providers = {}
    for m in model_pricing['models']:
        prov = m.get('provider', 'unknown')
        if prov not in mp_providers:
            mp_providers[prov] = []
        mp_providers[prov].append(m)

    return render_template(
        'settings.html',
        active_page='settings',
        user=session.get('user', {}),
        settings=settings_data,
        retention=retention,
        tool_security=tool_security,
        firewall=firewall,
        model_pricing=model_pricing,
        mp_providers=mp_providers,
    )

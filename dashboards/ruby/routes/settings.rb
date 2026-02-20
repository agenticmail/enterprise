# frozen_string_literal: true

# Settings routes — read and update organization settings

get '/settings' do
  require_auth!
  res = api_get('/api/settings')
  @settings = res[:status] == 200 ? res[:body] : {}

  # Fetch tool security config
  ts_res = api_get('/api/settings/tool-security')
  @tool_security = ts_res[:status] == 200 ? (ts_res[:body]['toolSecurityConfig'] || ts_res[:body]) : {}

  # Fetch firewall config
  fw_res = api_get('/api/settings/firewall')
  @firewall = fw_res[:status] == 200 ? (fw_res[:body]['firewallConfig'] || fw_res[:body]) : {}

  # Fetch model pricing config
  mp_res = api_get('/api/settings/model-pricing')
  @model_pricing = mp_res[:status] == 200 ? (mp_res[:body]['modelPricingConfig'] || mp_res[:body]) : {}

  erb :settings
end

post '/settings' do
  require_auth!
  payload = {}
  %w[org_name default_model max_agents rate_limit webhook_url].each do |k|
    payload[k] = params[k] if params[k] && !params[k].empty?
  end
  res = api_patch('/api/settings', payload)
  if res[:status] < 300
    set_flash('Settings updated successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to update settings') : 'Failed to update settings', 'danger')
  end
  redirect '/settings'
end

# Tool Security settings — save org-wide config
post '/settings/tool-security' do
  require_auth!

  # Build security section
  security = {
    'pathSandbox' => {
      'enabled' => params['path_sandbox_enabled'] == 'on',
      'allowedDirs' => (params['path_sandbox_allowed_dirs'] || '').split(',').map(&:strip).reject(&:empty?),
      'blockedPatterns' => (params['path_sandbox_blocked_patterns'] || '').split(',').map(&:strip).reject(&:empty?)
    },
    'ssrf' => {
      'enabled' => params['ssrf_enabled'] == 'on',
      'allowedHosts' => (params['ssrf_allowed_hosts'] || '').split(',').map(&:strip).reject(&:empty?),
      'blockedCidrs' => (params['ssrf_blocked_cidrs'] || '').split(',').map(&:strip).reject(&:empty?)
    },
    'commandSanitizer' => {
      'enabled' => params['command_sanitizer_enabled'] == 'on',
      'mode' => params['command_sanitizer_mode'] || 'blocklist',
      'allowedCommands' => (params['command_sanitizer_allowed'] || '').split(',').map(&:strip).reject(&:empty?),
      'blockedPatterns' => (params['command_sanitizer_blocked'] || '').split(',').map(&:strip).reject(&:empty?)
    }
  }

  # Build middleware section
  middleware = {
    'audit' => {
      'enabled' => params['audit_enabled'] == 'on',
      'redactKeys' => (params['audit_redact_keys'] || '').split(',').map(&:strip).reject(&:empty?)
    },
    'rateLimit' => {
      'enabled' => params['rate_limit_mw_enabled'] == 'on',
      'overrides' => {}
    },
    'circuitBreaker' => {
      'enabled' => params['circuit_breaker_enabled'] == 'on'
    },
    'telemetry' => {
      'enabled' => params['telemetry_enabled'] == 'on'
    }
  }

  payload = { 'security' => security, 'middleware' => middleware }
  res = api_put('/api/settings/tool-security', payload)
  if res[:status] < 300
    set_flash('Tool security settings saved', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to save tool security settings') : 'Failed to save tool security settings', 'danger')
  end
  redirect '/settings'
end

# Network & Firewall settings — save config
post '/settings/firewall' do
  require_auth!

  ip_access = {
    'enabled' => params['fw_ip_enabled'] == 'on',
    'mode' => params['fw_ip_mode'] || 'allowlist',
    'allowlist' => (params['fw_ip_allowlist'] || '').split(',').map(&:strip).reject(&:empty?),
    'blocklist' => (params['fw_ip_blocklist'] || '').split(',').map(&:strip).reject(&:empty?),
    'bypassPaths' => (params['fw_ip_bypass_paths'] || '').split(',').map(&:strip).reject(&:empty?)
  }

  egress = {
    'enabled' => params['fw_egress_enabled'] == 'on',
    'mode' => params['fw_egress_mode'] || 'blocklist',
    'allowedHosts' => (params['fw_egress_allowed_hosts'] || '').split(',').map(&:strip).reject(&:empty?),
    'blockedHosts' => (params['fw_egress_blocked_hosts'] || '').split(',').map(&:strip).reject(&:empty?),
    'allowedPorts' => (params['fw_egress_allowed_ports'] || '').split(',').map(&:strip).reject(&:empty?).map(&:to_i),
    'blockedPorts' => (params['fw_egress_blocked_ports'] || '').split(',').map(&:strip).reject(&:empty?).map(&:to_i)
  }

  proxy = {
    'httpProxy' => params['fw_proxy_http'] || '',
    'httpsProxy' => params['fw_proxy_https'] || '',
    'noProxy' => (params['fw_proxy_no_proxy'] || '').split(',').map(&:strip).reject(&:empty?)
  }

  trusted_proxies = {
    'enabled' => params['fw_trusted_proxies_enabled'] == 'on',
    'ips' => (params['fw_trusted_proxies_ips'] || '').split(',').map(&:strip).reject(&:empty?)
  }

  rate_limit = {
    'enabled' => params['fw_rate_limit_enabled'] == 'on',
    'requestsPerMinute' => (params['fw_rate_limit_rpm'] || '120').to_i,
    'skipPaths' => (params['fw_rate_limit_skip_paths'] || '').split(',').map(&:strip).reject(&:empty?)
  }

  network = {
    'corsOrigins' => (params['fw_cors_origins'] || '').split(',').map(&:strip).reject(&:empty?),
    'rateLimit' => rate_limit,
    'httpsEnforcement' => {
      'enabled' => params['fw_https_enabled'] == 'on',
      'excludePaths' => (params['fw_https_exclude_paths'] || '').split(',').map(&:strip).reject(&:empty?)
    },
    'securityHeaders' => {
      'hsts' => params['fw_hsts_enabled'] == 'on',
      'hstsMaxAge' => (params['fw_hsts_max_age'] || '31536000').to_i,
      'xFrameOptions' => params['fw_x_frame_options'] || 'DENY',
      'xContentTypeOptions' => params['fw_x_content_type_options'] == 'on',
      'referrerPolicy' => params['fw_referrer_policy'] || 'strict-origin-when-cross-origin',
      'permissionsPolicy' => params['fw_permissions_policy'] || 'camera=(), microphone=(), geolocation=()'
    }
  }

  payload = {
    'ipAccess' => ip_access,
    'egress' => egress,
    'proxy' => proxy,
    'trustedProxies' => trusted_proxies,
    'network' => network
  }

  res = api_put('/api/settings/firewall', payload)
  if res[:status] < 300
    set_flash('Network & firewall settings saved', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to save firewall settings') : 'Failed to save firewall settings', 'danger')
  end
  redirect '/settings'
end

# Model Pricing settings — save config
post '/settings/model-pricing' do
  require_auth!

  # Collect existing models from hidden fields
  models = []
  idx = 0
  while params["model_provider_#{idx}"]
    models << {
      'provider' => params["model_provider_#{idx}"],
      'modelId' => params["model_id_#{idx}"],
      'displayName' => params["model_display_name_#{idx}"] || '',
      'inputCostPerMillion' => (params["model_input_cost_#{idx}"] || '0').to_f,
      'outputCostPerMillion' => (params["model_output_cost_#{idx}"] || '0').to_f,
      'contextWindow' => (params["model_context_window_#{idx}"] || '0').to_i
    }
    idx += 1
  end

  # Check if a new model is being added
  if params['new_model_provider'] && !params['new_model_provider'].empty? &&
     params['new_model_id'] && !params['new_model_id'].empty?
    models << {
      'provider' => params['new_model_provider'],
      'modelId' => params['new_model_id'],
      'displayName' => params['new_model_display_name'] || '',
      'inputCostPerMillion' => (params['new_model_input_cost'] || '0').to_f,
      'outputCostPerMillion' => (params['new_model_output_cost'] || '0').to_f,
      'contextWindow' => (params['new_model_context_window'] || '0').to_i
    }
  end

  # Check if a model should be removed
  if params['remove_model_index']
    remove_idx = params['remove_model_index'].to_i
    models.delete_at(remove_idx)
  end

  payload = {
    'models' => models,
    'currency' => params['mp_currency'] || 'USD'
  }

  res = api_put('/api/settings/model-pricing', payload)
  if res[:status] < 300
    set_flash('Model pricing settings saved', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to save model pricing settings') : 'Failed to save model pricing settings', 'danger')
  end
  redirect '/settings'
end

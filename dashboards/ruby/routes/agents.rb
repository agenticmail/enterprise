# frozen_string_literal: true

# Agents routes — list, create, detail, archive, actions

get '/agents' do
  require_auth!
  res = api_get('/api/agents')
  @agents = res[:status] == 200 ? (res[:body]['agents'] || res[:body]) : []
  @agents = @agents.is_a?(Array) ? @agents : []
  erb :agents
end

get '/agents/:id' do
  require_auth!
  res = api_get("/api/agents/#{params[:id]}")
  halt 404, erb(:layout) { 'Agent not found' } unless res[:status] == 200
  @agent = res[:body].is_a?(Hash) ? res[:body] : (res[:body]['agent'] || {})
  @config = @agent['config'] || {}

  # Fetch activity data (events, tool calls, journal)
  agent_id = params[:id]
  begin
    ev_res = api_get("/activity/events?agentId=#{agent_id}&limit=50")
    @events = ev_res[:status] == 200 ? (ev_res[:body]['events'] || ev_res[:body]) : []
    @events = @events.is_a?(Array) ? @events : []
  rescue => e
    @events = []
  end

  begin
    tc_res = api_get("/activity/tool-calls?agentId=#{agent_id}&limit=50")
    @tool_calls = tc_res[:status] == 200 ? (tc_res[:body]['toolCalls'] || tc_res[:body]['tool_calls'] || tc_res[:body]) : []
    @tool_calls = @tool_calls.is_a?(Array) ? @tool_calls : []
  rescue => e
    @tool_calls = []
  end

  begin
    j_res = api_get("/engine/journal?agentId=#{agent_id}&orgId=default&limit=50")
    @journal_entries = j_res[:status] == 200 ? (j_res[:body]['entries'] || j_res[:body]['journal'] || j_res[:body]) : []
    @journal_entries = @journal_entries.is_a?(Array) ? @journal_entries : []
  rescue => e
    @journal_entries = []
  end

  # Fetch agent-level tool security
  begin
    ts_res = api_get("/engine/agents/#{agent_id}/tool-security")
    if ts_res[:status] == 200
      @agent_tool_security = ts_res[:body]['toolSecurity'] || {}
      @agent_tool_security_org = ts_res[:body]['orgDefaults'] || {}
      @agent_tool_security_overrides = ts_res[:body]['agentOverrides'] || {}
    else
      @agent_tool_security = {}
      @agent_tool_security_org = {}
      @agent_tool_security_overrides = {}
    end
  rescue => e
    @agent_tool_security = {}
    @agent_tool_security_org = {}
    @agent_tool_security_overrides = {}
  end

  erb :agent_detail
end

post '/agents/:id/deploy' do
  require_auth!
  res = api_post("/api/agents/#{params[:id]}/deploy", {})
  if res[:status] < 300
    set_flash('Agent deployed successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to deploy agent') : 'Failed to deploy agent', 'danger')
  end
  redirect "/agents/#{params[:id]}"
end

post '/agents/:id/stop' do
  require_auth!
  res = api_post("/api/agents/#{params[:id]}/stop", {})
  if res[:status] < 300
    set_flash('Agent stopped successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to stop agent') : 'Failed to stop agent', 'danger')
  end
  redirect "/agents/#{params[:id]}"
end

post '/agents/:id/restart' do
  require_auth!
  res = api_post("/api/agents/#{params[:id]}/restart", {})
  if res[:status] < 300
    set_flash('Agent restarted successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to restart agent') : 'Failed to restart agent', 'danger')
  end
  redirect "/agents/#{params[:id]}"
end

post '/agents' do
  require_auth!
  payload = {
    name: params[:name],
    description: params[:description],
    provider: params[:provider] || 'anthropic',
    model: params[:model],
    persona: {
      gender: params[:gender].to_s.empty? ? nil : params[:gender],
      dateOfBirth: params[:date_of_birth].to_s.empty? ? nil : params[:date_of_birth],
      maritalStatus: params[:marital_status].to_s.empty? ? nil : params[:marital_status],
      culturalBackground: params[:cultural_background].to_s.empty? ? nil : params[:cultural_background],
      language: params[:language].to_s.empty? ? nil : params[:language],
      traits: {
        communication: params[:trait_communication] || 'direct',
        detail: params[:trait_detail] || 'detail-oriented',
        energy: params[:trait_energy] || 'calm',
        humor: params[:humor] || 'warm',
        formality: params[:formality] || 'adaptive',
        empathy: params[:empathy] || 'moderate',
        patience: params[:patience] || 'patient',
        creativity: params[:creativity] || 'creative',
      },
    },
  }
  payload[:soul_id] = params[:soul_id] unless params[:soul_id].to_s.empty?
  res = api_post('/api/agents', payload)
  if res[:status] < 300
    set_flash('Agent created successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to create agent') : 'Failed to create agent', 'danger')
  end
  redirect '/agents'
end

post '/agents/:id/tool-security' do
  require_auth!
  agent_id = params[:id]

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

  payload = {
    'toolSecurity' => { 'security' => security, 'middleware' => middleware },
    'updatedBy' => 'dashboard'
  }
  res = api_patch("/engine/agents/#{agent_id}/tool-security", payload)
  if res[:status] < 300
    set_flash('Agent tool security updated', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to update tool security') : 'Failed to update tool security', 'danger')
  end
  redirect "/agents/#{agent_id}"
end

post '/agents/:id/archive' do
  require_auth!
  res = api_patch("/api/agents/#{params[:id]}", { status: 'archived' })
  if res[:status] < 300
    set_flash('Agent archived successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to archive agent') : 'Failed to archive agent', 'danger')
  end
  redirect '/agents'
end

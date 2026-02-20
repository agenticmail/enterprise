# frozen_string_literal: true

# Guardrails Controller

get '/guardrails' do
  require_auth!
  status_res = api_get('/engine/guardrails/status')
  interventions_res = api_get('/engine/guardrails/interventions')
  rules_res = api_get('/engine/anomaly-rules')
  @guardrail_status = status_res[:status] == 200 ? status_res[:body] : {}
  @interventions = interventions_res[:status] == 200 ? (interventions_res[:body]['interventions'] || interventions_res[:body]) : []
  @interventions = @interventions.is_a?(Array) ? @interventions : []
  @anomaly_rules = rules_res[:status] == 200 ? (rules_res[:body]['rules'] || rules_res[:body]) : []
  @anomaly_rules = @anomaly_rules.is_a?(Array) ? @anomaly_rules : []
  erb :guardrails
end

post '/guardrails/pause' do
  require_auth!
  res = api_post('/engine/guardrails/pause', {})
  set_flash(res[:status] < 300 ? 'Guardrails paused' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/guardrails'
end

post '/guardrails/resume' do
  require_auth!
  res = api_post('/engine/guardrails/resume', {})
  set_flash(res[:status] < 300 ? 'Guardrails resumed' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/guardrails'
end

post '/guardrails/kill' do
  require_auth!
  res = api_post('/engine/guardrails/kill', {})
  set_flash(res[:status] < 300 ? 'Guardrails killed' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/guardrails'
end

post '/anomaly-rules' do
  require_auth!
  res = api_post('/engine/anomaly-rules', { name: params[:name], condition: params[:condition], threshold: params[:threshold], action: params[:action] })
  set_flash(res[:status] < 300 ? 'Anomaly rule created' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/guardrails'
end

post '/anomaly-rules/:id/delete' do
  require_auth!
  res = api_delete("/engine/anomaly-rules/#{params[:id]}")
  set_flash(res[:status] < 300 ? 'Anomaly rule deleted' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/guardrails'
end

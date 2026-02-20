# frozen_string_literal: true

# Guardrails routes — agent controls, interventions, anomaly rules

get '/guardrails' do
  require_auth!
  interventions_res = api_get('/engine/guardrails/interventions?orgId=default')
  @interventions = interventions_res[:status] == 200 ? (interventions_res[:body]['interventions'] || interventions_res[:body]) : []
  @interventions = @interventions.is_a?(Array) ? @interventions : []
  rules_res = api_get('/engine/anomaly-rules?orgId=default')
  @anomaly_rules = rules_res[:status] == 200 ? (rules_res[:body]['rules'] || rules_res[:body]) : []
  @anomaly_rules = @anomaly_rules.is_a?(Array) ? @anomaly_rules : []
  erb :guardrails
end

post '/guardrails/pause' do
  require_auth!
  res = api_post("/engine/guardrails/pause/#{params[:agent_id]}", {
    reason: params[:reason],
    orgId: 'default'
  })
  if res[:status] < 300
    set_flash('Agent paused successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to pause agent') : 'Failed to pause agent', 'danger')
  end
  redirect '/guardrails'
end

post '/guardrails/resume/:id' do
  require_auth!
  res = api_post("/engine/guardrails/resume/#{params[:id]}", { orgId: 'default' })
  if res[:status] < 300
    set_flash('Agent resumed successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to resume agent') : 'Failed to resume agent', 'danger')
  end
  redirect '/guardrails'
end

post '/guardrails/kill/:id' do
  require_auth!
  res = api_post("/engine/guardrails/kill/#{params[:id]}", { orgId: 'default' })
  if res[:status] < 300
    set_flash('Agent killed successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to kill agent') : 'Failed to kill agent', 'danger')
  end
  redirect '/guardrails'
end

post '/anomaly-rules/create' do
  require_auth!
  res = api_post('/engine/anomaly-rules', {
    name: params[:name],
    condition: params[:condition],
    action: params[:action],
    orgId: 'default'
  })
  if res[:status] < 300
    set_flash('Anomaly rule created successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to create anomaly rule') : 'Failed to create anomaly rule', 'danger')
  end
  redirect '/guardrails'
end

post '/anomaly-rules/:id/delete' do
  require_auth!
  res = api_delete("/engine/anomaly-rules/#{params[:id]}")
  if res[:status] < 300
    set_flash('Anomaly rule deleted successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to delete anomaly rule') : 'Failed to delete anomaly rule', 'danger')
  end
  redirect '/guardrails'
end

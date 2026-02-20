# frozen_string_literal: true

# DLP routes — rules, violations, test scan

get '/dlp' do
  require_auth!
  rules_res = api_get('/engine/dlp/rules?orgId=default')
  @rules = rules_res[:status] == 200 ? (rules_res[:body]['rules'] || rules_res[:body]) : []
  @rules = @rules.is_a?(Array) ? @rules : []
  violations_res = api_get('/engine/dlp/violations?orgId=default')
  @violations = violations_res[:status] == 200 ? (violations_res[:body]['violations'] || violations_res[:body]) : []
  @violations = @violations.is_a?(Array) ? @violations : []
  erb :dlp
end

post '/dlp/rules/create' do
  require_auth!
  res = api_post('/engine/dlp/rules', {
    name: params[:name],
    pattern: params[:pattern],
    action: params[:action],
    orgId: 'default'
  })
  if res[:status] < 300
    set_flash('DLP rule created successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to create DLP rule') : 'Failed to create DLP rule', 'danger')
  end
  redirect '/dlp'
end

post '/dlp/rules/:id/delete' do
  require_auth!
  res = api_delete("/engine/dlp/rules/#{params[:id]}")
  if res[:status] < 300
    set_flash('DLP rule deleted successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to delete DLP rule') : 'Failed to delete DLP rule', 'danger')
  end
  redirect '/dlp'
end

post '/dlp/scan' do
  require_auth!
  res = api_post('/engine/dlp/scan', {
    content: params[:content],
    orgId: 'default'
  })
  if res[:status] < 300
    set_flash('Scan complete — check results below', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Scan failed') : 'Scan failed', 'danger')
  end
  redirect '/dlp'
end

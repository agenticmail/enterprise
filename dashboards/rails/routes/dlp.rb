# frozen_string_literal: true

# DLP Controller

get '/dlp' do
  require_auth!
  rules_res = api_get('/engine/dlp/rules')
  violations_res = api_get('/engine/dlp/violations')
  @rules = rules_res[:status] == 200 ? (rules_res[:body]['rules'] || rules_res[:body]) : []
  @rules = @rules.is_a?(Array) ? @rules : []
  @violations = violations_res[:status] == 200 ? (violations_res[:body]['violations'] || violations_res[:body]) : []
  @violations = @violations.is_a?(Array) ? @violations : []
  erb :dlp
end

post '/dlp/rules' do
  require_auth!
  res = api_post('/engine/dlp/rules', { name: params[:name], pattern: params[:pattern], action: params[:action], severity: params[:severity] })
  set_flash(res[:status] < 300 ? 'DLP rule created' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/dlp'
end

post '/dlp/rules/:id/delete' do
  require_auth!
  res = api_delete("/engine/dlp/rules/#{params[:id]}")
  set_flash(res[:status] < 300 ? 'DLP rule deleted' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/dlp'
end

post '/dlp/scan' do
  require_auth!
  res = api_post('/engine/dlp/scan', { content: params[:content] })
  if res[:status] < 300
    matches = res[:body]['matches'] || res[:body]['violations'] || []
    set_flash(matches.empty? ? 'Scan clean — no violations detected' : "Scan found #{matches.size} violation(s)", matches.empty? ? 'success' : 'warning')
  else
    set_flash(res[:body]['error'] || 'Scan failed', 'danger')
  end
  redirect '/dlp'
end

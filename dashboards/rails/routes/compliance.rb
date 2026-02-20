# frozen_string_literal: true

# Compliance Controller

get '/compliance' do
  require_auth!
  res = api_get('/engine/compliance/reports')
  @reports = res[:status] == 200 ? (res[:body]['reports'] || res[:body]) : []
  @reports = @reports.is_a?(Array) ? @reports : []
  erb :compliance
end

post '/compliance/reports' do
  require_auth!
  res = api_post('/engine/compliance/reports', { name: params[:name], type: params[:type], date_from: params[:date_from], date_to: params[:date_to] })
  set_flash(res[:status] < 300 ? 'Report generation started' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/compliance'
end

post '/compliance/reports/:id/delete' do
  require_auth!
  res = api_delete("/engine/compliance/reports/#{params[:id]}")
  set_flash(res[:status] < 300 ? 'Report deleted' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/compliance'
end

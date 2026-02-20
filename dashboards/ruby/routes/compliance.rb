# frozen_string_literal: true

# Compliance routes — reports, generate

get '/compliance' do
  require_auth!
  res = api_get('/engine/compliance/reports?orgId=default')
  @reports = res[:status] == 200 ? (res[:body]['reports'] || res[:body]) : []
  @reports = @reports.is_a?(Array) ? @reports : []
  erb :compliance
end

post '/compliance/generate' do
  require_auth!
  type = params[:type] || 'soc2'
  path = case type
         when 'gdpr'  then '/engine/compliance/reports/gdpr'
         when 'audit' then '/engine/compliance/reports/audit'
         else '/engine/compliance/reports/soc2'
         end
  res = api_post(path, { orgId: 'default' })
  if res[:status] < 300
    set_flash("#{type.upcase} report generated successfully", 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to generate report') : 'Failed to generate report', 'danger')
  end
  redirect '/compliance'
end

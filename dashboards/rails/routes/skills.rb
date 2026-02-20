# frozen_string_literal: true

# Skills Controller

get '/skills' do
  require_auth!
  categories_res = api_get('/engine/skills/by-category')
  @categories = categories_res[:status] == 200 ? (categories_res[:body]['categories'] || categories_res[:body]) : {}
  @categories = @categories.is_a?(Hash) ? @categories : {}
  installed_res = api_get('/engine/community/installed?orgId=default')
  @installed = installed_res[:status] == 200 ? (installed_res[:body]['skills'] || installed_res[:body]) : []
  @installed = @installed.is_a?(Array) ? @installed : []
  erb :skills
end

post '/skills/enable' do
  require_auth!
  skill_id = params[:skill_id]
  res = api_post("/engine/community/#{skill_id}/enable", {})
  set_flash(res[:status] < 300 ? 'Skill enabled' : (res[:body].is_a?(Hash) ? res[:body]['error'] || 'Failed' : 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/skills'
end

post '/skills/disable' do
  require_auth!
  skill_id = params[:skill_id]
  res = api_post("/engine/community/#{skill_id}/disable", {})
  set_flash(res[:status] < 300 ? 'Skill disabled' : (res[:body].is_a?(Hash) ? res[:body]['error'] || 'Failed' : 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/skills'
end

post '/skills/uninstall' do
  require_auth!
  skill_id = params[:skill_id]
  res = api_delete("/engine/community/#{skill_id}")
  set_flash(res[:status] < 300 ? 'Skill uninstalled' : (res[:body].is_a?(Hash) ? res[:body]['error'] || 'Failed' : 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/skills'
end

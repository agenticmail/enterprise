# frozen_string_literal: true

# Skills routes — builtin skills browser + community skill management

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
  if res[:status] < 300
    set_flash('Skill enabled successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to enable skill') : 'Failed to enable skill', 'danger')
  end
  redirect '/skills'
end

post '/skills/disable' do
  require_auth!
  skill_id = params[:skill_id]
  res = api_post("/engine/community/#{skill_id}/disable", {})
  if res[:status] < 300
    set_flash('Skill disabled successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to disable skill') : 'Failed to disable skill', 'danger')
  end
  redirect '/skills'
end

post '/skills/uninstall' do
  require_auth!
  skill_id = params[:skill_id]
  res = api_delete("/engine/community/#{skill_id}")
  if res[:status] < 300
    set_flash('Skill uninstalled successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to uninstall skill') : 'Failed to uninstall skill', 'danger')
  end
  redirect '/skills'
end

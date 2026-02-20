# frozen_string_literal: true

# Journal routes — entries, stats, rollback

get '/journal' do
  require_auth!
  stats_res = api_get('/engine/journal/stats/default')
  @stats = stats_res[:status] == 200 ? stats_res[:body] : {}
  entries_res = api_get('/engine/journal?orgId=default')
  @entries = entries_res[:status] == 200 ? (entries_res[:body]['entries'] || entries_res[:body]) : []
  @entries = @entries.is_a?(Array) ? @entries : []
  erb :journal
end

post '/journal/:id/rollback' do
  require_auth!
  res = api_post("/engine/journal/#{params[:id]}/rollback", { orgId: 'default' })
  if res[:status] < 300
    set_flash('Rollback completed successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to rollback entry') : 'Failed to rollback entry', 'danger')
  end
  redirect '/journal'
end

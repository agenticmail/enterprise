# frozen_string_literal: true

# Journal Controller

get '/journal' do
  require_auth!
  @page = (params[:page] || 1).to_i
  @limit = 25
  offset = (@page - 1) * @limit
  stats_res = api_get('/engine/journal/stats/default')
  entries_res = api_get("/engine/journal?limit=#{@limit}&offset=#{offset}")
  @stats = stats_res[:status] == 200 ? stats_res[:body] : {}
  body = entries_res[:status] == 200 ? entries_res[:body] : {}
  @entries = body.is_a?(Hash) ? (body['entries'] || body['journal'] || []) : (body.is_a?(Array) ? body : [])
  @total = body.is_a?(Hash) ? (body['total'] || @entries.size) : @entries.size
  erb :journal
end

post '/journal/:id/rollback' do
  require_auth!
  res = api_post("/engine/journal/#{params[:id]}/rollback", {})
  set_flash(res[:status] < 300 ? 'Entry rolled back' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/journal'
end

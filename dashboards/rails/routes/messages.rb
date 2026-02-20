# frozen_string_literal: true

# Messages Controller

get '/messages' do
  require_auth!
  @page = (params[:page] || 1).to_i
  @limit = 25
  offset = (@page - 1) * @limit
  res = api_get("/engine/messages?limit=#{@limit}&offset=#{offset}")
  body = res[:status] == 200 ? res[:body] : {}
  @messages = body.is_a?(Hash) ? (body['messages'] || []) : (body.is_a?(Array) ? body : [])
  @total = body.is_a?(Hash) ? (body['total'] || @messages.size) : @messages.size
  erb :messages
end

post '/messages' do
  require_auth!
  res = api_post('/engine/messages', { to: params[:to], subject: params[:subject], body: params[:body_text] })
  set_flash(res[:status] < 300 ? 'Message sent' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/messages'
end

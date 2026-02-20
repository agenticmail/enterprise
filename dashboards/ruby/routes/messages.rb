# frozen_string_literal: true

# Messages routes — list, send

get '/messages' do
  require_auth!
  res = api_get('/engine/messages?orgId=default')
  @messages = res[:status] == 200 ? (res[:body]['messages'] || res[:body]) : []
  @messages = @messages.is_a?(Array) ? @messages : []
  erb :messages
end

post '/messages/send' do
  require_auth!
  res = api_post('/engine/messages', {
    to: params[:to],
    subject: params[:subject],
    body: params[:body],
    orgId: 'default'
  })
  if res[:status] < 300
    set_flash('Message sent successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to send message') : 'Failed to send message', 'danger')
  end
  redirect '/messages'
end

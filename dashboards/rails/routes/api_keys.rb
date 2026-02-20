# frozen_string_literal: true

# API Keys Controller

get '/api-keys' do
  require_auth!
  res = api_get('/api/api-keys')
  @keys = res[:status] == 200 ? (res[:body]['api_keys'] || res[:body]['keys'] || res[:body]) : []
  @keys = @keys.is_a?(Array) ? @keys : []
  erb :api_keys
end

post '/api-keys' do
  require_auth!
  res = api_post('/api/api-keys', { name: params[:name], scopes: params[:scopes].to_s.split(',').map(&:strip) })
  if res[:status] < 300
    @created_key = res[:body]['key'] || res[:body]['api_key'] || res[:body]['token']
    set_flash("API key created. Key: #{@created_key}", 'success') if @created_key
  else
    set_flash(res[:body]['error'] || 'Failed', 'danger')
  end
  redirect '/api-keys'
end

post '/api-keys/:id/revoke' do
  require_auth!
  res = api_delete("/api/api-keys/#{params[:id]}")
  set_flash(res[:status] < 300 ? 'Key revoked' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/api-keys'
end

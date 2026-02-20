# frozen_string_literal: true

# API Keys routes — list, create, revoke

get '/api-keys' do
  require_auth!
  res = api_get('/api/api-keys')
  @keys = res[:status] == 200 ? (res[:body]['api_keys'] || res[:body]['keys'] || res[:body]) : []
  @keys = @keys.is_a?(Array) ? @keys : []
  @created_key = session.delete(:created_key)
  erb :api_keys
end

post '/api-keys' do
  require_auth!
  res = api_post('/api/api-keys', {
    name: params[:name],
    scopes: params[:scopes].to_s.split(',').map(&:strip).reject(&:empty?)
  })
  if res[:status] < 300
    key = res[:body]['key'] || res[:body]['api_key'] || res[:body]['token']
    if key
      session[:created_key] = key
      set_flash('API key created. Copy it now -- it will not be shown again.', 'success')
    else
      set_flash('API key created', 'success')
    end
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to create API key') : 'Failed to create API key', 'danger')
  end
  redirect '/api-keys'
end

post '/api-keys/:id/revoke' do
  require_auth!
  res = api_delete("/api/api-keys/#{params[:id]}")
  if res[:status] < 300
    set_flash('API key revoked successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to revoke key') : 'Failed to revoke key', 'danger')
  end
  redirect '/api-keys'
end

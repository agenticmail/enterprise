# frozen_string_literal: true

# Vault Controller

get '/vault' do
  require_auth!
  res = api_get('/api/engine/vault/secrets?orgId=default')
  @secrets = res[:status] == 200 ? (res[:body]['secrets'] || res[:body]) : []
  @secrets = @secrets.is_a?(Array) ? @secrets : []
  erb :vault
end

post '/vault' do
  require_auth!
  res = api_post('/api/engine/vault/secrets', {
    name: params[:name],
    value: params[:value],
    category: params[:category] || 'custom',
    orgId: 'default'
  })
  set_flash(res[:status] < 300 ? 'Secret added' : (res[:body].is_a?(Hash) ? res[:body]['error'] || 'Failed' : 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/vault'
end

post '/vault/:id/delete' do
  require_auth!
  res = api_delete("/api/engine/vault/secrets/#{params[:id]}")
  set_flash(res[:status] < 300 ? 'Secret deleted' : (res[:body].is_a?(Hash) ? res[:body]['error'] || 'Failed' : 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/vault'
end

post '/vault/:id/rotate' do
  require_auth!
  res = api_post("/api/engine/vault/secrets/#{params[:id]}/rotate", {})
  set_flash(res[:status] < 300 ? 'Secret encryption rotated' : (res[:body].is_a?(Hash) ? res[:body]['error'] || 'Failed' : 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/vault'
end

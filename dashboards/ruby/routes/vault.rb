# frozen_string_literal: true

# Vault routes — secrets management, rotate, delete

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
  if res[:status] < 300
    set_flash('Secret added successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to add secret') : 'Failed to add secret', 'danger')
  end
  redirect '/vault'
end

post '/vault/:id/delete' do
  require_auth!
  res = api_delete("/api/engine/vault/secrets/#{params[:id]}")
  if res[:status] < 300
    set_flash('Secret deleted successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to delete secret') : 'Failed to delete secret', 'danger')
  end
  redirect '/vault'
end

post '/vault/:id/rotate' do
  require_auth!
  res = api_post("/api/engine/vault/secrets/#{params[:id]}/rotate", {})
  if res[:status] < 300
    set_flash('Secret encryption rotated successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to rotate secret') : 'Failed to rotate secret', 'danger')
  end
  redirect '/vault'
end

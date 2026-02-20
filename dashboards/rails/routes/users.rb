# frozen_string_literal: true

# Users Controller

get '/users' do
  require_auth!
  res = api_get('/api/users')
  @users = res[:status] == 200 ? (res[:body]['users'] || res[:body]) : []
  @users = @users.is_a?(Array) ? @users : []
  erb :users
end

post '/users' do
  require_auth!
  res = api_post('/api/users', { name: params[:name], email: params[:email], role: params[:role] })
  set_flash(res[:status] < 300 ? 'User created' : (res[:body]['error'] || 'Failed'), res[:status] < 300 ? 'success' : 'danger')
  redirect '/users'
end

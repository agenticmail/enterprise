# frozen_string_literal: true

# Users routes — list and create

get '/users' do
  require_auth!
  res = api_get('/api/users')
  @users = res[:status] == 200 ? (res[:body]['users'] || res[:body]) : []
  @users = @users.is_a?(Array) ? @users : []
  erb :users
end

post '/users' do
  require_auth!
  res = api_post('/api/users', {
    name: params[:name],
    email: params[:email],
    role: params[:role]
  })
  if res[:status] < 300
    set_flash('User created successfully', 'success')
  else
    set_flash(res[:body].is_a?(Hash) ? (res[:body]['error'] || 'Failed to create user') : 'Failed to create user', 'danger')
  end
  redirect '/users'
end

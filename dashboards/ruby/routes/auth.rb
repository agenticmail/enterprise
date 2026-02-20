# frozen_string_literal: true

# Auth routes — login form, login POST, logout

get '/login' do
  redirect '/' if logged_in?
  erb :login, layout: false
end

post '/login' do
  res = api_request(:post, '/auth/login', body: {
    email: params[:email], password: params[:password]
  }, token: nil)

  if res[:status] == 200 && res[:body].is_a?(Hash) && res[:body]['token']
    session[:token] = res[:body]['token']
    session[:user]  = res[:body]['user'] || { 'email' => params[:email] }
    redirect '/'
  else
    @error = res[:body].is_a?(Hash) ? res[:body]['error'] : 'Login failed'
    @error ||= 'Invalid credentials'
    erb :login, layout: false
  end
end

get '/logout' do
  session.clear
  redirect '/login'
end

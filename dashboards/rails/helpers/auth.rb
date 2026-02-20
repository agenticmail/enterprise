# frozen_string_literal: true

# Authentication helpers
helpers do
  def logged_in? = !!session[:token]
  def current_user = session[:user] || {}

  def require_auth!
    redirect '/login' unless logged_in?
  end
end

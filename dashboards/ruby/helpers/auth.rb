# frozen_string_literal: true

# Authentication helpers — session management and access control
module Sinatra
  module AuthHelper
    def logged_in?
      !!session[:token]
    end

    def current_user
      session[:user] || {}
    end

    def require_auth!
      redirect '/login' unless logged_in?
    end
  end

  helpers AuthHelper
end

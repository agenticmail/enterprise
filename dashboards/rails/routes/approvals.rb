# frozen_string_literal: true

# Approvals route — Pending approval requests

get '/approvals' do
  require_auth!
  @pending_approvals = []
  @approval_history = []
  erb :approvals
end
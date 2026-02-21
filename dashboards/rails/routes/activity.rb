# frozen_string_literal: true

# Activity route — Real-time activity and tool usage

get '/activity' do
  require_auth!
  @events = []
  @tool_calls = []
  erb :activity
end
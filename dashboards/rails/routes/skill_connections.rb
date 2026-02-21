# frozen_string_literal: true

# Skill Connections route — Manage skill relationships and dependencies

get '/skill-connections' do
  require_auth!
  @connections = []
  @connection_types = {
    'dependencies' => 0,
    'enhancements' => 0,
    'conflicts' => 0
  }
  @recent_changes = []
  erb :skill_connections
end
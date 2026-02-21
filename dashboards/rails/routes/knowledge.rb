# frozen_string_literal: true

# Knowledge Bases route — Manage knowledge bases and documents

get '/knowledge' do
  require_auth!
  @knowledge_bases = []
  @recent_activity = []
  @stats = {}
  erb :knowledge
end
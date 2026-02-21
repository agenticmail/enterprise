#!/usr/bin/env ruby
# frozen_string_literal: true

# AgenticMail Enterprise Dashboard - Modular Sinatra App
# Setup: gem install sinatra && ruby app.rb

require 'sinatra'
require 'net/http'
require 'json'
require 'uri'
require 'time'

# =============================================================================
# Configuration
# =============================================================================
API_BASE = ENV.fetch('AGENTICMAIL_URL', 'http://localhost:3000')

set :port, 4567
set :bind, '0.0.0.0'
set :sessions, true
set :session_secret, ENV.fetch('SESSION_SECRET', SecureRandom.hex(32))
set :views, File.join(File.dirname(__FILE__), 'views')
set :public_folder, File.join(File.dirname(__FILE__), 'public')

# =============================================================================
# Helpers
# =============================================================================
require_relative 'helpers/api'
require_relative 'helpers/auth'
require_relative 'helpers/view'

# =============================================================================
# Before filter
# =============================================================================
before do
  pass if request.path_info == '/login'
  pass if request.path_info.start_with?('/assets')
end

# =============================================================================
# Routes
# =============================================================================
require_relative 'routes/auth'
require_relative 'routes/dashboard'
require_relative 'routes/agents'
require_relative 'routes/users'
require_relative 'routes/api_keys'
require_relative 'routes/vault'
require_relative 'routes/skills'
require_relative 'routes/audit'
require_relative 'routes/settings'
require_relative 'routes/messages'
require_relative 'routes/guardrails'
require_relative 'routes/journal'
require_relative 'routes/dlp'
require_relative 'routes/compliance'
require_relative 'routes/activity'
require_relative 'routes/approvals'
require_relative 'routes/community_skills'
require_relative 'routes/domain_status'
require_relative 'routes/knowledge'
require_relative 'routes/knowledge_contributions'
require_relative 'routes/skill_connections'
require_relative 'routes/workforce'

# frozen_string_literal: true

# Dashboard route — stats grid + recent audit events

get '/' do
  require_auth!
  stats_res = api_get('/api/stats')
  audit_res = api_get('/api/audit?limit=8')
  @stats = stats_res[:status] == 200 ? stats_res[:body] : {}
  @audit = audit_res[:status] == 200 ? (audit_res[:body]['events'] || audit_res[:body]) : []
  @audit = @audit.is_a?(Array) ? @audit : []
  erb :dashboard
end

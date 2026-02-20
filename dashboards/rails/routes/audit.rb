# frozen_string_literal: true

# Audit Controller

get '/audit' do
  require_auth!
  @page = (params[:page] || 1).to_i
  @limit = 25
  offset = (@page - 1) * @limit
  res = api_get("/api/audit?limit=#{@limit}&offset=#{offset}")
  body = res[:status] == 200 ? res[:body] : {}
  @events = body.is_a?(Hash) ? (body['events'] || []) : (body.is_a?(Array) ? body : [])
  @total  = body.is_a?(Hash) ? (body['total'] || @events.size) : @events.size
  erb :audit
end

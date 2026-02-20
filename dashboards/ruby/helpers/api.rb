# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'

# API client helper — wraps Net::HTTP for AgenticMail API calls
module Sinatra
  module ApiHelper
    API_BASE = ENV.fetch('AGENTICMAIL_URL', 'http://localhost:3000')

    def api_request(method, path, body: nil, token: nil)
      uri = URI("#{API_BASE}#{path}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.open_timeout = 5
      http.read_timeout = 10

      req = case method
            when :get    then Net::HTTP::Get.new(uri)
            when :post   then Net::HTTP::Post.new(uri)
            when :patch  then Net::HTTP::Patch.new(uri)
            when :put    then Net::HTTP::Put.new(uri)
            when :delete then Net::HTTP::Delete.new(uri)
            end

      req['Content-Type'] = 'application/json'
      req['Accept'] = 'application/json'
      tk = token || session[:token]
      req['Authorization'] = "Bearer #{tk}" if tk
      req.body = body.to_json if body

      res = http.request(req)
      { status: res.code.to_i, body: JSON.parse(res.body) rescue res.body }
    rescue Errno::ECONNREFUSED, Errno::ECONNRESET, Net::OpenTimeout, Net::ReadTimeout => e
      { status: 0, body: { 'error' => "API unreachable: #{e.message}" } }
    rescue JSON::ParserError
      { status: 500, body: { 'error' => 'Invalid JSON from API' } }
    end

    def api_get(path)
      api_request(:get, path)
    end

    def api_post(path, body)
      api_request(:post, path, body: body)
    end

    def api_put(path, body)
      api_request(:put, path, body: body)
    end

    def api_patch(path, body)
      api_request(:patch, path, body: body)
    end

    def api_delete(path)
      api_request(:delete, path)
    end
  end

  helpers ApiHelper
end

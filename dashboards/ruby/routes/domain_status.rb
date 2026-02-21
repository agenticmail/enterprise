# frozen_string_literal: true

# Domain Status route — Domain configuration and health status

get '/domain-status' do
  require_auth!
  @domain_config = {
    'domain_connected' => true,
    'dns_configured' => true,
    'ssl_valid' => true,
    'dkim_configured' => true,
    'spf_valid' => true,
    'dmarc_configured' => false
  }
  erb :domain_status
end
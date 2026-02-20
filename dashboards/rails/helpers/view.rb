# frozen_string_literal: true

# View helpers (Rails-style)
helpers do
  def active?(path)
    return 'active' if request.path_info == path
    return 'active' if path != '/' && request.path_info.start_with?(path)
    ''
  end

  def time_ago(iso)
    return 'N/A' unless iso
    t = Time.parse(iso.to_s) rescue return(iso.to_s)
    diff = (Time.now - t).to_i
    case diff
    when 0..59       then "#{diff}s ago"
    when 60..3599    then "#{diff / 60}m ago"
    when 3600..86399 then "#{diff / 3600}h ago"
    else "#{diff / 86400}d ago"
    end
  end

  def badge(text, variant = 'default')
    "<span class=\"badge badge-#{variant}\">#{escape_html(text.to_s)}</span>"
  end

  def status_badge(status)
    v = case status.to_s.downcase
        when 'active', 'enabled', 'running', 'success' then 'success'
        when 'archived', 'disabled', 'revoked'          then 'danger'
        when 'pending', 'paused'                         then 'warning'
        else 'default'
        end
    badge(status, v)
  end

  def category_badge(category)
    colors = {
      'deploy' => 'primary',
      'cloud_storage' => 'info',
      'api_key' => 'warning',
      'skill_credential' => 'success',
      'custom' => 'default',
    }
    v = colors[category.to_s] || 'default'
    badge(category.to_s.empty? ? 'custom' : category.to_s.gsub('_', ' '), v)
  end

  def direction_badge(direction)
    v = case direction.to_s.downcase
        when 'inbound'  then 'blue'
        when 'outbound' then 'success'
        when 'internal' then 'default'
        else 'default'
        end
    badge(direction.to_s.downcase.empty? ? '-' : direction, v)
  end

  def channel_badge(channel)
    v = case channel.to_s.downcase
        when 'email'    then 'primary'
        when 'api'      then 'warning'
        when 'internal' then 'default'
        when 'webhook'  then 'info'
        else 'default'
        end
    badge(channel.to_s.downcase.empty? ? '-' : channel, v)
  end

  def escape_html(s)
    Rack::Utils.escape_html(s.to_s)
  end

  def flash_messages
    msg = session.delete(:flash)
    return '' unless msg
    type = session.delete(:flash_type) || 'info'
    "<div class=\"flash flash-#{type}\">#{escape_html(msg)}</div>"
  end

  def set_flash(msg, type = 'info')
    session[:flash] = msg
    session[:flash_type] = type
  end

  # Layout renderer (Rails-style)
  def render_page(title, &block)
    content = capture_erb(&block) if block_given?
    erb :layout, locals: { title: title, content: content }
  end

  def capture_erb(&block)
    block.call
  end
end

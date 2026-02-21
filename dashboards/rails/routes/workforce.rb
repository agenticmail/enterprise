# frozen_string_literal: true

# Workforce route — Agent scheduling and workload management

get '/workforce' do
  require_auth!
  @stats = {
    'active_agents' => 0,
    'pending_tasks' => 0,
    'utilization' => 0
  }
  @schedules = []
  @workload_data = []
  @performance_metrics = []
  erb :workforce
end
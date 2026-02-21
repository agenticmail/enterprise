# frozen_string_literal: true

# Community Skills route — Browse and install community skills

get '/community-skills' do
  require_auth!
  @featured_skills = []
  @categories = []
  @my_contributions = []
  erb :community_skills
end
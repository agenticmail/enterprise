# frozen_string_literal: true

# Knowledge Hub route — Community knowledge sharing and contributions

get '/knowledge-contributions' do
  require_auth!
  @featured_knowledge = []
  @latest_contributions = []
  @trending_topics = []
  @my_bookmarks = []
  erb :knowledge_contributions
end
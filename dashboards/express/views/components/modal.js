/**
 * AgenticMail Enterprise Dashboard — Create Modal Components
 * Inline forms for creating agents, users, and API keys.
 */

/**
 * Agent create form (inline card, not overlay modal for simplicity)
 */
function agentCreateForm() {
  return `<div class="card">
  <h3>Create Agent</h3>
  <form method="post" action="/agents">
    <div class="form-group">
      <label>Role Template</label>
      <select name="soulId">
        <option value="">Custom (no template)</option>
        <optgroup label="Support">
          <option value="customer-support-lead">Customer Support Lead</option>
          <option value="technical-support-engineer">Technical Support Engineer</option>
          <option value="customer-success-manager">Customer Success Manager</option>
        </optgroup>
        <optgroup label="Sales">
          <option value="sales-development-rep">Sales Development Rep</option>
          <option value="account-executive">Account Executive</option>
        </optgroup>
        <optgroup label="Engineering">
          <option value="senior-software-engineer">Senior Software Engineer</option>
          <option value="devops-engineer">DevOps Engineer</option>
          <option value="qa-engineer">QA Engineer</option>
        </optgroup>
        <optgroup label="Operations">
          <option value="executive-assistant">Executive Assistant</option>
          <option value="project-coordinator">Project Coordinator</option>
        </optgroup>
        <optgroup label="Marketing">
          <option value="content-writer">Content Writer</option>
          <option value="social-media-manager">Social Media Manager</option>
        </optgroup>
        <optgroup label="Finance">
          <option value="financial-controller">Financial Controller</option>
          <option value="expense-auditor">Expense Auditor</option>
        </optgroup>
        <optgroup label="Legal">
          <option value="legal-compliance-officer">Legal Compliance Officer</option>
          <option value="contract-reviewer">Contract Reviewer</option>
        </optgroup>
        <optgroup label="Security">
          <option value="security-analyst">Security Analyst</option>
          <option value="compliance-auditor">Compliance Auditor</option>
        </optgroup>
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" required placeholder="e.g. Support Agent">
      </div>
      <div class="form-group">
        <label>Provider</label>
        <select name="provider">
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="google">Google</option>
          <option value="deepseek">DeepSeek</option>
          <option value="xai">xAI (Grok)</option>
          <option value="mistral">Mistral</option>
          <option value="groq">Groq</option>
          <option value="together">Together</option>
          <option value="fireworks">Fireworks</option>
          <option value="moonshot">Moonshot (Kimi)</option>
          <option value="cerebras">Cerebras</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama (Local)</option>
          <option value="vllm">vLLM (Local)</option>
          <option value="lmstudio">LM Studio (Local)</option>
          <option value="litellm">LiteLLM (Local)</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" id="model-field-container">
        <label>Model</label>
        <select name="model" id="agent-model-select">
          <option value="">-- Select a provider first --</option>
        </select>
        <input type="text" name="model_custom" id="agent-model-input" placeholder="Type a model ID" style="display:none">
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <input type="text" name="description" placeholder="What does this agent do?">
    </div>
    <script>
    (function() {
      var providerSelect = document.querySelector('select[name="provider"]');
      var modelSelect = document.getElementById('agent-model-select');
      var modelInput = document.getElementById('agent-model-input');
      if (!providerSelect || !modelSelect) return;

      function fetchModels(providerId) {
        if (!providerId) {
          modelSelect.innerHTML = '<option value="">-- Select a provider first --</option>';
          modelSelect.style.display = '';
          modelInput.style.display = 'none';
          modelInput.name = 'model_custom';
          modelSelect.name = 'model';
          return;
        }
        modelSelect.innerHTML = '<option value="">Loading models...</option>';
        modelSelect.style.display = '';
        modelInput.style.display = 'none';
        modelInput.name = 'model_custom';
        modelSelect.name = 'model';

        fetch('/api/providers/' + encodeURIComponent(providerId) + '/models', {
          headers: { 'Content-Type': 'application/json' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var models = data.models || data || [];
          if (!Array.isArray(models) || models.length === 0) {
            // Fall back to text input
            modelSelect.style.display = 'none';
            modelSelect.name = 'model_disabled';
            modelInput.style.display = '';
            modelInput.name = 'model';
            modelInput.value = '';
            modelInput.placeholder = 'Type a model ID (e.g. gpt-4o)';
            return;
          }
          var html = '';
          models.forEach(function(m) {
            var id = typeof m === 'string' ? m : (m.id || m.modelId || '');
            var label = typeof m === 'string' ? m : (m.name || m.label || id);
            if (id) html += '<option value="' + id.replace(/"/g, '&quot;') + '">' + label + '</option>';
          });
          if (!html) {
            modelSelect.style.display = 'none';
            modelSelect.name = 'model_disabled';
            modelInput.style.display = '';
            modelInput.name = 'model';
            return;
          }
          modelSelect.innerHTML = html;
          modelSelect.style.display = '';
          modelSelect.name = 'model';
          modelInput.style.display = 'none';
          modelInput.name = 'model_custom';
        })
        .catch(function() {
          modelSelect.style.display = 'none';
          modelSelect.name = 'model_disabled';
          modelInput.style.display = '';
          modelInput.name = 'model';
          modelInput.placeholder = 'Type a model ID (e.g. gpt-4o)';
        });
      }

      providerSelect.addEventListener('change', function() {
        fetchModels(providerSelect.value);
      });

      // Load models for the default selected provider on page load
      if (providerSelect.value) fetchModels(providerSelect.value);
    })();
    </script>
    <fieldset class="persona-fieldset"><legend>Persona (optional)</legend>
    <div class="form-row">
      <div class="form-group"><label>Date of Birth</label><input type="date" name="date_of_birth" id="date_of_birth"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Gender</label><select name="gender"><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="non-binary">Non-binary</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Marital Status</label><select name="marital_status"><option value="">Not specified</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option></select></div>
      <div class="form-group"><label>Cultural Background</label><select name="cultural_background"><option value="">Not specified</option><option value="north-american">North American</option><option value="british-european">British / European</option><option value="latin-american">Latin American</option><option value="middle-eastern">Middle Eastern</option><option value="east-asian">East Asian</option><option value="south-asian">South Asian</option><option value="southeast-asian">Southeast Asian</option><option value="african">African</option><option value="caribbean">Caribbean</option><option value="australian-pacific">Australian / Pacific</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Language</label><select name="language"><option value="en-us">English (American)</option><option value="en-gb">English (British)</option><option value="en-au">English (Australian)</option><option value="es">Spanish</option><option value="pt">Portuguese</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="zh">Mandarin</option><option value="hi">Hindi</option><option value="ar">Arabic</option><option value="yo">Yoruba</option><option value="ig">Igbo</option><option value="sw">Swahili</option><option value="it">Italian</option><option value="nl">Dutch</option><option value="ru">Russian</option><option value="tr">Turkish</option><option value="pl">Polish</option><option value="th">Thai</option><option value="vi">Vietnamese</option><option value="id">Indonesian</option><option value="ms">Malay</option><option value="tl">Filipino (Tagalog)</option></select></div>
      <div class="form-group"><label>Communication Style</label><select name="trait_communication"><option value="direct">Direct</option><option value="diplomatic">Diplomatic</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Detail Level</label><select name="trait_detail"><option value="detail-oriented">Detail-oriented</option><option value="big-picture">Big-picture</option></select></div>
      <div class="form-group"><label>Energy</label><select name="trait_energy"><option value="calm">Calm &amp; measured</option><option value="enthusiastic">Enthusiastic</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Humor</label><select name="humor"><option value="witty">Witty</option><option value="dry">Dry</option><option value="warm" selected>Warm</option><option value="none">None</option></select></div>
      <div class="form-group"><label>Formality</label><select name="formality"><option value="formal">Formal</option><option value="casual">Casual</option><option value="adaptive" selected>Adaptive</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Empathy</label><select name="empathy"><option value="high">High</option><option value="moderate" selected>Moderate</option><option value="reserved">Reserved</option></select></div>
      <div class="form-group"><label>Patience</label><select name="patience"><option value="patient" selected>Patient</option><option value="efficient">Efficient</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Creativity</label><select name="creativity"><option value="creative" selected>Creative</option><option value="conventional">Conventional</option></select></div>
    </div>
    </fieldset>
    <button class="btn btn-primary" type="submit">Create Agent</button>
  </form>
</div>`;
}

/**
 * User create form
 */
function userCreateForm() {
  return `<div class="card">
  <h3>Invite User</h3>
  <form method="post" action="/users">
    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" required placeholder="Full name">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" required placeholder="user@company.com">
      </div>
    </div>
    <div class="form-group">
      <label>Role</label>
      <select name="role">
        <option value="member">Member</option>
        <option value="admin">Admin</option>
        <option value="viewer">Viewer</option>
      </select>
    </div>
    <button class="btn btn-primary" type="submit">Create User</button>
  </form>
</div>`;
}

/**
 * API key create form
 */
function apiKeyCreateForm() {
  return `<div class="card">
  <h3>Create API Key</h3>
  <form method="post" action="/api-keys">
    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" required placeholder="e.g. Production Key">
      </div>
      <div class="form-group">
        <label>Scopes (comma separated)</label>
        <input type="text" name="scopes" placeholder="e.g. agents:read, messages:write">
      </div>
    </div>
    <button class="btn btn-primary" type="submit">Generate Key</button>
  </form>
</div>`;
}

module.exports = { agentCreateForm, userCreateForm, apiKeyCreateForm };

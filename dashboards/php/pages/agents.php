<?php
/**
 * Agents Page — Create form + list table + archive action
 */
$agents = am_api('/api/agents');

layout_start('Agents', 'agents');
?>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <div><h2 class="title">Agents</h2><p class="desc" style="margin:0">Manage AI agent identities</p></div>
    <button class="btn btn-p" onclick="document.getElementById('modal-agent').style.display='flex'">+ New Agent</button>
  </div>
  <div class="card">
    <?php $list = $agents['agents'] ?? []; if (empty($list)): ?>
      <div class="empty"><div class="empty-i">&#129302;</div>No agents yet</div>
    <?php else: ?>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      <?php foreach ($list as $a): ?>
        <tr><td style="font-weight:600"><a href="?page=agent-detail&id=<?= e($a['id']) ?>" style="color:var(--text);text-decoration:none"><?= e($a['name']) ?></a></td><td style="color:var(--dim)"><?= e($a['email']) ?></td><td><?= e($a['role']) ?></td><td><?= badge($a['status']) ?></td><td style="color:var(--muted);font-size:12px"><?= date('M j, Y', strtotime($a['createdAt'])) ?></td><td style="display:flex;gap:6px"><?php if ($a['status'] === 'active'): ?><a class="btn btn-sm btn-p" href="?page=agent-detail&id=<?= e($a['id']) ?>">View</a><?php endif; ?><a class="btn btn-sm btn-d" href="?page=agents&action=archive_agent&id=<?= e($a['id']) ?>">Archive</a></td></tr>
      <?php endforeach; ?>
      </tbody></table>
    <?php endif; ?>
  </div>
  <!-- Modal -->
  <div id="modal-agent" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:440px;max-width:90vw">
      <h3 style="margin-bottom:16px">Create Agent</h3>
      <form method="POST"><input type="hidden" name="action" value="create_agent">
        <div class="fg"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. researcher"></div>
        <div class="fg"><label class="fl">Email (optional)</label><input class="input" name="email" placeholder="auto-generated"></div>
        <div class="fg"><label class="fl">Provider</label><select class="input" name="provider" id="agent-provider">
          <option value="anthropic" selected>Anthropic</option>
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
        </select></div>
        <div class="fg"><label class="fl">Model</label><select class="input" name="model" id="agent-model"><option value="">Loading models...</option></select><input type="text" name="model_custom" id="agent-model-custom" class="input" placeholder="Enter model ID" style="display:none;margin-top:6px"></div>
        <div class="fg"><label class="fl">Role</label><select class="input" name="role"><option>assistant</option><option>secretary</option><option>researcher</option><option>writer</option><option>custom</option></select></div>
        <div class="fg"><label class="fl">Role Template</label><select class="input" name="soul_id">
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
        </select></div>
        <fieldset class="persona-fieldset"><legend>Persona (optional)</legend>
<div class="form-row">
  <div class="form-group"><label>Date of Birth</label><input type="date" name="date_of_birth" id="date_of_birth" class="input"></div>
</div>
<div class="form-row">
  <div class="form-group"><label>Gender</label><select name="gender" class="input"><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="non-binary">Non-binary</option></select></div>
</div>
<div class="form-row">
  <div class="form-group"><label>Marital Status</label><select name="marital_status" class="input"><option value="">Not specified</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option></select></div>
  <div class="form-group"><label>Cultural Background</label><select name="cultural_background" class="input"><option value="">Not specified</option><option value="north-american">North American</option><option value="british-european">British / European</option><option value="latin-american">Latin American</option><option value="middle-eastern">Middle Eastern</option><option value="east-asian">East Asian</option><option value="south-asian">South Asian</option><option value="southeast-asian">Southeast Asian</option><option value="african">African</option><option value="caribbean">Caribbean</option><option value="australian-pacific">Australian / Pacific</option></select></div>
</div>
<div class="form-row">
  <div class="form-group"><label>Language</label><select name="language" class="input"><option value="en-us">English (American)</option><option value="en-gb">English (British)</option><option value="en-au">English (Australian)</option><option value="es">Spanish</option><option value="pt">Portuguese</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="zh">Mandarin</option><option value="hi">Hindi</option><option value="ar">Arabic</option><option value="yo">Yoruba</option><option value="ig">Igbo</option><option value="sw">Swahili</option><option value="it">Italian</option><option value="nl">Dutch</option><option value="ru">Russian</option><option value="tr">Turkish</option><option value="pl">Polish</option><option value="th">Thai</option><option value="vi">Vietnamese</option><option value="id">Indonesian</option><option value="ms">Malay</option><option value="tl">Filipino (Tagalog)</option></select></div>
  <div class="form-group"><label>Communication Style</label><select name="trait_communication" class="input"><option value="direct">Direct</option><option value="diplomatic">Diplomatic</option></select></div>
</div>
<div class="form-row">
  <div class="form-group"><label>Detail Level</label><select name="trait_detail" class="input"><option value="detail-oriented">Detail-oriented</option><option value="big-picture">Big-picture</option></select></div>
  <div class="form-group"><label>Energy</label><select name="trait_energy" class="input"><option value="calm">Calm &amp; measured</option><option value="enthusiastic">Enthusiastic</option></select></div>
</div>
<div class="form-row">
<div class="form-group"><label>Humor</label><select name="humor" id="humor"><option value="witty">Witty</option><option value="dry">Dry</option><option value="warm" selected>Warm</option><option value="none">None</option></select></div>
<div class="form-group"><label>Formality</label><select name="formality" id="formality"><option value="formal">Formal</option><option value="casual">Casual</option><option value="adaptive" selected>Adaptive</option></select></div>
</div>
<div class="form-row">
<div class="form-group"><label>Empathy</label><select name="empathy" id="empathy"><option value="high">High</option><option value="moderate" selected>Moderate</option><option value="reserved">Reserved</option></select></div>
<div class="form-group"><label>Patience</label><select name="patience" id="patience"><option value="patient" selected>Patient</option><option value="efficient">Efficient</option></select></div>
</div>
<div class="form-row">
<div class="form-group"><label>Creativity</label><select name="creativity" id="creativity"><option value="creative" selected>Creative</option><option value="conventional">Conventional</option></select></div>
</div>
</fieldset>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" onclick="this.closest('[id]').style.display='none'">Cancel</button><button class="btn btn-p" type="submit">Create</button></div>
      </form>
    </div>
  </div>
<script>
(function() {
  var providerSelect = document.getElementById('agent-provider');
  var modelSelect = document.getElementById('agent-model');
  var modelCustom = document.getElementById('agent-model-custom');

  function loadModels(provider) {
    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    modelCustom.style.display = 'none';
    modelCustom.value = '';
    fetch('/api/providers/' + encodeURIComponent(provider) + '/models')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var models = d.models || [];
        modelSelect.innerHTML = '';
        if (models.length > 0) {
          models.forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name || m.id;
            modelSelect.appendChild(opt);
          });
        }
        var customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Custom (enter manually)';
        modelSelect.appendChild(customOpt);
      })
      .catch(function() {
        modelSelect.innerHTML = '<option value="">Enter model ID below</option>';
        modelCustom.style.display = 'block';
      });
  }

  modelSelect.addEventListener('change', function() {
    if (modelSelect.value === '__custom__') {
      modelCustom.style.display = 'block';
      modelCustom.focus();
    } else {
      modelCustom.style.display = 'none';
      modelCustom.value = '';
    }
  });

  providerSelect.addEventListener('change', function() {
    loadModels(providerSelect.value);
  });

  modelSelect.closest('form').addEventListener('submit', function() {
    if (modelSelect.value === '__custom__' && modelCustom.value) {
      modelSelect.innerHTML = '';
      var opt = document.createElement('option');
      opt.value = modelCustom.value;
      opt.selected = true;
      modelSelect.appendChild(opt);
    }
  });

  loadModels(providerSelect.value);
})();
</script>
<?php
layout_end();

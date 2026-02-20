<?php
/**
 * Agents page — create form + agent list with archive buttons.
 * Expects: $items (array of agent records)
 */
include_once __DIR__ . '/components/table.php';
?>
<div class="card">
    <h3>Create Agent</h3>
    <form method="post" action="/agents" class="inline-form">
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="name" placeholder="Agent name" required>
        </div>
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <input type="text" name="description" placeholder="Description">
        </div>
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <select name="provider" id="agent-provider">
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
            </select>
        </div>
        <div class="form-group" style="flex:1;min-width:160px;margin-bottom:0">
            <select name="model" id="agent-model">
                <option value="">Loading models...</option>
            </select>
            <input type="text" name="model_custom" id="agent-model-custom" placeholder="Enter model ID" style="display:none;margin-top:6px">
        </div>
        <div class="form-group" style="flex:1;min-width:200px;margin-bottom:0">
            <select name="soul_id">
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
        <button type="submit" class="btn btn-primary">Create</button>
    </form>
</div>

<?php
$headers = ['Name', 'Description', 'Status', 'Actions'];
$rows = [];
foreach ($items as $a) {
    $id   = Helpers::e($a['id'] ?? '');
    $name = '<strong><a href="/agents/' . $id . '" style="color:var(--text);text-decoration:none">' . Helpers::e($a['name'] ?? '-') . '</a></strong>';
    $desc = Helpers::e($a['description'] ?? '-');
    $st   = $a['status'] ?? 'active';
    $badge = Helpers::statusBadge($st);

    $viewBtn = '<a href="/agents/' . $id . '" class="btn btn-sm btn-primary">View</a> ';

    $archiveForm  = '<form method="post" action="/agents" style="display:inline">';
    $archiveForm .= '<input type="hidden" name="_action" value="archive">';
    $archiveForm .= '<input type="hidden" name="id" value="' . $id . '">';
    $archiveForm .= '<button type="submit" class="btn btn-sm btn-danger" onclick="return confirm(\'Archive this agent?\')">Archive</button>';
    $archiveForm .= '</form>';

    $rows[] = [$name, $desc, $badge, $viewBtn . $archiveForm];
}
?>

<div class="card">
    <h3>Agents</h3>
    <?= renderTable($headers, $rows) ?>
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

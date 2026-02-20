import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, DEPLOY_PHASES, DEPLOY_PHASE_LABELS, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
import { CULTURES, LANGUAGES, PersonaForm } from '../components/persona-fields.js';

// ════════════════════════════════════════════════════════════
// DEPLOY MODAL
// ════════════════════════════════════════════════════════════

export function DeployModal({ agentId, agentConfig, onClose, onDeployed, toast }) {
  const [step, setStep] = useState(0);
  const [targetType, setTargetType] = useState('docker');
  const [credentials, setCredentials] = useState([]);
  const [selectedCred, setSelectedCred] = useState('');
  const [config, setConfig] = useState({ imageTag: 'latest', ports: '3000', memory: '512m', cpu: '0.5', installPath: '/opt/agent', systemd: true, region: 'iad' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    engineCall('/deploy-credentials?orgId=default').then(d => setCredentials(d.credentials || [])).catch(() => {});
  }, []);

  const targets = [
    { id: 'docker', name: 'Docker', desc: 'Run in an isolated Docker container' },
    { id: 'vps', name: 'VPS / Server', desc: 'Deploy via SSH to a remote server' },
    { id: 'fly', name: 'Fly.io', desc: 'Deploy to Fly.io edge network' },
    { id: 'railway', name: 'Railway', desc: 'Deploy to Railway platform' },
  ];

  const filteredCreds = credentials.filter(c => c.targetType === targetType || c.targetType === 'ssh' && targetType === 'vps');

  const doDeploy = async () => {
    setError(''); setLoading(true);
    try {
      await engineCall('/agents/' + agentId + '/deploy', { method: 'POST', body: JSON.stringify({ targetType: targetType, credentialId: selectedCred || undefined, config: config, deployedBy: 'dashboard' }) });
      if (toast) toast('Deployment started', 'success');
      if (onDeployed) onDeployed();
      onClose();
    } catch (err) { setError(err.message); if (toast) toast(err.message, 'error'); }
    setLoading(false);
  };

  return h('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal modal-lg' },
      h('div', { className: 'modal-header' },
        h('h2', null, 'Deploy Agent'),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, I.x())
      ),
      h('div', { className: 'modal-body' },
        h('div', { className: 'wizard-steps' }, [0, 1, 2].map(i =>
          h('div', { key: i, className: 'wizard-step' + (i === step ? ' active' : '') + (i < step ? ' done' : '') })
        )),

        step === 0 && h(Fragment, null,
          h('h4', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Select Target'),
          h('div', { className: 'target-grid' }, targets.map(t =>
            h('div', { key: t.id, className: 'target-card' + (targetType === t.id ? ' selected' : ''), onClick: () => setTargetType(t.id) },
              h('h4', null, t.name),
              h('p', null, t.desc)
            )
          ))
        ),

        step === 1 && h(Fragment, null,
          h('h4', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Configure Deployment'),
          filteredCreds.length > 0 && h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Credential'),
            h('select', { className: 'input', value: selectedCred, onChange: e => setSelectedCred(e.target.value) },
              h('option', { value: '' }, '-- Select credential --'),
              filteredCreds.map(c => h('option', { key: c.id, value: c.id }, c.name))
            )
          ),
          filteredCreds.length === 0 && h('div', { style: { padding: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--warning)', marginBottom: 16 } }, 'No credentials found for this target type. Add one in Settings > Deployments.'),

          targetType === 'docker' && h(Fragment, null,
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Image Tag'),
                h('input', { className: 'input', value: config.imageTag, onChange: e => setConfig(c => ({ ...c, imageTag: e.target.value })) })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Ports'),
                h('input', { className: 'input', value: config.ports, onChange: e => setConfig(c => ({ ...c, ports: e.target.value })), placeholder: '3000' })
              )
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Memory'),
                h('input', { className: 'input', value: config.memory, onChange: e => setConfig(c => ({ ...c, memory: e.target.value })), placeholder: '512m' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'CPU'),
                h('input', { className: 'input', value: config.cpu, onChange: e => setConfig(c => ({ ...c, cpu: e.target.value })), placeholder: '0.5' })
              )
            )
          ),

          targetType === 'vps' && h(Fragment, null,
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Install Path'),
              h('input', { className: 'input', value: config.installPath, onChange: e => setConfig(c => ({ ...c, installPath: e.target.value })), placeholder: '/opt/agent' })
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 } },
              h('div', { className: 'toggle' + (config.systemd ? ' on' : ''), onClick: () => setConfig(c => ({ ...c, systemd: !c.systemd })) }),
              h('span', { style: { fontSize: 13 } }, 'Create systemd service')
            )
          ),

          targetType === 'fly' && h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Region'),
            h('select', { className: 'input', value: config.region, onChange: e => setConfig(c => ({ ...c, region: e.target.value })) },
              h('option', { value: 'iad' }, 'Ashburn (iad)'), h('option', { value: 'ord' }, 'Chicago (ord)'), h('option', { value: 'lax' }, 'Los Angeles (lax)'), h('option', { value: 'lhr' }, 'London (lhr)'), h('option', { value: 'ams' }, 'Amsterdam (ams)'), h('option', { value: 'nrt' }, 'Tokyo (nrt)')
            )
          ),

          targetType === 'railway' && h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Region'),
            h('select', { className: 'input', value: config.region, onChange: e => setConfig(c => ({ ...c, region: e.target.value })) },
              h('option', { value: 'us-west1' }, 'US West'), h('option', { value: 'us-east4' }, 'US East'), h('option', { value: 'europe-west4' }, 'Europe West'), h('option', { value: 'asia-southeast1' }, 'Asia Southeast')
            )
          )
        ),

        step === 2 && h(Fragment, null,
          h('h4', { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, 'Review Deployment'),
          h('div', { style: { background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', padding: 20 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 13 } },
              h('span', { style: { color: 'var(--text-muted)' } }, 'Agent'), h('span', { style: { fontWeight: 600 } }, agentConfig?.name || agentConfig?.email?.address || agentId),
              h('span', { style: { color: 'var(--text-muted)' } }, 'Target'), h('span', null, targets.find(t => t.id === targetType)?.name || targetType),
              h('span', { style: { color: 'var(--text-muted)' } }, 'Credential'), h('span', null, selectedCred ? (filteredCreds.find(c => c.id === selectedCred)?.name || selectedCred) : 'None'),
              targetType === 'docker' && h(Fragment, null,
                h('span', { style: { color: 'var(--text-muted)' } }, 'Image Tag'), h('span', null, config.imageTag),
                h('span', { style: { color: 'var(--text-muted)' } }, 'Resources'), h('span', null, config.memory + ' / ' + config.cpu + ' CPU')
              ),
              (targetType === 'fly' || targetType === 'railway') && h(Fragment, null,
                h('span', { style: { color: 'var(--text-muted)' } }, 'Region'), h('span', null, config.region)
              ),
              targetType === 'vps' && h(Fragment, null,
                h('span', { style: { color: 'var(--text-muted)' } }, 'Install Path'), h('span', null, config.installPath),
                h('span', { style: { color: 'var(--text-muted)' } }, 'Systemd'), h('span', null, config.systemd ? 'Yes' : 'No')
              )
            )
          ),
          error && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginTop: 12 } }, error)
        )
      ),
      h('div', { className: 'modal-footer' },
        step > 0 && h('button', { className: 'btn btn-secondary', onClick: () => setStep(step - 1) }, 'Back'),
        h('div', { style: { flex: 1 } }),
        step < 2 && h('button', { className: 'btn btn-primary', onClick: () => setStep(step + 1) }, 'Next'),
        step === 2 && h('button', { className: 'btn btn-primary', disabled: loading, onClick: doDeploy }, loading ? 'Deploying...' : 'Deploy')
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// DEPLOYMENT PROGRESS
// ════════════════════════════════════════════════════════════

export function DeploymentProgress({ agentId, onComplete }) {
  const [phases, setPhases] = useState({});

  useEffect(() => {
    var es = new EventSource('/api/engine/activity/stream');
    es.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.agentId && data.agentId !== agentId) return;
        if (data.type === 'deploy-phase' || data.type === 'deploy_phase') {
          setPhases(function(prev) {
            var next = Object.assign({}, prev);
            next[data.phase] = { status: data.status, message: data.message || '', timestamp: data.timestamp || new Date().toISOString() };
            return next;
          });
          if (data.phase === 'complete') {
            if (onComplete) onComplete(data.status === 'completed' || data.status === 'success');
          }
          if (data.status === 'failed' || data.status === 'error') {
            if (onComplete) onComplete(false);
          }
        }
      } catch (err) {}
    };
    es.onerror = function() { es.close(); };
    return function() { es.close(); };
  }, [agentId]);

  var currentPhaseIndex = -1;
  DEPLOY_PHASES.forEach(function(p, i) {
    if (phases[p]) currentPhaseIndex = i;
  });

  return h('div', { className: 'deploy-timeline' },
    DEPLOY_PHASES.map(function(phase, i) {
      var info = phases[phase];
      var status = 'pending';
      if (info) {
        if (info.status === 'completed' || info.status === 'success' || info.status === 'done') status = 'completed';
        else if (info.status === 'failed' || info.status === 'error') status = 'failed';
        else status = 'active';
      } else if (i <= currentPhaseIndex) {
        status = 'completed';
      }
      // Mark first un-completed phase after current as active if nothing explicitly active
      if (status === 'pending' && i === currentPhaseIndex + 1 && currentPhaseIndex >= 0) {
        var prevInfo = phases[DEPLOY_PHASES[currentPhaseIndex]];
        if (prevInfo && (prevInfo.status === 'completed' || prevInfo.status === 'success' || prevInfo.status === 'done')) {
          status = 'active';
        }
      }

      var icon = '-';
      if (status === 'completed') icon = h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 3 }, h('polyline', { points: '20 6 9 17 4 12' }));
      else if (status === 'active') icon = h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, h('path', { d: 'M12 2v4m0 12v4m-7.07-14.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4m-14.93-7.07l2.83 2.83m8.48 8.48l2.83 2.83' }));
      else if (status === 'failed') icon = h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 3 }, h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }), h('line', { x1: 6, y1: 6, x2: 18, y2: 18 }));

      return h('div', { key: phase, className: 'deploy-phase ' + status },
        h('div', { className: 'deploy-phase-icon' }, icon),
        h('div', { className: 'deploy-phase-content' },
          h('div', { className: 'deploy-phase-title' }, DEPLOY_PHASE_LABELS[phase] || phase),
          info && info.message && h('div', { className: 'deploy-phase-msg' }, info.message),
          info && info.timestamp && h('div', { className: 'deploy-phase-msg' }, new Date(info.timestamp).toLocaleTimeString())
        )
      );
    })
  );
}

// ════════════════════════════════════════════════════════════
// AGENT CREATION WIZARD
// ════════════════════════════════════════════════════════════

export function CreateAgentWizard({ onClose, onCreated, toast }) {
  const [step, setStep] = useState(0);
  const steps = ['Role', 'Basics', 'Persona', 'Skills', 'Permissions', 'Deployment', 'Review'];
  const [form, setForm] = useState({ name: '', email: '', role: 'assistant', description: '', personality: '', skills: [], preset: null, customTools: { allowed: [], blocked: [] }, deployTarget: 'docker', knowledgeBases: [], provider: 'anthropic', model: 'claude-sonnet-4-20250514', approvalRequired: true, soulId: null, avatar: null, gender: '', dateOfBirth: '', maritalStatus: '', culturalBackground: '', language: 'en-us', autoOnboard: true, maxRiskLevel: 'medium', blockedSideEffects: ['runs-code', 'deletes-data', 'financial', 'controls-device'], approvalForRiskLevels: ['high', 'critical'], approvalForSideEffects: ['sends-email', 'sends-message'], rateLimits: { toolCallsPerMinute: 30, toolCallsPerHour: 500, toolCallsPerDay: 5000, externalActionsPerHour: 50 }, constraints: { maxConcurrentTasks: 5, maxSessionDurationMinutes: 480, sandboxMode: false }, traits: { communication: 'direct', detail: 'detail-oriented', energy: 'calm', humor: 'warm', formality: 'adaptive', empathy: 'moderate', patience: 'patient', creativity: 'creative' } });
  const [allSkills, setAllSkills] = useState({});
  const [providers, setProviders] = useState([]);
  const [providerModels, setProviderModels] = useState([]);
  const [presets, setPresets] = useState([]);
  const [soulCategories, setSoulCategories] = useState({});
  const [soulMeta, setSoulMeta] = useState({});
  const [soulSearch, setSoulSearch] = useState('');
  const [selectedSoul, setSelectedSoul] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    engineCall('/skills/by-category').then(d => setAllSkills(d.categories || {})).catch(() => {});
    engineCall('/profiles/presets').then(d => setPresets(d.presets || [])).catch(() => {});
    engineCall('/souls/by-category').then(d => { setSoulCategories(d.categories || {}); setSoulMeta(d.categoryMeta || {}); }).catch(() => {});
    apiCall('/providers').then(function(d) { setProviders(d.providers || []); }).catch(function() {});
  }, []);

  // Fetch models when provider changes
  useEffect(function() {
    var p = form.provider || 'anthropic';
    apiCall('/providers/' + p + '/models').then(function(d) {
      var models = d.models || [];
      setProviderModels(models);
      // Auto-select first model if current model doesn't belong to this provider
      if (models.length > 0) {
        var currentValid = models.some(function(m) { return m.id === form.model; });
        if (!currentValid) {
          set('model', models[0].id);
        }
      }
    }).catch(function() { setProviderModels([]); });
  }, [form.provider]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSkill = (id) => setForm(f => ({ ...f, skills: f.skills.includes(id) ? f.skills.filter(s => s !== id) : [...f.skills, id] }));
  const [suites, setSuites] = useState([]);
  const [skillSearch, setSkillSearch] = useState('');

  // Load suites
  useEffect(() => {
    engineCall('/skills/suites').then(d => setSuites(d.suites || [])).catch(() => {});
  }, []);

  // Toggle an entire suite — adds all its skills at once, or removes them all
  const toggleSuite = (suite) => {
    setForm(f => {
      const allIn = suite.skills.every(id => f.skills.includes(id));
      if (allIn) {
        return { ...f, skills: f.skills.filter(id => !suite.skills.includes(id)) };
      } else {
        const merged = [...new Set([...f.skills, ...suite.skills])];
        return { ...f, skills: merged };
      }
    });
  };

  const selectSoul = (tpl) => {
    if (form.soulId === tpl.id) {
      setForm(f => ({ ...f, soulId: null }));
      setSelectedSoul(null);
      setPreviewOpen(false);
      return;
    }
    setForm(f => ({
      ...f,
      soulId: tpl.id,
      role: tpl.identity.role || tpl.name || f.role,
      personality: tpl.personality,
      description: tpl.description,
      skills: tpl.suggestedSkills || [],
      preset: tpl.suggestedPreset || f.preset,
    }));
    setSelectedSoul(tpl);
    setPreviewOpen(true);
  };

  // Parse personality markdown into named sections
  const parseSections = (text) => {
    if (!text) return {};
    const sections = {};
    const parts = text.split(/^## /m);
    for (const part of parts) {
      if (!part.trim()) continue;
      const nl = part.indexOf('\n');
      if (nl === -1) continue;
      sections[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
    }
    return sections;
  };

  // Rewrite "You are..." personality text into user-facing "This agent..." descriptions
  const rewriteForUser = (text) => {
    if (!text) return '';
    return text
      // Sentence-start patterns (after . or start of string)
      .replace(/(^|[.!?]\s+)You are /g, '$1This agent is ')
      .replace(/(^|[.!?]\s+)You do not /g, '$1This agent does not ')
      .replace(/(^|[.!?]\s+)You don't /g, '$1This agent won\'t ')
      .replace(/(^|[.!?]\s+)You never /g, '$1This agent never ')
      .replace(/(^|[.!?]\s+)You always /g, '$1This agent always ')
      .replace(/(^|[.!?]\s+)You can /g, '$1This agent can ')
      .replace(/(^|[.!?]\s+)You will /g, '$1This agent will ')
      .replace(/(^|[.!?]\s+)You have /g, '$1This agent has ')
      .replace(/(^|[.!?]\s+)You treat /g, '$1This agent treats ')
      .replace(/(^|[.!?]\s+)You use /g, '$1This agent uses ')
      .replace(/(^|[.!?]\s+)You apply /g, '$1This agent applies ')
      .replace(/(^|[.!?]\s+)You rely /g, '$1This agent relies ')
      .replace(/(^|[.!?]\s+)You prioritize /g, '$1This agent prioritizes ')
      .replace(/(^|[.!?]\s+)You write /g, '$1This agent writes ')
      .replace(/(^|[.!?]\s+)You keep /g, '$1This agent keeps ')
      .replace(/(^|[.!?]\s+)You work /g, '$1This agent works ')
      .replace(/(^|[.!?]\s+)You gather /g, '$1This agent gathers ')
      .replace(/(^|[.!?]\s+)You begin /g, '$1This agent begins ')
      .replace(/(^|[.!?]\s+)You maintain /g, '$1This agent maintains ')
      .replace(/(^|[.!?]\s+)You watch /g, '$1This agent watches ')
      .replace(/(^|[.!?]\s+)You guard /g, '$1This agent guards ')
      .replace(/(^|[.!?]\s+)You distinguish /g, '$1This agent distinguishes ')
      // Generic catch-all for remaining "You [verb]" at sentence start
      .replace(/(^|[.!?]\s+)You (\w)/g, (m, pre, c) => pre + 'This agent ' + c.toLowerCase())
      // Mid-sentence
      .replace(/ you /g, ' this agent ')
      .replace(/ your /g, ' this agent\'s ')
      .replace(/ Your /g, ' This agent\'s ')
      // Possessive at start
      .replace(/(^|[.!?]\s+)Your /g, '$1This agent\'s ');
  };

  // Extract first N sentences from a prose paragraph, rewritten for user
  const firstSentences = (text, n) => {
    if (!text) return '';
    const rewritten = rewriteForUser(text);
    const sentences = rewritten.match(/[^.!?]+[.!?]+/g) || [rewritten];
    return sentences.slice(0, n).join(' ').trim();
  };

  // Rewrite bullet/list items for user-facing language
  const extractItems = (text) => {
    if (!text) return [];
    const bullets = text.split('\n').filter(l => l.trim().startsWith('- ')).map(l => rewriteForUser(l.trim().slice(2).trim()));
    if (bullets.length > 0) return bullets;
    if (text.includes(',')) return text.split(',').map(s => s.trim()).filter(Boolean);
    return [rewriteForUser(text)];
  };

  // Filter souls by search
  const filteredCategories = {};
  for (const [cat, templates] of Object.entries(soulCategories)) {
    if (!soulSearch) { filteredCategories[cat] = templates; continue; }
    const q = soulSearch.toLowerCase();
    const filtered = templates.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.includes(q)));
    if (filtered.length > 0) filteredCategories[cat] = filtered;
  }

  const doCreate = async () => {
    setLoading(true);
    try {
      const result = await engineCall('/bridge/agents', { method: 'POST', body: JSON.stringify({
        orgId: 'default',
        name: form.name,
        displayName: form.name,
        email: form.email || form.name.toLowerCase().replace(/\s+/g, '.') + '@agenticmail.local',
        role: form.role,
        model: { provider: form.provider || 'anthropic', modelId: form.model === 'custom' ? (form.customModelId || form.model) : form.model },
        deployment: { target: form.deployTarget },
        presetName: form.preset || undefined,
        permissions: {
          maxRiskLevel: form.maxRiskLevel,
          blockedSideEffects: form.blockedSideEffects,
          requireApproval: {
            enabled: form.approvalRequired,
            forRiskLevels: form.approvalForRiskLevels,
            forSideEffects: form.approvalForSideEffects,
            approvers: [],
            timeoutMinutes: 60,
          },
          rateLimits: form.rateLimits,
          constraints: form.constraints,
        },
        persona: {
          avatar: form.avatar || undefined,
          gender: form.gender || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          maritalStatus: form.maritalStatus || undefined,
          culturalBackground: form.culturalBackground || undefined,
          language: form.language,
          traits: form.traits,
        },
      }) });

      const agentId = result?.agentId || result?.agent?.id;

      if (form.autoOnboard && agentId) {
        try {
          await engineCall('/onboarding/initiate/' + agentId, { method: 'POST', body: JSON.stringify({ orgId: 'default' }) });
          toast('Agent "' + form.name + '" created and onboarding started', 'success');
        } catch (e) {
          toast('Agent created but onboarding failed: ' + e.message, 'warning');
        }
      } else {
        toast('Agent "' + form.name + '" created successfully', 'success');
      }

      onCreated();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
    setLoading(false);
  };

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0;
    return true;
  };

  const lastStep = steps.length - 1;

  const stepIcons = ['soul', 'basics', 'skills', 'perms', 'deploy', 'review'];

  return h('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal modal-xl' },
      h('div', { className: 'modal-header' },
        h('div', null,
          h('h2', null, 'Create Agent'),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontWeight: 400 } }, 'Configure your new AI agent step by step')
        ),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, I.x())
      ),
      h('div', { className: 'modal-body', style: { padding: 0 } },
        h('div', { className: 'wizard-layout' },
          // ─── Sidebar stepper ───
          h('div', { className: 'wizard-sidebar' },
            steps.map((s, i) =>
              h('div', {
                key: i,
                className: 'wizard-sidebar-step' + (i === step ? ' active' : '') + (i < step ? ' done' : ''),
                onClick: () => { if (i < step || (i === step + 1 && canNext())) setStep(i); },
                style: { cursor: i <= step || (i === step + 1 && canNext()) ? 'pointer' : 'default', opacity: i > step + 1 ? 0.5 : 1 }
              },
                h('div', { className: 'wizard-sidebar-num' }, i < step ? I.check() : i + 1),
                h('span', null, s)
              )
            )
          ),
          // ─── Step content ───
          h('div', { className: 'wizard-content' },

            // Step 0: Role (Soul Template Selector)
            step === 0 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Choose a Role Template'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 } }, 'Select a pre-built role to auto-configure skills, permissions, and personality. Or skip to configure from scratch.'),

              // ── Role Resume Card (shown when a soul is selected) ──
              selectedSoul && form.soulId && (() => {
                const ps = parseSections(selectedSoul.personality || '');
                const identity = selectedSoul.identity || {};
                const skills = selectedSoul.suggestedSkills || [];
                const toneLabels = { formal: 'Formal & structured', casual: 'Casual & conversational', professional: 'Professional & clear', friendly: 'Friendly & warm' };
                const expertiseItems = extractItems(ps['Expertise'] || '');
                const principleItems = extractItems(ps['Principles'] || '');
                const boundaryItems = extractItems(ps['Boundaries'] || '');

                const sectionHead = (title) => h('div', { style: { marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' } },
                  h('span', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' } }, title)
                );

                const prose = (text, sentences) => h('p', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 } }, firstSentences(text, sentences));

                return h('div', { style: { marginBottom: 16, border: '2px solid var(--accent)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-primary)' } },

                  // ── Resume header ──
                  h('div', { style: { padding: '16px 20px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'flex-start', gap: 14 } },
                    h('div', { style: { width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 } },
                      selectedSoul.name.charAt(0)
                    ),
                    h('div', { style: { flex: 1, minWidth: 0 } },
                      h('div', { style: { fontWeight: 800, fontSize: 16 } }, selectedSoul.name),
                      h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 } }, selectedSoul.description),
                      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 } },
                        h('span', { className: 'badge badge-primary' }, identity.role || selectedSoul.name),
                        h('span', { className: 'badge badge-neutral' }, toneLabels[identity.tone] || 'Professional'),
                        h('span', { className: 'badge badge-neutral' }, 'Language: ' + (identity.language || 'en').toUpperCase()),
                        selectedSoul.suggestedPreset && h('span', { className: 'badge badge-info' }, 'Preset: ' + selectedSoul.suggestedPreset)
                      )
                    ),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 } },
                      h('button', { className: 'btn btn-ghost btn-sm', onClick: () => selectSoul(selectedSoul) }, 'Clear'),
                      h('button', {
                        className: 'btn btn-ghost btn-sm',
                        onClick: () => setPreviewOpen(o => !o),
                        title: previewOpen ? 'Collapse' : 'Expand'
                      },
                        h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, style: { transition: 'transform 150ms', transform: previewOpen ? 'rotate(180deg)' : 'rotate(0)' } },
                          h('polyline', { points: '6 9 12 15 18 9' })
                        )
                      )
                    )
                  ),

                  // ── Expandable resume body ──
                  previewOpen && h('div', { style: { padding: '16px 20px 20px' } },

                    // What this agent does
                    ps['Identity'] && h('div', { style: { marginBottom: 18 } },
                      sectionHead('What this agent does'),
                      prose(ps['Identity'], 3)
                    ),

                    // How it works
                    ps['Approach'] && h('div', { style: { marginBottom: 18 } },
                      sectionHead('How it works'),
                      prose(ps['Approach'], 3)
                    ),

                    // Two-column: Thinking + Decision making
                    (ps['Mental Models'] || ps['Decision Framework']) && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 } },
                      ps['Mental Models'] && h('div', null,
                        sectionHead('How it thinks'),
                        prose(ps['Mental Models'], 3)
                      ),
                      ps['Decision Framework'] && h('div', null,
                        sectionHead('How it prioritizes'),
                        prose(ps['Decision Framework'], 3)
                      )
                    ),

                    // Communication style
                    ps['Communication Style'] && h('div', { style: { marginBottom: 18 } },
                      sectionHead('How it communicates'),
                      prose(ps['Communication Style'], 3)
                    ),

                    // Expertise — pill tags
                    expertiseItems.length > 0 && h('div', { style: { marginBottom: 18 } },
                      sectionHead('Areas of expertise'),
                      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                        expertiseItems.map((item, i) =>
                          h('span', { key: i, style: { padding: '4px 12px', fontSize: 12, background: 'var(--bg-tertiary)', borderRadius: 20, color: 'var(--text-primary)', border: '1px solid var(--border)' } }, item)
                        )
                      )
                    ),

                    // Skills auto-enabled
                    skills.length > 0 && h('div', { style: { marginBottom: 18 } },
                      sectionHead('Tools this agent will use (' + skills.length + ')'),
                      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                        skills.map(s => h('span', { key: s, style: { padding: '4px 12px', fontSize: 12, background: 'var(--accent-soft)', borderRadius: 20, color: 'var(--accent-text)', border: '1px solid var(--accent)', fontWeight: 500 } }, s.replace(/-/g, ' ')))
                      )
                    ),

                    // Core principles
                    principleItems.length > 0 && h('div', { style: { marginBottom: 18 } },
                      sectionHead('Operating principles'),
                      h('ol', { style: { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } },
                        principleItems.slice(0, 6).map((p, i) => h('li', { key: i, style: { marginBottom: 2 } }, p))
                      )
                    ),

                    // Limitations
                    boundaryItems.length > 0 && h('div', { style: { padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.15)' } },
                      sectionHead('Limitations'),
                      h('ul', { style: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' } },
                        boundaryItems.map((b, i) => h('li', { key: i, style: { marginBottom: 2 } }, b))
                      )
                    )
                  )
                );
              })(),

              h('div', { style: { marginBottom: 14 } },
                h('input', { className: 'input', value: soulSearch, onChange: e => setSoulSearch(e.target.value), placeholder: 'Search roles (e.g., support, engineer, analyst...)' })
              ),
              h('div', null,
                Object.entries(filteredCategories).map(([cat, templates]) =>
                  h('div', { key: cat, style: { marginBottom: 20 } },
                    h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 } },
                      soulMeta[cat]?.icon || '',
                      ' ',
                      soulMeta[cat]?.name || cat,
                      h('span', { style: { fontWeight: 400, opacity: 0.6, marginLeft: 4 } }, '(' + templates.length + ')')
                    ),
                    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 } },
                      templates.map(tpl =>
                        h('div', {
                          key: tpl.id,
                          className: 'preset-card' + (form.soulId === tpl.id ? ' selected' : ''),
                          onClick: () => selectSoul(tpl),
                          style: { cursor: 'pointer', padding: '10px 14px' }
                        },
                          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                            h('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, tpl.name),
                            form.soulId === tpl.id && h('span', { style: { color: 'var(--accent)' } }, I.check())
                          ),
                          h('p', { style: { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.4 } }, tpl.description)
                        )
                      )
                    )
                  )
                ),
                Object.keys(filteredCategories).length === 0 && h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 } }, 'No roles match your search.')
              )
            ),

            // Step 1: Basics
            step === 1 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Basic Information'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 } }, 'Give your agent their real identity — this is how they\'ll introduce themselves and be known.'),
              form.soulId && h('div', { style: { marginBottom: 16, padding: '8px 12px', background: 'var(--accent-soft)', borderRadius: 'var(--radius)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 } },
                h('span', { className: 'badge badge-primary' }, 'Role Template'),
                h('span', null, form.soulId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Full Name *'),
                  h('input', { className: 'input', value: form.name, onChange: e => set('name', e.target.value), placeholder: 'e.g., Sarah Chen, Marcus Johnson' }),
                  h('p', { className: 'form-help' }, 'Their real human name — how they\'ll introduce themselves')
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Email Address'),
                  h('input', { className: 'input', value: form.email, onChange: e => set('email', e.target.value), placeholder: form.name ? form.name.toLowerCase().replace(/\s+/g, '.') + '@yourdomain.com' : 'first.last@yourdomain.com' }),
                  h('p', { className: 'form-help' }, 'Leave blank for auto-generated from their name')
                )
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Role / Job Title'),
                  h('input', { className: 'input', value: form.role, onChange: e => set('role', e.target.value), placeholder: 'e.g., Customer Support Lead' }),
                  h('p', { className: 'form-help' }, 'Pre-filled from role template — edit to customize')
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'LLM Provider'),
                  h('select', {
                    className: 'input',
                    value: form.provider || 'anthropic',
                    onChange: function(e) { setForm(Object.assign({}, form, { provider: e.target.value })); },
                  },
                    providers.length > 0
                      ? providers.filter(function(p) { return p.configured; }).map(function(p) {
                          return h('option', { key: p.id, value: p.id }, p.name + (p.isLocal ? ' (Local)' : ''));
                        })
                      : [
                          h('option', { value: 'anthropic' }, 'Anthropic'),
                          h('option', { value: 'openai' }, 'OpenAI'),
                          h('option', { value: 'google' }, 'Google'),
                          h('option', { value: 'deepseek' }, 'DeepSeek'),
                          h('option', { value: 'xai' }, 'xAI (Grok)'),
                          h('option', { value: 'mistral' }, 'Mistral'),
                          h('option', { value: 'groq' }, 'Groq'),
                          h('option', { value: 'ollama' }, 'Ollama (Local)'),
                        ]
                  )
                )
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Model'),
                  providerModels.length > 0
                    ? h('select', { className: 'input', value: form.model, onChange: e => set('model', e.target.value) },
                        providerModels.map(function(m) {
                          return h('option', { key: m.id, value: m.id }, m.name || m.id);
                        }),
                        h('option', { value: 'custom' }, 'Custom (enter manually)')
                      )
                    : h('input', { className: 'input', value: form.model, onChange: e => set('model', e.target.value), placeholder: 'Enter model ID (e.g. claude-opus-4-6)' })
                ),
                form.model === 'custom' && h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Custom Model ID'),
                  h('input', { className: 'input', value: form.customModelId || '', onChange: e => set('customModelId', e.target.value), placeholder: 'e.g. my-fine-tuned-model-v2' })
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Description'),
                h('textarea', { className: 'input', value: form.description, onChange: e => set('description', e.target.value), placeholder: 'What does this agent do? What are its responsibilities?', rows: 3 })
              )
            ),

            // Step 2: Persona — uses shared PersonaForm component
            step === 2 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Persona & Identity'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 } }, 'Upload a photo, set their birthday, and customize their background — they\'ll age naturally over time.'),
              h(PersonaForm, { form: form, set: set, toast: toast })
            ),

            // Step 3: Skills
            step === 3 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Skills & Capabilities'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 } }, 'Select the skills this agent should have. Skills determine what tools and actions are available.'),
              h('div', { style: { marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 } },
                h('span', { className: 'badge badge-primary' }, form.skills.length + ' selected'),
                form.skills.length > 0 && h('button', { className: 'btn btn-ghost btn-sm', onClick: () => set('skills', []) }, 'Clear all')
              ),

              // Suites — one-click to add an entire platform
              suites.length > 0 && h('div', { style: { marginBottom: 24 } },
                h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } }, 'Suites — select a platform to add all its apps'),
                h('div', { className: 'suite-grid' }, suites.map(s =>
                  h('div', { key: s.id, className: 'suite-card' + (s.skills.every(id => form.skills.includes(id)) ? ' selected' : s.skills.some(id => form.skills.includes(id)) ? ' partial' : ''), onClick: () => toggleSuite(s) },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                      h('span', { style: { fontSize: 20 } }, s.icon),
                      s.skills.every(id => form.skills.includes(id)) && h('span', { style: { color: 'var(--accent)' } }, I.check())
                    ),
                    h('div', { className: 'suite-name' }, s.name),
                    h('div', { className: 'suite-desc' }, s.skills.length + ' apps included'),
                    s.skills.some(id => form.skills.includes(id)) && !s.skills.every(id => form.skills.includes(id)) && h('div', { className: 'badge badge-warning', style: { marginTop: 6, fontSize: 10 } }, s.skills.filter(id => form.skills.includes(id)).length + '/' + s.skills.length + ' selected')
                  )
                ))
              ),

              // Search bar for filtering individual skills
              h('div', { style: { marginBottom: 14 } },
                h('input', { className: 'input', type: 'text', placeholder: 'Search skills...', value: skillSearch, onChange: e => setSkillSearch(e.target.value), style: { maxWidth: 300 } })
              ),

              // Individual skills by category
              Object.entries(allSkills).map(([cat, skills]) => {
                const filtered = skillSearch ? skills.filter(s => s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase())) : skills;
                if (filtered.length === 0) return null;
                return h('div', { key: cat, style: { marginBottom: 20 } },
                  h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } }, cat.replace(/-/g, ' ')),
                  h('div', { className: 'skill-grid' }, filtered.map(s =>
                    h('div', { key: s.id, className: 'skill-card' + (form.skills.includes(s.id) ? ' selected' : ''), onClick: () => toggleSkill(s.id) },
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                        h('span', { className: 'skill-name' }, (s.icon || '') + ' ' + s.name),
                        form.skills.includes(s.id) && h('span', { style: { color: 'var(--accent)' } }, I.check())
                      ),
                      h('div', { className: 'skill-desc' }, s.description)
                    )
                  ))
                );
              })
            ),

            // Step 4: Permissions
            step === 4 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Permissions & Security'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 } }, 'Start with a preset, then fine-tune individual controls below.'),

              // Preset cards
              h('div', { className: 'preset-grid' }, presets.map(p =>
                h('div', { key: p.name, className: 'preset-card' + (form.preset === p.name ? ' selected' : ''), onClick: () => {
                  if (form.preset === p.name) { set('preset', null); return; }
                  setForm(f => ({ ...f, preset: p.name, maxRiskLevel: p.maxRiskLevel || 'medium', blockedSideEffects: p.blockedSideEffects || [], approvalRequired: p.requireApproval?.enabled ?? true, approvalForRiskLevels: p.requireApproval?.forRiskLevels || ['high', 'critical'], approvalForSideEffects: p.requireApproval?.forSideEffects || [], rateLimits: p.rateLimits || f.rateLimits, constraints: p.constraints || f.constraints }));
                } },
                  h('h4', null, p.name),
                  h('p', null, p.description),
                  p.maxRiskLevel && h('div', { style: { marginTop: 6 } }, h('span', { className: 'badge badge-' + (p.maxRiskLevel === 'low' ? 'success' : p.maxRiskLevel === 'medium' ? 'warning' : 'danger') }, 'Risk: ' + p.maxRiskLevel))
                )
              )),

              // Max Risk Level
              h('div', { style: { marginTop: 24 } },
                h('h4', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, 'Maximum Risk Level'),
                h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 } }, 'The highest risk level of tools this agent is allowed to use.'),
                h('div', { style: { display: 'flex', gap: 8 } },
                  ['low', 'medium', 'high', 'critical'].map(level =>
                    h('button', { key: level, className: 'btn' + (form.maxRiskLevel === level ? ' btn-primary' : ' btn-secondary'), onClick: () => set('maxRiskLevel', level), style: { textTransform: 'capitalize' } }, level)
                  )
                )
              ),

              // Blocked Side Effects
              h('div', { style: { marginTop: 20 } },
                h('h4', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, 'Blocked Side Effects'),
                h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 } }, 'Actions this agent is never allowed to perform, regardless of tool permissions.'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 } },
                  [
                    { id: 'sends-email', label: 'Send Emails' },
                    { id: 'sends-message', label: 'Send Messages' },
                    { id: 'sends-sms', label: 'Send SMS' },
                    { id: 'posts-social', label: 'Post to Social Media' },
                    { id: 'runs-code', label: 'Execute Code' },
                    { id: 'modifies-files', label: 'Modify Files' },
                    { id: 'deletes-data', label: 'Delete Data' },
                    { id: 'controls-device', label: 'Control Devices' },
                    { id: 'financial', label: 'Financial Actions' },
                  ].map(se =>
                    h('label', { key: se.id, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 8px', borderRadius: 'var(--radius)', background: form.blockedSideEffects.includes(se.id) ? 'var(--danger-soft, rgba(239,68,68,0.08))' : 'var(--bg-tertiary)', cursor: 'pointer', border: '1px solid ' + (form.blockedSideEffects.includes(se.id) ? 'var(--danger)' : 'transparent') } },
                      h('input', { type: 'checkbox', checked: form.blockedSideEffects.includes(se.id), onChange: () => {
                        const cur = form.blockedSideEffects;
                        set('blockedSideEffects', cur.includes(se.id) ? cur.filter(x => x !== se.id) : [...cur, se.id]);
                      }, style: { accentColor: 'var(--danger)' } }),
                      se.label
                    )
                  )
                )
              ),

              // Approval Settings
              h('div', { style: { marginTop: 20 } },
                h('h4', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, 'Approval Requirements'),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
                  h('div', { className: 'toggle' + (form.approvalRequired ? ' on' : ''), onClick: () => set('approvalRequired', !form.approvalRequired) }),
                  h('div', null,
                    h('div', { style: { fontWeight: 500, fontSize: 12 } }, 'Require human approval for sensitive actions'),
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Agent pauses and waits for approval before executing flagged operations')
                  )
                ),
                form.approvalRequired && h(Fragment, null,
                  h('div', { style: { marginLeft: 4, paddingLeft: 16, borderLeft: '2px solid var(--border)' } },
                    h('div', { style: { marginBottom: 10 } },
                      h('div', { style: { fontSize: 12, fontWeight: 500, marginBottom: 6 } }, 'Require approval for risk levels:'),
                      h('div', { style: { display: 'flex', gap: 6 } },
                        ['low', 'medium', 'high', 'critical'].map(level =>
                          h('label', { key: level, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', background: form.approvalForRiskLevels.includes(level) ? 'var(--accent-soft)' : 'var(--bg-tertiary)', cursor: 'pointer', textTransform: 'capitalize' } },
                            h('input', { type: 'checkbox', checked: form.approvalForRiskLevels.includes(level), onChange: () => {
                              const cur = form.approvalForRiskLevels;
                              set('approvalForRiskLevels', cur.includes(level) ? cur.filter(x => x !== level) : [...cur, level]);
                            } }),
                            level
                          )
                        )
                      )
                    ),
                    h('div', null,
                      h('div', { style: { fontSize: 12, fontWeight: 500, marginBottom: 6 } }, 'Require approval for side effects:'),
                      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                        ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'runs-code', 'financial'].map(se =>
                          h('label', { key: se, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', background: form.approvalForSideEffects.includes(se) ? 'var(--accent-soft)' : 'var(--bg-tertiary)', cursor: 'pointer' } },
                            h('input', { type: 'checkbox', checked: form.approvalForSideEffects.includes(se), onChange: () => {
                              const cur = form.approvalForSideEffects;
                              set('approvalForSideEffects', cur.includes(se) ? cur.filter(x => x !== se) : [...cur, se]);
                            } }),
                            se.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                          )
                        )
                      )
                    )
                  )
                )
              ),

              // Rate Limits
              h('div', { style: { marginTop: 20 } },
                h('h4', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, 'Rate Limits'),
                h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 } }, 'Maximum number of tool calls the agent can make within each time window.'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
                  [
                    { key: 'toolCallsPerMinute', label: 'Calls / Minute' },
                    { key: 'toolCallsPerHour', label: 'Calls / Hour' },
                    { key: 'toolCallsPerDay', label: 'Calls / Day' },
                    { key: 'externalActionsPerHour', label: 'External Actions / Hour' },
                  ].map(rl =>
                    h('div', { key: rl.key, className: 'form-group' },
                      h('label', { style: { fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 } }, rl.label),
                      h('input', { className: 'input', type: 'number', min: 0, value: form.rateLimits[rl.key], onChange: e => setForm(f => ({ ...f, rateLimits: { ...f.rateLimits, [rl.key]: parseInt(e.target.value) || 0 } })), style: { fontSize: 12 } })
                    )
                  )
                )
              ),

              // Constraints
              h('div', { style: { marginTop: 20 } },
                h('h4', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, 'Execution Constraints'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 } },
                  h('div', { className: 'form-group' },
                    h('label', { style: { fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 } }, 'Max Concurrent Tasks'),
                    h('input', { className: 'input', type: 'number', min: 1, max: 50, value: form.constraints.maxConcurrentTasks, onChange: e => setForm(f => ({ ...f, constraints: { ...f.constraints, maxConcurrentTasks: parseInt(e.target.value) || 1 } })), style: { fontSize: 12 } })
                  ),
                  h('div', { className: 'form-group' },
                    h('label', { style: { fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 } }, 'Max Session (minutes)'),
                    h('input', { className: 'input', type: 'number', min: 1, value: form.constraints.maxSessionDurationMinutes, onChange: e => setForm(f => ({ ...f, constraints: { ...f.constraints, maxSessionDurationMinutes: parseInt(e.target.value) || 60 } })), style: { fontSize: 12 } })
                  ),
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 } },
                    h('div', { className: 'toggle' + (form.constraints.sandboxMode ? ' on' : ''), onClick: () => setForm(f => ({ ...f, constraints: { ...f.constraints, sandboxMode: !f.constraints.sandboxMode } })) }),
                    h('div', null,
                      h('div', { style: { fontWeight: 500, fontSize: 12 } }, 'Sandbox Mode'),
                      h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Simulate actions only')
                    )
                  )
                )
              )
            ),

            // Step 5: Deployment
            step === 5 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Deployment Target'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 } }, 'Choose where and how this agent will run.'),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
                ['docker', 'vps', 'local'].map(t =>
                  h('div', { key: t, className: 'preset-card' + (form.deployTarget === t ? ' selected' : ''), onClick: () => set('deployTarget', t), style: { padding: '16px 18px' } },
                    h('h4', { style: { marginBottom: 6 } }, { docker: 'Docker Container', vps: 'VPS / Dedicated Server', local: 'Local Machine' }[t]),
                    h('p', null, { docker: 'Run in an isolated Docker container with resource limits. Recommended for production.', vps: 'Deploy to a VPS or dedicated server via SSH. Full control over the environment.', local: 'Run on the current machine. Best for development and testing.' }[t])
                  )
                )
              )
            ),

            // Step 6: Review
            step === 6 && h(Fragment, null,
              h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Review & Create'),
              h('p', { style: { color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 } }, 'Review your agent configuration before creating.'),

              // Agent identity card
              h('div', { style: { background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', gap: 20, alignItems: 'flex-start' } },
                // Avatar
                h('div', { style: { width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, flexShrink: 0, overflow: 'hidden' } },
                  form.avatar ? h('img', { src: form.avatar, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : (form.name ? form.name.charAt(0).toUpperCase() : '?')
                ),
                h('div', { style: { flex: 1 } },
                  h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 20px', fontSize: 13 } },
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Name'), h('span', { style: { fontWeight: 600 } }, form.name),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Email'), h('span', null, form.email || form.name.toLowerCase().replace(/\s+/g, '.') + '@agenticmail.local'),
                    form.soulId && h(Fragment, null, h('span', { style: { color: 'var(--text-muted)' } }, 'Role Template'), h('span', null, h('span', { className: 'badge badge-primary' }, form.soulId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())))),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Role'), h('span', null, form.role),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Provider'), h('span', null, (form.provider || 'anthropic').charAt(0).toUpperCase() + (form.provider || 'anthropic').slice(1)),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Model'), h('span', null, form.model),
                    // Persona fields
                    form.gender && h(Fragment, null, h('span', { style: { color: 'var(--text-muted)' } }, 'Gender'), h('span', null, form.gender.charAt(0).toUpperCase() + form.gender.slice(1))),
                    form.dateOfBirth && (() => {
                      const dob = new Date(form.dateOfBirth);
                      const today = new Date();
                      let age = today.getFullYear() - dob.getFullYear();
                      const m = today.getMonth() - dob.getMonth();
                      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
                      return h(Fragment, null,
                        h('span', { style: { color: 'var(--text-muted)' } }, 'Date of Birth'), h('span', null, dob.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' (' + age + ' years old)')
                      );
                    })(),
                    form.maritalStatus && h(Fragment, null, h('span', { style: { color: 'var(--text-muted)' } }, 'Marital Status'), h('span', null, form.maritalStatus.charAt(0).toUpperCase() + form.maritalStatus.slice(1))),
                    form.culturalBackground && h(Fragment, null, h('span', { style: { color: 'var(--text-muted)' } }, 'Background'), h('span', null, CULTURES.find(c => c.id === form.culturalBackground)?.name || form.culturalBackground)),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Language'), h('span', null, LANGUAGES.find(l => l.id === form.language)?.name || form.language),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Traits'), h('span', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                      h('span', { className: 'badge badge-neutral' }, form.traits.communication),
                      h('span', { className: 'badge badge-neutral' }, form.traits.detail),
                      h('span', { className: 'badge badge-neutral' }, form.traits.energy),
                      h('span', { className: 'badge badge-neutral' }, form.traits.humor),
                      h('span', { className: 'badge badge-neutral' }, form.traits.formality),
                      h('span', { className: 'badge badge-neutral' }, form.traits.empathy),
                      h('span', { className: 'badge badge-neutral' }, form.traits.patience),
                      h('span', { className: 'badge badge-neutral' }, form.traits.creativity)
                    ),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Skills'), h('span', null, form.skills.length + ' selected'),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Permission Preset'), h('span', null, form.preset || 'Custom'),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Max Risk Level'), h('span', null, h('span', { className: 'badge badge-' + (form.maxRiskLevel === 'low' ? 'success' : form.maxRiskLevel === 'medium' ? 'warning' : 'danger'), style: { textTransform: 'capitalize' } }, form.maxRiskLevel)),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Blocked Side Effects'), h('span', null, form.blockedSideEffects.length > 0 ? form.blockedSideEffects.length + ' blocked' : 'None'),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Approvals'), h('span', null, form.approvalRequired ? 'Required (risk: ' + form.approvalForRiskLevels.join(', ') + ')' : 'Not required'),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Rate Limits'), h('span', null, form.rateLimits.toolCallsPerMinute + '/min, ' + form.rateLimits.toolCallsPerHour + '/hr, ' + form.rateLimits.toolCallsPerDay + '/day'),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Constraints'), h('span', null, form.constraints.maxConcurrentTasks + ' tasks, ' + form.constraints.maxSessionDurationMinutes + 'min max' + (form.constraints.sandboxMode ? ', sandbox' : '')),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Deployment'), h('span', null, { docker: 'Docker Container', vps: 'VPS / Dedicated Server', local: 'Local Machine' }[form.deployTarget]),
                    h('span', { style: { color: 'var(--text-muted)' } }, 'Onboarding'), h('span', null, form.autoOnboard ? h('span', { className: 'badge badge-success' }, 'Auto-start') : h('span', { className: 'badge badge-neutral' }, 'Manual'))
                  )
                )
              ),
              form.description && h('div', { style: { marginTop: 14, fontSize: 13, color: 'var(--text-secondary)', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' } }, h('strong', null, 'Description: '), form.description),

              // Onboarding toggle
              h('div', { style: { marginTop: 20, padding: '16px 20px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                h('div', null,
                  h('div', { style: { fontWeight: 600, fontSize: 14 } }, 'Start Onboarding Immediately'),
                  h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' } }, form.autoOnboard ? 'Agent will go through all compliance policies and guardrails pipeline after creation.' : 'You can manually trigger onboarding later from the Guardrails page.')
                ),
                h('label', { style: { position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer' } },
                  h('input', { type: 'checkbox', checked: form.autoOnboard, onChange: e => set('autoOnboard', e.target.checked), style: { opacity: 0, width: 0, height: 0 } }),
                  h('span', { style: { position: 'absolute', inset: 0, borderRadius: 12, background: form.autoOnboard ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s' } },
                    h('span', { style: { position: 'absolute', top: 2, left: form.autoOnboard ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } })
                  )
                )
              )
            )
          )
        )
      ),
      h('div', { className: 'modal-footer' },
        step > 0 && h('button', { className: 'btn btn-secondary', onClick: () => setStep(step - 1) }, 'Back'),
        step === 0 && !form.soulId && h('button', { className: 'btn btn-ghost', onClick: () => setStep(1) }, 'Skip — Configure Manually'),
        h('div', { style: { flex: 1 } }),
        step < lastStep && h('button', { className: 'btn btn-primary', disabled: !canNext(), onClick: () => setStep(step + 1) }, 'Next'),
        step === lastStep && h('button', { className: 'btn btn-primary', disabled: loading, onClick: doCreate }, loading ? 'Creating...' : 'Create Agent')
      )
    )
  );
}

// ════════════════════════════════════════════════════════════
// AGENTS PAGE
// ════════════════════════════════════════════════════════════

export function AgentsPage({ onSelectAgent }) {
  const { toast } = useApp();
  const [agents, setAgents] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => apiCall('/agents').then(d => setAgents(d.agents || d || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const deleteAgent = async (id) => {
    const ok = await showConfirm({ title: 'Delete Agent', message: 'Are you sure you want to delete this agent? This will remove all associated data.', warning: 'This action cannot be undone.', danger: true, confirmText: 'Delete Agent' });
    if (!ok) return;
    try { await engineCall('/bridge/agents/' + id, { method: 'DELETE', body: JSON.stringify({ destroyedBy: 'dashboard' }) }); toast('Agent deleted', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null, h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Agents'), h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Manage your AI agents — create, configure, deploy, and monitor')),
      h('button', { className: 'btn btn-primary', onClick: () => setCreating(true) }, I.plus(), ' Create Agent')
    ),
    creating && h(CreateAgentWizard, { onClose: () => setCreating(false), onCreated: load, toast }),
    agents.length === 0
      ? h('div', { className: 'card' }, h('div', { className: 'card-body' },
          h('div', { className: 'empty-state' },
            I.agents(),
            h('h3', null, 'No agents yet'),
            h('p', null, 'Create your first agent to give it an email identity, skills, and deploy it to start working autonomously.'),
            h('button', { className: 'btn btn-primary', onClick: () => setCreating(true) }, I.plus(), ' Create Your First Agent')
          )
        ))
      : h('div', { className: 'card' },
          h('div', { className: 'card-body-flush' },
            h('table', null,
              h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Role'), h('th', null, 'Status'), h('th', null, 'Created'), h('th', { style: { width: 180 } }, 'Actions'))),
              h('tbody', null, agents.map(a =>
                h('tr', { key: a.id },
                  h('td', null, h('strong', { style: { cursor: 'pointer', color: 'var(--accent-text)' }, onClick: () => onSelectAgent && onSelectAgent(a.id) }, a.name)),
                  h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, a.email || '-')),
                  h('td', null, h('span', { className: 'badge badge-neutral' }, a.role || 'agent')),
                  h('td', null, h('span', { className: 'badge badge-' + (a.status === 'active' ? 'success' : a.status === 'archived' ? 'neutral' : 'warning') }, a.status || 'active')),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-'),
                  h('td', null,
                    h('div', { style: { display: 'flex', gap: 4 } },
                      h('button', { className: 'btn btn-primary btn-sm', onClick: () => onSelectAgent && onSelectAgent(a.id) }, 'View Details'),
                      h('button', { className: 'btn btn-ghost btn-sm', title: 'Restart', onClick: () => engineCall('/agents/' + a.id + '/restart', { method: 'POST', body: JSON.stringify({ restartedBy: 'dashboard' }) }).then(() => toast('Restarting...', 'info')).catch(e => toast(e.message, 'error')) }, I.refresh()),
                      h('button', { className: 'btn btn-ghost btn-sm', title: 'Delete', onClick: () => deleteAgent(a.id) }, I.trash())
                    )
                  )
                )
              ))
            )
          )
        )
  );
}

// ════════════════════════════════════════════════════════════
// AGENT DETAIL PAGE — Re-exported from agent-detail.js
// ════════════════════════════════════════════════════════════

export { AgentDetailPage } from './agent-detail.js';

import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { HelpButton } from '../../components/help-button.js';
import { TagInput } from '../../components/tag-input.js';
import { Badge, StatCard, EmptyState } from './shared.js?v=4';
import { getLanguageName } from '../../components/persona-fields.js';

// ════════════════════════════════════════════════════════════
// DEPLOYMENT SECTION
// ════════════════════════════════════════════════════════════

export function DeploymentSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var agent = props.agent;
  var reload = props.reload;
  var onBack = props.onBack;

  var app = useApp();
  var toast = app.toast;

  var _knowledgeBases = useState([]);
  var knowledgeBases = _knowledgeBases[0]; var setKnowledgeBases = _knowledgeBases[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _showJson = useState(false);
  var showJson = _showJson[0]; var setShowJson = _showJson[1];
  var _pmStatus = useState(null);
  var pmStatus = _pmStatus[0]; var setPmStatus = _pmStatus[1];
  var _installingPm2 = useState(false);
  var installingPm2 = _installingPm2[0]; var setInstallingPm2 = _installingPm2[1];
  var _syncingKbs = useState(false);
  var syncingKbs = _syncingKbs[0]; var setSyncingKbs = _syncingKbs[1];

  var load = function() {
    setLoading(true);
    var clientOrg = agent && (agent.client_org_id || agent.clientOrgId) || '';
    var url = '/knowledge-bases?agentId=' + agentId + (clientOrg ? '&clientOrgId=' + clientOrg : '');
    engineCall(url)
      .then(function(d) { setKnowledgeBases(d.knowledgeBases || d.bases || d || []); })
      .catch(function() { setKnowledgeBases([]); })
      .finally(function() { setLoading(false); });
  };

  useEffect(function() { load(); }, [agentId]);

  var syncKnowledgeBases = function() {
    setSyncingKbs(true);
    var clientOrgId = ea.client_org_id || ea.clientOrgId || null;
    engineCall('/knowledge-bases/auto-assign/' + agentId, {
      method: 'POST',
      body: JSON.stringify({ clientOrgId: clientOrgId })
    }).then(function(d) {
      if (d.count > 0) {
        toast(d.count + ' knowledge base(s) assigned', 'success');
        load();
      } else {
        toast('Agent already has access to all relevant knowledge bases', 'info');
      }
    }).catch(function(e) { toast(e.message || 'Failed to sync', 'error'); })
    .finally(function() { setSyncingKbs(false); });
  };

  // ─── Derived Values ─────────────────────────────────────

  var ea = engineAgent || {};
  var a = agent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  var deployment = config.deployment || {};
  var state = ea.state || a.status || 'unknown';
  var stateColor = { running: 'success', active: 'success', deploying: 'info', starting: 'info', provisioning: 'info', degraded: 'warning', error: 'danger', stopped: 'neutral', draft: 'neutral', ready: 'primary' }[state] || 'neutral';
  var healthStatus = ea.health?.status || 'unknown';
  var healthColor = healthStatus === 'healthy' ? 'success' : healthStatus === 'degraded' ? 'warning' : healthStatus === 'unhealthy' ? 'danger' : 'neutral';
  var deploymentTarget = deployment.target || config.deploymentTarget || '-';
  var modelDisplay = typeof config.model === 'string' ? config.model : (config.model ? (config.model.modelId || config.model.provider || '-') : '-');

  // ─── Deployment Edit State ──────────────────────────────
  var _editingDeploy = useState(false);
  var editingDeploy = _editingDeploy[0]; var setEditingDeploy = _editingDeploy[1];
  var _savingDeploy = useState(false);
  var savingDeploy = _savingDeploy[0]; var setSavingDeploy = _savingDeploy[1];
  var _deployForm = useState({});
  var deployForm = _deployForm[0]; var setDeployForm = _deployForm[1];

  var startDeployEdit = function() {
    var cloud = deployment.config?.cloud || {};
    var docker = deployment.config?.docker || {};
    var vps = deployment.config?.vps || {};
    var aws = deployment.config?.aws || {};
    var gcp = deployment.config?.gcp || {};
    var az = deployment.config?.azure || {};
    var rail = deployment.config?.railway || {};
    setDeployForm({
      target: deployment.target || 'fly',
      region: deployment.region || cloud.region || 'iad',
      // Fly.io
      flyApiToken: cloud.apiToken || '',
      flyAppName: cloud.appName || '',
      flyOrg: cloud.org || 'personal',
      flyVmSize: cloud.vmSize || 'shared-cpu-1x',
      flyVmMemory: cloud.vmMemory || '256',
      // Docker
      dockerImage: docker.image || 'agenticmail/agent',
      dockerTag: docker.tag || 'latest',
      dockerMemory: docker.memory || '512m',
      dockerCpu: docker.cpu || '0.5',
      dockerPorts: (docker.ports || [3000]).join(', '),
      dockerNetwork: docker.network || '',
      dockerRestart: docker.restart || 'unless-stopped',
      // VPS
      vpsHost: vps.host || '',
      vpsPort: vps.port || '22',
      vpsUser: vps.user || 'root',
      vpsKeyPath: vps.keyPath || '~/.ssh/id_rsa',
      vpsWorkDir: vps.workDir || '/opt/agenticmail',
      // AWS
      awsRegion: aws.region || 'us-east-1',
      awsAccessKeyId: aws.accessKeyId || '',
      awsSecretAccessKey: aws.secretAccessKey || '',
      awsInstanceType: aws.instanceType || 't3.micro',
      awsAmi: aws.ami || '',
      awsSubnetId: aws.subnetId || '',
      awsSecurityGroupId: aws.securityGroupId || '',
      awsKeyPairName: aws.keyPairName || '',
      // GCP
      gcpProject: gcp.projectId || '',
      gcpRegion: gcp.region || 'us-central1',
      gcpZone: gcp.zone || 'us-central1-a',
      gcpMachineType: gcp.machineType || 'e2-micro',
      gcpServiceAccountKey: gcp.serviceAccountKey || '',
      // Azure
      azureSubscriptionId: az.subscriptionId || '',
      azureResourceGroup: az.resourceGroup || '',
      azureRegion: az.region || 'eastus',
      azureVmSize: az.vmSize || 'Standard_B1s',
      azureTenantId: az.tenantId || '',
      azureClientId: az.clientId || '',
      azureClientSecret: az.clientSecret || '',
      // Railway
      railwayApiToken: rail.apiToken || '',
      railwayProjectId: rail.projectId || '',
      railwayServiceName: rail.serviceName || '',
      // Local
      localPort: deployment.port || (deployment.config?.local?.port) || '',
      localHost: deployment.host || (deployment.config?.local?.host) || 'localhost',
      localProcessManager: deployment.config?.local?.processManager || 'pm2',
      localProcessName: deployment.config?.local?.processName || '',
      localWorkDir: deployment.config?.local?.workDir || '',
    });
    setEditingDeploy(true);
    // Check process manager availability when editing local deployment
    engineCall('/system/process-managers').then(function(d) { setPmStatus(d); }).catch(function() {});
  };

  var installPm2 = function() {
    setInstallingPm2(true);
    engineCall('/system/install-pm2', { method: 'POST' })
      .then(function(d) {
        if (d.success) {
          toast(d.message, 'success');
          engineCall('/system/process-managers').then(function(d2) { setPmStatus(d2); }).catch(function() {});
        } else {
          toast('Failed: ' + (d.error || 'Unknown error'), 'error');
        }
      })
      .catch(function(err) { toast('Install failed: ' + err.message, 'error'); })
      .finally(function() { setInstallingPm2(false); });
  };

  var saveDeploy = function() {
    setSavingDeploy(true);
    var t = deployForm.target;
    var deployConfig = {};
    if (t === 'fly') {
      deployConfig = { cloud: { provider: 'fly', region: deployForm.region || 'iad', apiToken: deployForm.flyApiToken || undefined, appName: deployForm.flyAppName || undefined, org: deployForm.flyOrg || 'personal', vmSize: deployForm.flyVmSize || 'shared-cpu-1x', vmMemory: deployForm.flyVmMemory || '256' } };
    } else if (t === 'docker') {
      deployConfig = { docker: { image: deployForm.dockerImage || 'agenticmail/agent', tag: deployForm.dockerTag || 'latest', ports: (deployForm.dockerPorts || '3000').split(',').map(function(p) { return parseInt(p.trim()) || 3000; }), memory: deployForm.dockerMemory || '512m', cpu: deployForm.dockerCpu || '0.5', network: deployForm.dockerNetwork || undefined, restart: deployForm.dockerRestart || 'unless-stopped' } };
    } else if (t === 'vps') {
      deployConfig = { vps: { host: deployForm.vpsHost, port: parseInt(deployForm.vpsPort) || 22, user: deployForm.vpsUser || 'root', keyPath: deployForm.vpsKeyPath || '~/.ssh/id_rsa', workDir: deployForm.vpsWorkDir || '/opt/agenticmail' } };
    } else if (t === 'aws') {
      deployConfig = { aws: { region: deployForm.awsRegion || 'us-east-1', accessKeyId: deployForm.awsAccessKeyId || undefined, secretAccessKey: deployForm.awsSecretAccessKey || undefined, instanceType: deployForm.awsInstanceType || 't3.micro', ami: deployForm.awsAmi || undefined, subnetId: deployForm.awsSubnetId || undefined, securityGroupId: deployForm.awsSecurityGroupId || undefined, keyPairName: deployForm.awsKeyPairName || undefined } };
    } else if (t === 'gcp') {
      deployConfig = { gcp: { projectId: deployForm.gcpProject, region: deployForm.gcpRegion || 'us-central1', zone: deployForm.gcpZone || 'us-central1-a', machineType: deployForm.gcpMachineType || 'e2-micro', serviceAccountKey: deployForm.gcpServiceAccountKey || undefined } };
    } else if (t === 'azure') {
      deployConfig = { azure: { subscriptionId: deployForm.azureSubscriptionId, resourceGroup: deployForm.azureResourceGroup, region: deployForm.azureRegion || 'eastus', vmSize: deployForm.azureVmSize || 'Standard_B1s', tenantId: deployForm.azureTenantId || undefined, clientId: deployForm.azureClientId || undefined, clientSecret: deployForm.azureClientSecret || undefined } };
    } else if (t === 'railway') {
      deployConfig = { railway: { apiToken: deployForm.railwayApiToken || undefined, projectId: deployForm.railwayProjectId || undefined, serviceName: deployForm.railwayServiceName || undefined, region: deployForm.region || undefined } };
    } else if (t === 'local') {
      deployConfig = { local: { port: parseInt(deployForm.localPort) || undefined, host: deployForm.localHost || 'localhost', processManager: deployForm.localProcessManager || 'pm2', processName: deployForm.localProcessName || undefined, workDir: deployForm.localWorkDir || undefined } };
    }
    var localPort = (t === 'local' && deployForm.localPort) ? parseInt(deployForm.localPort) : undefined;
    var localHost = (t === 'local' && deployForm.localHost) ? deployForm.localHost : undefined;
    var updates = {
      deployment: {
        target: t,
        region: deployForm.region,
        port: localPort,
        host: localHost,
        config: deployConfig
      }
    };
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Deployment config saved', 'success'); setEditingDeploy(false); setSavingDeploy(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSavingDeploy(false); });
  };

  var setDf = function(k, v) { setDeployForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  // ─── Actions ────────────────────────────────────────────

  var deploy = function() {
    engineCall('/agents/' + agentId + '/deploy', { method: 'POST', body: JSON.stringify({ deployedBy: 'dashboard' }) })
      .then(function() { toast('Deploy initiated', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var stop = function() {
    engineCall('/agents/' + agentId + '/stop', { method: 'POST', body: JSON.stringify({ stoppedBy: 'dashboard', reason: 'Manual stop' }) })
      .then(function() { toast('Stop initiated', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  var restart = function() {
    engineCall('/agents/' + agentId + '/restart', { method: 'POST', body: JSON.stringify({ restartedBy: 'dashboard' }) })
      .then(function() { toast('Restart initiated', 'success'); reload(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  // 5-step delete confirmation flow
  var [deleteStep, setDeleteStep] = useState(0);
  var [deleteTyped, setDeleteTyped] = useState('');
  var _agentName = ea.name || identity.name || agentId;

  var startDelete = function() { setDeleteStep(1); setDeleteTyped(''); };
  var cancelDelete = function() { setDeleteStep(0); setDeleteTyped(''); };
  var [deleting, setDeleting] = useState(false);

  var advanceDelete = async function() {
    if (deleteStep < 5) { setDeleteStep(deleteStep + 1); return; }
    if (deleteStep === 5) {
      if (deleteTyped.trim().toLowerCase() !== _agentName.trim().toLowerCase()) {
        toast('Agent name does not match', 'error'); return;
      }
      setDeleting(true);
      try {
        await apiCall('/bridge/agents/' + agentId, { method: 'DELETE' });
        toast('Agent deleted', 'success');
        if (onBack) onBack();
      } catch (err) { toast(err.message, 'error'); }
      setDeleting(false); setDeleteStep(0);
    }
  };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading deployment data...');
  }

  return h(Fragment, null,

    // ─── Deployment Edit Card ─────────────────────────────
    editingDeploy && h('div', { className: 'card', style: { marginBottom: 20, border: '2px solid var(--accent)' } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Edit Deployment Configuration',
          h(HelpButton, { label: 'Deployment Configuration' },
            h('p', null, 'Configure where and how this agent is deployed. These settings control the agent\'s runtime environment.'),
            h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
              h('li', null, h('strong', null, 'Target'), ' — The cloud platform or infrastructure (Fly.io, AWS, GCP, local, etc.).'),
              h('li', null, h('strong', null, 'Region'), ' — Where the agent runs. Choose a region close to your users for lower latency.'),
              h('li', null, h('strong', null, 'Resources'), ' — CPU/memory allocation. More resources = faster responses but higher cost.'),
              h('li', null, h('strong', null, 'Environment Variables'), ' — Secrets and config values injected at runtime. Never hard-code API keys in agent code.')
            ),
            h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Use the smallest resource allocation that handles your load. You can always scale up later.')
          )
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditingDeploy(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: savingDeploy, onClick: saveDeploy }, savingDeploy ? 'Saving...' : 'Save')
        )
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Target'),
            h('select', { className: 'input', value: deployForm.target, onChange: function(e) { setDf('target', e.target.value); } },
              h('option', { value: 'fly' }, 'Fly.io'),
              h('option', { value: 'aws' }, 'AWS (EC2)'),
              h('option', { value: 'gcp' }, 'Google Cloud (GCE)'),
              h('option', { value: 'azure' }, 'Microsoft Azure'),
              h('option', { value: 'railway' }, 'Railway'),
              h('option', { value: 'docker' }, 'Docker'),
              h('option', { value: 'vps' }, 'VPS / Bare Metal'),
              h('option', { value: 'local' }, 'Local (In-Process)')
            )
          ),
          // Region selector for cloud providers
          (deployForm.target === 'fly' || deployForm.target === 'railway') && h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
            h('select', { className: 'input', value: deployForm.region, onChange: function(e) { setDf('region', e.target.value); } },
              h('option', { value: 'iad' }, 'Ashburn, VA (iad)'),
              h('option', { value: 'ord' }, 'Chicago, IL (ord)'),
              h('option', { value: 'dfw' }, 'Dallas, TX (dfw)'),
              h('option', { value: 'lax' }, 'Los Angeles, CA (lax)'),
              h('option', { value: 'sea' }, 'Seattle, WA (sea)'),
              h('option', { value: 'sjc' }, 'San Jose, CA (sjc)'),
              h('option', { value: 'yyz' }, 'Toronto (yyz)'),
              h('option', { value: 'lhr' }, 'London (lhr)'),
              h('option', { value: 'ams' }, 'Amsterdam (ams)'),
              h('option', { value: 'fra' }, 'Frankfurt (fra)'),
              h('option', { value: 'cdg' }, 'Paris (cdg)'),
              h('option', { value: 'waw' }, 'Warsaw (waw)'),
              h('option', { value: 'nrt' }, 'Tokyo (nrt)'),
              h('option', { value: 'sin' }, 'Singapore (sin)'),
              h('option', { value: 'hkg' }, 'Hong Kong (hkg)'),
              h('option', { value: 'syd' }, 'Sydney (syd)'),
              h('option', { value: 'gru' }, 'São Paulo (gru)'),
              h('option', { value: 'jnb' }, 'Johannesburg (jnb)')
            )
          )
        ),

        // ── Fly.io ──────────────────────────────────────────
        deployForm.target === 'fly' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'API Token'),
            h('input', { className: 'input', type: 'password', value: deployForm.flyApiToken, onChange: function(e) { setDf('flyApiToken', e.target.value); }, placeholder: 'fo1_...' }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'From fly.io/user/personal_access_tokens')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'App Name'),
            h('input', { className: 'input', value: deployForm.flyAppName, onChange: function(e) { setDf('flyAppName', e.target.value); }, placeholder: 'Auto-generated if empty' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Organization'),
            h('input', { className: 'input', value: deployForm.flyOrg, onChange: function(e) { setDf('flyOrg', e.target.value); }, placeholder: 'personal' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'VM Size'),
            h('select', { className: 'input', value: deployForm.flyVmSize, onChange: function(e) { setDf('flyVmSize', e.target.value); } },
              h('option', { value: 'shared-cpu-1x' }, 'Shared 1x (256MB) — $1.94/mo'),
              h('option', { value: 'shared-cpu-2x' }, 'Shared 2x (512MB) — $3.88/mo'),
              h('option', { value: 'shared-cpu-4x' }, 'Shared 4x (1GB) — $7.76/mo'),
              h('option', { value: 'shared-cpu-8x' }, 'Shared 8x (2GB) — $15.52/mo'),
              h('option', { value: 'performance-1x' }, 'Performance 1x (2GB) — $29.04/mo'),
              h('option', { value: 'performance-2x' }, 'Performance 2x (4GB) — $58.09/mo'),
              h('option', { value: 'performance-4x' }, 'Performance 4x (8GB) — $116.18/mo'),
              h('option', { value: 'performance-8x' }, 'Performance 8x (16GB) — $232.36/mo')
            )
          )
        ),

        // ── AWS EC2 ─────────────────────────────────────────
        deployForm.target === 'aws' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Access Key ID'),
              h('input', { className: 'input', type: 'password', value: deployForm.awsAccessKeyId, onChange: function(e) { setDf('awsAccessKeyId', e.target.value); }, placeholder: 'AKIA...' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Secret Access Key'),
              h('input', { className: 'input', type: 'password', value: deployForm.awsSecretAccessKey, onChange: function(e) { setDf('awsSecretAccessKey', e.target.value); }, placeholder: '••••••••' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
              h('select', { className: 'input', value: deployForm.awsRegion, onChange: function(e) { setDf('awsRegion', e.target.value); } },
                h('option', { value: 'us-east-1' }, 'US East (N. Virginia)'),
                h('option', { value: 'us-east-2' }, 'US East (Ohio)'),
                h('option', { value: 'us-west-1' }, 'US West (N. California)'),
                h('option', { value: 'us-west-2' }, 'US West (Oregon)'),
                h('option', { value: 'eu-west-1' }, 'EU (Ireland)'),
                h('option', { value: 'eu-west-2' }, 'EU (London)'),
                h('option', { value: 'eu-central-1' }, 'EU (Frankfurt)'),
                h('option', { value: 'ap-southeast-1' }, 'Asia Pacific (Singapore)'),
                h('option', { value: 'ap-northeast-1' }, 'Asia Pacific (Tokyo)'),
                h('option', { value: 'ap-south-1' }, 'Asia Pacific (Mumbai)'),
                h('option', { value: 'sa-east-1' }, 'South America (São Paulo)'),
                h('option', { value: 'af-south-1' }, 'Africa (Cape Town)')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Instance Type'),
              h('select', { className: 'input', value: deployForm.awsInstanceType, onChange: function(e) { setDf('awsInstanceType', e.target.value); } },
                h('option', { value: 't3.micro' }, 't3.micro (1 vCPU, 1GB) — ~$7.59/mo'),
                h('option', { value: 't3.small' }, 't3.small (2 vCPU, 2GB) — ~$15.18/mo'),
                h('option', { value: 't3.medium' }, 't3.medium (2 vCPU, 4GB) — ~$30.37/mo'),
                h('option', { value: 't3.large' }, 't3.large (2 vCPU, 8GB) — ~$60.74/mo'),
                h('option', { value: 'm5.large' }, 'm5.large (2 vCPU, 8GB) — ~$69.12/mo'),
                h('option', { value: 'm5.xlarge' }, 'm5.xlarge (4 vCPU, 16GB) — ~$138.24/mo'),
                h('option', { value: 'c5.large' }, 'c5.large (2 vCPU, 4GB) — ~$61.20/mo'),
                h('option', { value: 'c5.xlarge' }, 'c5.xlarge (4 vCPU, 8GB) — ~$122.40/mo')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Key Pair Name'),
              h('input', { className: 'input', value: deployForm.awsKeyPairName, onChange: function(e) { setDf('awsKeyPairName', e.target.value); }, placeholder: 'my-keypair' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'AMI ID (optional)'),
              h('input', { className: 'input', value: deployForm.awsAmi, onChange: function(e) { setDf('awsAmi', e.target.value); }, placeholder: 'ami-... (default: Ubuntu 22.04)' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Subnet ID (optional)'),
              h('input', { className: 'input', value: deployForm.awsSubnetId, onChange: function(e) { setDf('awsSubnetId', e.target.value); }, placeholder: 'subnet-...' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Security Group (optional)'),
              h('input', { className: 'input', value: deployForm.awsSecurityGroupId, onChange: function(e) { setDf('awsSecurityGroupId', e.target.value); }, placeholder: 'sg-...' })
            )
          )
        ),

        // ── Google Cloud GCE ────────────────────────────────
        deployForm.target === 'gcp' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Project ID'),
              h('input', { className: 'input', value: deployForm.gcpProject, onChange: function(e) { setDf('gcpProject', e.target.value); }, placeholder: 'my-project-123' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Service Account Key (JSON)'),
              h('input', { className: 'input', type: 'password', value: deployForm.gcpServiceAccountKey, onChange: function(e) { setDf('gcpServiceAccountKey', e.target.value); }, placeholder: 'Paste JSON key or path' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
              h('select', { className: 'input', value: deployForm.gcpRegion, onChange: function(e) { setDf('gcpRegion', e.target.value); } },
                h('option', { value: 'us-central1' }, 'US Central (Iowa)'),
                h('option', { value: 'us-east1' }, 'US East (S. Carolina)'),
                h('option', { value: 'us-west1' }, 'US West (Oregon)'),
                h('option', { value: 'europe-west1' }, 'EU West (Belgium)'),
                h('option', { value: 'europe-west2' }, 'EU West (London)'),
                h('option', { value: 'europe-west3' }, 'EU West (Frankfurt)'),
                h('option', { value: 'asia-east1' }, 'Asia East (Taiwan)'),
                h('option', { value: 'asia-northeast1' }, 'Asia NE (Tokyo)'),
                h('option', { value: 'asia-southeast1' }, 'Asia SE (Singapore)'),
                h('option', { value: 'australia-southeast1' }, 'Australia (Sydney)'),
                h('option', { value: 'southamerica-east1' }, 'South America (São Paulo)')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Zone'),
              h('input', { className: 'input', value: deployForm.gcpZone, onChange: function(e) { setDf('gcpZone', e.target.value); }, placeholder: 'us-central1-a' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Machine Type'),
              h('select', { className: 'input', value: deployForm.gcpMachineType, onChange: function(e) { setDf('gcpMachineType', e.target.value); } },
                h('option', { value: 'e2-micro' }, 'e2-micro (0.25 vCPU, 1GB) — ~$6.11/mo'),
                h('option', { value: 'e2-small' }, 'e2-small (0.5 vCPU, 2GB) — ~$12.23/mo'),
                h('option', { value: 'e2-medium' }, 'e2-medium (1 vCPU, 4GB) — ~$24.46/mo'),
                h('option', { value: 'e2-standard-2' }, 'e2-standard-2 (2 vCPU, 8GB) — ~$48.92/mo'),
                h('option', { value: 'e2-standard-4' }, 'e2-standard-4 (4 vCPU, 16GB) — ~$97.83/mo'),
                h('option', { value: 'n2-standard-2' }, 'n2-standard-2 (2 vCPU, 8GB) — ~$56.52/mo'),
                h('option', { value: 'c2-standard-4' }, 'c2-standard-4 (4 vCPU, 16GB) — ~$124.49/mo')
              )
            )
          )
        ),

        // ── Microsoft Azure ─────────────────────────────────
        deployForm.target === 'azure' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Subscription ID'),
              h('input', { className: 'input', value: deployForm.azureSubscriptionId, onChange: function(e) { setDf('azureSubscriptionId', e.target.value); }, placeholder: 'xxxxxxxx-xxxx-...' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Resource Group'),
              h('input', { className: 'input', value: deployForm.azureResourceGroup, onChange: function(e) { setDf('azureResourceGroup', e.target.value); }, placeholder: 'my-resource-group' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Region'),
              h('select', { className: 'input', value: deployForm.azureRegion, onChange: function(e) { setDf('azureRegion', e.target.value); } },
                h('option', { value: 'eastus' }, 'East US'),
                h('option', { value: 'eastus2' }, 'East US 2'),
                h('option', { value: 'westus2' }, 'West US 2'),
                h('option', { value: 'westus3' }, 'West US 3'),
                h('option', { value: 'centralus' }, 'Central US'),
                h('option', { value: 'northeurope' }, 'North Europe (Ireland)'),
                h('option', { value: 'westeurope' }, 'West Europe (Netherlands)'),
                h('option', { value: 'uksouth' }, 'UK South'),
                h('option', { value: 'germanywestcentral' }, 'Germany West Central'),
                h('option', { value: 'eastasia' }, 'East Asia (Hong Kong)'),
                h('option', { value: 'southeastasia' }, 'Southeast Asia (Singapore)'),
                h('option', { value: 'japaneast' }, 'Japan East'),
                h('option', { value: 'australiaeast' }, 'Australia East'),
                h('option', { value: 'brazilsouth' }, 'Brazil South'),
                h('option', { value: 'southafricanorth' }, 'South Africa North')
              )
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'VM Size'),
              h('select', { className: 'input', value: deployForm.azureVmSize, onChange: function(e) { setDf('azureVmSize', e.target.value); } },
                h('option', { value: 'Standard_B1s' }, 'B1s (1 vCPU, 1GB) — ~$7.59/mo'),
                h('option', { value: 'Standard_B1ms' }, 'B1ms (1 vCPU, 2GB) — ~$15.11/mo'),
                h('option', { value: 'Standard_B2s' }, 'B2s (2 vCPU, 4GB) — ~$30.37/mo'),
                h('option', { value: 'Standard_B2ms' }, 'B2ms (2 vCPU, 8GB) — ~$60.74/mo'),
                h('option', { value: 'Standard_D2s_v5' }, 'D2s v5 (2 vCPU, 8GB) — ~$70.08/mo'),
                h('option', { value: 'Standard_D4s_v5' }, 'D4s v5 (4 vCPU, 16GB) — ~$140.16/mo'),
                h('option', { value: 'Standard_F2s_v2' }, 'F2s v2 (2 vCPU, 4GB) — ~$61.25/mo'),
                h('option', { value: 'Standard_E2s_v5' }, 'E2s v5 (2 vCPU, 16GB) — ~$91.98/mo')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Tenant ID (optional)'),
              h('input', { className: 'input', type: 'password', value: deployForm.azureTenantId, onChange: function(e) { setDf('azureTenantId', e.target.value); }, placeholder: 'For service principal auth' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Client ID (optional)'),
              h('input', { className: 'input', type: 'password', value: deployForm.azureClientId, onChange: function(e) { setDf('azureClientId', e.target.value); }, placeholder: 'App registration client ID' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Client Secret (optional)'),
              h('input', { className: 'input', type: 'password', value: deployForm.azureClientSecret, onChange: function(e) { setDf('azureClientSecret', e.target.value); }, placeholder: '••••••••' })
            )
          )
        ),

        // ── Railway ─────────────────────────────────────────
        deployForm.target === 'railway' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'API Token'),
            h('input', { className: 'input', type: 'password', value: deployForm.railwayApiToken, onChange: function(e) { setDf('railwayApiToken', e.target.value); }, placeholder: 'railway_...' }),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'From railway.app/account/tokens')
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Project ID (optional)'),
            h('input', { className: 'input', value: deployForm.railwayProjectId, onChange: function(e) { setDf('railwayProjectId', e.target.value); }, placeholder: 'Auto-created if empty' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Service Name'),
            h('input', { className: 'input', value: deployForm.railwayServiceName, onChange: function(e) { setDf('railwayServiceName', e.target.value); }, placeholder: 'agenticmail-agent' })
          )
        ),

        // ── Docker ──────────────────────────────────────────
        deployForm.target === 'docker' && h(Fragment, null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Image'),
              h('input', { className: 'input', value: deployForm.dockerImage, onChange: function(e) { setDf('dockerImage', e.target.value); }, placeholder: 'agenticmail/agent' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Tag'),
              h('input', { className: 'input', value: deployForm.dockerTag, onChange: function(e) { setDf('dockerTag', e.target.value); }, placeholder: 'latest' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Ports'),
              h('input', { className: 'input', value: deployForm.dockerPorts, onChange: function(e) { setDf('dockerPorts', e.target.value); }, placeholder: '3000' })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Memory'),
              h('input', { className: 'input', value: deployForm.dockerMemory, onChange: function(e) { setDf('dockerMemory', e.target.value); }, placeholder: '512m' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'CPU'),
              h('input', { className: 'input', value: deployForm.dockerCpu, onChange: function(e) { setDf('dockerCpu', e.target.value); }, placeholder: '0.5' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Network'),
              h('input', { className: 'input', value: deployForm.dockerNetwork, onChange: function(e) { setDf('dockerNetwork', e.target.value); }, placeholder: 'bridge (default)' })
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Restart Policy'),
              h('select', { className: 'input', value: deployForm.dockerRestart, onChange: function(e) { setDf('dockerRestart', e.target.value); } },
                h('option', { value: 'unless-stopped' }, 'Unless Stopped'),
                h('option', { value: 'always' }, 'Always'),
                h('option', { value: 'on-failure' }, 'On Failure'),
                h('option', { value: 'no' }, 'Never')
              )
            )
          )
        ),

        // ── VPS / Bare Metal ────────────────────────────────
        deployForm.target === 'vps' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Host'),
            h('input', { className: 'input', value: deployForm.vpsHost, onChange: function(e) { setDf('vpsHost', e.target.value); }, placeholder: '192.168.1.100 or hostname' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'SSH Port'),
            h('input', { className: 'input', type: 'number', value: deployForm.vpsPort, onChange: function(e) { setDf('vpsPort', e.target.value); }, placeholder: '22' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'User'),
            h('input', { className: 'input', value: deployForm.vpsUser, onChange: function(e) { setDf('vpsUser', e.target.value); }, placeholder: 'root' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'SSH Key Path'),
            h('input', { className: 'input', value: deployForm.vpsKeyPath, onChange: function(e) { setDf('vpsKeyPath', e.target.value); }, placeholder: '~/.ssh/id_rsa' })
          ),
          h('div', { className: 'form-group' },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Work Directory'),
            h('input', { className: 'input', value: deployForm.vpsWorkDir, onChange: function(e) { setDf('vpsWorkDir', e.target.value); }, placeholder: '/home/user/agenticmail' })
          )
        ),

        // ── Local ───────────────────────────────────────────
        deployForm.target === 'local' && h(Fragment, null,
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, border: '1px solid var(--border)' } },
            'Agent runs as a standalone process on this server (e.g. via PM2, systemd). Configure the port so the enterprise server can route messages to it.'
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Port'),
              h('input', { className: 'input', type: 'number', value: deployForm.localPort, onChange: function(e) { setDf('localPort', e.target.value); }, placeholder: '3101' }),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'HTTP port the agent listens on')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Host'),
              h('input', { className: 'input', value: deployForm.localHost, onChange: function(e) { setDf('localHost', e.target.value); }, placeholder: 'localhost' }),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Hostname or IP (default: localhost)')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Process Manager'),
              h('select', { className: 'input', value: deployForm.localProcessManager, onChange: function(e) { setDf('localProcessManager', e.target.value); } },
                h('option', { value: 'pm2' }, 'PM2' + (pmStatus && pmStatus.pm2?.installed ? ' (v' + pmStatus.pm2.version + ')' : '')),
                h('option', { value: 'systemd', disabled: pmStatus && !pmStatus.systemd?.available }, 'systemd' + (pmStatus && !pmStatus.systemd?.available ? ' (not available)' : '')),
                h('option', { value: 'manual' }, 'Manual'),
                h('option', { value: 'in-process' }, 'In-Process (embedded)')
              ),
              // PM2 install prompt
              pmStatus && deployForm.localProcessManager === 'pm2' && !pmStatus.pm2?.installed && h('div', { style: { marginTop: 6, padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                h('span', { style: { color: 'var(--warning-text, #b45309)' } }, 'PM2 is not installed on this server'),
                h('button', { className: 'btn btn-primary btn-sm', style: { fontSize: 11, padding: '4px 10px' }, disabled: installingPm2, onClick: installPm2 }, installingPm2 ? 'Installing...' : 'Install PM2')
              ),
              // systemd not available note
              pmStatus && deployForm.localProcessManager === 'systemd' && !pmStatus.systemd?.available && h('div', { style: { marginTop: 6, fontSize: 12, color: 'var(--text-muted)' } }, pmStatus.systemd?.note || 'systemd is not available on this platform'),
              // PM2 installed badge
              pmStatus && deployForm.localProcessManager === 'pm2' && pmStatus.pm2?.installed && h('div', { style: { marginTop: 6, fontSize: 12, color: 'var(--success)' } }, 'Installed (v' + pmStatus.pm2.version + ')')
            )
          ),
          deployForm.localProcessManager !== 'in-process' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 } },
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Process Name'),
              h('input', { className: 'input', value: deployForm.localProcessName, onChange: function(e) { setDf('localProcessName', e.target.value); }, placeholder: 'e.g. fola-agent' }),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'PM2/systemd service name for start/stop/restart')
            ),
            h('div', { className: 'form-group' },
              h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Working Directory (optional)'),
              h('input', { className: 'input', value: deployForm.localWorkDir, onChange: function(e) { setDf('localWorkDir', e.target.value); }, placeholder: 'Auto-detected from install location' }),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Leave blank to auto-detect. Only set if running from a custom location.')
            )
          )
        )
      )
    ),

    // ─── Deployment Status Card ─────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Deployment Status'),
        !editingDeploy && h('button', { className: 'btn btn-ghost btn-sm', onClick: startDeployEdit }, I.journal(), ' Edit')
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' } },
          h('span', { className: 'status-dot ' + state }),
          h('span', { className: 'badge badge-' + stateColor, style: { fontSize: 12, textTransform: 'capitalize' } }, state),
          h('span', { className: 'badge badge-' + healthColor }, 'Health: ' + healthStatus),
          ea.health?.uptime && h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Uptime: ' + formatUptime(ea.health.uptime))
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 13, marginBottom: 16 } },
          ea.deploymentUrl && h(Fragment, null,
            h('span', { style: { color: 'var(--text-muted)' } }, 'Endpoint'),
            h('a', { href: ea.deploymentUrl, target: '_blank', style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, ea.deploymentUrl)
          ),
          h('span', { style: { color: 'var(--text-muted)' } }, 'Target'),
          h('span', null, deploymentTarget),
          h('span', { style: { color: 'var(--text-muted)' } }, 'Model'),
          h('span', null, modelDisplay),
          deployment.region && h(Fragment, null,
            h('span', { style: { color: 'var(--text-muted)' } }, 'Region'),
            h('span', null, deployment.region)
          ),
          deployment.port && h(Fragment, null,
            h('span', { style: { color: 'var(--text-muted)' } }, 'Port'),
            h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, (deployment.host || 'localhost') + ':' + deployment.port)
          )
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          (state !== 'running' && state !== 'active' && state !== 'deploying') && h('button', { className: 'btn btn-primary btn-sm', onClick: deploy }, I.play(), ' Deploy'),
          (state === 'running' || state === 'active' || state === 'degraded') && h('button', { className: 'btn btn-danger btn-sm', onClick: stop }, I.stop(), ' Stop'),
          (state === 'running' || state === 'active' || state === 'degraded' || state === 'stopped') && h('button', { className: 'btn btn-secondary btn-sm', onClick: restart }, I.refresh(), ' Restart')
        )
      )
    ),

    // ─── Knowledge Bases Card ───────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Knowledge Bases',
          h(HelpButton, { label: 'Knowledge Bases' },
            h('p', null, 'Connect knowledge bases to give this agent access to your organization\'s documents, FAQs, and reference material.'),
            h('p', null, 'When a knowledge base is connected, the agent can search and retrieve relevant information during conversations — this is called Retrieval-Augmented Generation (RAG).'),
            h('p', null, h('strong', null, 'Auto-assign: '), 'Click "Sync Knowledge" to automatically assign all knowledge bases relevant to this agent\'s organization. Internal agents get internal KBs; client org agents get their org\'s KBs.'),
            h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'New agents are auto-assigned relevant KBs on creation. Use "Sync Knowledge" to pick up any new KBs added after the agent was created.')
          )
        ),
        h('button', { className: 'btn btn-secondary btn-sm', onClick: syncKnowledgeBases, disabled: syncingKbs, style: { whiteSpace: 'nowrap' } }, syncingKbs ? 'Syncing...' : (I.refresh ? I.refresh() : ''), ' Sync Knowledge')
      ),
      knowledgeBases.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Name'),
                  h('th', null, 'Description'),
                  h('th', null, 'Documents')
                )
              ),
              h('tbody', null,
                knowledgeBases.map(function(kb, i) {
                  return h('tr', { key: kb.id || i },
                    h('td', { style: { fontWeight: 500, fontSize: 13 } }, kb.name || 'Unnamed'),
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, kb.description || '-'),
                    h('td', null, String(kb.documentCount || (Array.isArray(kb.documents) ? kb.documents.length : kb.documents) || kb.docCount || 0))
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h(EmptyState, { icon: I.database ? I.database() : null, message: 'No knowledge bases attached to this agent.' })
          )
    ),

    // ─── Configuration Card ─────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Configuration'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setShowJson(!showJson); } }, showJson ? 'Structured View' : 'Raw JSON')
      ),
      h('div', { className: 'card-body' },
        showJson
          ? h('pre', { style: { fontSize: 11, background: 'var(--bg-tertiary)', padding: 16, borderRadius: 'var(--radius)', overflow: 'auto', maxHeight: 500, margin: 0 } }, JSON.stringify(config, null, 2))
          : h('div', null,

              // Identity Section
              h('div', { style: { marginBottom: 20 } },
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' } }, 'Identity'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Name'),
                  h('span', null, identity.name || ea.name || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Display Name'),
                  h('span', null, identity.displayName || identity.display_name || config.displayName || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Email'),
                  h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, identity.email || ea.email || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Role'),
                  h('span', null, identity.role || config.role || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Avatar'),
                  h('span', null, identity.avatar ? (identity.avatar.length > 2 ? 'Custom image' : identity.avatar) : '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Gender'),
                  h('span', null, identity.gender || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Date of Birth'),
                  h('span', null, identity.dob || identity.dateOfBirth || identity.date_of_birth || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Language'),
                  h('span', null, getLanguageName(identity.language || config.language) || '-')
                )
              ),

              // Model Section
              h('div', { style: { marginBottom: 20 } },
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' } }, 'Model'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Provider'),
                  h('span', null, (typeof config.model === 'object' ? config.model.provider : config.provider) || config.modelProvider || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Model ID'),
                  h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, typeof config.model === 'string' ? config.model : (config.model ? (config.model.modelId || '-') : '-'))
                )
              ),

              // Deployment Section
              h('div', null,
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' } }, 'Deployment'),
                h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Target'),
                  h('span', null, deployment.target || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Region'),
                  h('span', null, deployment.region || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Image Tag'),
                  h('span', { style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }, deployment.imageTag || deployment.image_tag || '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'Memory'),
                  h('span', null, deployment.memory || deployment.memoryMb ? (deployment.memoryMb || deployment.memory) + ' MB' : '-'),
                  h('span', { style: { color: 'var(--text-muted)' } }, 'CPU'),
                  h('span', null, deployment.cpu || deployment.cpuUnits ? String(deployment.cpuUnits || deployment.cpu) : '-')
                )
              )
            )
      )
    ),

    // ─── Danger Zone ────────────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20, border: '1px solid var(--danger)' } },
      h('div', { className: 'card-header', style: { borderBottom: '1px solid var(--danger)' } }, h('span', { style: { color: 'var(--danger)', fontWeight: 600 } }, 'Danger Zone')),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('div', null,
            h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, 'Delete Agent'),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Permanently delete this agent and all associated data. This action cannot be undone.')
          ),
          h('button', { className: 'btn btn-danger btn-sm', onClick: startDelete }, I.trash(), ' Delete Agent')
        )
      )
    ),

    // ─── 5-Step Delete Confirmation Modal ──────────────────
    deleteStep >= 1 && h('div', { className: 'modal-overlay', onClick: cancelDelete },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 480 } },
        h('div', { className: 'modal-header' },
          h('h2', { style: { color: 'var(--danger)' } },
            ['', 'Step 1: Are you sure?', 'Step 2: Data Loss Warning', 'Step 3: Memory & Knowledge Loss', 'Step 4: Communication & Integration Impact', 'Step 5: Final Confirmation'][deleteStep]
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: cancelDelete }, '\u00D7')
        ),
        h('div', { style: { display: 'flex', gap: 4, padding: '0 20px', paddingTop: 12 } },
          [1,2,3,4,5].map(function(s) {
            return h('div', { key: s, style: { flex: 1, height: 4, borderRadius: 2, background: s <= deleteStep ? 'var(--danger)' : 'var(--border)' } });
          })
        ),
        h('div', { className: 'modal-body', style: { padding: 20 } },
          deleteStep === 1 && h(Fragment, null,
            h('p', { style: { marginBottom: 12 } }, 'You are about to delete agent ', h('strong', null, _agentName), '.'),
            h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 } }, 'This is a destructive action that will permanently remove this agent and everything associated with it. There is no undo, no recycle bin, and no way to recover.'),
            h('p', { style: { fontSize: 13 } }, 'Please proceed through the next steps to understand exactly what will be lost.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'I understand, continue')
            )
          ),
          deleteStep === 2 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 6 } }, 'ALL AGENT DATA WILL BE DESTROYED'),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13 } },
                h('li', null, 'All email messages (inbox, sent, drafts, folders)'),
                h('li', null, 'All conversation sessions and chat history'),
                h('li', null, 'All tool execution logs and audit trails'),
                h('li', null, 'All configuration, settings, and deployment config'),
                h('li', null, 'All scheduled jobs, cron tasks, and automations')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'If you need any of this data, export it BEFORE proceeding.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'Continue anyway')
            )
          ),
          deleteStep === 3 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 6 } }, 'MEMORY & KNOWLEDGE PERMANENTLY LOST'),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13 } },
                h('li', null, 'All long-term memory entries the agent has built over time'),
                h('li', null, 'All learned preferences, patterns, and behavioral adaptations'),
                h('li', null, 'All knowledge base contributions and embeddings'),
                h('li', null, 'All training data, fine-tuning, and custom instructions'),
                h('li', null, 'The agent\'s entire personality and relationship context')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'This agent has been learning and building context. Once deleted, this knowledge cannot be reconstructed even if you create a new agent with the same name.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'Continue anyway')
            )
          ),
          deleteStep === 4 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 6 } }, 'COMMUNICATION & INTEGRATION IMPACT'),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13 } },
                h('li', null, 'The agent\'s email address will stop working immediately'),
                h('li', null, 'Any external services or APIs relying on this agent will break'),
                h('li', null, 'Other agents that communicate with this agent will lose their connection'),
                h('li', null, 'Active workflows, approval chains, and escalation paths will be disrupted'),
                h('li', null, 'Contacts and external parties will receive bounced emails')
              )
            ),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'If this agent is part of a team or workflow, consider reassigning its responsibilities first.'),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceDelete }, 'I accept the consequences')
            )
          ),
          deleteStep === 5 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, textAlign: 'center' } },
              h('strong', { style: { color: 'var(--danger)', fontSize: 15 } }, 'THIS ACTION IS PERMANENT AND IRREVERSIBLE')
            ),
            h('p', { style: { marginBottom: 12 } }, 'To confirm deletion, type the agent name ', h('strong', { style: { fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 } }, _agentName), ' below:'),
            h('input', {
              type: 'text',
              className: 'form-control',
              placeholder: 'Type agent name to confirm...',
              value: deleteTyped,
              autoFocus: true,
              onInput: function(e) { setDeleteTyped(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') advanceDelete(); },
              style: { marginBottom: 16, borderColor: deleteTyped.trim().toLowerCase() === _agentName.trim().toLowerCase() ? 'var(--danger)' : 'var(--border)' }
            }),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelDelete }, 'Cancel'),
              h('button', {
                className: 'btn btn-danger',
                disabled: deleteTyped.trim().toLowerCase() !== _agentName.trim().toLowerCase() || deleting,
                onClick: advanceDelete
              }, deleting ? 'Deleting...' : 'Permanently delete agent')
            )
          )
        )
      )
    )
  );
}


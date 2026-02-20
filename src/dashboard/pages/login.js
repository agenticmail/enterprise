import { h, useState, useEffect, useCallback, Fragment } from '../components/utils.js';
import { apiCall, authCall, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';

export function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoProviders, setSsoProviders] = useState([]);

  useEffect(() => {
    fetch('/auth/sso/providers').then(r => r.ok ? r.json() : null).then(d => {
      if (d && d.providers) setSsoProviders(d.providers);
    }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const d = await authCall('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      // Server sets httpOnly cookies automatically — no localStorage needed
      onLogin(d);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return h('div', { className: 'login-page' },
    h('div', { className: 'login-card' },
      h('div', { className: 'login-logo' },
        h('img', { src: '/dashboard/assets/logo.png', alt: 'AgenticMail', style: { width: 48, height: 48, objectFit: 'contain' } }),
        h('h1', null, 'AgenticMail Enterprise'),
        h('p', null, 'AI Agent Identity & Management Platform')
      ),
      h('form', { onSubmit: submit },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Email'),
          h('input', { className: 'input', type: 'email', value: email, onChange: e => setEmail(e.target.value), placeholder: 'admin@company.com', required: true, autoFocus: true })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Password'),
          h('input', { className: 'input', type: 'password', value: password, onChange: e => setPassword(e.target.value), placeholder: 'Enter password', required: true })
        ),
        error && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 16 } }, error),
        h('button', { className: 'btn btn-primary', type: 'submit', disabled: loading, style: { width: '100%', justifyContent: 'center', padding: '8px' } }, loading ? 'Signing in...' : 'Sign In')
      ),
      ssoProviders.length > 0 && h('div', { style: { textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' } },
        'Or sign in with ',
        ssoProviders.map((p, i) => h(Fragment, { key: p.type }, i > 0 && ' · ', h('a', { href: p.url }, p.name)))
      ),
      h('div', { style: { textAlign: 'center', marginTop: ssoProviders.length > 0 ? 8 : 20, fontSize: 12, color: 'var(--text-muted)' } },
        h('a', { href: '#', onClick: () => { const k = prompt('Enter API Key:'); if (k) { localStorage.setItem('em_api_key', k); onLogin({}); } } }, 'Use API Key')
      )
    )
  );
}

// ─── Database Type Metadata ──────────────────────────────

var DB_TYPES = [
  { type: 'sqlite', label: 'SQLite (embedded)', group: 'SQL', fields: 'sqlite' },
  { type: 'postgres', label: 'PostgreSQL', group: 'SQL', fields: 'connection', placeholder: 'postgresql://user:pass@host:5432/dbname' },
  { type: 'mysql', label: 'MySQL / MariaDB', group: 'SQL', fields: 'connection', placeholder: 'mysql://user:pass@host:3306/dbname' },
  { type: 'mongodb', label: 'MongoDB', group: 'NoSQL', fields: 'connection', placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/dbname' },
  { type: 'supabase', label: 'Supabase (managed Postgres)', group: 'Cloud', fields: 'connection', placeholder: 'postgresql://postgres:pass@db.xxxx.supabase.co:5432/postgres' },
  { type: 'neon', label: 'Neon (serverless Postgres)', group: 'Cloud', fields: 'connection', placeholder: 'postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require' },
  { type: 'planetscale', label: 'PlanetScale (managed MySQL)', group: 'Cloud', fields: 'connection', placeholder: 'mysql://user:pass@aws.connect.psdb.cloud/dbname?ssl={"rejectUnauthorized":true}' },
  { type: 'cockroachdb', label: 'CockroachDB', group: 'Distributed', fields: 'connection', placeholder: 'postgresql://user:pass@host:26257/dbname?sslmode=verify-full' },
  { type: 'turso', label: 'Turso (LibSQL, edge)', group: 'Edge', fields: 'turso' },
  { type: 'dynamodb', label: 'DynamoDB (AWS)', group: 'Cloud', fields: 'dynamodb' },
];

export function OnboardingWizard({ onComplete }) {
  var TOTAL_STEPS = 6;
  var [step, setStep] = useState(0);
  var [error, setError] = useState('');
  var [loading, setLoading] = useState(false);

  var [form, setForm] = useState({
    // DB
    dbType: 'sqlite', dbConnectionString: '', dbHost: '', dbPort: '', dbDatabase: '',
    dbUsername: '', dbPassword: '', dbSsl: false, dbAuthToken: '', dbRegion: 'us-east-1',
    dbAccessKey: '', dbSecretKey: '',
    // Admin + Company
    name: '', email: '', password: '', confirmPassword: '', company: '', subdomain: '',
    // SMTP
    smtpHost: '', smtpPort: '', smtpUser: '', smtpPass: '',
    // Domain
    customDomain: '', deploymentKey: '', dnsChallenge: '', registrationId: '',
    domainRegistered: false, domainVerified: false,
    // Agent
    agentName: '', agentRole: 'assistant',
  });

  var [dbTesting, setDbTesting] = useState(false);
  var [dbConfigured, setDbConfigured] = useState(false);
  var [dbTestResult, setDbTestResult] = useState(null); // { ok, error }
  var [domainRegistering, setDomainRegistering] = useState(false);
  var [dnsChecking, setDnsChecking] = useState(false);

  var set = function(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); };

  // ─── DB Config Builder ──────────────────────────────

  var buildDbConfig = function() {
    var t = form.dbType;
    if (t === 'sqlite') return { type: 'sqlite' };
    if (t === 'turso') return { type: 'turso', connectionString: form.dbConnectionString, authToken: form.dbAuthToken };
    if (t === 'dynamodb') return { type: 'dynamodb', region: form.dbRegion, accessKeyId: form.dbAccessKey, secretAccessKey: form.dbSecretKey };
    return { type: t, connectionString: form.dbConnectionString };
  };

  // ─── Actions ────────────────────────────────────────

  var doTestDb = async function() {
    setDbTesting(true); setDbTestResult(null); setError('');
    try {
      var res = await authCall('/test-db', { method: 'POST', body: JSON.stringify(buildDbConfig()) });
      setDbTestResult({ ok: true });
    } catch (err) { setDbTestResult({ ok: false, error: err.message }); }
    setDbTesting(false);
  };

  var doConfigureDb = async function() {
    setError(''); setLoading(true);
    try {
      await authCall('/configure-db', { method: 'POST', body: JSON.stringify(buildDbConfig()) });
      setDbConfigured(true);
      setStep(2);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var doBootstrap = async function() {
    setError(''); setLoading(true);
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
    try {
      await authCall('/bootstrap', { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, password: form.password, companyName: form.company, subdomain: form.subdomain }) });
      setStep(3);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var doSmtp = async function() {
    setError(''); setLoading(true);
    try {
      await apiCall('/settings', { method: 'PATCH', body: JSON.stringify({ smtpHost: form.smtpHost, smtpPort: form.smtpPort ? Number(form.smtpPort) : null, smtpUser: form.smtpUser, smtpPass: form.smtpPass }) });
      setStep(4);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var doRegisterDomain = async function() {
    setError(''); setDomainRegistering(true);
    try {
      var res = await apiCall('/domain/register', { method: 'POST', body: JSON.stringify({ domain: form.customDomain }) });
      set('deploymentKey', res.deploymentKey);
      set('dnsChallenge', res.dnsChallenge);
      set('registrationId', res.registrationId);
      set('domainRegistered', true);
    } catch (err) { setError(err.message); }
    setDomainRegistering(false);
  };

  var doVerifyDns = async function() {
    setError(''); setDnsChecking(true);
    try {
      var res = await apiCall('/domain/verify', { method: 'POST', body: JSON.stringify({ domain: form.customDomain }) });
      if (res.verified) {
        set('domainVerified', true);
      } else {
        setError(res.error || 'DNS record not found yet. It may take a few minutes to propagate.');
      }
    } catch (err) { setError(err.message); }
    setDnsChecking(false);
  };

  var doCreateAgent = async function() {
    setError(''); setLoading(true);
    try {
      await apiCall('/agents', { method: 'POST', body: JSON.stringify({ name: form.agentName, role: form.agentRole }) });
      onComplete();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // ─── Copy to clipboard helper ───────────────────────

  var copyText = function(text) {
    if (navigator.clipboard) { navigator.clipboard.writeText(text); }
  };

  // ─── Render helpers ─────────────────────────────────

  var dots = h('div', { className: 'onboarding-steps-indicator' },
    Array.from({ length: TOTAL_STEPS }, function(_, i) {
      return h('div', { key: i, className: 'onboarding-step-dot' + (i === step ? ' active' : '') + (i < step ? ' done' : '') });
    })
  );

  var errorBox = error && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 } }, error);

  var currentDbType = DB_TYPES.find(function(d) { return d.type === form.dbType; });

  // ─── DB Fields per type ─────────────────────────────

  var dbFields = function() {
    var t = form.dbType;
    if (t === 'sqlite') {
      return h('div', { style: { padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 } },
        'SQLite stores data in a local file. No configuration needed for development. For production, choose a cloud database.'
      );
    }
    if (t === 'turso') {
      return h(Fragment, null,
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Turso Database URL'),
          h('input', { className: 'input', value: form.dbConnectionString, onChange: function(e) { set('dbConnectionString', e.target.value); }, placeholder: 'libsql://your-db-name-org.turso.io' })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Auth Token'),
          h('input', { className: 'input', type: 'password', value: form.dbAuthToken, onChange: function(e) { set('dbAuthToken', e.target.value); }, placeholder: 'eyJ...' })
        )
      );
    }
    if (t === 'dynamodb') {
      return h(Fragment, null,
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'AWS Region'),
          h('input', { className: 'input', value: form.dbRegion, onChange: function(e) { set('dbRegion', e.target.value); }, placeholder: 'us-east-1' })
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Access Key ID'),
            h('input', { className: 'input', value: form.dbAccessKey, onChange: function(e) { set('dbAccessKey', e.target.value); }, placeholder: 'AKIA...' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Secret Access Key'),
            h('input', { className: 'input', type: 'password', value: form.dbSecretKey, onChange: function(e) { set('dbSecretKey', e.target.value); }, placeholder: 'wJalr...' })
          )
        )
      );
    }
    // Connection string types: postgres, mysql, mongodb, supabase, neon, planetscale, cockroachdb
    return h('div', { className: 'form-group' },
      h('label', { className: 'form-label' }, 'Connection String'),
      h('input', { className: 'input', value: form.dbConnectionString, onChange: function(e) { set('dbConnectionString', e.target.value); }, placeholder: currentDbType ? currentDbType.placeholder : '' })
    );
  };

  var canTestDb = function() {
    var t = form.dbType;
    if (t === 'sqlite') return true;
    if (t === 'turso') return !!form.dbConnectionString;
    if (t === 'dynamodb') return !!form.dbRegion && !!form.dbAccessKey && !!form.dbSecretKey;
    return !!form.dbConnectionString;
  };

  // ─── Layout ─────────────────────────────────────────

  return h('div', { className: 'onboarding-page' },
    h('div', { className: 'onboarding-card' },
      dots,

      // ── Step 0: Welcome ──────────────────────────────
      step === 0 && h(Fragment, null,
        h('h1', null, 'Welcome to AgenticMail'),
        h('p', { className: 'subtitle' }, 'Set up your enterprise AI agent platform in a few steps.'),
        h('div', { style: { margin: '24px 0', lineHeight: 1.8, fontSize: 14, color: 'var(--text-secondary)' } },
          h('div', null, '1. Configure your database'),
          h('div', null, '2. Create admin account & company'),
          h('div', null, '3. Set up email delivery'),
          h('div', null, '4. Register your custom domain'),
          h('div', null, '5. Create your first AI agent')
        ),
        h('div', { className: 'onboarding-footer' },
          h('div'),
          h('button', { className: 'btn btn-primary', onClick: function() { setStep(1); } }, 'Get Started')
        )
      ),

      // ── Step 1: Database Configuration ───────────────
      step === 1 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Database Configuration'),
        h('div', { className: 'step-desc' }, 'Choose where to store your data. Configure this first so your admin account and all data are stored in the right place.'),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Database Type'),
          h('select', { className: 'input', value: form.dbType, onChange: function(e) { set('dbType', e.target.value); setDbTestResult(null); setDbConfigured(false); setError(''); } },
            DB_TYPES.map(function(d) {
              return h('option', { key: d.type, value: d.type }, d.label);
            })
          )
        ),
        dbFields(),
        // Test & result
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
          form.dbType !== 'sqlite' && h('button', {
            className: 'btn btn-secondary',
            disabled: dbTesting || !canTestDb(),
            onClick: doTestDb,
            style: { fontSize: 13 }
          }, dbTesting ? 'Testing...' : 'Test Connection'),
          dbTestResult && dbTestResult.ok && h('span', { style: { color: 'var(--success, #22c55e)', fontSize: 13 } }, 'Connection successful'),
          dbTestResult && !dbTestResult.ok && h('span', { style: { color: 'var(--danger)', fontSize: 13 } }, dbTestResult.error)
        ),
        errorBox,
        h('div', { className: 'onboarding-footer' },
          h('div', { style: { display: 'flex', gap: 12 } },
            h('button', { className: 'btn btn-secondary', onClick: function() { setStep(0); } }, 'Back'),
            form.dbType === 'sqlite' && h('button', { className: 'onboarding-skip', onClick: function() { setStep(2); } }, 'Use Default SQLite')
          ),
          form.dbType !== 'sqlite' && h('button', {
            className: 'btn btn-primary',
            disabled: loading || !canTestDb(),
            onClick: doConfigureDb
          }, loading ? 'Configuring...' : 'Configure & Continue')
        )
      ),

      // ── Step 2: Admin Account + Company ──────────────
      step === 2 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Admin Account & Company'),
        h('div', { className: 'step-desc' }, 'Create the first administrator account and set up your organization.'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Full Name'),
            h('input', { className: 'input', value: form.name, onChange: function(e) { set('name', e.target.value); }, placeholder: 'Jane Smith', autoFocus: true })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Email'),
            h('input', { className: 'input', type: 'email', value: form.email, onChange: function(e) { set('email', e.target.value); }, placeholder: 'admin@agenticmail.io' })
          )
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Password'),
            h('input', { className: 'input', type: 'password', value: form.password, onChange: function(e) { set('password', e.target.value); }, placeholder: 'Min 8 characters' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Confirm Password'),
            h('input', { className: 'input', type: 'password', value: form.confirmPassword, onChange: function(e) { set('confirmPassword', e.target.value); }, placeholder: 'Confirm password' })
          )
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Company Name'),
            h('input', { className: 'input', value: form.company, onChange: function(e) { set('company', e.target.value); set('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')); }, placeholder: 'AgenticMail Inc' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Subdomain'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h('input', { className: 'input', value: form.subdomain, onChange: function(e) { set('subdomain', e.target.value); }, placeholder: 'agenticmail-inc', style: { flex: 1 } }),
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' } }, '.agenticmail.io')
            )
          )
        ),
        errorBox,
        h('div', { className: 'onboarding-footer' },
          h('button', { className: 'btn btn-secondary', onClick: function() { setStep(1); } }, 'Back'),
          h('button', { className: 'btn btn-primary', disabled: loading || !form.name || !form.email || !form.password || !form.confirmPassword || !form.company, onClick: doBootstrap }, loading ? 'Creating...' : 'Create Account')
        )
      ),

      // ── Step 3: Email / SMTP ─────────────────────────
      step === 3 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Email Configuration'),
        h('div', { className: 'step-desc' }, 'Configure SMTP for outbound email delivery. You can skip this and set it up later.'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'SMTP Host'),
            h('input', { className: 'input', value: form.smtpHost, onChange: function(e) { set('smtpHost', e.target.value); }, placeholder: 'smtp.gmail.com', autoFocus: true })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'SMTP Port'),
            h('input', { className: 'input', type: 'number', value: form.smtpPort, onChange: function(e) { set('smtpPort', e.target.value); }, placeholder: '587' })
          )
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'SMTP Username'),
            h('input', { className: 'input', value: form.smtpUser, onChange: function(e) { set('smtpUser', e.target.value); }, placeholder: 'you@gmail.com' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'SMTP Password'),
            h('input', { className: 'input', type: 'password', value: form.smtpPass, onChange: function(e) { set('smtpPass', e.target.value); }, placeholder: 'App password' })
          )
        ),
        errorBox,
        h('div', { className: 'onboarding-footer' },
          h('div', { style: { display: 'flex', gap: 12 } },
            h('button', { className: 'btn btn-secondary', onClick: function() { setStep(2); } }, 'Back'),
            h('button', { className: 'onboarding-skip', onClick: function() { setStep(4); } }, 'Skip for now')
          ),
          h('button', { className: 'btn btn-primary', disabled: loading || !form.smtpHost, onClick: doSmtp }, loading ? 'Saving...' : 'Continue')
        )
      ),

      // ── Step 4: Domain Registration ──────────────────
      step === 4 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Domain Registration'),
        h('div', { className: 'step-desc' }, 'Register a custom domain for your AgenticMail deployment. You can skip this and set it up later.'),

        !form.domainRegistered && h(Fragment, null,
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Custom Domain'),
            h('input', { className: 'input', value: form.customDomain, onChange: function(e) { set('customDomain', e.target.value); }, placeholder: 'agents.agenticmail.io', autoFocus: true })
          ),
          errorBox,
          h('div', { className: 'onboarding-footer' },
            h('div', { style: { display: 'flex', gap: 12 } },
              h('button', { className: 'btn btn-secondary', onClick: function() { setStep(3); } }, 'Back'),
              h('button', { className: 'onboarding-skip', onClick: function() { setStep(5); } }, 'Skip for now')
            ),
            h('button', { className: 'btn btn-primary', disabled: domainRegistering || !form.customDomain, onClick: doRegisterDomain }, domainRegistering ? 'Registering...' : 'Register Domain')
          )
        ),

        form.domainRegistered && !form.domainVerified && h(Fragment, null,
          // Deployment key warning
          h('div', { style: { background: 'var(--warning-bg, #fef3c7)', border: '1px solid var(--warning-border, #fbbf24)', borderRadius: 8, padding: 16, marginBottom: 16 } },
            h('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, 'Save Your Deployment Key'),
            h('div', { style: { fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' } }, 'This key is shown only once. You will need it to recover your domain if you lose access to this server.'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('code', { style: { flex: 1, padding: '8px 12px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: 6, fontSize: 12, wordBreak: 'break-all', fontFamily: 'monospace' } }, form.deploymentKey),
              h('button', { className: 'btn btn-secondary', style: { fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }, onClick: function() { copyText(form.deploymentKey); } }, 'Copy')
            )
          ),
          // DNS instructions
          h('div', { style: { background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: 16, marginBottom: 16 } },
            h('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, 'Add DNS TXT Record'),
            h('div', { style: { fontSize: 13, marginBottom: 12 } }, 'Add the following TXT record to your DNS provider:'),
            h('div', { style: { display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 12px', fontSize: 13 } },
              h('span', { style: { fontWeight: 600 } }, 'Host:'),
              h('code', { style: { wordBreak: 'break-all' } }, '_agenticmail-verify.' + form.customDomain),
              h('span', { style: { fontWeight: 600 } }, 'Type:'),
              h('span', null, 'TXT'),
              h('span', { style: { fontWeight: 600 } }, 'Value:'),
              h('code', { style: { wordBreak: 'break-all' } }, form.dnsChallenge)
            )
          ),
          errorBox,
          h('div', { className: 'onboarding-footer' },
            h('button', { className: 'onboarding-skip', onClick: function() { setStep(5); } }, 'Skip verification for now'),
            h('button', { className: 'btn btn-primary', disabled: dnsChecking, onClick: doVerifyDns }, dnsChecking ? 'Checking...' : 'Verify DNS')
          )
        ),

        form.domainRegistered && form.domainVerified && h(Fragment, null,
          h('div', { style: { textAlign: 'center', padding: '24px 0' } },
            h('div', { style: { fontSize: 40, marginBottom: 12 } }, '\u2705'),
            h('div', { style: { fontSize: 16, fontWeight: 600 } }, 'Domain Verified'),
            h('div', { style: { color: 'var(--text-muted)', fontSize: 14, marginTop: 4 } }, form.customDomain + ' is now registered and verified.')
          ),
          h('div', { className: 'onboarding-footer' },
            h('div'),
            h('button', { className: 'btn btn-primary', onClick: function() { setStep(5); } }, 'Continue')
          )
        )
      ),

      // ── Step 5: First Agent ──────────────────────────
      step === 5 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Create Your First Agent'),
        h('div', { className: 'step-desc' }, 'Set up an AI agent with an email identity. You can skip this and create agents later.'),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Agent Name'),
          h('input', { className: 'input', value: form.agentName, onChange: function(e) { set('agentName', e.target.value); }, placeholder: 'e.g., Research Assistant', autoFocus: true })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Role'),
          h('select', { className: 'input', value: form.agentRole, onChange: function(e) { set('agentRole', e.target.value); } },
            h('option', { value: 'assistant' }, 'Assistant'),
            h('option', { value: 'researcher' }, 'Researcher'),
            h('option', { value: 'writer' }, 'Writer'),
            h('option', { value: 'secretary' }, 'Secretary'),
            h('option', { value: 'developer' }, 'Developer'),
            h('option', { value: 'support' }, 'Support')
          )
        ),
        errorBox,
        h('div', { className: 'onboarding-footer' },
          h('div', { style: { display: 'flex', gap: 12 } },
            h('button', { className: 'btn btn-secondary', onClick: function() { setStep(4); } }, 'Back'),
            h('button', { className: 'onboarding-skip', onClick: function() { onComplete(); } }, 'Skip for now')
          ),
          h('button', { className: 'btn btn-primary', disabled: loading || !form.agentName, onClick: doCreateAgent }, loading ? 'Creating...' : 'Create & Finish')
        )
      )
    )
  );
}

import { h, useState, useEffect, useCallback, Fragment } from '../components/utils.js';
import { apiCall, authCall, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';

var _b = typeof window !== 'undefined' && window.__EM_BRANDING__ || {};
var _brandLogo = _b.login_logo || _b.logo || _brandLogo;
var _brandBg = _b.login_bg || null;

export function LoginPage({ onLogin }) {
  var [tab, setTab] = useState('password'); // 'password' | 'apikey' | 'sso'
  var [email, setEmail] = useState('');
  var [password, setPassword] = useState('');
  var [apiKey, setApiKey] = useState('');
  var [error, setError] = useState('');
  var [loading, setLoading] = useState(false);
  var [ssoProviders, setSsoProviders] = useState([]);

  // 2FA state
  var [needs2fa, setNeeds2fa] = useState(false);
  var [challengeToken, setChallengeToken] = useState('');
  var [totpCode, setTotpCode] = useState('');

  // Forgot password state
  var [forgotMode, setForgotMode] = useState(false);   // show forgot password form
  var [forgotEmail, setForgotEmail] = useState('');
  var [forgotCode, setForgotCode] = useState('');
  var [forgotNewPw, setForgotNewPw] = useState('');
  var [forgotNewPw2, setForgotNewPw2] = useState('');
  var [forgotStep, setForgotStep] = useState('email');  // 'email' | 'code' | 'no2fa' | 'done'
  var [forgotLoading, setForgotLoading] = useState(false);
  var [forgotError, setForgotError] = useState('');

  useEffect(function() {
    fetch('/auth/sso/providers').then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
      if (d && d.providers && d.providers.length > 0) setSsoProviders(d.providers);
    }).catch(function() {});
  }, []);

  var submitPassword = async function(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      var d = await authCall('/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) });
      if (d.requires2fa) {
        setNeeds2fa(true);
        setChallengeToken(d.challengeToken);
        setLoading(false);
        return;
      }
      onLogin(d);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var submit2fa = async function(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      var d = await authCall('/2fa/verify', { method: 'POST', body: JSON.stringify({ challengeToken: challengeToken, code: totpCode }) });
      onLogin(d);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var submitApiKey = async function(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      var d = await authCall('/login/api-key', { method: 'POST', body: JSON.stringify({ apiKey: apiKey }) });
      onLogin(d);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var submitForgotEmail = async function() {
    setForgotLoading(true); setForgotError('');
    try {
      // Check if user has 2FA by attempting reset without code
      var d = await authCall('/reset-password-self', { method: 'POST', body: JSON.stringify({ email: forgotEmail, newPassword: 'check__only__12', totpCode: '' }) });
      if (d.has2fa) { setForgotStep('code'); }
      else if (d.no2fa) { setForgotStep('no2fa'); }
      else { setForgotStep('code'); }
    } catch (err) {
      var msg = err.message || '';
      if (msg.indexOf('not enabled') >= 0 || msg.indexOf('administrator') >= 0) {
        setForgotStep('no2fa');
      } else {
        setForgotStep('code');
      }
    }
    setForgotLoading(false);
  };

  var submitForgotReset = async function() {
    if (forgotNewPw !== forgotNewPw2) { setForgotError('Passwords do not match'); return; }
    if (forgotNewPw.length < 8) { setForgotError('Password must be at least 8 characters'); return; }
    setForgotLoading(true); setForgotError('');
    try {
      var d = await authCall('/reset-password-self', { method: 'POST', body: JSON.stringify({ email: forgotEmail, totpCode: forgotCode, newPassword: forgotNewPw }) });
      if (d.ok) { setForgotStep('done'); }
      else if (d.no2fa) { setForgotStep('no2fa'); setForgotError(d.error); }
      else if (d.error) { setForgotError(d.error); }
    } catch (err) { setForgotError(err.message); }
    setForgotLoading(false);
  };

  var cancelForgot = function() {
    setForgotMode(false); setForgotStep('email'); setForgotEmail(''); setForgotCode('');
    setForgotNewPw(''); setForgotNewPw2(''); setForgotError('');
  };

  var cancel2fa = function() {
    setNeeds2fa(false);
    setChallengeToken('');
    setTotpCode('');
    setError('');
  };

  var tabStyle = function(t) {
    return {
      flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
      color: tab === t ? 'var(--accent-text)' : 'var(--text-muted)',
      background: 'none', border: 'none', borderBottomStyle: 'solid', borderBottomWidth: 2,
      borderBottomColor: tab === t ? 'var(--accent)' : 'transparent',
      fontFamily: 'var(--font)', transition: 'all 150ms ease',
    };
  };

  // ─── 2FA Verification Screen ──────────────────────────

  if (needs2fa) {
    return h('div', { className: 'login-page', style: _brandBg ? { backgroundImage: 'url(' + _brandBg + ')', backgroundSize: 'cover', backgroundPosition: 'center' } : {} },
      h('div', { className: 'login-card' },
        h('div', { className: 'login-logo' },
          h('img', { src: _brandLogo, alt: 'AgenticMail', style: { width: 48, height: 48, objectFit: 'contain' } }),
          h('h1', null, 'Two-Factor Authentication'),
          h('p', null, 'Enter the code from your authenticator app')
        ),
        h('form', { onSubmit: submit2fa },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, '6-Digit Code'),
            h('input', {
              className: 'input', type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code',
              value: totpCode, onChange: function(e) { setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); },
              placeholder: '000000', autoFocus: true, maxLength: 6,
              style: { textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', fontFamily: 'var(--font-mono)' }
            })
          ),
          error && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 16 } }, error),
          h('button', { className: 'btn btn-primary', type: 'submit', disabled: loading || totpCode.length !== 6, style: { width: '100%', justifyContent: 'center', padding: '8px' } }, loading ? 'Verifying...' : 'Verify'),
          h('div', { style: { textAlign: 'center', marginTop: 16 } },
            h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: cancel2fa }, 'Back to login')
          ),
          h('div', { style: { textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-muted)' } },
            'You can also enter a backup code'
          )
        )
      )
    );
  }

  // ─── Forgot Password Screen ──────────────────────────

  if (forgotMode) {
    return h('div', { className: 'login-page', style: _brandBg ? { backgroundImage: 'url(' + _brandBg + ')', backgroundSize: 'cover', backgroundPosition: 'center' } : {} },
      h('div', { className: 'login-card' },
        h('div', { className: 'login-logo' },
          h('img', { src: _brandLogo, alt: 'AgenticMail', style: { width: 48, height: 48, objectFit: 'contain' } }),
          h('h1', null, 'Reset Password'),
          h('p', null, forgotStep === 'email' ? 'Enter your email address' : forgotStep === 'code' ? 'Verify with your authenticator app' : forgotStep === 'done' ? 'Password updated' : 'Contact your administrator')
        ),

        // Step: enter email
        forgotStep === 'email' && h('div', null,
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Email Address'),
            h('input', { className: 'input', type: 'email', value: forgotEmail, onChange: function(e) { setForgotEmail(e.target.value); }, placeholder: 'you@company.com', autoFocus: true })
          ),
          forgotError && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 } }, forgotError),
          h('button', { className: 'btn btn-primary', onClick: submitForgotEmail, disabled: forgotLoading || !forgotEmail, style: { width: '100%', justifyContent: 'center', padding: '8px' } }, forgotLoading ? 'Checking...' : 'Continue'),
          h('div', { style: { textAlign: 'center', marginTop: 16 } },
            h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: cancelForgot }, 'Back to login')
          )
        ),

        // Step: enter 2FA code + new password
        forgotStep === 'code' && h('div', null,
          h('div', { style: { background: 'var(--info-soft, rgba(59,130,246,0.1))', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' } },
            'Enter the 6-digit code from your authenticator app (or a backup code) along with your new password.'
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, '2FA Code'),
            h('input', {
              className: 'input', type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code',
              value: forgotCode, onChange: function(e) { setForgotCode(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 8)); },
              placeholder: '000000', autoFocus: true, maxLength: 8,
              style: { textAlign: 'center', fontSize: 20, letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }
            })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'New Password'),
            h('input', { className: 'input', type: 'password', value: forgotNewPw, onChange: function(e) { setForgotNewPw(e.target.value); }, placeholder: 'Min 8 characters' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Confirm Password'),
            h('input', { className: 'input', type: 'password', value: forgotNewPw2, onChange: function(e) { setForgotNewPw2(e.target.value); }, placeholder: 'Confirm new password' })
          ),
          forgotError && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 } }, forgotError),
          h('button', { className: 'btn btn-primary', onClick: submitForgotReset, disabled: forgotLoading || !forgotCode || !forgotNewPw || !forgotNewPw2, style: { width: '100%', justifyContent: 'center', padding: '8px' } }, forgotLoading ? 'Resetting...' : 'Reset Password'),
          h('div', { style: { textAlign: 'center', marginTop: 16 } },
            h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: cancelForgot }, 'Back to login')
          )
        ),

        // Step: no 2FA — contact admin
        forgotStep === 'no2fa' && h('div', null,
          h('div', { style: { textAlign: 'center', padding: '12px 0' } },
            h('div', { style: { width: 48, height: 48, borderRadius: '50%', background: 'var(--danger-soft, rgba(220,38,38,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' } },
              h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--danger, #dc2626)', strokeWidth: 2, strokeLinecap: 'round' },
                h('path', { d: 'M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' })
              )
            ),
            h('h3', { style: { fontSize: 16, fontWeight: 600, marginBottom: 8 } }, 'Cannot Reset Password'),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' } },
              'Two-factor authentication is not enabled on this account. Without 2FA, you cannot reset your password yourself.'
            ),
            h('div', { style: { marginTop: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 13 } },
              h('strong', null, 'What to do:'), h('br', null),
              'Contact your organization administrator and ask them to reset your password from the Users page.'
            ),
            h('div', { style: { marginTop: 16, padding: 10, background: 'var(--warning-soft, rgba(153,27,27,0.08))', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' } },
              'Tip: Once you regain access, enable 2FA immediately so you can reset your own password in the future.'
            )
          ),
          h('div', { style: { textAlign: 'center', marginTop: 16 } },
            h('button', { type: 'button', className: 'btn btn-primary', onClick: cancelForgot, style: { width: '100%', justifyContent: 'center' } }, 'Back to Login')
          )
        ),

        // Step: done
        forgotStep === 'done' && h('div', null,
          h('div', { style: { textAlign: 'center', padding: '12px 0' } },
            h('div', { style: { width: 48, height: 48, borderRadius: '50%', background: 'var(--success-soft, rgba(21,128,61,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' } },
              h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--success, #15803d)', strokeWidth: 2, strokeLinecap: 'round' },
                h('path', { d: 'M20 6L9 17l-5-5' })
              )
            ),
            h('h3', { style: { fontSize: 16, fontWeight: 600, marginBottom: 8 } }, 'Password Reset Successfully'),
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'You can now sign in with your new password.')
          ),
          h('div', { style: { textAlign: 'center', marginTop: 16 } },
            h('button', { type: 'button', className: 'btn btn-primary', onClick: cancelForgot, style: { width: '100%', justifyContent: 'center' } }, 'Sign In')
          )
        )
      )
    );
  }

  // ─── Main Login Screen ────────────────────────────────

  return h('div', { className: 'login-page', style: _brandBg ? { backgroundImage: 'url(' + _brandBg + ')', backgroundSize: 'cover', backgroundPosition: 'center' } : {} },
    h('div', { className: 'login-card' },
      h('div', { className: 'login-logo' },
        h('img', { src: _brandLogo, alt: 'AgenticMail', style: { width: 48, height: 48, objectFit: 'contain' } }),
        h('h1', null, 'AgenticMail Enterprise'),
        h('p', null, 'AI Agent Identity & Management Platform')
      ),

      // Tab bar
      h('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' } },
        h('button', { type: 'button', style: tabStyle('password'), onClick: function() { setTab('password'); setError(''); } }, 'Email & Password'),
        h('button', { type: 'button', style: tabStyle('apikey'), onClick: function() { setTab('apikey'); setError(''); } }, 'API Key'),
        ssoProviders.length > 0 && h('button', { type: 'button', style: tabStyle('sso'), onClick: function() { setTab('sso'); setError(''); } }, 'SSO')
      ),

      // ── Email/Password Tab ──────────────────────────
      tab === 'password' && h('form', { onSubmit: submitPassword },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Email'),
          h('input', { className: 'input', type: 'email', value: email, onChange: function(e) { setEmail(e.target.value); }, placeholder: 'admin@company.com', required: true, autoFocus: true })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Password'),
          h('input', { className: 'input', type: 'password', value: password, onChange: function(e) { setPassword(e.target.value); }, placeholder: 'Enter password', required: true })
        ),
        error && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 16 } }, error),
        h('button', { className: 'btn btn-primary', type: 'submit', disabled: loading, style: { width: '100%', justifyContent: 'center', padding: '8px' } }, loading ? 'Signing in...' : 'Sign In'),
        h('div', { style: { textAlign: 'center', marginTop: 12 } },
          h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: function() { setForgotMode(true); setForgotEmail(email); setError(''); }, style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Forgot Password?')
        )
      ),

      // ── API Key Tab ─────────────────────────────────
      tab === 'apikey' && h('form', { onSubmit: submitApiKey },
        h('div', { style: { background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 } },
          'Use an API key for programmatic access or headless environments. Create API keys from Settings after logging in.'
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'API Key'),
          h('input', { className: 'input', type: 'password', value: apiKey, onChange: function(e) { setApiKey(e.target.value); }, placeholder: 'em_key_...', required: true, autoFocus: true, style: { fontFamily: 'var(--font-mono)', fontSize: 13 } })
        ),
        error && h('div', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 16 } }, error),
        h('button', { className: 'btn btn-primary', type: 'submit', disabled: loading || !apiKey.trim(), style: { width: '100%', justifyContent: 'center', padding: '8px' } }, loading ? 'Authenticating...' : 'Sign In with API Key')
      ),

      // ── SSO Tab ─────────────────────────────────────
      tab === 'sso' && h('div', null,
        h('div', { style: { marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' } },
          'Sign in using your organization\'s identity provider.'
        ),
        ssoProviders.map(function(p) {
          return h('a', {
            key: p.type, href: p.url,
            className: 'btn btn-secondary',
            style: { width: '100%', justifyContent: 'center', padding: '10px', marginBottom: 8, display: 'flex', textDecoration: 'none' }
          },
            p.type === 'saml' ? I.shield() : I.link(),
            ' Sign in with ', p.name
          );
        }),
        ssoProviders.length === 0 && h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } },
          'No SSO providers configured. Set up SAML or OIDC in Settings.'
        )
      ),

      // Footer
      h('div', { style: { textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-muted)' } },
        'Secured with enterprise-grade authentication',
        h('span', { style: { margin: '0 6px' } }, '·'),
        '2FA supported'
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
  var TOTAL_STEPS = 7;
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

  // Generated security keys from bootstrap (shown once for backup)
  var [generatedKeys, setGeneratedKeys] = useState(null);
  var [envPersisted, setEnvPersisted] = useState(false);
  var [keysCopied, setKeysCopied] = useState(false);

  var [dbTesting, setDbTesting] = useState(false);
  var [dbConfigured, setDbConfigured] = useState(false);
  var [dbTestResult, setDbTestResult] = useState(null); // { ok, error }
  var [domainRegistering, setDomainRegistering] = useState(false);
  var [dnsChecking, setDnsChecking] = useState(false);

  var set = function(k, v) { setForm(function(f) { return Object.assign({}, f, { [k]: v }); }); };

  // ─── Smart DB URL Analysis & Auto-Optimization ─────

  var analyzeDbUrl = function(url) {
    if (!url) return null;
    try {
      var u = new URL(url);
      var port = u.port || '5432';
      var host = u.hostname || '';
      var info = {
        host: host, port: port, provider: null, isPooler: false, poolerMode: null,
        directUrl: null, optimizedUrl: null, warnings: [], tips: [], autoFixed: []
      };

      // ── Supabase Detection ──────────────────────────
      if (host.includes('.supabase.co') || host.includes('pooler.supabase.com')) {
        info.provider = 'supabase';
        var projectRef = u.username.replace('postgres.', '');

        if (host.includes('pooler.supabase.com')) {
          info.isPooler = true;
          info.poolerMode = port === '6543' ? 'transaction' : port === '5432' ? 'session' : 'unknown';

          // Build direct URL: db.{ref}.supabase.co:5432
          var directU = new URL(url);
          directU.hostname = 'db.' + projectRef + '.supabase.co';
          directU.port = '5432';
          directU.searchParams.delete('pgbouncer');
          info.directUrl = directU.toString();

          if (port === '5432') {
            // Auto-fix: switch from session mode (5432) to transaction mode (6543)
            var fixedU = new URL(url);
            fixedU.port = '6543';
            fixedU.searchParams.set('pgbouncer', 'true');
            info.optimizedUrl = fixedU.toString();
            info.autoFixed.push('Switched from session mode (port 5432) to transaction mode (port 6543) — higher connection limits and better for multi-process setups.');
            info.autoFixed.push('Added ?pgbouncer=true for proper connection pooling.');
          } else if (port === '6543') {
            // Already on transaction mode — ensure pgbouncer param is set
            if (!u.searchParams.get('pgbouncer')) {
              var optU = new URL(url);
              optU.searchParams.set('pgbouncer', 'true');
              info.optimizedUrl = optU.toString();
              info.autoFixed.push('Added ?pgbouncer=true parameter for proper PgBouncer transaction mode handling.');
            }
            info.tips.push('Transaction mode pooler detected — optimal for production.');
          }
          info.tips.push('Direct URL auto-generated for migrations (bypasses pooler for DDL operations).');

        } else if (host.startsWith('db.') || host.includes('.supabase.co')) {
          // Direct connection — build pooler URL for them
          info.directUrl = url;
          var region = host.match(/db\.([^.]+)\.supabase\.co/)?.[1] || projectRef;
          // Try to detect region from hostname pattern
          var poolerU = new URL(url);
          // Supabase pooler format: aws-0-{region}.pooler.supabase.com
          poolerU.hostname = 'aws-0-us-east-1.pooler.supabase.com'; // default, user may need to adjust
          poolerU.port = '6543';
          poolerU.username = 'postgres.' + region;
          poolerU.searchParams.set('pgbouncer', 'true');
          info.warnings.push('Direct connection detected. For production with multiple agents, use the Supabase connection pooler.');
          info.tips.push('Go to Supabase Dashboard > Settings > Database > Connection string > URI, and select "Transaction mode" to get the correct pooler URL.');
        }
      }
      // ── Neon Detection ──────────────────────────────
      else if (host.includes('.neon.tech')) {
        info.provider = 'neon';
        info.isPooler = host.includes('-pooler');
        if (!info.isPooler) {
          // Auto-fix: add -pooler to hostname
          var neonFixedU = new URL(url);
          var parts = neonFixedU.hostname.split('.');
          if (parts[0] && !parts[0].endsWith('-pooler')) {
            parts[0] = parts[0] + '-pooler';
            neonFixedU.hostname = parts.join('.');
            info.optimizedUrl = neonFixedU.toString();
            info.autoFixed.push('Added connection pooler endpoint (-pooler) for better connection handling.');
          }
          // Direct URL is the original
          info.directUrl = url;
          info.tips.push('Direct URL saved for migrations.');
        } else {
          // Already pooled — generate direct URL
          var neonDirectU = new URL(url);
          var neonParts = neonDirectU.hostname.split('.');
          if (neonParts[0]) {
            neonParts[0] = neonParts[0].replace(/-pooler$/, '');
            neonDirectU.hostname = neonParts.join('.');
          }
          info.directUrl = neonDirectU.toString();
          info.tips.push('Neon pooler detected — optimal for production. Direct URL auto-generated for migrations.');
        }
      }
      // ── Generic Postgres ────────────────────────────
      else {
        info.provider = 'postgres';
        // Check for common PgBouncer indicators
        if (port === '6432' || port === '6543' || u.searchParams.get('pgbouncer') === 'true') {
          info.isPooler = true;
          info.poolerMode = 'transaction';
          info.tips.push('PgBouncer detected. Connection pooling will be configured automatically.');
        }
      }

      return info;
    } catch { return null; }
  };

  var dbUrlInfo = analyzeDbUrl(form.dbConnectionString);

  // ─── DB Config Builder ──────────────────────────────

  var buildDbConfig = function() {
    var t = form.dbType;
    if (t === 'sqlite') return { type: 'sqlite' };
    if (t === 'turso') return { type: 'turso', connectionString: form.dbConnectionString, authToken: form.dbAuthToken };
    if (t === 'dynamodb') return { type: 'dynamodb', region: form.dbRegion, accessKeyId: form.dbAccessKey, secretAccessKey: form.dbSecretKey };
    // Use optimized URL if available (auto-fixed pooler mode, pgbouncer param, etc.)
    var connStr = (dbUrlInfo && dbUrlInfo.optimizedUrl) ? dbUrlInfo.optimizedUrl : form.dbConnectionString;
    var config = { type: t, connectionString: connStr };
    // Auto-attach smart DB metadata for Postgres-family databases
    if (dbUrlInfo) {
      config.poolerDetected = dbUrlInfo.isPooler || !!dbUrlInfo.optimizedUrl;
      config.poolerMode = dbUrlInfo.poolerMode || (dbUrlInfo.optimizedUrl ? 'transaction' : null);
      config.directUrl = dbUrlInfo.directUrl;
      config.provider = dbUrlInfo.provider;
    }
    return config;
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
      var autoSub = form.company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      var res = await authCall('/bootstrap', { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, password: form.password, companyName: form.company, subdomain: autoSub }) });
      if (res.generatedKeys && Object.keys(res.generatedKeys).length > 0) {
        setGeneratedKeys(res.generatedKeys);
        setEnvPersisted(res.envPersisted || false);
      }
      setStep(3);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var doSmtp = async function() {
    setError(''); setLoading(true);
    try {
      await apiCall('/settings', { method: 'PATCH', body: JSON.stringify({ smtpHost: form.smtpHost, smtpPort: form.smtpPort ? Number(form.smtpPort) : null, smtpUser: form.smtpUser, smtpPass: form.smtpPass }) });
      if (form.company && !form.customDomain) set('customDomain', form.company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.agenticmail.io');
      setStep(5);
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
    var urlHints = dbUrlInfo && form.dbConnectionString.length > 10;
    return h(Fragment, null,
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Connection String'),
        h('input', { className: 'input', value: form.dbConnectionString, onChange: function(e) { set('dbConnectionString', e.target.value); }, placeholder: currentDbType ? currentDbType.placeholder : '' })
      ),
      // Smart URL analysis hints
      urlHints && h('div', { style: { margin: '-8px 0 12px', fontSize: 12, lineHeight: 1.6 } },
        dbUrlInfo.provider && dbUrlInfo.provider !== 'postgres' && h('div', { style: { color: 'var(--accent)', fontWeight: 500, marginBottom: 4 } },
          dbUrlInfo.provider === 'supabase' ? '\uD83D\uDFE2 Supabase' : dbUrlInfo.provider === 'neon' ? '\uD83D\uDFE2 Neon' : dbUrlInfo.provider,
          ' detected',
          dbUrlInfo.isPooler || dbUrlInfo.optimizedUrl ? ' \u2014 connection will be auto-optimized' : ' (direct connection)'
        ),
        // Auto-fix notifications (green — things we fixed for them)
        dbUrlInfo.autoFixed && dbUrlInfo.autoFixed.map(function(f, i) {
          return h('div', { key: 'f' + i, style: { color: '#10b981', padding: '4px 8px', background: 'rgba(16,185,129,0.08)', borderRadius: 6, marginBottom: 4 } },
            '\u2728 Auto-configured: ', f
          );
        }),
        // Warnings (yellow — things they need to act on)
        dbUrlInfo.warnings.map(function(w, i) {
          return h('div', { key: 'w' + i, style: { color: 'var(--warning, #f59e0b)', padding: '4px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: 6, marginBottom: 4 } },
            '\u26A0\uFE0F ', w
          );
        }),
        // Tips (informational)
        dbUrlInfo.tips.map(function(t, i) {
          return h('div', { key: 't' + i, style: { color: 'var(--text-secondary)', padding: '2px 0' } },
            '\u2714\uFE0F ', t
          );
        }),
        // Summary of what will be sent
        (dbUrlInfo.directUrl || dbUrlInfo.optimizedUrl) && h('div', { style: { color: 'var(--text-secondary)', padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6, marginTop: 4, fontSize: 11 } },
          dbUrlInfo.optimizedUrl && h('div', null, '\uD83D\uDD17 Pooler URL: ', h('code', { style: { fontSize: 10 } }, dbUrlInfo.optimizedUrl.substring(0, 60) + '...')),
          dbUrlInfo.directUrl && h('div', null, '\uD83D\uDD17 Direct URL (migrations): ', h('code', { style: { fontSize: 10 } }, dbUrlInfo.directUrl.substring(0, 60) + '...'))
        )
      )
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
          dbTestResult && dbTestResult.ok && h('span', { style: { color: 'var(--success, #15803d)', fontSize: 13 } }, 'Connection successful'),
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
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Company Name'),
          h('input', { className: 'input', value: form.company, onChange: function(e) { set('company', e.target.value); }, placeholder: 'AgenticMail Inc' })
        ),
        errorBox,
        h('div', { className: 'onboarding-footer' },
          h('button', { className: 'btn btn-secondary', onClick: function() { setStep(1); } }, 'Back'),
          h('button', { className: 'btn btn-primary', disabled: loading || !form.name || !form.email || !form.password || !form.confirmPassword || !form.company, onClick: doBootstrap }, loading ? 'Creating...' : 'Create Account')
        )
      ),

      // ── Step 3: Security Keys ──────────────────────────
      step === 3 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Security Keys'),
        h('div', { className: 'step-desc' }, 'Your encryption keys have been auto-generated. These keys encrypt your vault secrets, sign auth tokens, and protect API data in transit. Save them now — you\'ll need them for redeployment.'),

        generatedKeys ? h(Fragment, null,
          envPersisted
            ? h('div', { style: { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 } },
                h('strong', null, 'Keys saved to .env file. '), 'A backup copy was also stored in your database. We still recommend saving these to a password manager in case you need to deploy from a new machine.'
              )
            : h('div', { style: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 } },
                h('strong', null, 'Ephemeral filesystem detected — .env could not be saved. '), 'Your keys are set in memory for this session and backed up in the database, but you MUST configure them as environment variables on your platform (fly.io, Railway, Docker, etc.) before your next deploy. See platform instructions below.'
              ),

          Object.keys(generatedKeys).map(function(envVar) {
            return h('div', { key: envVar, className: 'form-group', style: { marginBottom: 12 } },
              h('label', { className: 'form-label', style: { fontFamily: 'monospace', fontSize: 12 } }, envVar),
              h('div', { style: { display: 'flex', gap: 6 } },
                h('input', { className: 'input', readOnly: true, value: generatedKeys[envVar], style: { fontFamily: 'monospace', fontSize: 12 } }),
                h('button', { className: 'btn btn-sm btn-ghost', onClick: function() { copyText(generatedKeys[envVar]); } }, 'Copy')
              )
            );
          }),

          h('div', { style: { display: 'flex', gap: 8, marginTop: 12, marginBottom: 16 } },
            h('button', { className: 'btn btn-sm ' + (keysCopied ? 'btn-success' : 'btn-primary'), onClick: function() {
              var envBlock = Object.keys(generatedKeys).map(function(k) { return k + '=' + generatedKeys[k]; }).join('\n');
              copyText(envBlock);
              setKeysCopied(true);
            } }, keysCopied ? 'Copied to clipboard' : 'Copy All as .env Block'),
            h('button', { className: 'btn btn-sm btn-secondary', onClick: function() {
              var envBlock = '# AgenticMail Security Keys — Generated ' + new Date().toISOString() + '\n' + Object.keys(generatedKeys).map(function(k) { return k + '=' + generatedKeys[k]; }).join('\n') + '\n';
              var blob = new Blob([envBlock], { type: 'text/plain' });
              var url = URL.createObjectURL(blob);
              var a = document.createElement('a');
              a.href = url; a.download = 'agenticmail-keys.env'; a.click();
              URL.revokeObjectURL(url);
            } }, 'Download .env File')
          ),

          // What each key does
          h('div', { style: { background: 'var(--bg-tertiary)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16 } },
            h('strong', null, 'What each key does:'),
            h('ul', { style: { margin: '4px 0 0', paddingLeft: 16 } },
              h('li', null, h('code', null, 'JWT_SECRET'), ' — Signs authentication tokens (sessions, API keys)'),
              h('li', null, h('code', null, 'ENCRYPTION_KEY'), ' — Encrypts secrets stored in the vault (API keys, database passwords, OAuth tokens)'),
              h('li', null, h('code', null, 'TRANSPORT_ENCRYPTION_KEY'), ' — Encrypts API data in transit between dashboard and server (enable in Settings > Security)')
            )
          ),

          // Platform-specific instructions
          h('div', { style: { background: 'var(--bg-tertiary)', borderRadius: 8, padding: 12, fontSize: 13 } },
            h('strong', null, 'How to set these keys on your platform:'),
            h('div', { style: { marginTop: 8 } },

              h('details', { style: { marginBottom: 6 } },
                h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0' } }, 'Localhost / VPS / Bare Metal'),
                h('div', { style: { padding: '8px 0 4px 12px', color: 'var(--text-secondary)' } },
                  h('p', { style: { margin: '0 0 4px' } }, 'Keys are already saved to your .env file automatically. No action needed.'),
                  h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' } }, '# Your .env file already contains these keys\ncat .env | grep -E "(JWT_SECRET|ENCRYPTION_KEY|TRANSPORT_ENCRYPTION_KEY)"')
                )
              ),

              h('details', { style: { marginBottom: 6 } },
                h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0' } }, 'fly.io'),
                h('div', { style: { padding: '8px 0 4px 12px', color: 'var(--text-secondary)' } },
                  h('p', { style: { margin: '0 0 4px' } }, 'Set as fly secrets (filesystem resets on each deploy):'),
                  h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' } },
                    Object.keys(generatedKeys).map(function(k) { return 'fly secrets set ' + k + '="' + generatedKeys[k] + '"'; }).join('\n')
                  )
                )
              ),

              h('details', { style: { marginBottom: 6 } },
                h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0' } }, 'Railway / Render / Heroku'),
                h('div', { style: { padding: '8px 0 4px 12px', color: 'var(--text-secondary)' } },
                  h('p', { style: { margin: '0 0 4px' } }, 'Add as environment variables in your platform dashboard:'),
                  h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' } },
                    '# Railway\nrailway variables set ' + Object.keys(generatedKeys).map(function(k) { return k + '="' + generatedKeys[k] + '"'; }).join(' ') + '\n\n# Or add in your platform\'s dashboard under Environment Variables'
                  )
                )
              ),

              h('details', { style: { marginBottom: 6 } },
                h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0' } }, 'Docker / Docker Compose'),
                h('div', { style: { padding: '8px 0 4px 12px', color: 'var(--text-secondary)' } },
                  h('p', { style: { margin: '0 0 4px' } }, 'Add to docker-compose.yml or pass with docker run:'),
                  h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' } },
                    '# docker-compose.yml\nservices:\n  agenticmail:\n    environment:\n' + Object.keys(generatedKeys).map(function(k) { return '      - ' + k + '=' + generatedKeys[k]; }).join('\n') + '\n\n# Or: docker run -e JWT_SECRET=... -e ENCRYPTION_KEY=... ...'
                  )
                )
              ),

              h('details', { style: { marginBottom: 6 } },
                h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0' } }, 'Cloudflare Workers / Pages'),
                h('div', { style: { padding: '8px 0 4px 12px', color: 'var(--text-secondary)' } },
                  h('p', { style: { margin: '0 0 4px' } }, 'Set as encrypted secrets:'),
                  h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' } },
                    Object.keys(generatedKeys).map(function(k) { return 'wrangler secret put ' + k; }).join('\n') + '\n# Then paste each key value when prompted'
                  )
                )
              ),

              h('details', { style: { marginBottom: 6 } },
                h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0' } }, 'AWS / GCP / Azure'),
                h('div', { style: { padding: '8px 0 4px 12px', color: 'var(--text-secondary)' } },
                  h('p', { style: { margin: '0 0 4px' } }, 'Use your cloud provider\'s secret manager or environment variable configuration:'),
                  h('pre', { style: { background: 'var(--bg-primary)', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' } },
                    '# AWS SSM Parameter Store\n' + Object.keys(generatedKeys).map(function(k) { return 'aws ssm put-parameter --name "/agenticmail/' + k + '" --value "' + generatedKeys[k] + '" --type SecureString'; }).join('\n') + '\n\n# Or set as environment variables in ECS/Lambda/App Runner config'
                  )
                )
              )
            )
          )
        ) : h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)' } },
          h('p', null, 'Security keys were already configured from a previous setup.'),
          h('p', { style: { fontSize: 12, marginTop: 8 } }, 'If you need to view your keys, check your .env file or platform environment variables.')
        ),

        errorBox,
        h('div', { className: 'onboarding-footer' },
          h('button', { className: 'btn btn-primary', onClick: function() { if (form.company && !form.customDomain) set('customDomain', form.company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.agenticmail.io'); setStep(4); } }, keysCopied || !generatedKeys ? 'Continue' : 'I\'ve Saved My Keys — Continue')
        )
      ),

      // ── Step 4: Email / SMTP ─────────────────────────
      step === 4 && h(Fragment, null,
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
            h('button', { className: 'btn btn-secondary', onClick: function() { setStep(3); } }, 'Back'),
            h('button', { className: 'onboarding-skip', onClick: function() { if (form.company && !form.customDomain) set('customDomain', form.company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.agenticmail.io'); setStep(5); } }, 'Skip for now')
          ),
          h('button', { className: 'btn btn-primary', disabled: loading || !form.smtpHost, onClick: doSmtp }, loading ? 'Saving...' : 'Continue')
        )
      ),

      // ── Step 5: Domain Registration ──────────────────
      step === 5 && h(Fragment, null,
        h('div', { className: 'step-title' }, 'Domain Registration'),
        h('div', { className: 'step-desc' }, 'Register a custom domain or claim your free agenticmail.io subdomain. This is required for cloud deployment.'),

        !form.domainRegistered && h(Fragment, null,
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Custom Domain'),
            h('input', { className: 'input', value: form.customDomain, onChange: function(e) { set('customDomain', e.target.value); }, placeholder: 'yourcompany.agenticmail.io', autoFocus: true })
          ),
          errorBox,
          h('div', { className: 'onboarding-footer' },
            h('div', { style: { display: 'flex', gap: 12 } },
              h('button', { className: 'btn btn-secondary', onClick: function() { setStep(4); } }, 'Back'),
              h('button', { className: 'onboarding-skip', onClick: function() { setStep(6); } }, 'Skip for now')
            ),
            h('button', { className: 'btn btn-primary', disabled: domainRegistering || !form.customDomain, onClick: doRegisterDomain }, domainRegistering ? 'Registering...' : 'Register Domain')
          )
        ),

        form.domainRegistered && !form.domainVerified && h(Fragment, null,
          h('div', { style: { background: 'var(--warning-bg, #fef3c7)', border: '1px solid var(--warning-border, #fbbf24)', borderRadius: 8, padding: 16, marginBottom: 16 } },
            h('div', { style: { fontWeight: 600, marginBottom: 8, fontSize: 14 } }, 'Save Your Deployment Key'),
            h('div', { style: { fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' } }, 'This key is shown only once. You will need it to recover your domain if you lose access to this server.'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('code', { style: { flex: 1, padding: '8px 12px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: 6, fontSize: 12, wordBreak: 'break-all', fontFamily: 'monospace' } }, form.deploymentKey),
              h('button', { className: 'btn btn-secondary', style: { fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }, onClick: function() { copyText(form.deploymentKey); } }, 'Copy')
            )
          ),
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
            h('button', { className: 'onboarding-skip', onClick: function() { setStep(6); } }, 'Skip verification for now'),
            h('button', { className: 'btn btn-primary', disabled: dnsChecking, onClick: doVerifyDns }, dnsChecking ? 'Checking...' : 'Verify DNS')
          )
        ),

        form.domainRegistered && form.domainVerified && h(Fragment, null,
          h('div', { style: { textAlign: 'center', padding: '24px 0' } },
            h('div', { style: { marginBottom: 12 } }, E.checkCircle(40)),
            h('div', { style: { fontSize: 16, fontWeight: 600 } }, 'Domain Verified'),
            h('div', { style: { color: 'var(--text-muted)', fontSize: 14, marginTop: 4 } }, form.customDomain + ' is now registered and verified.')
          ),
          h('div', { className: 'onboarding-footer' },
            h('div'),
            h('button', { className: 'btn btn-primary', onClick: function() { setStep(6); } }, 'Continue')
          )
        )
      ),

      // ── Step 6: First Agent ──────────────────────────
      step === 6 && h(Fragment, null,
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
            h('button', { className: 'btn btn-secondary', onClick: function() { setStep(5); } }, 'Back'),
            h('button', { className: 'onboarding-skip', onClick: function() { onComplete(); } }, 'Skip for now')
          ),
          h('button', { className: 'btn btn-primary', disabled: loading || !form.agentName, onClick: doCreateAgent }, loading ? 'Creating...' : 'Create & Finish')
        )
      )
    )
  );
}

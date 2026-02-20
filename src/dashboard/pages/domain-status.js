import { h, useState, useEffect, useCallback, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';

export function DomainStatusPage() {
  const { toast } = useApp();
  const [state, setState] = useState(window.__EM_DOMAIN_STATE__ || null);
  const [checking, setChecking] = useState(false);

  const checkVerification = useCallback(async () => {
    if (!state?.domain) return;
    setChecking(true);
    try {
      const r = await engineCall('/domain/verify', { method: 'POST', body: JSON.stringify({ domain: state.domain }) });
      if (r.verified) {
        setState(s => ({ ...s, status: 'verified', verifiedAt: new Date().toISOString() }));
        toast('Domain verified successfully!', 'success');
      } else {
        toast('DNS record not detected yet. Changes can take up to 48 hours.', 'warning');
      }
    } catch {
      toast('Could not check verification status', 'error');
    } finally {
      setChecking(false);
    }
  }, [state?.domain, toast]);

  // Unregistered / no domain state
  if (!state || !state.domain) {
    return h('div', { className: 'page-content' },
      h('div', { style: { maxWidth: 640, margin: '40px auto' } },
        h('div', { className: 'card', style: { textAlign: 'center', padding: 48 } },
          h('div', { style: { marginBottom: 20, opacity: 0.5 } }, I.shield()),
          h('h2', { style: { marginBottom: 8 } }, 'Domain Protection'),
          h('p', { style: { color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' } },
            'Domain registration locks your deployment to a specific domain, preventing unauthorized duplication. Register your domain during setup or using the CLI:'
          ),
          h('pre', { style: { marginTop: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 13, textAlign: 'left', overflow: 'auto' } },
            'npx @agenticmail/enterprise recover --domain your.domain.com'
          )
        )
      )
    );
  }

  // Verified state
  if (state.status === 'verified') {
    return h('div', { className: 'page-content' },
      h('div', { style: { maxWidth: 640, margin: '40px auto' } },
        h('div', { className: 'card', style: { padding: 32 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 } },
            h('div', { style: { width: 48, height: 48, borderRadius: '50%', background: 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 } }, I.shield()),
            h('div', null,
              h('h2', { style: { margin: 0 } }, 'Domain Verified'),
              h('p', { style: { margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 } }, 'Your deployment is protected')
            )
          ),
          h('div', { style: { display: 'grid', gap: 16 } },
            infoRow('Domain', state.domain),
            infoRow('Status', h('span', { style: { color: 'var(--success)', fontWeight: 600 } }, 'Verified')),
            state.verifiedAt && infoRow('Verified', new Date(state.verifiedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
          ),
          h('div', { style: { marginTop: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 } },
            'This domain is locked to your deployment. No other AgenticMail Enterprise instance can claim it. Your system operates fully offline — no outbound calls are made after verification.'
          )
        )
      )
    );
  }

  // Pending DNS state
  return h('div', { className: 'page-content' },
    h('div', { style: { maxWidth: 640, margin: '40px auto' } },
      h('div', { className: 'card', style: { padding: 32 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 } },
          h('div', { style: { width: 48, height: 48, borderRadius: '50%', background: 'var(--warning-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)', flexShrink: 0 } }, I.shield()),
          h('div', null,
            h('h2', { style: { margin: 0 } }, 'DNS Verification Pending'),
            h('p', { style: { margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 } }, 'Add the TXT record below to verify ownership')
          )
        ),

        h('div', { style: { padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: 20 } },
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 } }, 'DNS Record to Add'),
          dnsRow('Host', '_agenticmail-verify.' + state.domain),
          dnsRow('Type', 'TXT'),
          state.dnsChallenge
            ? dnsRow('Value', state.dnsChallenge)
            : dnsRow('Value', '(check your setup records or CLI output)')
        ),

        h('div', { style: { display: 'grid', gap: 16, marginBottom: 24 } },
          infoRow('Domain', state.domain),
          infoRow('Status', h('span', { style: { color: 'var(--warning)', fontWeight: 600 } }, 'Pending DNS Verification'))
        ),

        h('div', { style: { display: 'flex', gap: 12 } },
          h('button', { className: 'btn btn-primary', onClick: checkVerification, disabled: checking },
            checking ? 'Checking...' : 'Check DNS Now'
          )
        ),

        h('div', { style: { marginTop: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 } },
          'DNS changes can take up to 48 hours to propagate. You can also verify from the CLI: ',
          h('code', { style: { fontSize: 12 } }, 'npx @agenticmail/enterprise verify-domain')
        )
      )
    )
  );
}

function infoRow(label, value) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
    h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, label),
    h('span', { style: { fontSize: 14 } }, value)
  );
}

function dnsRow(label, value) {
  return h('div', { style: { display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 8 } },
    h('span', { style: { fontWeight: 600, fontSize: 13, minWidth: 48, color: 'var(--text-secondary)' } }, label),
    h('code', { style: { fontSize: 13, wordBreak: 'break-all', color: 'var(--primary)' } }, value)
  );
}

import { h } from './utils.js';

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, errorInfo) { this.setState({ errorInfo }); console.error('[ErrorBoundary]', error, errorInfo); }
  render() {
    if (this.state.error) {
      return h('div', { style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font)' } },
        h('div', { style: { textAlign: 'center', maxWidth: 480, padding: 24 } },
          h('div', { style: { fontSize: 48, marginBottom: 16 } }, '\u26A0\uFE0F'),
          h('h1', { style: { fontSize: 20, fontWeight: 700, marginBottom: 8 } }, 'Something went wrong'),
          h('p', { style: { color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 } }, 'An unexpected error occurred in the dashboard. Try reloading the page.'),
          h('pre', { style: { textAlign: 'left', fontSize: 11, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 160, marginBottom: 20, color: 'var(--danger)' } }, String(this.state.error)),
          h('button', { onClick: () => window.location.reload(), style: { padding: '10px 24px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600 } }, 'Reload Page')
        )
      );
    }
    return this.props.children;
  }
}

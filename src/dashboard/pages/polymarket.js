import { h, useState, useEffect, Fragment, useApp, apiCall, engineCall, showConfirm, getOrgId } from '../components/utils.js';
import { I as Icons } from '../components/icons.js';
var iconMap = { 'trending-up': 'activity', 'refresh-cw': 'refresh', 'play': 'play', 'pause': 'pause', 'check': 'check', 'x': 'x', 'edit': 'settings', 'link': 'link', 'message-circle': 'messages', 'calendar': 'calendar', 'trash-2': 'trash', 'zap': 'warning', 'git-branch': 'link', 'shuffle': 'refresh', 'activity': 'activity', 'crosshair': 'search', 'layers': 'folder', 'shield': 'shield', 'log-out': 'logout', 'pie-chart': 'dashboard', 'trending-down': 'activity', 'brain': 'brain', 'key': 'key', 'globe': 'globe', 'eye': 'eye', 'chart': 'chart', 'clock': 'clock', 'database': 'database' };
function I(name) { var k = iconMap[name] || name; var fn = Icons[k]; return fn ? fn() : ''; }
import { HelpButton } from '../components/help-button.js';
import { Modal } from '../components/modal.js';
import { useOrgContext } from '../components/org-switcher.js';

var CHART_COLORS = ['#6366f1', '#10b981', '#b45309', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

export function PolymarketPage() {
  var orgCtx = useOrgContext();
  var clientOrgFilter = orgCtx.selectedOrgId || '';
  const { toast } = useApp();
  const [tab, setTab] = useState('wallet');
  const [proxyStatus, setProxyStatus] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [config, setConfig] = useState(null);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [paperPositions, setPaperPositions] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveResult, setArchiveResult] = useState(null);
  const [showArchive, setShowArchive] = useState({});
  const [editConfig, setEditConfig] = useState(null);
  // Tooltip
  const [tooltip, setTooltip] = useState(null);
  // Learning
  const [predictions, setPredictions] = useState([]);
  const [calibration, setCalibration] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [predFilter, setPredFilter] = useState('all');
  // New sections
  const [whales, setWhales] = useState([]);
  const [socialSignals, setSocialSignals] = useState([]);
  const [events, setEvents] = useState([]);
  const [newsAlerts, setNewsAlerts] = useState([]);
  const [correlations, setCorrelations] = useState([]);
  const [arbitrage, setArbitrage] = useState([]);
  const [regimes, setRegimes] = useState([]);
  const [snipers, setSnipers] = useState([]);
  const [scaleOrders, setScaleOrders] = useState([]);
  const [hedges, setHedges] = useState([]);
  const [exitRules, setExitRules] = useState([]);
  const [drawdown, setDrawdown] = useState(null);
  const [pnlAttrib, setPnlAttrib] = useState(null);
  // Header chart — real-time price history from SSE
  const [pnlTimeline, setPnlTimeline] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]); // [{ts, positions: [{token_id, market, current, pnl, side, entry, size}], totalPnl}]
  // Detail modals
  const [selectedPaper, setSelectedPaper] = useState(null);
  // Wallet
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  // Live prices
  const [livePrices, setLivePrices] = useState(null);
  const [livePositions, setLivePositions] = useState([]);
  // Table controls (search, filters, pagination) per tab
  const [tc, setTc] = useState({});
  // Universal detail modal
  const [selectedRow, setSelectedRow] = useState(null);
  // Watchers / Automation
  const [watchers, setWatchers] = useState([]);
  const [watcherEvents, setWatcherEvents] = useState([]);
  const [engineStatus, setEngineStatus] = useState(null);
  const [watcherAIConfig, setWatcherAIConfig] = useState(null);
  // Org providers + models for AI config
  const [orgProviders, setOrgProviders] = useState([]);
  const [aiModels, setAiModels] = useState([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiUseOrgKey, setAiUseOrgKey] = useState(true);
  const [aiCustomKey, setAiCustomKey] = useState('');
  const [aiBudget, setAiBudget] = useState(100);
  const [aiMaxSpawns, setAiMaxSpawns] = useState(6);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [exportedKey, setExportedKey] = useState(null);
  const [whitelist, setWhitelist] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [goals, setGoals] = useState([]);
  const [goalEval, setGoalEval] = useState(null);
  const [dailyScorecard, setDailyScorecard] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [goalDetail, setGoalDetail] = useState(null);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txPage, setTxPage] = useState(1);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txFilter, setTxFilter] = useState('all');
  const [txSearch, setTxSearch] = useState('');
  const [addrForm, setAddrForm] = useState({ label: '', address: '', per_tx_limit: 100, daily_limit: 500, cooling_hours: 24 });
  const [showImportWallet, setShowImportWallet] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [walletSetupTab, setWalletSetupTab] = useState('create');
  const [apiCredsForm, setApiCredsForm] = useState({ api_key: '', api_secret: '', api_passphrase: '', wallet_address: '' });
  const [createdWallet, setCreatedWallet] = useState(null);
  const [walletSetupLoading, setWalletSetupLoading] = useState(false);
  // Manual trading
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buySearch, setBuySearch] = useState('');
  const [buyResults, setBuyResults] = useState([]);
  const [buySearching, setBuySearching] = useState(false);
  const [buySelected, setBuySelected] = useState(null); // { market, tokenIndex, outcome }
  const [buySize, setBuySize] = useState('10');
  const [buyExecuting, setBuyExecuting] = useState(false);
  const [buyConfirm, setBuyConfirm] = useState(false); // show purchase confirmation modal
  const [sellExecuting, setSellExecuting] = useState(null); // token_id being sold
  const [redeemExecuting, setRedeemExecuting] = useState(null); // conditionId being redeemed
  // Transfer with 2FA/PIN
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferUnlocked, setTransferUnlocked] = useState(false);
  const [transferUnlockExpiry, setTransferUnlockExpiry] = useState(null);
  const [transferForm, setTransferForm] = useState({ to_address: '', amount: '', token: 'USDC.e', reason: '' });
  const [transferVerifyStep, setTransferVerifyStep] = useState('locked'); // 'locked' | '2fa' | 'pin' | 'setup_pin' | 'unlocked'
  const [transferCode, setTransferCode] = useState('');
  const [transferPinSetup, setTransferPinSetup] = useState({ pin: '', confirm: '' });
  const [transferLoading, setTransferLoading] = useState(false);
  const [walletSecurity, setWalletSecurity] = useState(null); // { has2fa, hasPin, pinEnabled }
  // Swap modal state
  const [swapModal, setSwapModal] = useState(null); // null | { direction, maxAmount, label }
  const [swapAmount, setSwapAmount] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapCountdown, setSwapCountdown] = useState(0);

  // Countdown timer during swap
  useEffect(function() {
    if (swapCountdown <= 0) return;
    var t = setTimeout(function() { setSwapCountdown(swapCountdown - 1); }, 1000);
    return function() { clearTimeout(t); };
  }, [swapCountdown]);

  var showTip = function(e, lines) { setTooltip({ x: e.clientX, y: e.clientY, lines: lines }); };
  var hideTip = function() { setTooltip(null); };
  var renderTooltip = function() {
    if (!tooltip || !tooltip.lines || tooltip.lines.length === 0) return null;
    var nearRight = tooltip.x > (window.innerWidth - 300);
    var posStyle = nearRight ? { right: (window.innerWidth - tooltip.x + 12) } : { left: tooltip.x + 12 };
    return h('div', { style: Object.assign({ position: 'fixed', top: tooltip.y - 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--text)', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', pointerEvents: 'none', zIndex: 99999, minHeight: 32, minWidth: 100, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'break-word' }, posStyle) },
      tooltip.lines.map(function(l, i) {
        return h('div', { key: i, style: l.bold ? { fontWeight: 600, marginBottom: 2 } : l.color ? { color: l.color } : {} },
          l.dot ? h('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: l.dot, marginRight: 6 } }) : null,
          l.text
        );
      })
    );
  };
  var _fmtDate = function(raw) {
    if (!raw) return '';
    var d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Outcome badge — works for YES/NO and multi-outcome (Trump, Biden, etc)
  var resolveOutcome = function(side, outcome) {
    if (outcome && outcome !== 'buy' && outcome !== 'sell') return outcome;
    var s = (side || '').toLowerCase();
    if (s === 'buy') return 'YES';
    if (s === 'sell') return 'NO';
    return side || '?';
  };
  var outcomeBadge = function(oc) {
    var isYes = oc === 'YES', isNo = oc === 'NO';
    var bg = isYes ? 'rgba(16,185,129,0.15)' : isNo ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)';
    var color = isYes ? '#10b981' : isNo ? '#ef4444' : '#6366f1';
    return h('span', { style: { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color: color } }, oc);
  };

  var POLY_SKILLS = ['polymarket', 'polymarket-quant', 'polymarket-onchain', 'polymarket-social',
    'polymarket-feeds', 'polymarket-analytics', 'polymarket-execution', 'polymarket-counterintel', 'polymarket-portfolio'];

  const loadProxyStatus = async () => {
    try { const s = await apiCall('/polymarket/proxy/status'); setProxyStatus(s); } catch { setProxyStatus(null); }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      loadProxyStatus();
      const d = await apiCall('/polymarket/dashboard' + (clientOrgFilter ? '?orgId=' + clientOrgFilter : ''));
      setDashboard(d);
      var engineOrgId = clientOrgFilter || getOrgId();
      const a = await engineCall('/agents?orgId=' + engineOrgId);
      var allAgents = a.agents || [];
      var polyAgents = allAgents.filter(function(ag) {
        var cfg = ag.config || {};
        var skills = cfg.skills || ag.skills || [];
        var template = cfg.soulTemplate || cfg.soul_template || ag.soul_template || '';
        var permProfile = cfg.permissionProfile || '';
        return skills.some(function(s) { return POLY_SKILLS.indexOf(s) !== -1; })
          || template.toLowerCase().indexOf('polymarket') !== -1
          || permProfile.toLowerCase().indexOf('polymarket') !== -1;
      });
      setAgents(polyAgents);
      if (polyAgents.length > 0 && !selectedAgent) setSelectedAgent(polyAgents[0].id);
    } catch (e) {
      setDashboard({ configs: [], wallets: [], pendingTrades: [], dailyCounters: [] });
    } finally { setLoading(false); }
  };

  // ─── Manual Trading Functions ───
  const [sellModal, setSellModal] = useState(null); // position being sold
  const [sellShares, setSellShares] = useState('');
  const [targetModal, setTargetModal] = useState(null); // { value: '10', saving: false }
  const [targetModalValue, setTargetModalValue] = useState('');

  var openTargetModal = function() {
    var currentTarget = dailyScorecard?.daily_target || 10;
    setTargetModalValue(String(currentTarget));
    setTargetModal({ saving: false });
  };

  var saveTarget = async function() {
    var val = parseFloat(targetModalValue);
    if (isNaN(val) || val <= 0) { toast('Enter a valid target amount', 'error'); return; }
    setTargetModal({ saving: true });
    try {
      var existingGoal = goals.find(function(g) { return g.type === 'daily_pnl_usd' && g.enabled; });
      if (existingGoal) {
        await apiCall('/polymarket/' + selectedAgent + '/goals/' + existingGoal.id, { method: 'PUT', body: JSON.stringify({ target_value: val }) });
      } else {
        await apiCall('/polymarket/' + selectedAgent + '/goals', { method: 'POST', body: JSON.stringify({ name: 'Daily P&L Target', type: 'daily_pnl_usd', target_value: val, notify_on_met: true }) });
      }
      toast('Daily target set to $' + val, 'success');
      setTargetModal(null);
      loadAgentData(selectedAgent);
    } catch (e) {
      toast(e.message || 'Failed to save target', 'error');
      setTargetModal({ saving: false });
    }
  };

  var renderTargetModal = function() {
    if (!targetModal) return null;
    return h('div', { className: 'modal-overlay', onClick: function() { if (!targetModal.saving) setTargetModal(null); } },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 420, padding: 0, borderRadius: 14 } },
        h('div', { style: { padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              h('div', { style: { width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 } }, I('trending-up')),
              h('div', null,
                h('div', { style: { fontWeight: 700, fontSize: 16 } }, 'Set Daily P&L Target'),
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, 'Set your daily profit goal')
              )
            ),
            h('button', { style: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }, onClick: function() { setTargetModal(null); } }, '\u00d7')
          )
        ),
        h('div', { style: { padding: '20px 24px 24px' } },
          h('label', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' } }, 'Target amount (USD)'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 } },
            h('span', { style: { fontSize: 20, fontWeight: 700, color: 'var(--text-muted)' } }, '$'),
            h('input', {
              type: 'number', min: '0.01', step: '0.01',
              value: targetModalValue,
              onChange: function(e) { setTargetModalValue(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') saveTarget(); },
              autoFocus: true,
              style: { flex: 1, padding: '10px 14px', fontSize: 18, fontWeight: 600, border: '2px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' },
              placeholder: '10.00'
            })
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 } },
            'The agent will track progress toward this target throughout the day. ',
            'Status updates: TARGET_HIT (100%+), AHEAD (70%+), ON_TRACK, BEHIND (<30%).'
          ),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            h('button', { className: 'btn btn-secondary', onClick: function() { setTargetModal(null); }, disabled: targetModal.saving }, 'Cancel'),
            h('button', { className: 'btn btn-success', onClick: saveTarget, disabled: targetModal.saving, style: { minWidth: 100 } },
              targetModal.saving ? 'Saving...' : 'Set Target'
            )
          )
        )
      )
    );
  };

  var openSellModal = function(position) {
    setSellModal(position);
    setSellShares(position.size.toFixed(1));
  };

  var executeSell = async function() {
    if (!sellModal) return;
    var size = parseFloat(sellShares);
    if (isNaN(size) || size < 1) { toast('Minimum 1 share', 'error'); return; }
    if (size > sellModal.size) { toast('Cannot sell more than ' + sellModal.size.toFixed(1) + ' shares', 'error'); return; }
    setSellExecuting(sellModal.token_id);
    try {
      var resp = await apiCall('/polymarket/' + selectedAgent + '/manual-trade', {
        method: 'POST', body: JSON.stringify({
          token_id: sellModal.token_id, side: 'SELL', size: size,
          market_question: sellModal.market || '', outcome: sellModal.outcome || ''
        })
      });
      if (resp.error) { toast('Sell failed: ' + resp.error, 'error'); }
      else { toast('Sell order placed!', 'success'); setSellModal(null); hideTip(); loadAgentData(selectedAgent); }
    } catch (e) { toast('Sell failed: ' + e.message, 'error'); }
    setSellExecuting(null);
  };

  var executeRedeem = async function(position) {
    if (!position?.conditionId) { toast('No condition ID for redemption', 'error'); return; }
    if (!confirm('Redeem winnings for "' + (position.market || 'this position') + '"?\n\nThis will claim your winning tokens on-chain.')) return;
    setRedeemExecuting(position.conditionId);
    try {
      var resp = await apiCall('/polymarket/' + selectedAgent + '/wallet/redeem', {
        method: 'POST', body: JSON.stringify({ condition_id: position.conditionId })
      });
      if (resp.error) { toast('Redeem failed: ' + resp.error, 'error'); }
      else if (resp.ok) {
        var msg = 'Redeemed ' + (resp.redeemed || 0) + ' position(s)';
        if (resp.total_profit) msg += ' — Profit: $' + resp.total_profit.toFixed(2);
        if (resp.failed > 0) msg += ' (' + resp.failed + ' failed)';
        toast(msg, 'success');
        loadAgentData(selectedAgent);
      } else { toast('Redeem returned unexpected response', 'error'); }
    } catch (e) { toast('Redeem failed: ' + e.message, 'error'); }
    setRedeemExecuting(null);
  };

  var executeRedeemAll = async function() {
    if (!confirm('Redeem ALL winning positions?\n\nThis will claim all redeemable tokens on-chain.')) return;
    setRedeemExecuting('all');
    try {
      var resp = await apiCall('/polymarket/' + selectedAgent + '/wallet/redeem', {
        method: 'POST', body: JSON.stringify({})
      });
      if (resp.error) { toast('Redeem failed: ' + resp.error, 'error'); }
      else if (resp.ok) {
        var msg = 'Redeemed ' + (resp.redeemed || 0) + ' position(s)';
        if (resp.total_value) msg += ' — Value: $' + resp.total_value.toFixed(2);
        if (resp.total_profit) msg += ', Profit: $' + resp.total_profit.toFixed(2);
        if (resp.failed > 0) msg += ' (' + resp.failed + ' failed)';
        toast(msg, resp.failed > 0 ? 'warning' : 'success');
        loadAgentData(selectedAgent);
      } else { toast('Nothing to redeem', 'info'); }
    } catch (e) { toast('Redeem all failed: ' + e.message, 'error'); }
    setRedeemExecuting(null);
  };

  var renderSellModal = function() {
    if (!sellModal) return null;
    var p = sellModal;
    var shares = parseFloat(sellShares) || 0;
    var pnl = (p.current - p.entry) * shares;
    var pnlPct = p.entry > 0 ? ((p.current - p.entry) / p.entry * 100) : 0;
    var proceeds = p.current * shares;
    var cost = p.entry * shares;
    var isProfit = pnlPct >= 0;
    var accentColor = isProfit ? '#10b981' : '#ef4444';
    var accentBg = isProfit ? 'rgba(16,185,129,' : 'rgba(239,68,68,';
    var ocColor = (p.outcome || '').toLowerCase() === 'yes' ? '#10b981' : '#ef4444';

    return h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setSellModal(null); hideTip(); } },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 560, maxHeight: '90vh', overflow: 'auto', padding: 0, borderRadius: 14 } },
        // Header with gradient
        h('div', { style: { padding: '22px 28px 18px', background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))', borderBottom: '1px solid var(--border)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
              h('div', { style: { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 } }, I('trending-down')),
              h('div', null,
                h('div', { style: { fontWeight: 700, fontSize: 17 } }, 'Sell Position'),
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, 'Close or reduce your position')
              )
            ),
            h('button', { style: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }, onClick: function() { setSellModal(null); hideTip(); } }, '\u00d7')
          )
        ),

        h('div', { style: { padding: '20px 28px 24px' } },
          // Market card
          h('div', { style: { padding: '16px 18px', background: 'var(--bg-secondary)', borderRadius: 10, marginBottom: 20, border: '1px solid var(--border)' } },
            h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 10, lineHeight: 1.4 } }, p.market || 'Unknown Market'),
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              h('span', { style: { padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: ocColor + '15', color: ocColor, border: '1px solid ' + ocColor + '30' } }, p.outcome || '--'),
              h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, p.size.toFixed(1) + ' shares'),
              h('span', { style: { fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' } }, 'Token: ' + (p.token_id || '').slice(0, 12) + '...')
            )
          ),

          // Price cards row
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 } },
            // Entry
            h('div', { style: { padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' } },
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 } }, 'Entry Price'),
              h('div', { style: { fontSize: 26, fontWeight: 800, letterSpacing: -0.5 } }, (p.entry * 100).toFixed(1) + '\u00a2'),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Cost basis: $' + (p.entry * p.size).toFixed(2))
            ),
            // Current
            h('div', { style: { padding: '14px 16px', background: accentBg + '0.06)', borderRadius: 10, border: '1px solid ' + accentBg + '0.2)' } },
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 } },
                p.resolved ? (p.current >= 0.99 ? 'RESOLVED \u2014 WON' : 'RESOLVED \u2014 LOST') : 'Current Price'
              ),
              h('div', { style: { fontSize: 26, fontWeight: 800, color: accentColor, letterSpacing: -0.5 } },
                p.resolved && p.current >= 0.99 ? '100.0\u00a2' : p.resolved && p.current <= 0.01 ? '0.0\u00a2' : (p.current * 100).toFixed(1) + '\u00a2'
              ),
              h('div', { style: { fontSize: 11, color: accentColor, marginTop: 2, fontWeight: 600 } },
                p.redeemable ? '\u2728 Redeemable \u2014 Claim your winnings!' : (isProfit ? '\u25b2 +' : '\u25bc ') + Math.abs(pnlPct).toFixed(1) + '% from entry'
              )
            )
          ),

          // P&L Banner
          h('div', { style: { padding: '14px 18px', borderRadius: 10, marginBottom: 20, background: accentBg + '0.08)', border: '1px solid ' + accentBg + '0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', null,
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 } }, p.resolved ? (isProfit ? 'Realized Profit' : 'Realized Loss') : (isProfit ? 'Unrealized Profit' : 'Unrealized Loss')),
              h('div', { style: { fontSize: 28, fontWeight: 800, color: accentColor, letterSpacing: -0.5 } }, (isProfit ? '+' : '') + '$' + pnl.toFixed(2))
            ),
            h('div', { style: { padding: '8px 16px', borderRadius: 8, background: accentBg + '0.15)', textAlign: 'center' } },
              h('div', { style: { fontSize: 20, fontWeight: 800, color: accentColor } }, (isProfit ? '+' : '') + pnlPct.toFixed(1) + '%'),
              h('div', { style: { fontSize: 10, color: accentColor, fontWeight: 600 } }, 'RETURN')
            )
          ),

          // Shares input section
          h('div', { style: { marginBottom: 20 } },
            h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('span', null, 'Shares to Sell'),
              h('span', { style: { fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' } }, 'Available: ' + p.size.toFixed(1))
            ),
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              h('input', { type: 'number', value: sellShares, min: 1, max: p.size, step: 0.1,
                style: { width: 120, fontSize: 18, fontWeight: 700, textAlign: 'center', padding: '10px 14px', borderRadius: 10, background: accentBg + '0.08)', border: '1px solid ' + accentBg + '0.25)', color: accentColor, outline: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield' },
                onChange: function(e) { setSellShares(e.target.value); }
              }),
              h('div', { style: { display: 'flex', gap: 6, flex: 1 } },
                h('button', { style: { flex: 1, borderRadius: 8, padding: '8px 0', background: accentBg + '0.08)', border: '1px solid ' + accentBg + '0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 12, color: accentColor }, onClick: function() { setSellShares((p.size * 0.25).toFixed(1)); } }, '25%'),
                h('button', { style: { flex: 1, borderRadius: 8, padding: '8px 0', background: accentBg + '0.08)', border: '1px solid ' + accentBg + '0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 12, color: accentColor }, onClick: function() { setSellShares((p.size * 0.5).toFixed(1)); } }, '50%'),
                h('button', { style: { flex: 1, borderRadius: 8, padding: '8px 0', background: accentBg + '0.08)', border: '1px solid ' + accentBg + '0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 12, color: accentColor }, onClick: function() { setSellShares((p.size * 0.75).toFixed(1)); } }, '75%'),
                h('button', { style: { flex: 1, borderRadius: 8, padding: '8px 0', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }, onClick: function() { setSellShares(p.size.toFixed(1)); } }, 'Max')
              )
            )
          ),

          // Order summary
          h('div', { style: { padding: '14px 18px', background: 'var(--bg-secondary)', borderRadius: 10, marginBottom: 20, border: '1px solid var(--border)' } },
            h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 } }, 'Order Summary'),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 } },
              h('span', { style: { color: 'var(--text-muted)' } }, 'Selling'),
              h('span', { style: { fontWeight: 600 } }, shares.toFixed(1) + ' shares @ ' + (p.current * 100).toFixed(1) + '\u00a2')
            ),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 } },
              h('span', { style: { color: 'var(--text-muted)' } }, 'Original Cost'),
              h('span', null, '$' + cost.toFixed(2))
            ),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 } },
              h('span', { style: { color: 'var(--text-muted)' } }, isProfit ? 'Realized Profit' : 'Realized Loss'),
              h('span', { style: { fontWeight: 600, color: accentColor } }, (isProfit ? '+' : '') + '$' + pnl.toFixed(2))
            ),
            h('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14 } },
              h('span', { style: { fontWeight: 700 } }, 'Est. Proceeds'),
              h('span', { style: { fontWeight: 800, fontSize: 16 } }, '$' + proceeds.toFixed(2) + ' USDC')
            )
          ),

          // Action buttons
          h('div', { style: { display: 'flex', gap: 10 } },
            h('button', { style: { flex: 1, padding: '12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text)' }, onClick: function() { setSellModal(null); hideTip(); } }, 'Cancel'),
            h('button', { disabled: sellExecuting,
              style: { flex: 2, padding: '12px', borderRadius: 10, background: sellExecuting ? '#9ca3af' : 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', cursor: sellExecuting ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: sellExecuting ? 'none' : '0 4px 12px rgba(239,68,68,0.3)' },
              onClick: executeSell
            }, sellExecuting ? 'Executing Sale...' : [I('trending-down'), ' Sell ' + shares.toFixed(1) + ' Shares'])
          )
        )
      )
    );
  };

  var searchMarkets = async function(query) {
    if (!query || query.length < 2) { setBuyResults([]); return; }
    setBuySearching(true);
    try {
      var resp = await apiCall('/polymarket/markets/search?q=' + encodeURIComponent(query) + '&agentId=' + (selectedAgent || ''));
      setBuyResults(resp.markets || []);
    } catch { setBuyResults([]); }
    setBuySearching(false);
  };

  var executeBuy = async function() {
    if (!buySelected || !buySize) return;
    var size = parseFloat(buySize);
    if (isNaN(size) || size < 5) { toast('Minimum 5 shares', 'error'); return; }
    setBuyExecuting(true);
    try {
      var resp = await apiCall('/polymarket/' + selectedAgent + '/manual-trade', {
        method: 'POST', body: JSON.stringify({
          token_id: buySelected.token_id, side: 'BUY', size: size,
          market_question: buySelected.question || '', outcome: buySelected.outcome || ''
        })
      });
      if (resp.error) { toast('Buy failed: ' + resp.error, 'error'); }
      else { toast('Buy order placed!', 'success'); setShowBuyModal(false); hideTip(); setBuySelected(null); setBuySearch(''); setBuyResults([]); setBuyConfirm(false); hideTip(); loadAgentData(selectedAgent); }
    } catch (e) { toast('Buy failed: ' + e.message, 'error'); }
    setBuyExecuting(false);
  };

  var fmtCompact = function(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return Math.round(n).toLocaleString();
    return n.toFixed(0);
  };

  var actionColor = function(action) {
    if (action?.startsWith('buy')) return '#10b981';
    if (action === 'sell') return '#ef4444';
    return '#6b7280';
  };
  var scoreColor = function(score) {
    if (score >= 70) return '#10b981';
    if (score >= 50) return '#3b82f6';
    if (score >= 30) return '#b45309';
    return '#6b7280';
  };
  var liquidityGrade = function(m) {
    var s = m.scores || {};
    var liq = s.liquidity || 0;
    if (liq >= 20 && s.spread >= 10) return { grade: 'A', color: '#10b981', label: 'Excellent' };
    if (liq >= 15) return { grade: 'B', color: '#3b82f6', label: 'Good' };
    if (liq >= 8) return { grade: 'C', color: '#b45309', label: 'Fair' };
    return { grade: 'D', color: '#ef4444', label: 'Thin' };
  };
  var scoreBar = function(label, value, max) {
    var pct = Math.min(100, (value / (max || 25)) * 100);
    var clr = value >= max * 0.7 ? '#10b981' : value >= max * 0.4 ? '#3b82f6' : value >= max * 0.2 ? '#b45309' : '#6b7280';
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 4 } },
      h('span', { style: { width: 60, color: 'var(--text-muted)', fontWeight: 500 } }, label),
      h('div', { style: { flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' } },
        h('div', { style: { width: pct + '%', height: '100%', background: clr, borderRadius: 3, transition: 'width 0.3s' } })
      ),
      h('span', { style: { width: 24, textAlign: 'right', fontWeight: 600, color: clr } }, value.toFixed(0))
    );
  };

  var renderBuyModal = function() {
    if (!showBuyModal) return null;
    // If buyConfirm is true and we have a selection, show the purchase modal instead
    if (buyConfirm && buySelected) return null;
    return h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowBuyModal(false); hideTip(); setBuySelected(null); } },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 780, maxHeight: '90vh', overflow: 'auto', padding: 0 } },
        // Header
        h('div', { style: { padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { style: { width: 36, height: 36, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 16 } }, I('search')),
            h('div', null,
              h('div', { style: { fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 } }, 'Find & Buy Markets',
                h(HelpButton, { label: 'Find & Buy Markets' },
                  h('p', null, 'Search prediction markets and place buy orders directly from the dashboard.'),
                  h('p', null, h('strong', null, 'Score'), ' \u2014 Composite rating (0-120) based on 6 quantitative dimensions: liquidity, volume, spread, edge, timing, and momentum. Higher is better.'),
                  h('p', null, h('strong', null, 'Liquidity Grade'), ' \u2014 A (excellent) to D (poor). Measures how easily you can enter/exit a position without price slippage.'),
                  h('p', null, h('strong', null, 'BUY YES/NO'), ' \u2014 Screener-recommended side based on orderbook imbalance, spread analysis, and price edge. "WATCH" means no strong signal.'),
                  h('p', null, h('strong', null, 'Outcome Buttons'), ' \u2014 Click Yes or No to open the buy confirmation. Price shown is the current midpoint.'),
                  h('p', null, h('strong', null, 'Hover'), ' \u2014 Hover over the score circle for full breakdown, or outcome buttons for bid/ask spread and entry targets.'),
                  h('p', null, h('strong', null, 'View'), ' \u2014 Opens the market on Polymarket.com in a new tab for additional research.'),
                  h('p', null, h('strong', null, 'Balance Check'), ' \u2014 Orders are validated against your wallet\'s available USDC before execution. Minimum order size is 5 shares.')
                )
              ),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Multi-signal scored with orderbook depth')
            )
          ),
          h('button', { style: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }, onClick: function() { setShowBuyModal(false); hideTip(); setBuySelected(null); } }, '\u00d7')
        ),
        // Search bar
        h('div', { style: { padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' } },
          h('div', { style: { display: 'flex', gap: 8 } },
            h('input', { type: 'text', placeholder: 'Search markets... (e.g. "Trump", "Bitcoin $100K", "NFL Super Bowl")',
              value: buySearch, style: { flex: 1, fontSize: 14, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' },
              onChange: function(e) { setBuySearch(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') searchMarkets(buySearch); }
            }),
            h('button', { disabled: buySearching, style: { minWidth: 110, fontSize: 13, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', cursor: buySearching ? 'wait' : 'pointer', fontWeight: 600 },
              onClick: function() { searchMarkets(buySearch); }
            }, buySearching ? 'Searching...' : 'Search')
          ),
          buySearching && h('div', { style: { marginTop: 10, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 1s infinite' } }),
            'Fetching markets and analyzing orderbooks...'
          )
        ),
        // Results
        h('div', { style: { padding: '16px 24px', maxHeight: 'calc(90vh - 200px)', overflow: 'auto' } },
          !buySearching && buyResults.length === 0 && h('div', { style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' } },
            h('div', { style: { fontSize: 40, marginBottom: 12, opacity: 0.3 } }, '\ud83d\udd0d'),
            h('div', { style: { fontSize: 14, marginBottom: 4 } }, 'Search for prediction markets'),
            h('div', { style: { fontSize: 12 } }, 'Results ranked by liquidity, volume, spread, edge, timing, and momentum')
          ),
          // Summary bar
          buyResults.length > 0 && h('div', { style: { marginBottom: 14, padding: '8px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' } },
            h('span', null, 'Showing ' + buyResults.length + ' active markets'),
            h('span', null, 'Ranked by composite score')
          ),
          buyResults.map(function(m, mi) {
            var liq = liquidityGrade(m);
            var sc = m.scores || {};
            var an = m.analysis || {};
            var rec = m.recommendation || {};
            var pl = m.pipeline || {};
            var totalScore = sc.total || 0;
            var isExpanded = buySelected?.market_id === m.id;
            var recAction = rec.action || 'watch';
            var isActionable = recAction.startsWith('buy');
            var compositeSignal = pl.action || '';
            var compColor = compositeSignal.includes('BUY') ? '#10b981' : compositeSignal.includes('SELL') ? '#ef4444' : compositeSignal === 'AVOID' ? '#ef4444' : '#6b7280';

            var polyUrl = m.slug ? 'https://polymarket.com/event/' + m.slug : 'https://polymarket.com';

            return h('div', { key: m.id, style: { marginBottom: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', overflow: 'hidden' } },
              // Compact card: score | question + tags | outcomes | actions
              h('div', { style: { padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' } },
                // Score circle (smaller)
                h('div', { style: { width: 38, height: 38, borderRadius: 10, background: scoreColor(totalScore) + '15', border: '2px solid ' + scoreColor(totalScore) + '40', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'help' },
                  onMouseEnter: function(e) { var tips = [
                    'Screener: ' + totalScore.toFixed(0) + '/120 \u2022 Liq ' + (sc.liquidity||0) + ' \u2022 Vol ' + (sc.volume||0) + ' \u2022 Spread ' + (sc.spread||0) + ' \u2022 Edge ' + (sc.edge||0),
                  ];
                  if (pl.action) tips.push('Signal: ' + pl.action + (pl.score ? ' (score ' + pl.score + '/100)' : ''));
                  if (pl.kelly) tips.push('Kelly: edge ' + (pl.kelly.edge||0) + '%, half-Kelly $' + (pl.kelly.half_kelly_size||0).toFixed(1));
                  if (pl.regime) tips.push('Regime: ' + pl.regime);
                  if (pl.smart_money != null) tips.push('Smart Money: ' + pl.smart_money.toFixed(2));
                  if (pl.manipulation_risk && pl.manipulation_risk !== 'LOW') tips.push('\u26a0 Manipulation: ' + pl.manipulation_risk);
                  if (pl.thesis) tips.push('---', pl.thesis);
                  showTip(e, tips); }, onMouseLeave: hideTip
                },
                  h('div', { style: { fontSize: 15, fontWeight: 800, color: scoreColor(totalScore), lineHeight: 1 } }, totalScore.toFixed(0)),
                  h('div', { style: { fontSize: 7, fontWeight: 600, color: scoreColor(totalScore), textTransform: 'uppercase' } }, 'SCORE')
                ),
                // Question + meta
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { fontWeight: 600, fontSize: 13, lineHeight: 1.3, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } }, m.question),
                  h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' } },
                    compositeSignal && h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: compColor + '15', color: compColor, border: '1px solid ' + compColor + '30' } }, compositeSignal.replace(/_/g, ' ')),
                    !compositeSignal && isActionable && h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10b981' } }, recAction.replace('buy_', 'BUY ').toUpperCase()),
                    !compositeSignal && !isActionable && h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-muted)' } }, 'WATCH'),
                    h('span', { style: { padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: liq.color + '18', color: liq.color, cursor: 'help' },
                      onMouseEnter: function(e) { showTip(e, ['Liquidity: ' + liq.grade + ' \u2014 ' + liq.label, '$' + fmtCompact(m.liquidity) + ' available liquidity']); }, onMouseLeave: hideTip
                    }, liq.grade),
                    pl.regime && h('span', { style: { fontSize: 8, color: 'var(--text-muted)' } }, pl.regime),
                    pl.manipulation_risk && pl.manipulation_risk !== 'LOW' && h('span', { style: { fontSize: 8, color: pl.manipulation_risk === 'HIGH' ? '#ef4444' : '#b45309' } }, '\u26a0 ' + pl.manipulation_risk),
                    m.volume24hr > 0 && h('span', { style: { fontSize: 9, color: 'var(--text-muted)' } }, 'Vol $' + fmtCompact(m.volume24hr)),
                    m.liquidity > 0 && h('span', { style: { fontSize: 9, color: 'var(--text-muted)' } }, 'Liq $' + fmtCompact(m.liquidity)),
                    pl.confidence ? h('span', { style: { fontSize: 9, color: 'var(--text-muted)' } }, pl.confidence.toFixed(0) + '% conf') : rec.confidence && h('span', { style: { fontSize: 9, color: 'var(--text-muted)' } }, rec.confidence.toFixed(0) + '% conf')
                  )
                ),
                // Outcome buttons (compact)
                h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                  (m.outcomes || []).map(function(oc, i) {
                    var price = m.prices?.[oc] || 0;
                    var sp = m.spread?.[oc];
                    var tokenId = m.tokens?.[i];
                    if (!tokenId) return null;
                    var isSuggested = rec.side === oc.toUpperCase() && isActionable;
                    var ocColor = oc.toLowerCase() === 'yes' ? '#10b981' : oc.toLowerCase() === 'no' ? '#ef4444' : '#3b82f6';
                    return h('button', { key: i,
                      style: { padding: '6px 12px', borderRadius: 8, border: '1.5px solid ' + (isSuggested ? ocColor : 'var(--border)'), background: isSuggested ? ocColor + '08' : 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'center', minWidth: 70, transition: 'all 0.15s', position: 'relative' },
                      onClick: function() { setBuySelected({ token_id: tokenId, outcome: oc, question: m.question, price: price, market_id: m.id, spread: sp, liq: liq, rec: rec, pipeline: pl }); setBuyConfirm(true); },
                      onMouseEnter: function(e) { var tips = ['\ud83d\uded2 Click to buy ' + oc + ' @ ' + (price*100).toFixed(1) + '\u00a2', 'Cost: $' + (price * 10).toFixed(2) + ' for 10 shares']; if (sp && sp.bid > 0.001) tips.push('Bid: ' + (sp.bid*100).toFixed(1) + '\u00a2 / Ask: ' + (sp.ask*100).toFixed(1) + '\u00a2'); if (isSuggested) { tips.push('\u2b50 AI recommends this side'); if (rec.entryPrice) tips.push('Entry: ' + (rec.entryPrice*100).toFixed(1) + '\u00a2 \u2192 Target: ' + ((rec.targetExit||0)*100).toFixed(1) + '\u00a2'); } showTip(e, tips); },
                      onMouseLeave: hideTip
                    },
                      isSuggested && h('div', { style: { position: 'absolute', top: -6, right: -3, background: ocColor, color: '#fff', fontSize: 7, fontWeight: 700, padding: '0px 4px', borderRadius: 3 } }, 'PICK'),
                      h('div', { style: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' } }, oc),
                      h('div', { style: { fontSize: 16, fontWeight: 800, color: ocColor, lineHeight: 1.2 } }, (price * 100).toFixed(1) + '\u00a2')
                    );
                  })
                ),
                // View on Polymarket button
                h('a', { href: polyUrl, target: '_blank', rel: 'noopener',
                  style: { padding: '6px 10px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 },
                  title: 'View on Polymarket'
                }, I('external-link'), 'View')
              )
            );
          }),
          null
        )
      )
    );
  };

  const loadAgentData = async (agentId) => {
    if (!agentId) return;
    try {
      const [c, p, t, al, pp, w, preds, cal, strats, less,
             wh, soc, ev, na, cor, arb, reg, sn, sc, hd, ex, dd, pnl, wtch, wevt, engSt, aiCfg, goalsRes, livePos, sc2] = await Promise.all([
        apiCall('/polymarket/' + agentId + '/config').catch(() => ({ config: null })),
        apiCall('/polymarket/' + agentId + '/pending').catch(() => ({ trades: [] })),
        apiCall('/polymarket/' + agentId + '/trades').catch(() => ({ trades: [] })),
        apiCall('/polymarket/' + agentId + '/alerts').catch(() => ({ alerts: [] })),
        apiCall('/polymarket/' + agentId + '/paper').catch(() => ({ positions: [] })),
        apiCall('/polymarket/' + agentId + '/wallet').catch(() => ({ wallet: null })),
        apiCall('/polymarket/' + agentId + '/predictions').catch(() => ({ predictions: [] })),
        apiCall('/polymarket/' + agentId + '/calibration').catch(() => ({ calibration: [] })),
        apiCall('/polymarket/' + agentId + '/strategies').catch(() => ({ strategies: [] })),
        apiCall('/polymarket/' + agentId + '/lessons').catch(() => ({ lessons: [] })),
        // New
        apiCall('/polymarket/' + agentId + '/whales').catch(() => ({ whales: [] })),
        apiCall('/polymarket/' + agentId + '/social').catch(() => ({ signals: [] })),
        apiCall('/polymarket/' + agentId + '/events').catch(() => ({ events: [] })),
        apiCall('/polymarket/' + agentId + '/news-alerts').catch(() => ({ alerts: [] })),
        apiCall('/polymarket/' + agentId + '/correlations').catch(() => ({ correlations: [] })),
        apiCall('/polymarket/' + agentId + '/arbitrage').catch(() => ({ opportunities: [] })),
        apiCall('/polymarket/' + agentId + '/regimes').catch(() => ({ regimes: [] })),
        apiCall('/polymarket/' + agentId + '/snipers').catch(() => ({ snipers: [] })),
        apiCall('/polymarket/' + agentId + '/scale-orders').catch(() => ({ orders: [] })),
        apiCall('/polymarket/' + agentId + '/hedges').catch(() => ({ hedges: [] })),
        apiCall('/polymarket/' + agentId + '/exit-rules').catch(() => ({ rules: [] })),
        apiCall('/polymarket/' + agentId + '/drawdown').catch(() => ({ snapshots: [], peak: 0, current: 0, drawdown_pct: 0 })),
        apiCall('/polymarket/' + agentId + '/pnl-attribution').catch(() => ({ byStrategy: [], byCategory: [], bySignal: [] })),
        apiCall('/polymarket/' + agentId + '/watchers').catch(() => ({ watchers: [] })),
        apiCall('/polymarket/' + agentId + '/watcher-events').catch(() => ({ events: [] })),
        apiCall('/polymarket/engine/status').catch(() => null),
        apiCall('/polymarket/' + agentId + '/watcher-config').catch(() => null),
        apiCall('/polymarket/' + agentId + '/goals').catch(() => ({ goals: [] })),
        apiCall('/polymarket/' + agentId + '/live-positions').catch(() => ({ positions: [] })),
        apiCall('/polymarket/' + agentId + '/daily-scorecard').catch(() => null),
      ]);
      setDailyScorecard(sc2 || null);
      setLivePositions(livePos?.positions || []);
      setGoals(goalsRes?.goals || []);
      setConfig(c.config); setPendingTrades(p.trades || []); setTradeHistory(t.trades || []);
      setAlerts(al.alerts || []); setPaperPositions(pp.positions || []); setWallet(w.wallet);
      setPredictions(preds.predictions || []); setCalibration(cal.calibration || []);
      setStrategies(strats.strategies || []); setLessons(less.lessons || []);
      setWhales(wh.whales || []); setSocialSignals(soc.signals || []);
      setEvents(ev.events || []); setNewsAlerts(na.alerts || []);
      setCorrelations(cor.correlations || []); setArbitrage(arb.opportunities || []);
      setRegimes(reg.regimes || []); setSnipers(sn.snipers || []);
      setScaleOrders(sc.orders || []); setHedges(hd.hedges || []);
      setExitRules(ex.rules || []); setDrawdown(dd); setPnlAttrib(pnl);
      setWatchers(wtch.watchers || []); setWatcherEvents(wevt.events || []);
      if (engSt) setEngineStatus(engSt);
      if (aiCfg) setWatcherAIConfig(aiCfg);

      // Auto-archive completed data silently in background
      apiCall('/polymarket/' + agentId + '/archive', { method: 'POST', body: JSON.stringify({ tab: 'all' }) }).catch(function() {});
    } catch {}
  };

  const loadPnlTimeline = async () => {
    try {
      // Load P&L timeline for ALL poly agents (trades + paper positions)
      var allTimelines = await Promise.all(agents.map(function(ag) {
        return Promise.all([
          apiCall('/polymarket/' + ag.id + '/trades').catch(function() { return { trades: [] }; }),
          apiCall('/polymarket/' + ag.id + '/paper').catch(function() { return { positions: [] }; }),
          apiCall('/polymarket/' + ag.id + '/live-positions').catch(function() { return { positions: [] }; })
        ]).then(function(results) {
          var trades = results[0].trades || [];
          var papers = results[1].positions || [];
          var livePos = results[2].positions || [];
          var byDay = {};
          // Realized P&L from closed trades
          trades.forEach(function(t) {
            var day = (t.created_at || '').slice(0, 10);
            if (!day) return;
            if (!byDay[day]) byDay[day] = 0;
            byDay[day] += (t.pnl || 0);
          });
          // Unrealized P&L from open paper positions (entry vs current estimate)
          papers.forEach(function(p) {
            if (p.status === 'closed') return;
            var day = (p.created_at || '').slice(0, 10);
            if (!day) return;
            if (!byDay[day]) byDay[day] = 0;
            var entryPrice = parseFloat(p.entry_price) || 0;
            var currentPrice = parseFloat(p.current_price || p.entry_price) || entryPrice;
            var size = parseFloat(p.size) || 0;
            var unrealized = p.side === 'YES' ? (currentPrice - entryPrice) * size : (entryPrice - currentPrice) * size;
            byDay[day] += unrealized;
          });
          // Live positions (real trades)
          livePos.forEach(function(p) {
            var day = (p.created_at || '').slice(0, 10);
            if (!day) return;
            if (!byDay[day]) byDay[day] = 0;
            var entryPrice = parseFloat(p.entry_price) || 0;
            var size = parseFloat(p.size) || 0;
            // Live trades: cost basis as P&L placeholder (real P&L comes from SSE)
            byDay[day] += 0; // Will be updated by SSE stream
          });
          // Convert to cumulative
          var days = Object.keys(byDay).sort();
          var cumulative = 0;
          return { agentId: ag.id, agentName: ag.name || ag.id.slice(0, 8), data: days.map(function(d) { cumulative += byDay[d]; return { day: d, pnl: cumulative }; }) };
        });
      }));
      setPnlTimeline(allTimelines.filter(function(t) { return t.data.length > 0; }));
    } catch {}
  };

  const loadWalletBalance = async (agentId) => {
    if (!agentId) return;
    setWalletLoading(true);
    try {
      var res = await apiCall('/polymarket/' + agentId + '/wallet/balance');
      setWalletBalance(res);
    } catch { setWalletBalance(null); }
    finally { setWalletLoading(false); }
  };
  const loadWalletSecurity = async (agentId) => {
    if (!agentId) return;
    try {
      var [wl, tx, sec] = await Promise.all([
        apiCall('/polymarket/' + agentId + '/wallet/whitelist').catch(function() { return { addresses: [] }; }),
        apiCall('/polymarket/' + agentId + '/transfers').catch(function() { return { transfers: [] }; }),
        apiCall('/polymarket/' + agentId + '/wallet/security-status').catch(function() { return { has2fa: false, hasPin: false }; }),
      ]);
      setWhitelist(wl.addresses || []);
      setTransfers(tx.transfers || []);
      setWalletSecurity(sec);
    } catch {}
  };

  // Transfer unlock expiry timer (9 minutes)
  useEffect(function() {
    if (!transferUnlockExpiry) return;
    var iv = setInterval(function() {
      if (Date.now() > transferUnlockExpiry) {
        setTransferUnlocked(false);
        setTransferUnlockExpiry(null);
        setTransferVerifyStep('locked');
        setShowTransferModal(false);
      }
    }, 1000);
    return function() { clearInterval(iv); };
  }, [transferUnlockExpiry]);

  useEffect(function() { loadDashboard(); }, [clientOrgFilter]);
  useEffect(function() { if (selectedAgent) loadAgentData(selectedAgent); }, [selectedAgent]);
  useEffect(function() { if (agents.length > 0) loadPnlTimeline(); }, [agents.length]);
  // Load org providers for AI config
  useEffect(function() {
    apiCall('/providers').then(function(d) {
      var configured = (d.providers || []).filter(function(p) { return p.configured; });
      setOrgProviders(configured);
    }).catch(function() {});
  }, []);
  // Sync AI config state when loaded
  useEffect(function() {
    if (watcherAIConfig) {
      if (watcherAIConfig.provider) setAiProvider(watcherAIConfig.provider);
      if (watcherAIConfig.model) setAiModel(watcherAIConfig.model);
      setAiBudget(watcherAIConfig.budget_daily || 100);
      setAiMaxSpawns(watcherAIConfig.max_spawn_per_hour || 6);
      setAiUseOrgKey(!watcherAIConfig.has_custom_key);
    }
  }, [watcherAIConfig]);
  // Load models when provider changes
  useEffect(function() {
    if (!aiProvider) { setAiModels([]); return; }
    apiCall('/providers/' + aiProvider + '/models').then(function(d) {
      setAiModels(d.models || []);
    }).catch(function() { setAiModels([]); });
  }, [aiProvider]);

  // SSE: dashboard update stream (auto-reconnect on drop)
  useEffect(function() {
    if (!selectedAgent) return;
    var es = null;
    var closed = false;
    var retryTimeout = null;
    function connect() {
      if (closed) return;
      try {
        es = new EventSource('/api/polymarket/stream?agentId=' + selectedAgent);
        es.onmessage = function(e) {
          try {
            var data = JSON.parse(e.data);
            if (data.type === 'update') loadAgentData(selectedAgent);
          } catch {}
        };
        es.onerror = function() {
          if (es) es.close();
          es = null;
          if (!closed) retryTimeout = setTimeout(connect, 5000);
        };
      } catch {}
    }
    connect();
    return function() { closed = true; if (retryTimeout) clearTimeout(retryTimeout); if (es) es.close(); };
  }, [selectedAgent]);

  // SSE: live price stream for positions (auto-reconnect on drop)
  useEffect(function() {
    if (!selectedAgent) return;
    var es2 = null;
    var closed = false;
    var retryTimeout = null;
    function connect() {
      if (closed) return;
      try {
        es2 = new EventSource('/api/polymarket/' + selectedAgent + '/price-stream');
        es2.onmessage = function(e) {
          try {
            var data = JSON.parse(e.data);
            if (data.type === 'prices') {
              setLivePrices(data);
              setPriceHistory(function(prev) {
                var next = prev.concat([{ ts: data.ts || Date.now(), positions: data.positions || [], totalPnl: data.totalPnl || 0 }]);
                return next.length > 200 ? next.slice(-200) : next;
              });
            }
          } catch {}
        };
        es2.onerror = function() {
          if (es2) es2.close();
          es2 = null;
          if (!closed) retryTimeout = setTimeout(connect, 5000);
        };
      } catch {}
    }
    connect();
    return function() { closed = true; if (retryTimeout) clearTimeout(retryTimeout); if (es2) es2.close(); };
  }, [selectedAgent]);

  // Auto-refresh wallet balance every 15s when on wallet tab (only if wallet exists)
  useEffect(function() {
    if (tab !== 'wallet' || !selectedAgent || !wallet) return;
    loadWalletBalance(selectedAgent);
    loadWalletSecurity(selectedAgent);
    var iv = setInterval(function() { loadWalletBalance(selectedAgent); }, 15000);
    return function() { clearInterval(iv); };
  }, [tab, selectedAgent, wallet]);

  const decideTrade = async (tradeId, decision) => {
    var trade = pendingTrades.find(function(t) { return t.id === tradeId; });
    var details = trade ? trade.side + ' ' + (trade.size || 0).toFixed(1) + ' shares of "' + (trade.outcome || trade.token_id || '?') + '"' + (trade.price ? ' at ' + (trade.price * 100).toFixed(1) + '\u00a2 ($' + ((trade.price || 0) * (trade.size || 0)).toFixed(2) + ')' : ' at Market') : '';
    var body = trade ? 'Market: ' + (trade.market_question || 'Unknown') + '\nUrgency: ' + (trade.urgency || 'normal') + (trade.rationale ? '\nRationale: ' + trade.rationale : '') : '';
    if (!(await showConfirm({
      title: decision === 'approve' ? 'Approve Trade' : 'Reject Trade',
      message: details + (body ? '\n\n' + body : ''),
      warning: decision === 'approve' ? 'This will execute on-chain and cannot be undone.' : undefined,
      danger: decision !== 'approve',
      confirmText: decision === 'approve' ? 'Approve' : 'Reject'
    }))) return;
    try {
      await apiCall('/polymarket/trades/' + tradeId + '/decide', { method: 'POST', body: JSON.stringify({ decision }) });
      toast(decision === 'approve' ? 'Trade approved' : 'Trade rejected', 'success');
      loadAgentData(selectedAgent);
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };

  const updateConfig = async (updates) => {
    try {
      await apiCall('/polymarket/' + selectedAgent + '/config', { method: 'PUT', body: JSON.stringify(updates) });
      toast('Config updated', 'success'); loadAgentData(selectedAgent); setEditConfig(null);
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };

  const togglePause = async () => {
    var isPaused = dashboard?.dailyCounters?.some(function(c) { return c.agent_id === selectedAgent && c.paused; });
    var msg = isPaused ? 'Resume trading for this agent?' : 'Pause all trading for this agent?';
    if (!(await showConfirm(msg))) return;
    try {
      await apiCall('/polymarket/' + selectedAgent + '/pause', { method: 'POST', body: JSON.stringify({ action: isPaused ? 'resume' : 'pause', reason: 'Dashboard toggle' }) });
      toast(isPaused ? 'Trading resumed' : 'Trading paused', 'success'); loadDashboard();
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };

  // ─── Table Controls: search, filter, paginate ───
  var PAGE_SIZE = 15;
  function getTC(id) { return tc[id] || { search: '', page: 1, filters: {} }; }
  function updateTC(id, patch) {
    setTc(function(prev) {
      var cur = prev[id] || { search: '', page: 1, filters: {} };
      var next = Object.assign({}, prev); next[id] = Object.assign({}, cur, patch); return next;
    });
  }
  function applySearchFilter(data, tabId, searchFields, filterDefs) {
    var s = getTC(tabId);
    var out = data || [];
    if (s.search && searchFields.length) {
      var q = s.search.toLowerCase();
      out = out.filter(function(item) {
        return searchFields.some(function(f) { var v = item[f]; return v && String(v).toLowerCase().indexOf(q) !== -1; });
      });
    }
    if (filterDefs) filterDefs.forEach(function(fd) {
      var val = (s.filters || {})[fd.key];
      if (val && val !== 'all') {
        out = out.filter(function(item) {
          if (fd.fn) return fd.fn(item, val);
          return String(item[fd.key]).toLowerCase() === val.toLowerCase();
        });
      }
    });
    return out;
  }
  function paginateData(data, tabId, customPageSize) {
    var ps = customPageSize || PAGE_SIZE;
    var s = getTC(tabId), total = data.length, totalPages = Math.max(1, Math.ceil(total / ps));
    var p = Math.min(Math.max(1, s.page || 1), totalPages), start = (p - 1) * ps;
    return { items: data.slice(start, start + ps), total: total, totalPages: totalPages, page: p, start: start, pageSize: ps };
  }
  function renderControls(tabId, filterDefs, result, extraLeft) {
    var s = getTC(tabId);
    var hasFilters = s.search || Object.values(s.filters || {}).some(function(v) { return v && v !== 'all'; });
    return h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' } },
      h('input', { type: 'text', placeholder: 'Search\u2026', value: s.search || '',
        style: Object.assign({}, _inputStyle, { width: 200, flex: 'none' }),
        onChange: function(e) { updateTC(tabId, { search: e.target.value, page: 1 }); }
      }),
      (filterDefs || []).map(function(fd) {
        return h('select', { key: fd.key, value: (s.filters || {})[fd.key] || 'all',
          style: Object.assign({}, _selectStyle, { width: 'auto', minWidth: 110, flex: 'none' }),
          onChange: function(e) {
            var f = Object.assign({}, s.filters || {}); f[fd.key] = e.target.value;
            updateTC(tabId, { filters: f, page: 1 });
          }
        },
          h('option', { value: 'all' }, fd.label + ': All'),
          fd.options.map(function(o) {
            var v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label;
            return h('option', { key: v, value: v }, l);
          })
        );
      }),
      hasFilters && h('button', { className: 'btn btn-sm btn-ghost', style: { fontSize: 11, color: 'var(--text-muted)' },
        onClick: function() { updateTC(tabId, { search: '', page: 1, filters: {} }); }
      }, 'Clear'),
      extraLeft,
      h('div', { style: { flex: 1 } }),
      result.total > 0 && h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 } },
        h('span', null, (result.start + 1) + '\u2013' + Math.min(result.start + (result.pageSize || PAGE_SIZE), result.total) + ' of ' + result.total),
        h('button', { className: 'btn btn-sm btn-outline', disabled: result.page <= 1, style: { padding: '4px 8px', minWidth: 28 },
          onClick: function() { updateTC(tabId, { page: result.page - 1 }); } }, '\u2039'),
        h('span', { style: { fontSize: 12, minWidth: 36, textAlign: 'center' } }, result.page + '/' + result.totalPages),
        h('button', { className: 'btn btn-sm btn-outline', disabled: result.page >= result.totalPages, style: { padding: '4px 8px', minWidth: 28 },
          onClick: function() { updateTC(tabId, { page: result.page + 1 }); } }, '\u203A')
      )
    );
  }
  function renderFilteredTable(tabId, data, emptyMsg, headers, rowFn, opts) {
    var clickFn = opts.onRowClick || function(item) { setSelectedRow({ tab: tabId, data: item }); };
    var filtered = applySearchFilter(data, tabId, opts.searchFields || [], opts.filters || []);
    var result = paginateData(filtered, tabId, opts.pageSize);
    var hasData = data && data.length > 0;
    var s = getTC(tabId);
    var isFiltered = s.search || Object.values(s.filters || {}).some(function(v) { return v && v !== 'all'; });
    return h('div', null,
      hasData && renderControls(tabId, opts.filters || [], result),
      result.items.length === 0
        ? h('div', { className: 'empty-state card', style: { padding: '24px', textAlign: 'center' } }, isFiltered ? 'No results match your filters.' : emptyMsg)
        : h('div', { className: 'table-container' },
            h('table', { className: 'data-table' },
              h('thead', null, h('tr', null, headers.map(function(hdr) { return h('th', { key: hdr }, hdr); }))),
              h('tbody', null, result.items.map(function(item, idx) {
                return h.apply(null, ['tr', { key: item.id || item.bucket || item.strategy_name || idx, style: { cursor: 'pointer' },
                  onClick: function(e) { if (e.target.closest('button')) return; clickFn(item); }
                }].concat(rowFn(item)));
              }))
            )
          )
    );
  }

  // ─── Universal Detail Modal ───
  function renderDetailModal() {
    if (!selectedRow) return null;
    var d = selectedRow.data;
    var title = d.market_question || d.title || d.headline || d.strategy_name || d.strategy ||
      d.topic || d.label || d.signal_source || d.category || d.name ||
      (d.lesson ? (d.lesson.length > 60 ? d.lesson.slice(0, 60) + '\u2026' : d.lesson) : null) ||
      (d.address ? 'Wallet ' + shortAddr(d.address) : null) || 'Details';
    var skip = { id:1, agent_id:1, watcher_id:1, market_question:1, title:1, headline:1 };
    var badgeKeys = ['side','status','impact','urgency','importance','regime','predicted_outcome','source','type','category'];
    var longKeys = ['rationale','reasoning','description','lesson','content','summary','notes','strategy_notes','config'];
    var dateRe = /_at$|^timestamp$|^last_seen$|^first_seen$|^event_date$|^time_exit$|^resolved_at$|^closed_at$|^last_run$|^last_alert$/;
    var moneyRe = /^(pnl|total_pnl|unrealized_pnl|total_value|peak_value|invested_value)$/;
    var sharesRe = /^(size|total_size|primary_size|hedge_size|size_usdc)$/;
    var priceRe = /price|fill_price|target_price|max_price|entry_price|exit_price|take_profit|stop_loss|trail_amount|highest_price|avg_price/;
    var pctRe = /pct|rate|confidence|correlation|hurst|volatility|relevance|sentiment|hedge_ratio/;
    var codeRe = /address|token_id|tx_hash|order_id|market_a|market_b|primary_token|hedge_token|condition_id|watcher_id/;
    var badges = [], grid = [], longs = [];
    Object.keys(d).forEach(function(key) {
      if (skip[key] || d[key] == null || d[key] === '') return;
      var val = d[key], label = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      if (badgeKeys.indexOf(key) !== -1) { badges.push({ key: key, value: String(val) }); return; }
      if (longKeys.indexOf(key) !== -1 && typeof val === 'string' && val.length > 50) { longs.push({ label: label.toUpperCase(), value: val }); return; }
      var formatted, style = {};
      // Rename size fields to "Shares" in label
      if (sharesRe.test(key)) { label = label.replace(/Size/g, 'Shares').replace(/Size Usdc/g, 'Shares'); }
      if (dateRe.test(key)) { formatted = val ? new Date(val).toLocaleString() : '-'; }
      else if (sharesRe.test(key)) {
        var n = parseFloat(val) || 0;
        formatted = n.toFixed(1);
      }
      else if (moneyRe.test(key)) {
        var n = parseFloat(val) || 0;
        var isPnl = key === 'pnl' || key === 'total_pnl' || key === 'unrealized_pnl';
        formatted = isPnl ? ((n >= 0 ? '+' : '') + '$' + n.toFixed(2)) : ('$' + n.toFixed(2));
        if (isPnl) style = { fontWeight: 600, color: n >= 0 ? '#10b981' : '#ef4444' };
      }
      else if (priceRe.test(key) && typeof val === 'number') { formatted = val.toFixed(4); }
      else if (pctRe.test(key) && typeof val === 'number') {
        formatted = Math.abs(val) <= 1 && key !== 'correlation' ? (val * 100).toFixed(1) + '%' : key === 'correlation' ? val.toFixed(3) : val.toFixed(1) + '%';
      }
      else if (codeRe.test(key)) { formatted = String(val); style = { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }; }
      else if (typeof val === 'boolean') { formatted = val ? 'Yes' : 'No'; }
      else if (typeof val === 'number') { formatted = val % 1 === 0 ? String(val) : val.toFixed(2); }
      else if (typeof val === 'object') { formatted = JSON.stringify(val, null, 2); style = { fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }; }
      else { formatted = String(val); }
      grid.push({ label: label, value: formatted, style: style });
    });
    return h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setSelectedRow(null); } },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 640, maxHeight: '85vh', overflow: 'auto' } },
        h('div', { className: 'modal-header' },
          h('h2', { style: { fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setSelectedRow(null); } }, '\u00D7')
        ),
        h('div', { className: 'modal-body', style: { padding: 20 } },
          badges.length > 0 && h('div', { style: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' } },
            badges.map(function(b) {
              if (b.key === 'side') return h(Fragment, { key: b.key }, sideBadge(b.value));
              if (b.key === 'status') return h(Fragment, { key: b.key }, statusBadge(b.value));
              if (b.key === 'regime') return h(Fragment, { key: b.key }, regimeBadge(b.value));
              if (b.key === 'predicted_outcome') return h('span', { key: b.key, className: 'badge badge-info' }, b.value);
              var cls = (b.key === 'impact' || b.key === 'urgency' || b.key === 'importance')
                ? 'badge-' + (b.value === 'critical' ? 'danger' : b.value === 'high' ? 'warning' : 'secondary')
                : 'badge-secondary';
              return h('span', { key: b.key, className: 'badge ' + cls }, b.value);
            })
          ),
          d.pnl != null && h('div', { style: { display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 700, marginBottom: 16,
            background: d.pnl >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: d.pnl >= 0 ? '#10b981' : '#ef4444'
          } }, 'P&L: ' + (d.pnl >= 0 ? '+' : '') + '$' + (d.pnl || 0).toFixed(2)),
          grid.length > 0 && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '10px 0', fontSize: 13, marginBottom: longs.length > 0 ? 8 : 0, textAlign: 'left' } },
            grid.map(function(f, i) {
              return h('div', { key: i },
                h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, f.label),
                h('div', { style: f.style }, f.value)
              );
            })
          ),
          longs.map(function(f, i) {
            return h('div', { key: i, style: { marginTop: 12 } },
              h('div', { style: { color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, marginBottom: 6 } }, f.label),
              h('div', { style: { padding: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' } }, f.value)
            );
          })
        )
      )
    );
  }

  if (loading) return h('div', { className: 'page-loading' }, 'Loading Polymarket data...');

  var resolvedPreds = predictions.filter(function(p) { return p.resolved; });
  var correctPreds = resolvedPreds.filter(function(p) { return p.was_correct; });
  var totalPredPnl = resolvedPreds.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
  var activeSnipers = snipers.filter(function(s) { return s.status === 'active'; });
  var activeScales = scaleOrders.filter(function(s) { return s.status === 'active'; });
  var activeHedges = hedges.filter(function(s) { return s.status === 'active'; });

  var tabGroups = [
    { label: 'Trading', tabs: [
      { id: 'overview', label: 'Overview', icon: 'dashboard' },
      { id: 'wallet', label: 'Wallet', icon: 'key' },
      { id: 'pending', label: 'Pending Orders', icon: 'clock', count: pendingTrades.length },
      { id: 'history', label: 'Trades', icon: 'activity' },
      { id: 'paper', label: 'Paper', icon: 'edit' },
      { id: 'goals', label: 'Goals', icon: 'chart' },
    ]},
    { label: 'Automation', tabs: [
      { id: 'watchers', label: 'Monitors', icon: 'eye', count: watchers.filter(function(w) { return w.status === 'active'; }).length },
      { id: 'signals', label: 'Signals', icon: 'warning', count: watcherEvents.filter(function(e) { return !e.acknowledged; }).length },
    ]},
    { label: 'Journal', tabs: [
      { id: 'journal', label: 'Journal', icon: 'brain' },
      { id: 'strategies', label: 'Strategies', icon: 'globe' },
      { id: 'lessons', label: 'Lessons', icon: 'database', count: lessons.length },
    ]},
    { label: 'Orders', tabs: [
      { id: 'execution', label: 'Orders', icon: 'search', count: activeSnipers.length + activeScales.length },
      { id: 'hedges_tab', label: 'Hedges', icon: 'shield', count: activeHedges.length },
      { id: 'exits', label: 'Exit Rules', icon: 'logout' },
    ]},
    { label: 'Intelligence', tabs: [
      { id: 'onchain', label: 'On-Chain', icon: 'link' },
      { id: 'social', label: 'Social', icon: 'messages' },
      { id: 'events', label: 'Events', icon: 'calendar' },
      { id: 'alerts', label: 'Alerts', icon: 'warning' },
    ]},
    { label: 'Analytics', tabs: [
      { id: 'analytics', label: 'Analytics', icon: 'chart' },
      { id: 'drawdown_tab', label: 'Drawdown', icon: 'activity' },
      { id: 'attribution', label: 'Attribution', icon: 'folder' },
      { id: 'calibration', label: 'Calibration', icon: 'settings' },
    ]},
    { label: 'Settings', tabs: [
      { id: 'proxy', label: 'Proxy', icon: 'globe' },
    ]},
  ];
  var allTabs = tabGroups.reduce(function(acc, g) { return acc.concat(g.tabs); }, []);

  // ═══ Reusable line chart — exact same style as knowledge-contributions "Contributions Over Time" ═══
  var renderLineChart = function(data, opts) {
    if (!data || data.length === 0) return null;
    // Single data point: expand into 3 so we get a visible line
    if (data.length === 1) {
      var _d0 = data[0];
      data = [Object.assign({}, _d0, { _synth: true }), _d0, Object.assign({}, _d0, { _synth: true })];
    }
    var W = opts.width || 600, H = opts.height || 200, pad = { top: 16, right: 16, bottom: 32, left: 44 };
    var cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    var vals = data.map(function(d) { return d[opts.valueKey] || 0; });
    var maxV = Math.max.apply(null, vals.concat([1]));
    var minV = opts.minVal != null ? opts.minVal : Math.min.apply(null, vals.concat([0]));
    var range = (maxV - minV) || 1;
    // Add 10% padding
    minV -= range * 0.05; maxV += range * 0.05; range = maxV - minV;

    var points = data.map(function(d, i) {
      var x = pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
      var y = pad.top + cH - (((d[opts.valueKey] || 0) - minV) / range) * cH;
      return { x: x, y: y, d: d };
    });

    // Smooth curve (catmull-rom → cubic bezier)
    var smoothPath = function(pts) {
      if (pts.length < 2) return 'M' + pts[0].x + ',' + pts[0].y;
      if (pts.length === 2) return 'M' + pts[0].x + ',' + pts[0].y + ' L' + pts[1].x + ',' + pts[1].y;
      var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        var cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
        var cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
      }
      return d;
    };

    var linePath = smoothPath(points);
    var areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (pad.top + cH) + ' L' + points[0].x.toFixed(1) + ',' + (pad.top + cH) + ' Z';
    var color = opts.color || '#6366f1';

    // Y-axis: min and max labels
    var yLabels = [
      { val: opts.formatY ? opts.formatY(minV) : minV.toFixed(opts.decimals || 0), y: pad.top + cH },
      { val: opts.formatY ? opts.formatY(maxV) : maxV.toFixed(opts.decimals || 0), y: pad.top }
    ];

    // X-axis labels (max 6)
    var xStep = Math.max(1, Math.ceil(data.length / 6));
    var xLabels = [];
    data.forEach(function(d, i) {
      if (i % xStep === 0 || i === data.length - 1) {
        var x = pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
        var label = opts.formatX ? opts.formatX(d) : (d[opts.labelKey] || '');
        xLabels.push({ x: x, label: label });
      }
    });

    return h('div', { style: { position: 'relative' } },
      h('svg', { viewBox: '0 0 ' + W + ' ' + H, style: { width: '100%', height: 'auto', display: 'block' } },
        h('defs', null,
          h('linearGradient', { id: 'lineGrad-' + (opts.id || 'default'), x1: 0, y1: 0, x2: 0, y2: 1 },
            h('stop', { offset: '0%', stopColor: color, stopOpacity: 0.2 }),
            h('stop', { offset: '100%', stopColor: color, stopOpacity: 0.02 })
          )
        ),
        yLabels.map(function(yl, i) {
          return h('text', { key: 'yl' + i, x: pad.left - 8, y: yl.y + 4, textAnchor: 'end', fill: 'var(--text-muted)', fontSize: 10 }, yl.val);
        }),
        xLabels.map(function(xl, i) {
          return h('text', { key: 'xl' + i, x: xl.x, y: H - 6, textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 10 }, xl.label);
        }),
        h('path', { d: areaPath, fill: 'url(#lineGrad-' + (opts.id || 'default') + ')' }),
        h('path', { d: linePath, fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        // Invisible hit areas for hover
        points.map(function(p, i) {
          if (p.d._synth) return null;
          var tipLines = opts.tipFn ? opts.tipFn(p.d) : [{ text: (opts.valueLabel || 'Value') + ': ' + (p.d[opts.valueKey] || 0), bold: true }];
          return h('circle', {
            key: 'hit' + i, cx: p.x, cy: p.y, r: 14, fill: 'transparent', cursor: 'pointer',
            onMouseEnter: function(e) { showTip(e, tipLines); },
            onMouseMove: function(e) { showTip(e, tipLines); },
            onMouseLeave: hideTip
          });
        }),
        // Visible dots
        points.map(function(p, i) {
          if (p.d._synth) return null;
          return h('circle', { key: 'dot' + i, cx: p.x, cy: p.y, r: 4, fill: color, stroke: 'var(--bg-card)', strokeWidth: 2, style: { pointerEvents: 'none' } });
        })
      )
    );
  };

  // ═══ Multi-line chart for multiple positions (same style, multiple colored lines) ═══
  var renderMultiLineChart = function(series, opts) {
    // series: [{ id, label, color, data: [{x_val, y_val, ...}] }]
    if (!series || series.length === 0) return null;
    var W = opts.width || 600, H = opts.height || 200, pad = { top: 14, right: 20, bottom: 24, left: 58 };
    var cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;

    // Global min/max Y — symmetric around 0 so 0% is always centered
    var gMin = 0, gMax = 0;
    series.forEach(function(s) { s.data.forEach(function(d) { var v = d[opts.valueKey]; if (v < gMin) gMin = v; if (v > gMax) gMax = v; }); });
    var absMax = Math.max(Math.abs(gMin), Math.abs(gMax), 1);
    absMax *= 1.08; // 8% padding
    gMin = -absMax; gMax = absMax;
    var range = gMax - gMin;
    var zeroY = pad.top + cH / 2; // always center

    // Global X range (index-based since all series share same time ticks)
    var maxLen = Math.max.apply(null, series.map(function(s) { return s.data.length; }));
    if (maxLen < 2) maxLen = 2;

    var smoothPath = function(pts) {
      if (pts.length < 2) return 'M' + pts[0].x + ',' + pts[0].y;
      if (pts.length === 2) return 'M' + pts[0].x + ',' + pts[0].y + ' L' + pts[1].x + ',' + pts[1].y;
      var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        var cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
        var cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
      }
      return d;
    };

    var builtLines = series.map(function(s, si) {
      var pts = s.data.map(function(d, di) {
        var x = pad.left + (di / (maxLen - 1)) * cW;
        var y = pad.top + cH - ((d[opts.valueKey] - gMin) / range) * cH;
        return { x: x, y: y, d: d };
      });
      var linePath = smoothPath(pts);
      var areaPath = linePath + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (pad.top + cH) + ' L' + pts[0].x.toFixed(1) + ',' + (pad.top + cH) + ' Z';
      return { id: s.id, color: s.color, label: s.label, pts: pts, linePath: linePath, areaPath: areaPath, entry: s.entry, basePrice: s.basePrice, side: s.side };
    });
    // Nice tick calculation — pick round intervals that fit the range
    var niceInterval = function(maxVal) {
      var candidates = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 100000];
      for (var ci = 0; ci < candidates.length; ci++) {
        if (maxVal / candidates[ci] <= 3) return candidates[ci]; // aim for 1-3 ticks per side
      }
      return Math.pow(10, Math.floor(Math.log10(maxVal)));
    };
    var tickStep = niceInterval(absMax);
    var yLabels = [{ val: opts.formatY ? opts.formatY(0) : '0%', y: zeroY, isZero: true }];
    for (var ti = tickStep; ti < absMax; ti += tickStep) {
      var yPos = pad.top + cH - ((ti - gMin) / range) * cH;
      var yNeg = pad.top + cH - ((-ti - gMin) / range) * cH;
      yLabels.push({ val: opts.formatY ? opts.formatY(ti) : '+' + ti.toFixed(0) + '%', y: yPos });
      yLabels.push({ val: opts.formatY ? opts.formatY(-ti) : '-' + ti.toFixed(0) + '%', y: yNeg });
    }

    // X labels — max 4 evenly spaced, never overlap
    var refData = series[0].data;
    var maxXLabels = Math.min(4, refData.length);
    var xLabels = [];
    if (refData.length > 0) {
      for (var xi = 0; xi < maxXLabels; xi++) {
        var di2 = maxXLabels === 1 ? refData.length - 1 : Math.round(xi * (refData.length - 1) / (maxXLabels - 1));
        xLabels.push({ x: pad.left + (di2 / (maxLen - 1)) * cW, label: opts.formatX ? opts.formatX(refData[di2]) : '' });
      }
    }

    return h('div', { style: { position: 'relative' } },
      h('svg', { viewBox: '0 0 ' + W + ' ' + H, style: { width: '100%', height: 'auto', display: 'block' } },
        h('defs', null,
          builtLines.map(function(bl) {
            return h('linearGradient', { key: bl.id, id: 'mlg-' + bl.id, x1: 0, y1: 0, x2: 0, y2: 1 },
              h('stop', { offset: '0%', stopColor: bl.color, stopOpacity: 0.15 }),
              h('stop', { offset: '100%', stopColor: bl.color, stopOpacity: 0.02 })
            );
          })
        ),
        // Y-axis vertical line + 0% horizontal baseline only
        h('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: pad.top + cH, strokeWidth: 1, strokeOpacity: 0.5, style: { stroke: 'var(--text-muted, #6b7394)' } }),
        h('line', { x1: pad.left, y1: zeroY, x2: W - pad.right, y2: zeroY, strokeWidth: 1.5, strokeDasharray: '4,3', style: { stroke: 'var(--text-muted, #6b7394)', opacity: 0.8 } }),
        yLabels.map(function(yl, i) {
          return h('text', { key: 'yl' + i, x: pad.left - 8, y: yl.y + 4, textAnchor: 'end', fontSize: 10, fontWeight: yl.isZero ? 600 : 400, style: { fill: 'var(--text-muted, #6b7394)' } }, yl.val);
        }),
        xLabels.map(function(xl, i) {
          return h('text', { key: 'xl' + i, x: xl.x, y: H - 6, textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 10 }, xl.label);
        }),
        // Area + line per series
        builtLines.map(function(bl) {
          return h(Fragment, { key: bl.id },
            h('path', { d: bl.areaPath, fill: 'url(#mlg-' + bl.id + ')' }),
            h('path', { d: bl.linePath, fill: 'none', stroke: bl.color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
          );
        }),
        // Tooltip hit areas — full transparent line path for continuous hover detection
        builtLines.map(function(bl) {
          return [
            // Thick invisible path for continuous hover anywhere on the line
            h('path', { key: bl.id + '-hitpath', d: bl.linePath, fill: 'none', stroke: 'transparent', strokeWidth: 20, cursor: 'pointer',
              onMouseMove: function(e) {
                // Find closest point by X position
                var svgRect = e.currentTarget.closest('svg').getBoundingClientRect();
                var mouseX = (e.clientX - svgRect.left) / svgRect.width * (opts.width || 600);
                var closest = bl.pts[0], minDist = Infinity;
                bl.pts.forEach(function(pt) { var d = Math.abs(pt.x - mouseX); if (d < minDist) { minDist = d; closest = pt; } });
                var tipLines = opts.tipFn ? opts.tipFn(closest.d, bl) : [{ text: bl.label, bold: true }, { text: (closest.d[opts.valueKey] || 0).toFixed(4), dot: bl.color }];
                showTip(e, tipLines);
              },
              onMouseLeave: hideTip
            })
          ].concat(bl.pts.filter(function(_, i) { return i === bl.pts.length - 1; }).map(function(p, pi) {
            var tipLines = opts.tipFn ? opts.tipFn(p.d, bl) : [{ text: bl.label, bold: true }, { text: (p.d[opts.valueKey] || 0).toFixed(4), dot: bl.color }];
            return h('circle', {
              key: bl.id + '-h' + pi, cx: p.x, cy: p.y, r: 14, fill: 'transparent', cursor: 'pointer',
              onMouseEnter: function(e) { showTip(e, tipLines); },
              onMouseMove: function(e) { showTip(e, tipLines); },
              onMouseLeave: hideTip
            });
          }));
        }),
        // Visible dots (last point per series only)
        builtLines.map(function(bl) {
          var last = bl.pts[bl.pts.length - 1];
          return h('circle', { key: bl.id + '-end', cx: last.x, cy: last.y, r: 4, fill: bl.color, stroke: 'var(--bg-card)', strokeWidth: 2, style: { pointerEvents: 'none' } });
        })
      )
    );
  };

  // ═══ LIVE CHART — renders as card with card-header/card-body like Contributions Over Time ═══
  var renderLiveChart = function() {
    var hasLive = priceHistory.length >= 2;

    if (!hasLive) {
      var hasPositions = livePrices?.positions?.length > 0;
      return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-header' }, h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 } },
          'Live Position Prices',
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: hasPositions ? '#b45309' : 'var(--text-muted)' } }),
            h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, hasPositions ? 'Waiting for data...' : 'No positions')
          )
        )),
        h('div', { className: 'card-body', style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } },
          hasPositions ? 'Streaming prices... chart will appear in a few seconds.' : 'No active positions. Create a paper position or place a trade to see live price streaming.'
        )
      );
    }

    // Build per-position series
    var tokenMap = {};
    var colorIdx = 0;
    priceHistory.forEach(function(snap) {
      (snap.positions || []).forEach(function(pos) {
        if (!tokenMap[pos.token_id]) {
          tokenMap[pos.token_id] = { market: (pos.market || '').slice(0, 60), side: pos.side, entry: parseFloat(pos.entry) || pos.current || 0, color: CHART_COLORS[colorIdx % CHART_COLORS.length], data: [] };
          colorIdx++;
        }
        tokenMap[pos.token_id].data.push({ ts: snap.ts, price: pos.current, pnl: pos.pnl });
      });
    });

    var tokens = Object.keys(tokenMap);
    if (tokens.length === 0) return null;

    var currentTotalPnl = priceHistory[priceHistory.length - 1]?.totalPnl || 0;
    var elapsed = ((priceHistory[priceHistory.length - 1].ts - priceHistory[0].ts) / 1000);
    var elapsedStr = elapsed < 60 ? Math.round(elapsed) + 's' : Math.round(elapsed / 60) + 'm ' + Math.round(elapsed % 60) + 's';

    var series = tokens.map(function(tid) {
      var info = tokenMap[tid];
      // Normalize to % change from entry price (the price the position was opened at)
      var basePrice = parseFloat(info.entry) || info.data[0]?.price || 1;
      // Prepend a 0% origin point so all lines start at the same baseline
      var firstTs = info.data[0]?.ts || Date.now();
      var originPoint = { ts: firstTs - 1, price: basePrice, pnl: 0, pctChange: 0 };
      var normData = [originPoint].concat(info.data.map(function(d) {
        return Object.assign({}, d, { pctChange: ((d.price - basePrice) / basePrice) * 100 });
      }));
      return { id: tid, label: info.market, color: info.color, side: info.side, entry: info.entry, data: normData, basePrice: basePrice };
    });

    var fmtTime = function(d) {
      var t = new Date(d.ts);
      var h = t.getHours(), m = t.getMinutes(), s = t.getSeconds();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0') + ' ' + ampm;
    };

    return h('div', { className: 'card', style: { marginBottom: 16, overflow: 'hidden' } },
      h('div', { className: 'card-header', style: { padding: '8px 16px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } },
          h('h3', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: 0 } },
            'Live Position Prices',
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', animation: 'pulse 1.5s infinite' } }),
              h('span', { style: { fontSize: 11, color: '#10b981', fontWeight: 600 } }, 'LIVE')
            ),
            h('span', { style: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 } }, elapsedStr + ' · ' + priceHistory.length + ' ticks'),
            h('span', { style: {
              padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
              background: currentTotalPnl >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              color: currentTotalPnl >= 0 ? '#10b981' : '#ef4444'
            } }, 'P&L: ' + (currentTotalPnl >= 0 ? '+' : '') + '$' + currentTotalPnl.toFixed(2)),
            h(HelpButton, { label: 'Live Position Prices' },
              h('p', null, 'Real-time streaming chart showing the % change from entry price for each open position. Data is streamed every 3 seconds from the Polymarket CLOB. All positions are normalized to % change so they can be compared on the same scale regardless of price level.'),
              h('h4', { style: _h4 }, 'What to look for'),
              h('ul', { style: _ul },
                h('li', null, h('strong', null, 'Rising line'), ' — Price moving up from your entry. Profitable for YES positions.'),
                h('li', null, h('strong', null, 'Falling line'), ' — Price dropping from your entry. Profitable for NO positions.'),
                h('li', null, h('strong', null, 'Flat line (0%)'), ' — Price unchanged from entry. Low liquidity or stable market consensus.'),
                h('li', null, h('strong', null, 'Multiple lines'), ' — Each colored line represents a different position. Legend shows market name and current P&L.')
              ),
              h('h4', { style: _h4 }, 'Hover details'),
              h('ul', { style: _ul },
                h('li', null, 'Time of the price tick'),
                h('li', null, 'Market name and outcome (YES/NO)'),
                h('li', null, 'Current price and entry price'),
                h('li', null, '% change from entry'),
                h('li', null, 'Unrealized P&L in dollars')
              ),
              h('div', { style: _tip }, 'The chart keeps the last ~10 minutes of streaming data (200 ticks). It resets when you switch agents.')
            )
          ),
          h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', overflow: 'auto', maxWidth: 400, scrollbarWidth: 'none' } },
            series.map(function(s) {
              var lastD = s.data[s.data.length - 1];
              return h('div', { key: s.id, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexShrink: 0, padding: '2px 8px', background: 'var(--bg-secondary, rgba(255,255,255,0.05))', borderRadius: 6 } },
                h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 } }),
                h('span', { style: { maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.label),
                h('span', { style: { fontWeight: 600, color: lastD.pnl >= 0 ? '#10b981' : '#ef4444', flexShrink: 0 } }, (lastD.pnl >= 0 ? '+' : '') + '$' + lastD.pnl.toFixed(2))
              );
            })
          )
        )
      ),
      h('div', { className: 'card-body', style: { padding: '0 8px 0' } },
        renderMultiLineChart(series, {
          valueKey: 'pctChange', width: 900, height: 140, decimals: 2, id: 'live-prices',
          formatY: function(v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; },
          formatX: fmtTime,
          tipFn: function(d, bl) {
            var t = new Date(d.ts);
            var hh = t.getHours(), ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12;
            var tStr = hh + ':' + t.getMinutes().toString().padStart(2, '0') + ':' + t.getSeconds().toString().padStart(2, '0') + ' ' + ap;
            var oc = resolveOutcome(bl.side);
            return [
              { text: tStr, bold: true },
              { text: bl.label + (oc ? ' (' + oc + ')' : '') },
              { text: 'Price: $' + d.price.toFixed(4), dot: bl.color },
              { text: 'Entry: $' + (bl.basePrice || parseFloat(bl.entry) || 0).toFixed(4) },
              { text: 'Change: ' + (d.pctChange >= 0 ? '+' : '') + d.pctChange.toFixed(2) + '%', color: d.pctChange >= 0 ? '#10b981' : '#ef4444' },
              { text: 'P&L: ' + (d.pnl >= 0 ? '+' : '') + '$' + d.pnl.toFixed(2), color: d.pnl >= 0 ? '#10b981' : '#ef4444' }
            ];
          }
        })
      ),
      h('style', null, '@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }')
    );
  };

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };
  var viewArchiveToggle = function(tabKey, label) {
    var isOpen = showArchive[tabKey];
    return h('button', {
      className: 'btn btn-sm',
      style: { fontSize: 12, padding: '5px 12px', background: isOpen ? 'var(--accent)' : 'var(--bg-secondary)', color: isOpen ? '#fff' : 'inherit', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' },
      onClick: function() {
        var next = Object.assign({}, showArchive);
        next[tabKey] = !next[tabKey];
        setShowArchive(next);
        if (!next[tabKey]) return;
        setArchiveLoading(true);
        apiCall('/polymarket/' + agentId + '/archive/' + tabKey).then(function(r) {
          var next2 = Object.assign({}, showArchive); next2[tabKey] = true; next2[tabKey + '_data'] = r; setShowArchive(next2); setArchiveLoading(false);
        }).catch(function() { setArchiveLoading(false); });
      }
    }, I('database'), isOpen ? ' Active' : ' Archive (' + (label || '') + ')');
  };

  var tabHeader = function(title, icon, helpContent) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 } }, I(icon), title,
        helpContent && h(HelpButton, { label: title }, helpContent)
      )
    );
  };

  return h('div', { className: 'page-content', style: { padding: 0, paddingTop: 0, marginTop: 0, position: 'relative' } },
    renderDetailModal(),
    renderBuyModal(),
    renderSellModal(),
    renderTargetModal(),
    renderTooltip(),
    // Purchase confirmation modal
    buyConfirm && buySelected && (function() {
      var bs = buySelected;
      var size = parseFloat(buySize) || 0;
      var cost = (bs.price || 0) * size;
      var ocColor = (bs.outcome || '').toLowerCase() === 'yes' ? '#10b981' : '#ef4444';
      var rec = bs.rec || {};
      var availableCash = walletBalance?.balances ? (walletBalance.balances.usdce != null ? walletBalance.balances.usdce : walletBalance.balances.usdc || 0) : null;
      var insufficientFunds = availableCash !== null && cost > availableCash;
      return h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { if (!buyExecuting) setBuyConfirm(false); hideTip(); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 420, padding: 0, borderRadius: 12, overflow: 'hidden' } },
          // Compact header
          h('div', { style: { padding: '14px 18px', background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('div', { style: { width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 } }, I('shopping-cart')),
              h('span', { style: { fontWeight: 700, fontSize: 15 } }, 'Confirm Purchase')
            ),
            h('button', { style: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }, onClick: function() { if (!buyExecuting) setBuyConfirm(false); hideTip(); } }, '\u00d7')
          ),
          h('div', { style: { padding: '14px 18px 18px' } },
            // Market + outcome inline
            h('div', { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 8 } }, bs.question),
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 } },
              h('span', { style: { padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: ocColor + '15', color: ocColor } }, bs.outcome),
              h('span', { style: { fontSize: 20, fontWeight: 800, color: '#10b981' } }, ((bs.price || 0) * 100).toFixed(1) + '\u00a2'),
              rec.targetExit && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, '\u2192 ' + (rec.targetExit * 100).toFixed(1) + '\u00a2 target')
            ),
            // Shares input row
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 } },
              h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, 'Shares'),
              h('input', { type: 'number', value: buySize, min: 5, step: 1,
                style: { width: 80, fontSize: 16, fontWeight: 700, textAlign: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', outline: 'none' },
                onChange: function(e) { setBuySize(e.target.value); }
              }),
              h('button', { style: { padding: '5px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 11, color: '#10b981' }, onClick: function() { setBuySize('10'); } }, '10'),
              h('button', { style: { padding: '5px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 11, color: '#10b981' }, onClick: function() { setBuySize('25'); } }, '25'),
              h('button', { style: { padding: '5px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 11, color: '#10b981' }, onClick: function() { setBuySize('50'); } }, '50'),
              h('button', { style: { padding: '5px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer', fontWeight: 600, fontSize: 11, color: '#10b981' }, onClick: function() { setBuySize('100'); } }, '100')
            ),
            // Compact order summary
            h('div', { style: { padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 14, border: '1px solid var(--border)', fontSize: 12 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                h('span', { style: { color: 'var(--text-muted)' } }, size.toFixed(0) + ' shares @ ' + ((bs.price||0)*100).toFixed(1) + '\u00a2'),
                h('span', { style: { fontWeight: 700, color: insufficientFunds ? '#ef4444' : 'inherit' } }, 'Cost: $' + cost.toFixed(2))
              ),
              availableCash !== null && h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                h('span', { style: { color: 'var(--text-muted)' } }, 'Available'),
                h('span', { style: { fontWeight: 600, color: insufficientFunds ? '#ef4444' : '#10b981' } }, '$' + availableCash.toFixed(2))
              ),
              size < 5 && h('div', { style: { color: '#b45309', marginTop: 4 } }, '\u26a0 Min 5 shares'),
              insufficientFunds && h('div', { style: { color: '#ef4444', fontWeight: 600, marginTop: 4 } }, '\u26d4 Need $' + (cost - availableCash).toFixed(2) + ' more')
            ),
            // Pipeline analysis (compact)
            (function() {
              var bsPl = bs.pipeline || {};
              var insights = [];
              if (bsPl.action) insights.push(bsPl.action.replace(/_/g, ' ') + (bsPl.score ? ' (score ' + bsPl.score + '/100)' : ''));
              if (bsPl.kelly) insights.push('Kelly: edge ' + (bsPl.kelly.edge||0) + '%, size $' + (bsPl.kelly.half_kelly_size||0).toFixed(1));
              if (bsPl.regime) insights.push('Regime: ' + bsPl.regime);
              if (bsPl.smart_money != null) insights.push('Smart Money: ' + bsPl.smart_money.toFixed(2));
              if (bsPl.manipulation_risk && bsPl.manipulation_risk !== 'LOW') insights.push('\u26a0 Manipulation: ' + bsPl.manipulation_risk);
              if (bsPl.thesis) insights.push(bsPl.thesis);
              if (insights.length === 0 && rec.reasoning) insights.push(rec.reasoning);
              if (insights.length === 0) return null;
              var sigColor = bsPl.action?.includes('BUY') ? '#10b981' : bsPl.action?.includes('SELL') ? '#ef4444' : '#6b7280';
              return h('div', { style: { padding: '8px 12px', background: sigColor + '08', borderRadius: 8, marginBottom: 14, border: '1px solid ' + sigColor + '20', fontSize: 11, lineHeight: 1.6 } },
                h('div', { style: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: sigColor, marginBottom: 4 } }, 'Analysis Pipeline'),
                insights.map(function(line, li) { return h('div', { key: li, style: { color: line.startsWith('\u26a0') ? '#b45309' : 'var(--text-muted)' } }, line); })
              );
            })(),
            // Actions
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', { disabled: buyExecuting, style: { flex: 1, padding: '10px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: buyExecuting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }, onClick: function() { if (!buyExecuting) { setBuyConfirm(false); hideTip(); setBuySelected(null); } } }, 'Back'),
              h('button', { disabled: buyExecuting || size < 5 || insufficientFunds,
                style: { flex: 2, padding: '10px', borderRadius: 8, background: buyExecuting || size < 5 || insufficientFunds ? '#9ca3af' : 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', cursor: buyExecuting || size < 5 || insufficientFunds ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
                onClick: function() { if (insufficientFunds) return; executeBuy(); }
              }, insufficientFunds ? '\u26d4 Insufficient Funds' : buyExecuting ? 'Executing...' : [I('check'), ' Buy $' + cost.toFixed(2)])
            )
          )
        )
      );
    })(),

    // ═══ HEADER P&L CHART (sticky — always visible) ═══
    h('div', { style: { position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: 0, marginTop: '-16px' } },
      renderLiveChart()
    ),

    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h('h1', { style: { margin: 0, fontSize: 22, fontWeight: 700 } }, I('trending-up'), ' Polymarket Trading'),
        h(HelpButton, { label: 'Polymarket Trading' },
          h('p', null, 'A complete prediction market trading system with 108 tools across 9 skill modules. Supports both human-in-the-loop (approval) and fully autonomous trading modes.'),
          h('h4', { style: _h4 }, 'Skill Modules'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Core Trading'), ' — Market search, order placement, position management, wallet setup.'),
            h('li', null, h('strong', null, 'Quant Engine'), ' — Kelly criterion, Black-Scholes, Bayesian updates, Monte Carlo simulation, EV calculation.'),
            h('li', null, h('strong', null, 'On-Chain Intelligence'), ' — Whale tracking, order book analysis, on-chain flow monitoring.'),
            h('li', null, h('strong', null, 'Social Intelligence'), ' — Twitter, Reddit, Telegram sentiment analysis and velocity tracking.'),
            h('li', null, h('strong', null, 'Event Feeds'), ' — Calendar events, official sources, odds aggregation, breaking news.'),
            h('li', null, h('strong', null, 'Advanced Analytics'), ' — Market correlations, arbitrage scanning, regime detection.'),
            h('li', null, h('strong', null, 'Execution'), ' — Sniper orders, TWAP/VWAP scale-in, hedging, exit strategies.'),
            h('li', null, h('strong', null, 'Counter-Intelligence'), ' — Manipulation detection, resolution risk, counterparty analysis.'),
            h('li', null, h('strong', null, 'Portfolio'), ' — Portfolio optimization, drawdown monitoring, P&L attribution.')
          ),
          h('h4', { style: _h4 }, 'Getting Started'),
          h('ol', { style: _ul },
            h('li', null, 'Create an agent with the "Polymarket Trader" template (Agents → Create → Finance category).'),
            h('li', null, 'Configure a wallet (the agent auto-generates one, or import your own private key).'),
            h('li', null, 'Set risk limits in the Config tab (start with Paper mode).'),
            h('li', null, 'The agent will start scanning markets, making predictions, and proposing trades.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Security: '), 'All trades go through the enterprise permission pipeline. In approval mode, every trade requires manual confirmation before execution.'),
          h('div', { style: { marginTop: 12 } }, h('a', { href: '/docs/polymarket.html', target: '_blank', style: { color: 'var(--brand)', fontSize: 13, fontWeight: 600 } }, '\u2192 Full Documentation'))
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('a', { href: '/docs/polymarket.html', target: '_blank', className: 'btn btn-outline', style: { fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 } }, I('link'), 'Docs'),
        proxyStatus && h('div', {
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: proxyStatus.connected ? 'rgba(16,185,129,0.15)' : proxyStatus.configured ? 'rgba(239,68,68,0.15)' : 'rgba(100,100,100,0.15)', color: proxyStatus.connected ? '#10b981' : proxyStatus.configured ? '#ef4444' : '#888', border: '1px solid ' + (proxyStatus.connected ? 'rgba(16,185,129,0.3)' : proxyStatus.configured ? 'rgba(239,68,68,0.3)' : 'rgba(100,100,100,0.2)') },
          title: proxyStatus.connected ? 'Proxy active via ' + (proxyStatus.config?.proxyUrl || proxyStatus.config?.vpsHost || '?') : proxyStatus.configured ? 'Proxy configured but disconnected' : 'No proxy \u2014 direct connection',
          onClick: function() { setTab('proxy'); }
        },
          h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: proxyStatus.connected ? '#10b981' : proxyStatus.configured ? '#ef4444' : '#888' } }),
          proxyStatus.connected ? 'Proxy Active' : proxyStatus.configured ? 'Proxy Off' : 'Direct'
        ),
        h(orgCtx.Switcher),
        agents.length > 0 && h('select', {
          value: selectedAgent || '', onChange: function(e) { setSelectedAgent(e.target.value); setPriceHistory([]); },
          style: Object.assign({}, _selectStyle, { width: 'auto', minWidth: 200 })
        }, agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.name || a.id); })),
        selectedAgent && h('button', { className: 'btn btn-outline', onClick: togglePause },
          I(dashboard?.dailyCounters?.some(function(c) { return c.agent_id === selectedAgent && c.paused; }) ? 'play' : 'pause'),
          dashboard?.dailyCounters?.some(function(c) { return c.agent_id === selectedAgent && c.paused; }) ? ' Resume' : ' Pause'
        ),
        h('button', { className: 'btn btn-secondary', onClick: function() { loadDashboard(); loadAgentData(selectedAgent); } }, I('refresh-cw')),
        selectedAgent && h('button', { className: 'btn btn-secondary', onClick: function() {
          setEditConfig(config ? Object.assign({}, config) : { mode: 'approval', max_position_size: 100, max_order_size: 50, max_total_exposure: 500, max_daily_trades: 10, max_daily_loss: 50, max_drawdown_pct: 20, stop_loss_pct: 0, take_profit_pct: 0, cash_reserve_pct: 20, proactive_interval_mins: 30, proactive_max_daily: 20 });
        } }, I('edit'), ' Config')
      )
    ),

    // Two-column layout: pill sidebar + content
    h('div', { style: { display: 'flex', gap: 20, minHeight: 600 } },

    // ── Left Sidebar: Grouped vertical nav ──
    h('nav', { style: { flexShrink: 0, width: 170, borderRight: '1px solid var(--border)', paddingRight: 16, position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: '100vh', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, paddingBottom: 16 } },
        tabGroups.map(function(group) {
          return h('div', { key: group.label },
            h('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, paddingLeft: 10 } }, group.label),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
              group.tabs.map(function(t) {
                var isActive = tab === t.id;
                return h('button', { key: t.id, onClick: function(e) { setTab(t.id); var nav = e.currentTarget.closest('nav'); if (nav && nav.parentElement) { var top = nav.parentElement.getBoundingClientRect().top + window.scrollY; window.scrollTo({ top: top, behavior: 'instant' }); } }, style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative',
                  padding: '6px 10px', borderRadius: 6, border: 'none',
                  background: isActive ? 'var(--brand-color, #6366f1)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: isActive ? 700 : 600, cursor: 'pointer',
                  transition: 'all 0.12s', textAlign: 'left', width: '100%'
                }, onMouseEnter: function(e) { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)'; },
                   onMouseLeave: function(e) { if (!isActive) e.currentTarget.style.background = 'transparent'; }
                },
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, t.icon && I(t.icon), t.label),
                  t.count > 0 && h('span', { style: { fontSize: 10, fontWeight: 600, background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)', color: isActive ? '#fff' : 'var(--text-muted)', borderRadius: 99, padding: '1px 6px', minWidth: 18, textAlign: 'center' } }, t.count),
                  h('div', { style: { position: 'absolute', bottom: 0, left: 10, right: 10, height: 1, background: 'var(--border)' } })
                );
              })
            )
          );
        })
      )
    ),

    // ── Right Content Pane ──
    h('div', { style: { flex: 1, minWidth: 0 } },

    // ═══ OVERVIEW ═══
    tab === 'overview' && h('div', null,
      tabHeader('Overview', 'trending-up',
        h(Fragment, null,
          h('p', null, 'High-level snapshot of your Polymarket trading agents. Shows wallet status, trade counts, win rate, P&L, and key metrics at a glance.'),
          h('h4', { style: _h4 }, 'Key Metrics'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Win Rate'), ' — Percentage of resolved predictions that were correct.'),
            h('li', null, h('strong', null, 'P&L'), ' — Total profit/loss from resolved predictions.'),
            h('li', null, h('strong', null, 'Drawdown'), ' — Current peak-to-trough decline in portfolio value.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Create an agent with the "Polymarket Trader" template (Finance category) to get started.')
        )
      ),
      h('div', { className: 'stats-grid', style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "12px", marginBottom: "24px" } },
        statCard('Funder', wallet ? shortAddr(wallet.address) : 'Not set', wallet ? 'Connected' : null),
        wallet && wallet.signerAddress && wallet.signerAddress !== wallet.address ? statCard('Signer', shortAddr(wallet.signerAddress), 'Trading key') : null,
        statCard('Mode', config?.mode || 'N/A'),
        statCard('Pending', pendingTrades.length),
        statCard('Live Positions', livePositions.length),
        statCard('Total Trades', tradeHistory.length),
        statCard('Win Rate', resolvedPreds.length > 0 ? Math.round(correctPreds.length / resolvedPreds.length * 100) + '%' : 'N/A'),
        statCard('P&L', resolvedPreds.length > 0 ? '$' + totalPredPnl.toFixed(2) : 'N/A', totalPredPnl >= 0 ? 'profit' : 'loss'),
        statCard('Whales Tracked', whales.length),
        statCard('Active Snipers', activeSnipers.length),
        statCard('Active Hedges', activeHedges.length),
        statCard('Exit Rules', exitRules.length),
        statCard('Arb Opps', arbitrage.length),
        statCard('Lessons', lessons.length),
        statCard('Drawdown', drawdown ? drawdown.drawdown_pct + '%' : 'N/A'),
        statCard('Social Signals', socialSignals.length),
        statCard('Events', events.length),
      ),
      // ── Daily Scorecard ──
      dailyScorecard && h('div', { className: 'card', style: { padding: 16, marginBottom: 20 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
          h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Daily Scorecard'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('button', { className: 'btn btn-sm btn-secondary', style: { fontSize: 11, padding: '2px 8px' }, onClick: openTargetModal }, I('journal'), ' Set Target'),
            h('span', { className: 'badge ' + (dailyScorecard.status === 'TARGET_HIT' ? 'badge-success' : dailyScorecard.status === 'AHEAD' ? 'badge-success' : dailyScorecard.status === 'ON_TRACK' ? 'badge-secondary' : dailyScorecard.status === 'STOP_TRADING' ? 'badge-danger' : 'badge-warning') }, dailyScorecard.status?.replace(/_/g, ' '))
          )
        ),
        // Progress bar
        h('div', { style: { marginBottom: 12 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text-muted)' } },
            h('span', null, 'P&L: $' + (dailyScorecard.total_pnl || 0).toFixed(2)),
            h('span', { style: { cursor: 'pointer', textDecoration: 'underline dotted' }, title: 'Click to change daily target', onClick: openTargetModal }, 'Target: $' + (dailyScorecard.daily_target || 0))
          ),
          h('div', { style: { height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: Math.min(100, Math.max(0, dailyScorecard.target_progress_pct || 0)) + '%', background: (dailyScorecard.total_pnl || 0) >= 0 ? '#22c55e' : '#ef4444', borderRadius: 4, transition: 'width 0.3s' } })
          ),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, dailyScorecard.daily_target > 0 ? (dailyScorecard.target_progress_pct || 0).toFixed(0) + '% of daily target' : 'No daily target set \u2014 click "Set Target" above')
        ),
        // Score metrics row
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 } },
          h('div', { style: { textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 } },
            h('div', { style: { fontSize: 18, fontWeight: 700, color: (dailyScorecard.realized_pnl || 0) >= 0 ? '#22c55e' : '#ef4444' } }, '$' + (dailyScorecard.realized_pnl || 0).toFixed(2)),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, 'Realized')
          ),
          h('div', { style: { textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 } },
            h('div', { style: { fontSize: 18, fontWeight: 700, color: (dailyScorecard.unrealized_pnl || 0) >= 0 ? '#22c55e' : '#ef4444' } }, '$' + (dailyScorecard.unrealized_pnl || 0).toFixed(2)),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, 'Unrealized')
          ),
          h('div', { style: { textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 } },
            h('div', { style: { fontSize: 18, fontWeight: 700 } }, dailyScorecard.trades_today || 0),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, 'Trades')
          ),
          h('div', { style: { textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 } },
            h('div', { style: { fontSize: 18, fontWeight: 700 } }, (dailyScorecard.win_rate_today || 0).toFixed(0) + '%'),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, 'Win Rate')
          ),
          h('div', { style: { textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 } },
            h('div', { style: { fontSize: 18, fontWeight: 700 } }, '$' + (dailyScorecard.available_capital || 0).toFixed(0)),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, 'Available')
          ),
          h('div', { style: { textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 6 } },
            h('div', { style: { fontSize: 18, fontWeight: 700 } }, dailyScorecard.open_positions || 0),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, 'Positions')
          )
        )
      ),
      agents.length === 0 && h('div', { className: 'empty-state card', style: { padding: "40px", textAlign: "center" } },
        h('h3', null, 'No Polymarket Agents'),
        h('p', null, 'Create an agent with the Polymarket Trader template to get started.'),
        h('p', { style: { color: "var(--text-muted)" } }, 'Agents \u2192 Create Agent \u2192 "Polymarket Trader" (Finance)')
      )
    ),

    // ═══ PENDING TRADES ═══
    tab === 'pending' && h('div', null,
      tabHeader('Pending Orders', 'check',
        h(Fragment, null,
          h('p', null, 'All pending orders — both buy and sell. Includes trades awaiting your approval (in approval mode) as well as automatically placed orders that are pending execution on the exchange.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Pending Buy Orders'), ' — Buy orders placed by the agent or awaiting approval before execution.'),
            h('li', null, h('strong', null, 'Pending Sell Orders'), ' — Sell orders placed automatically (e.g. stop-loss, take-profit) or manually, awaiting execution.'),
            h('li', null, h('strong', null, 'Approve'), ' — Executes the trade on Polymarket via the CLOB API.'),
            h('li', null, h('strong', null, 'Reject'), ' — Cancels the trade. The agent learns from rejections.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Switch to "autonomous" mode in Config to let the agent trade without approval (within risk limits).')
        )
      ),
      // Pending Buy Orders section
      (function() {
        var pendingBuys = pendingTrades.filter(function(t) { return (t.side || '').toUpperCase() === 'BUY'; });
        var pendingSells = pendingTrades.filter(function(t) { return (t.side || '').toUpperCase() === 'SELL'; });
        var needsApproval = pendingTrades.filter(function(t) { return t.status === 'pending' || !t.status; });
        var autoPlaced = pendingTrades.filter(function(t) { return t.status === 'placed'; });
        return h(Fragment, null,
          pendingBuys.length > 0 && h('div', { style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { color: '#10b981' } }, '\u25B2'),
              'Pending Buy Orders',
              h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, pendingBuys.length)
            )
          ),
          pendingSells.length > 0 && h('div', { style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { color: '#ef4444' } }, '\u25BC'),
              'Pending Sell Orders',
              h('span', { className: 'badge badge-danger', style: { fontSize: 10 } }, pendingSells.length)
            )
          ),
          autoPlaced.length > 0 && h('div', { style: { padding: '8px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', null, '\u23F3'),
            h('span', null, h('strong', null, autoPlaced.length), ' order(s) placed and awaiting exchange execution'),
          ),
          needsApproval.length > 0 && h('div', { style: { padding: '8px 12px', background: 'rgba(180,83,9,0.08)', borderRadius: 8, border: '1px solid rgba(180,83,9,0.2)', marginBottom: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', null, '\u26A0\uFE0F'),
            h('span', null, h('strong', null, needsApproval.length), ' order(s) awaiting your approval'),
          )
        );
      })(),
      renderFilteredTable('pending', pendingTrades, 'No pending orders',
      ['Market', 'Position', 'Outcome', 'Shares', 'Price', 'Cost', 'Urgency', 'Created', 'Actions'],
      function(t) { return [
        h('td', null, h('div', { style: { maxWidth: "240px" } }, h('strong', null, t.outcome || '?'), h('div', { className: 'text-muted small' }, t.market_question || ''))),
        h('td', null, sideBadge(t.side)),
        h('td', null, t.outcome
          ? h('span', { className: 'badge ' + ((t.outcome || '').toLowerCase() === 'yes' ? 'badge-success' : (t.outcome || '').toLowerCase() === 'no' ? 'badge-danger' : 'badge-secondary') }, t.outcome)
          : sideBadge(t.side, { asOutcome: true })
        ),
        h('td', null, (t.size || 0).toFixed(1)),
        h('td', null, t.price ? (t.price * 100).toFixed(1) + '\u00a2' : 'Market'),
        h('td', null, '$' + ((t.price || 0) * (t.size || 0)).toFixed(2)),
        h('td', null, h('span', { className: 'badge badge-' + (t.urgency === 'high' ? 'warning' : 'secondary') }, t.urgency || 'normal')),
        h('td', null, fmtDate(t.created_at)),
        h('td', null, h('div', { style: { display: "flex", gap: "4px" } },
          h('button', { className: 'btn btn-sm btn-success', onClick: function() { decideTrade(t.id, 'approve'); } }, I('check')),
          h('button', { className: 'btn btn-sm btn-danger', onClick: function() { decideTrade(t.id, 'reject'); } }, I('x'))
        )),
      ]; },
      { searchFields: ['market_question', 'outcome'], filters: [
        { key: 'side', label: 'Side', options: ['BUY', 'SELL'] },
        { key: 'status', label: 'Status', options: ['pending', 'placed', 'cancelled'] },
        { key: 'urgency', label: 'Urgency', options: ['normal', 'high'] }
      ]}
    )),

    // ═══ TRADE HISTORY ═══
    tab === 'history' && h('div', null,
      tabHeader('Trade History', 'activity',
        h(Fragment, null,
          h('p', null, 'Complete log of all executed trades. Shows fill prices, P&L, and trade status.'),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use the Journal tab to see prediction accuracy alongside trade outcomes.')
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' } },
        viewArchiveToggle('trades', tradeHistory.length ? '' : 'view past')
      ),
      showArchive.trades ? (
        archiveLoading ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading archive...') :
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' } }, I('database'), ' Archived Trades (', (showArchive.trades_data?.total || 0), ')'),
          (showArchive.trades_data?.rows || []).length === 0 ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No archived trades yet.') :
          h('div', { className: 'table-container' }, h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, ['Market','Side','Outcome','Shares','Price','Status','Date'].map(function(hd) { return h('th', { key: hd }, hd); }))),
            h('tbody', null, (showArchive.trades_data?.rows || []).map(function(t) {
              return h('tr', { key: t.id },
                h('td', null, h('div', { style: { maxWidth: 220 } }, t.market_question || '')),
                h('td', null, sideBadge(t.side)),
                h('td', null, t.outcome ? h('span', { className: 'badge badge-' + (t.outcome.toLowerCase() === 'yes' ? 'success' : 'danger') }, t.outcome) : '--'),
                h('td', null, (t.size || 0).toFixed(1)),
                h('td', null, ((t.price || 0) * 100).toFixed(1) + '\u00a2'),
                h('td', null, h('span', { className: 'badge badge-' + (t.status === 'filled' ? 'success' : t.status === 'failed' ? 'danger' : 'secondary') }, t.status)),
                h('td', null, fmtDate(t.created_at))
              );
            }))
          ))
        )
      ) :
      renderFilteredTable('history', tradeHistory, 'No trade history',
      ['Market', 'Position', 'Outcome', 'Shares', 'Price', 'Cost', 'Status', 'P&L', 'Date'],
      function(t) { return [
        h('td', null, h('div', { style: { maxWidth: "240px" } }, t.market_question || shortId(t.token_id))),
        h('td', null, sideBadge(t.side)),
        h('td', null, t.outcome
          ? h('span', { className: 'badge ' + (t.outcome.toLowerCase() === 'yes' ? 'badge-success' : t.outcome.toLowerCase() === 'no' ? 'badge-danger' : 'badge-secondary') }, t.outcome)
          : h('span', { className: 'text-muted' }, '--')
        ),
        h('td', null, (t.size || 0).toFixed(1)),
        h('td', null, ((t.fill_price || t.price || 0) * 100).toFixed(1) + '\u00a2'),
        h('td', null, '$' + ((t.fill_price || t.price || 0) * (t.size || 0)).toFixed(2)),
        h('td', null, h('span', { className: 'badge badge-' + (t.status === 'placed' || t.status === 'filled' ? 'success' : t.status === 'failed' || t.status === 'no_wallet' ? 'danger' : 'secondary') }, t.status)),
        h('td', null, t.pnl != null ? pnlCell(t.pnl) : (t.status === 'placed' || t.status === 'filled' ? h('span', { className: 'text-muted', style: { fontSize: 11 } }, 'Open') : '--')),
        h('td', null, fmtDate(t.created_at)),
      ]; },
      { searchFields: ['market_question', 'token_id', 'outcome'], filters: [
        { key: 'side', label: 'Side', options: ['BUY', 'SELL'] },
        { key: 'outcome', label: 'Outcome', options: ['Yes', 'No'] },
        { key: 'status', label: 'Status', options: ['placed', 'filled', 'failed', 'no_wallet', 'pending', 'cancelled', 'rejected'] }
      ]}
    )),

    // ═══ WALLET ═══
    tab === 'wallet' && h('div', null,
      tabHeader('Wallet & Balance', 'shield',
        h(Fragment, null,
          h('p', null, 'Your Polymarket wallet on Polygon. Manage balances, whitelisted withdrawal addresses, and fund transfers.'),
          h('h4', { style: _h4 }, 'Sections'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Balances'), ' \u2014 Live USDC and MATIC balances on Polygon. Auto-refreshes every 15 seconds.'),
            h('li', null, h('strong', null, 'Deposit'), ' \u2014 Send USDC on Polygon network to your wallet address. Supports bridging from Ethereum, Arbitrum, Base, and Optimism via polymarket.com.'),
            h('li', null, h('strong', null, 'Export Private Key'), ' \u2014 Owner-only. Reveals the private key so you can import the wallet into MetaMask, Rabby, or any EVM wallet for direct access.'),
            h('li', null, h('strong', null, 'Withdrawal Addresses'), ' \u2014 Whitelist addresses that can receive transfers. Each address has a configurable cooling period, per-transaction limit, and daily limit.'),
            h('li', null, h('strong', null, 'Pending Transfers'), ' \u2014 Agent-requested transfers awaiting your approval. All transfers are approval-gated and cannot be auto-approved.'),
            h('li', null, h('strong', null, 'Live Positions'), ' \u2014 Real-time prices for your open Polymarket positions via SSE streaming.')
          ),
          h('h4', { style: _h4 }, 'Security Model'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Whitelist-only'), ' \u2014 Agents can ONLY transfer to pre-registered addresses. No arbitrary destinations.'),
            h('li', null, h('strong', null, 'Cooling period'), ' \u2014 Configurable delay (default 24h) before new addresses can receive funds.'),
            h('li', null, h('strong', null, 'Always approval-gated'), ' \u2014 Every transfer requires owner approval. Cannot be bypassed.'),
            h('li', null, h('strong', null, 'Per-tx + daily limits'), ' \u2014 Each address has dollar limits that the agent cannot exceed.'),
            h('li', null, h('strong', null, 'Audit trail'), ' \u2014 Every action (add, remove, approve, reject, export) is logged.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'To withdraw funds, first add a withdrawal address here, wait for the cooling period, then ask the agent to transfer funds via chat.')
        )
      ),
      // Live positions & prices (top of wallet tab)
      livePrices?.positions?.length > 0 && h('div', { style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { fontSize: 14, fontWeight: 600 } }, 'Live Positions'),
            h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' } }),
            h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Streaming every 3s'),
          ),
          livePrices.totalPnl != null && h('span', { style: {
            padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
            background: livePrices.totalPnl >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: livePrices.totalPnl >= 0 ? '#10b981' : '#ef4444'
          } }, 'Total P&L: ' + (livePrices.totalPnl >= 0 ? '+' : '') + '$' + livePrices.totalPnl.toFixed(2))
        ),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 } },
          livePrices.positions.some(function(p) { return p.redeemable && !p.isLost; })
            ? h('button', { className: 'btn btn-sm', disabled: redeemExecuting === 'all',
                style: { background: 'rgba(180,83,9,0.15)', border: '1px solid rgba(180,83,9,0.3)', color: '#b45309', fontWeight: 600, cursor: redeemExecuting === 'all' ? 'not-allowed' : 'pointer' },
                onClick: executeRedeemAll
              }, redeemExecuting === 'all' ? 'Claiming All...' : I('award'), ' Redeem All Winnings')
            : null,
          h('button', { className: 'btn btn-sm btn-primary', onClick: function() { setShowBuyModal(true); setBuySearch(''); setBuyResults([]); setBuySelected(null); } }, I('plus'), ' Buy Position')
        ),
        renderFilteredTable('livePositions', livePrices.positions, '',
          ['Market', 'Position', 'Outcome', 'Shares', 'Entry', 'Current', 'Cost', 'Win Amount', 'P&L', 'P&L %', 'Ends', ''],
          function(p) {
            var oc = p.outcome || resolveOutcome(p.side, p.outcome);
            var isWon = p.isWon || (p.resolved && p.current >= 0.99);
            var isLost = p.isLost || (p.resolved && p.current <= 0.01);
            // Win amount = total payout if prediction is correct (shares × $1 = full amount you get back)
            var cost = (p.entry || 0) * (p.size || 0);
            var winAmount = (p.size || 0); // each winning share pays $1, so total payout = number of shares
            var statusBadge = p.redeemable
              ? h('span', { className: 'badge', style: { background: 'rgba(180,83,9,0.15)', color: '#b45309', fontSize: 9, marginLeft: 6 } }, 'REDEEM')
              : isWon
                ? h('span', { className: 'badge', style: { background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 9, marginLeft: 6 } }, 'WON')
                : isLost
                  ? h('span', { className: 'badge', style: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 9, marginLeft: 6 } }, 'LOST')
                  : null;
            return [
              h('td', { key: 'm', style: { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                h('span', { title: p.market || shortId(p.token_id) }, ((p.market || shortId(p.token_id)).length > 12 ? (p.market || shortId(p.token_id)).slice(0, 12) + '...' : (p.market || shortId(p.token_id))), statusBadge)
              ),
              h('td', { key: 's' }, sideBadge(p.side)),
              h('td', { key: 'o' }, oc
                ? h('span', { className: 'badge ' + (oc.toLowerCase() === 'yes' ? 'badge-success' : oc.toLowerCase() === 'no' ? 'badge-danger' : 'badge-secondary') }, oc)
                : h('span', { className: 'text-muted' }, '--')
              ),
              h('td', { key: 'sh' }, (p.size || 0).toFixed(1)),
              h('td', { key: 'e' }, (p.entry * 100).toFixed(1) + '\u00a2'),
              h('td', { key: 'c', style: { fontWeight: 600, color: isWon ? '#10b981' : isLost ? '#ef4444' : undefined } },
                isWon ? '100.0\u00a2' : isLost ? '0.0\u00a2' : (p.current * 100).toFixed(1) + '\u00a2'
              ),
              h('td', { key: 'sz' }, '$' + cost.toFixed(2)),
              h('td', { key: 'win', style: { fontWeight: 600, color: '#10b981' } },
                isWon ? h('span', null, '$' + winAmount.toFixed(2), h('span', { style: { fontSize: 10, marginLeft: 4, opacity: 0.7 } }, 'WON'))
                : isLost ? h('span', { style: { color: '#ef4444' } }, '$0.00')
                : h('span', null, '$' + winAmount.toFixed(2),
                    h('span', { style: { fontSize: 10, marginLeft: 4, color: '#10b981', opacity: 0.7 } }, ' (+$' + (winAmount - cost).toFixed(2) + ' profit)')
                  )
              ),
              h('td', { key: 'pnl' }, pnlCell(p.pnl)),
              h('td', { key: 'pp', style: { color: (p.pnlPct || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 } }, (p.pnlPct >= 0 ? '+' : '') + (p.pnlPct || 0).toFixed(1) + '%'),
              h('td', { key: 'end', style: { fontSize: 11, whiteSpace: 'nowrap' } },
                isWon
                  ? h('span', { style: { color: '#10b981', fontWeight: 700 } }, 'WON')
                  : isLost
                    ? h('span', { style: { color: '#ef4444', fontWeight: 700 } }, 'LOST')
                    : p.endDate ? (function() {
                        var d = new Date(p.endDate);
                        if (isNaN(d.getTime())) return '--';
                        var now = Date.now();
                        var diff = d.getTime() - now;
                        var days = Math.floor(diff / 86400000);
                        var label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        if (diff < 0) return h('span', { style: { color: '#ef4444' } }, 'Ended');
                        if (days === 0) return h('span', { style: { color: '#b45309', fontWeight: 600 } }, 'Today');
                        if (days <= 3) return h('span', { style: { color: '#b45309' } }, days + 'd · ' + label);
                        return label;
                      })() : '--'
              ),
              h('td', { key: 'act' },
                p.redeemable && !isLost
                  ? h('button', { className: 'btn btn-sm', disabled: redeemExecuting === p.conditionId || redeemExecuting === 'all',
                      style: { minWidth: 50, fontSize: 11, background: 'rgba(180,83,9,0.15)', border: '1px solid rgba(180,83,9,0.3)', color: '#b45309', fontWeight: 600, cursor: (redeemExecuting === p.conditionId || redeemExecuting === 'all') ? 'not-allowed' : 'pointer' },
                      onClick: function(e) { e.stopPropagation(); executeRedeem(p); }
                    }, redeemExecuting === p.conditionId ? 'Claiming...' : 'Redeem')
                  : isLost
                    ? h('span', { style: { fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Resolved')
                    : isWon
                      ? h('span', { style: { fontSize: 10, color: '#10b981', fontWeight: 600 } }, 'Awaiting redeem')
                      : h('button', { className: 'btn btn-sm btn-danger', disabled: sellExecuting === p.token_id,
                          style: { minWidth: 50, fontSize: 11 },
                          onClick: function(e) { e.stopPropagation(); openSellModal(p); }
                        }, sellExecuting === p.token_id ? '...' : 'Sell')
              )
            ];
          }, { searchKeys: ['market', 'outcome'], pageSize: 6 }
        )
      ),

      !wallet && !walletBalance && h('div', { className: 'card', style: { padding: 24, textAlign: 'center' } },
        h('div', { style: { marginBottom: 12 } }, I('key')),
        h('h3', { style: { marginBottom: 8 } }, 'No Wallet Connected'),
        h('p', { style: { color: 'var(--text-muted)', marginBottom: 16 } }, 'Set up a wallet so your agent can trade on Polymarket. You can create a new wallet, import an existing one, or connect your existing Polymarket account.'),
        h('button', { className: 'btn btn-primary', onClick: function() { setImportKey(''); setCreatedWallet(null); setWalletSetupTab('create'); setShowImportWallet(true); } }, I('plus'), ' Set Up Wallet'),
      ),
      (wallet || walletBalance) && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
        // Balance card
        h('div', { className: 'card', style: { padding: 20 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
            h('div', { style: { fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 } }, 'Balances',
              h(HelpButton, { label: 'Wallet Balances' },
                h('p', null, 'Live balances fetched directly from the Polygon blockchain. Auto-refreshes every 15 seconds.'),
                h('ul', { style: _ul },
                  h('li', null, h('strong', null, 'USDC.e (Bridged)'), ' \u2014 The stablecoin used for trading on Polymarket. This is your available trading balance. Polymarket only accepts USDC.e, not native USDC.'),
                  h('li', null, h('strong', null, 'USDC (Native)'), ' \u2014 Native USDC on Polygon. Not directly usable on Polymarket \u2014 must be swapped to USDC.e first. Use the swap function below if you have native USDC.'),
                  h('li', null, h('strong', null, 'POL'), ' \u2014 Polygon gas token (formerly MATIC). Needed for transaction fees. Keep at least 0.1 POL for gas.'),
                  h('li', null, h('strong', null, 'Portfolio Value'), ' \u2014 Total value of all open positions at current market prices, including unrealized P&L.'),
                  h('li', null, h('strong', null, 'Transfers'), ' \u2014 To withdraw funds, set up a 2FA or wallet PIN first, then initiate a transfer to a whitelisted address.')
                )
              )
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              walletLoading && h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: '#b45309', animation: 'pulse 1s infinite' } }),
              h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, walletLoading ? 'Refreshing...' : 'Auto-refreshes every 15s')
            )
          ),
          walletBalance?.balances ? h('div', { style: { display: 'grid', gap: 12 } },
            // USDC.e (bridged + exchange) — total available cash for trading
            (function() {
              var onChain = walletBalance.balances.usdce != null ? walletBalance.balances.usdce : walletBalance.balances.usdc || 0;
              var onExchange = walletBalance.balances.exchange || 0;
              var totalCash = onChain + onExchange;
              return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.15)' } },
                h('div', null,
                  h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 } }, 'USDC.e',
                    h('span', { style: { fontSize: 9, padding: '1px 5px', background: 'rgba(16,185,129,0.15)', borderRadius: 4, color: '#10b981', fontWeight: 600 } }, 'CASH')
                  ),
                  h('div', { style: { fontSize: 24, fontWeight: 700 } }, '$' + totalCash.toFixed(2)),
                  onExchange > 0 && onChain > 0 ? h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, '$' + onChain.toFixed(2) + ' wallet + $' + onExchange.toFixed(2) + ' exchange') :
                  onExchange > 0 ? h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, 'On exchange (ready to trade)') : null
                ),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' } },
                  h('div', null, 'Cash / Liquidity'),
                  h('div', null, 'Available to trade')
                )
              );
            })(),
            // Native USDC (not directly usable on Polymarket)
            (walletBalance.balances.usdcNative != null && walletBalance.balances.usdcNative > 0) && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 16px', background: 'rgba(180,83,9,0.06)', borderRadius: 8, border: '1px solid rgba(180,83,9,0.2)' } },
              h('div', null,
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 } }, 'USDC (Native)',
                  h('span', { style: { fontSize: 9, padding: '1px 5px', background: 'rgba(180,83,9,0.15)', borderRadius: 4, color: '#b45309', fontWeight: 600 } }, 'NEEDS SWAP')
                ),
                h('div', { style: { fontSize: 18, fontWeight: 600 } }, '$' + (walletBalance.balances.usdcNative || 0).toFixed(2))
              ),
              h('div', { style: { fontSize: 11, color: '#b45309', textAlign: 'right' } },
                h('div', null, 'Not usable on Polymarket'),
                h('div', null, 'Swap to USDC.e to trade')
              )
            ),
            // Swap section — USDC.e <-> Native USDC
            (walletBalance.needsSwap || walletBalance.balances.usdcNative > 0 || (walletBalance.balances.usdce != null ? walletBalance.balances.usdce : walletBalance.balances.usdc || 0) > 0) && h('div', { style: { padding: '12px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                h('div', { style: { fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 } },
                  '\u21C4', ' Swap USDC',
                  h(HelpButton, { label: 'USDC Swap' },
                    h('p', null, 'Polymarket uses USDC.e (bridged USDC), not native USDC. If you received native USDC, swap it to USDC.e to trade. You can also swap USDC.e back to native USDC for withdrawals to exchanges that only accept native USDC.'),
                    h('p', null, 'Swaps are executed directly on-chain via Uniswap V3 — no agent or LLM call required.'),
                  )
                )
              ),
              h('div', { style: { display: 'flex', gap: 8 } },
                walletBalance.balances.usdcNative > 0 && h('button', {
                  className: 'btn btn-sm btn-warning',
                  onClick: function() {
                    setSwapAmount(walletBalance.balances.usdcNative.toFixed(2));
                    setSwapModal({ direction: 'native_to_bridged', maxAmount: walletBalance.balances.usdcNative, label: 'Native USDC \u2192 USDC.e' });
                  }
                }, 'Swap Native USDC \u2192 USDC.e ($' + (walletBalance.balances.usdcNative || 0).toFixed(2) + ')'),
                (walletBalance.balances.usdce != null ? walletBalance.balances.usdce : walletBalance.balances.usdc || 0) > 0 && h('button', {
                  className: 'btn btn-sm btn-secondary',
                  onClick: function() {
                    var usdceBalance = walletBalance.balances.usdce != null ? walletBalance.balances.usdce : walletBalance.balances.usdc || 0;
                    setSwapAmount('');
                    setSwapModal({ direction: 'bridged_to_native', maxAmount: usdceBalance, label: 'USDC.e \u2192 Native USDC' });
                  }
                }, 'Swap USDC.e \u2192 Native USDC')
              ),
              walletBalance.needsSwap && h('div', { style: { marginTop: 8, fontSize: 11, color: '#b45309' } },
                '\u26A0\uFE0F Polymarket requires USDC.e. Swap your native USDC above to start trading.'
              )
            ),
            // POL/MATIC gas token
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: (walletBalance.balances.matic || 0) < 1 ? 'rgba(239,68,68,0.06)' : 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid ' + ((walletBalance.balances.matic || 0) < 1 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)') } },
              h('div', null,
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'POL'),
                h('div', { style: { fontSize: 18, fontWeight: 600 } }, (walletBalance.balances.matic || 0).toFixed(4))
              ),
              h('div', { style: { fontSize: 11, color: (walletBalance.balances.matic || 0) < 1 ? '#ef4444' : 'var(--text-muted)', textAlign: 'right' } },
                h('div', null, 'Gas token'),
                (walletBalance.balances.matic || 0) < 1 && h('div', { style: { fontWeight: 600, marginTop: 2 } }, 'Low! Deposit $5\u2013$10 of POL')
              )
            ),
            walletBalance?.portfolio && (function() {
              // Use live SSE data for real-time portfolio value when available
              var port = walletBalance.portfolio;
              var invested = port.investedValue || 0;
              var currentVal = port.currentValue || 0;
              var pnl = port.pnl || 0;
              var portfolioVal = port.totalValue || 0;
              var posCount = port.openPositions || 0;
              return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)' } },
                h('div', null,
                  h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 } }, 'PORTFOLIO VALUE'),
                  h('div', { style: { fontSize: 18, fontWeight: 600 } }, '$' + portfolioVal.toFixed(2)),
                  h('div', { style: { fontSize: 11, fontWeight: 600, color: pnl >= 0 ? '#10b981' : '#ef4444' } }, (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ' P&L')
                ),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' } },
                  h('div', null, posCount + ' open positions'),
                  h('div', null, '$' + invested.toFixed(2) + ' invested')
                )
              );
            })()
          ) : h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)' } }, walletLoading ? 'Loading balances...' : 'Could not fetch balances'),
          h('button', { className: 'btn btn-secondary btn-sm', style: { marginTop: 12 }, onClick: function() { loadWalletBalance(selectedAgent); } }, I('refresh-cw'), ' Refresh')
        ),
        // Deposit card
        h('div', { className: 'card', style: { padding: 20 } },
          h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 } }, 'Deposit USDC',
            h(HelpButton, { label: 'Deposit USDC' },
              h('p', null, 'Fund your trading wallet by sending USDC on the Polygon network.'),
              h('ul', { style: _ul },
                h('li', null, 'Send ', h('strong', null, 'USDC on Polygon only'), '. Other tokens or networks will result in lost funds.'),
                h('li', null, 'You can also bridge from Ethereum, Arbitrum, Base, or Optimism via ', h('a', { href: 'https://polymarket.com', target: '_blank' }, 'polymarket.com'), '.'),
                h('li', null, 'Polygon confirmations take ~2 seconds. Balance updates within 15 seconds.'),
                h('li', null, h('strong', null, 'Also deposit $5\u2013$10 worth of POL'), ' (Polygon gas token) for transaction fees. Swaps, trades, and approvals each cost ~$0.01 in POL gas. Keep your POL balance topped up when running low.')
              )
            )
          ),
          h('div', { style: { padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 12 } },
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'DEPOSIT ADDRESS (Polygon)'),
            h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', userSelect: 'all', color: 'var(--text)' } },
              (wallet?.address || walletBalance?.address || 'N/A')
            ),
            h('button', { className: 'btn btn-secondary btn-sm', style: { marginTop: 8 }, onClick: function() {
              navigator.clipboard?.writeText(wallet?.address || walletBalance?.address || '');
              toast('Address copied', 'success');
            } }, 'Copy Address')
          ),
          h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 } },
            h('div', { style: { fontWeight: 600, marginBottom: 6 } }, 'How to deposit:'),
            h('ol', { style: { margin: 0, paddingLeft: 20 } },
              h('li', null, 'Send USDC on the ', h('strong', null, 'Polygon'), ' network to the address above'),
              h('li', null, 'Also send ', h('strong', null, '$5\u2013$10 worth of POL'), ' (Polygon gas token) to the same address for transaction fees'),
              h('li', null, 'Confirmation takes ~2 seconds on Polygon'),
              h('li', null, 'You can also deposit via ', h('a', { href: 'https://polymarket.com', target: '_blank', style: { color: 'var(--brand)' } }, 'polymarket.com'), ' bridge from Ethereum, Arbitrum, Base, or Optimism')
            )
          ),
          h('div', { style: { marginTop: 12, padding: 10, background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 6, fontSize: 12, color: '#b45309' } },
            h('strong', null, '\u26A0 '), 'Only send USDC on Polygon. Sending other tokens or on other networks will result in loss of funds.'
          )
        )
      ),
      // Wallet management bar
      (wallet || walletBalance) && h('div', { style: { display: 'flex', gap: 8, marginTop: 16, marginBottom: 4 } },
        h('button', { className: 'btn btn-sm btn-secondary', onClick: async function() {
          if (!(await showConfirm('Export your wallet private key?\n\nThis will reveal the private key that controls all funds. Only do this if you need to import the wallet into MetaMask, Rabby, or another wallet app.\n\nThis action is logged in the audit trail.'))) return;
          try {
            var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/export', { method: 'POST', body: JSON.stringify({ confirm: 'EXPORT' }) });
            if (res.privateKey) { setExportedKey(res); }
            else { toast(res.error || 'Export failed', 'error'); }
          } catch (e) { toast(e.message || 'Export failed — owner access required', 'error'); }
        } }, I('key'), ' Export Private Key'),
        h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { setImportKey(''); setShowImportWallet(true); } }, I('download'), ' Import Wallet'),
        h('button', { className: 'btn btn-sm btn-secondary', onClick: async function() {
          setShowTxHistory(true); setTxLoading(true); setTxPage(1); setTxFilter('all'); setTxSearch('');
          try {
            var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/transactions?page=1&pageSize=50&type=all');
            setTxHistory(res.transactions || []); setTxHasMore(res.hasMore || false);
          } catch (e) { toast(e.message, 'error'); setTxHistory([]); }
          setTxLoading(false);
        } }, I('clock'), ' Transaction History'),
        h('a', { href: 'https://polygonscan.com/address/' + (wallet?.signerAddress || wallet?.address || walletBalance?.address), target: '_blank', className: 'btn btn-sm btn-secondary' }, I('globe'), ' View on PolygonScan'),
        h('button', { className: 'btn btn-sm btn-secondary', title: 'Flush in-memory wallet cache and reload from database', onClick: async function() {
          try {
            var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/sync', { method: 'POST' });
            toast(res.message || 'Wallet synced', 'success');
            loadAgentData(selectedAgent);
          } catch (e) { toast(e.message || 'Sync failed', 'error'); }
        } }, I('refresh'), ' Sync Wallet'),
        h('button', { className: 'btn btn-sm btn-primary', onClick: function() {
          setTransferForm({ to_address: '', amount: '', token: 'USDC.e', reason: '' });
          setTransferCode('');
          if (transferUnlocked && transferUnlockExpiry && Date.now() < transferUnlockExpiry) {
            setTransferVerifyStep('unlocked');
          } else {
            setTransferUnlocked(false);
            setTransferUnlockExpiry(null);
            setTransferVerifyStep('locked');
          }
          setShowTransferModal(true);
          loadWalletSecurity(selectedAgent);
        } }, I('send'), ' Transfer Funds',
          transferUnlocked && transferUnlockExpiry ? h('span', { style: { fontSize: 9, marginLeft: 6, padding: '1px 5px', background: 'rgba(16,185,129,0.2)', borderRadius: 4, color: '#10b981' } },
            Math.max(0, Math.ceil((transferUnlockExpiry - Date.now()) / 60000)) + 'min left'
          ) : null
        )
      ),

      // ── Swap Modal ──
      swapModal && h(Modal, {
        title: swapModal.label,
        width: 420,
        onClose: function() { if (!swapLoading) { setSwapModal(null); setSwapAmount(''); } },
        footer: h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', { className: 'btn btn-secondary', disabled: swapLoading, onClick: function() { setSwapModal(null); setSwapAmount(''); } }, 'Cancel'),
          h('button', {
            className: 'btn btn-primary',
            disabled: swapLoading || !swapAmount || parseFloat(swapAmount) <= 0 || parseFloat(swapAmount) > swapModal.maxAmount,
            onClick: async function() {
              var amt = parseFloat(swapAmount);
              if (isNaN(amt) || amt <= 0 || amt > swapModal.maxAmount) { toast('Invalid amount (max $' + swapModal.maxAmount.toFixed(2) + ')', 'error'); return; }
              setSwapLoading(true);
              setSwapCountdown(99);
              try {
                var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/swap', { method: 'POST', body: JSON.stringify({ direction: swapModal.direction, amount: amt }) });
                setSwapCountdown(0);
                toast(res.message || 'Swap completed!', 'success');
                if (res.txHash) toast('Tx: ' + res.txHash.slice(0, 10) + '...', 'info');
                setSwapModal(null); setSwapAmount('');
                setTimeout(function() { loadWalletBalance(selectedAgent); }, 3000);
              } catch (e) { setSwapCountdown(0); toast(e.message || 'Swap failed', 'error'); }
              setSwapLoading(false);
            }
          }, swapLoading ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } },
            h('span', {
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums'
              }
            }, swapCountdown > 0 ? swapCountdown : '...'),
            'Swapping on-chain...'
          ) : 'Confirm Swap')
        )
      },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
          h('div', { style: { padding: 12, background: swapModal.direction === 'native_to_bridged' ? 'rgba(180,83,9,0.08)' : 'rgba(99,102,241,0.08)', borderRadius: 8, fontSize: 13, lineHeight: 1.6 } },
            swapModal.direction === 'native_to_bridged'
              ? 'Convert your native USDC to USDC.e (bridged), which is required for trading on Polymarket.'
              : 'Convert your USDC.e (bridged) back to native USDC. Note: Native USDC cannot be used for trading on Polymarket.'
          ),
          h('div', null,
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' } },
              'Amount to swap (max: $' + swapModal.maxAmount.toFixed(2) + ')'
            ),
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              h('input', {
                type: 'number',
                className: 'input',
                style: { flex: 1, fontSize: 16, padding: '10px 12px' },
                placeholder: '0.00',
                min: 0,
                max: swapModal.maxAmount,
                step: '0.01',
                value: swapAmount,
                disabled: swapLoading,
                autoFocus: true,
                onInput: function(e) { setSwapAmount(e.target.value); }
              }),
              h('button', {
                className: 'btn btn-sm btn-secondary',
                disabled: swapLoading,
                onClick: function() { setSwapAmount(swapModal.maxAmount.toFixed(2)); }
              }, 'Max')
            ),
            (swapAmount && parseFloat(swapAmount) > swapModal.maxAmount) && h('div', { style: { fontSize: 11, color: '#ef4444', marginTop: 4 } },
              'Amount exceeds available balance of $' + swapModal.maxAmount.toFixed(2)
            )
          ),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 } },
            'Swap is executed directly on-chain via Uniswap V3 on Polygon. Typical fee: 0.01%. Slippage tolerance: 0.5%.',
            h('br'),
            'Requires POL for gas fees (~$0.01 per swap).'
          )
        )
      ),

      // ── Transfer Modal with 2FA/PIN ──
      showTransferModal && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowTransferModal(false); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 560, maxHeight: '90vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h2', { style: { fontSize: 16, flex: 1, display: 'flex', alignItems: 'center', gap: 8 } }, I('send'), ' Transfer Funds'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowTransferModal(false); } }, '\u00d7')
          ),
          h('div', { className: 'modal-body', style: { padding: 20 } },

            // Step 1: Locked — need to verify identity
            transferVerifyStep === 'locked' && h('div', null,
              h('div', { style: { textAlign: 'center', padding: '20px 0' } },
                h('div', { style: { marginBottom: 12, color: 'var(--text-muted)' } }, I('lock', 48)),
                h('h3', { style: { marginBottom: 8 } }, 'Security Verification Required'),
                h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 } },
                  'To protect your funds, you must verify your identity before transferring. The transfer window stays open for ', h('strong', null, '9 minutes'), ' after verification.'
                ),
                walletSecurity && walletSecurity.has2fa && h('button', { className: 'btn btn-primary', style: { marginBottom: 8, width: '100%' }, onClick: function() { setTransferVerifyStep('2fa'); setTransferCode(''); } },
                  I('shield'), ' Verify with 2FA Code'
                ),
                walletSecurity && walletSecurity.hasPin && h('button', { className: 'btn btn-secondary', style: { marginBottom: 8, width: '100%' }, onClick: function() { setTransferVerifyStep('pin'); setTransferCode(''); } },
                  I('key'), ' Verify with Wallet PIN'
                ),
                (!walletSecurity || (!walletSecurity.has2fa && !walletSecurity.hasPin)) && h('div', { style: { padding: 16, background: 'rgba(180,83,9,0.08)', borderRadius: 8, border: '1px solid rgba(180,83,9,0.2)', marginTop: 12 } },
                  h('p', { style: { fontWeight: 600, marginBottom: 8, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 } }, I('warning'), ' No Security Method Set Up'),
                  h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'You need to set up either 2FA (from Settings page) or a 6-digit Wallet PIN to enable transfers.'),
                  h('button', { className: 'btn btn-warning', style: { width: '100%' }, onClick: function() { setTransferVerifyStep('setup_pin'); setTransferPinSetup({ pin: '', confirm: '' }); } },
                    I('plus'), ' Set Up Wallet PIN'
                  )
                )
              )
            ),

            // Step: 2FA verification
            transferVerifyStep === '2fa' && h('div', null,
              h('h3', { style: { marginBottom: 12 } }, 'Enter 2FA Code'),
              h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 } }, 'Enter the 6-digit code from your authenticator app.'),
              h('input', { type: 'text', value: transferCode, maxLength: 6, placeholder: '000000', style: { width: '100%', padding: '12px 16px', fontSize: 24, textAlign: 'center', letterSpacing: 8, fontFamily: 'var(--font-mono)', border: '2px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' },
                onChange: function(e) { setTransferCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }
              }),
              h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
                h('button', { className: 'btn btn-secondary', onClick: function() { setTransferVerifyStep('locked'); } }, 'Back'),
                h('button', { className: 'btn btn-primary', disabled: transferCode.length !== 6 || transferLoading, onClick: async function() {
                  setTransferLoading(true);
                  try {
                    var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/verify-transfer', { method: 'POST', body: JSON.stringify({ method: '2fa', code: transferCode }) });
                    if (res.ok) {
                      setTransferUnlocked(true);
                      var expiry = Date.now() + 9 * 60 * 1000;
                      setTransferUnlockExpiry(expiry);
                      setTransferVerifyStep('unlocked');
                      toast('Transfer window unlocked for 9 minutes', 'success');
                    } else { toast(res.error || 'Invalid 2FA code', 'error'); }
                  } catch (e) { toast(e.message || 'Verification failed', 'error'); }
                  setTransferLoading(false);
                } }, transferLoading ? 'Verifying...' : 'Verify')
              )
            ),

            // Step: PIN verification
            transferVerifyStep === 'pin' && h('div', null,
              h('h3', { style: { marginBottom: 12 } }, 'Enter Wallet PIN'),
              h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 } }, 'Enter your 6-digit wallet PIN.'),
              h('input', { type: 'password', value: transferCode, maxLength: 6, placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022', style: { width: '100%', padding: '12px 16px', fontSize: 24, textAlign: 'center', letterSpacing: 8, fontFamily: 'var(--font-mono)', border: '2px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' },
                onChange: function(e) { setTransferCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }
              }),
              h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
                h('button', { className: 'btn btn-secondary', onClick: function() { setTransferVerifyStep('locked'); } }, 'Back'),
                h('button', { className: 'btn btn-primary', disabled: transferCode.length !== 6 || transferLoading, onClick: async function() {
                  setTransferLoading(true);
                  try {
                    var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/verify-transfer', { method: 'POST', body: JSON.stringify({ method: 'pin', code: transferCode }) });
                    if (res.ok) {
                      setTransferUnlocked(true);
                      var expiry = Date.now() + 9 * 60 * 1000;
                      setTransferUnlockExpiry(expiry);
                      setTransferVerifyStep('unlocked');
                      toast('Transfer window unlocked for 9 minutes', 'success');
                    } else { toast(res.error || 'Invalid PIN', 'error'); }
                  } catch (e) { toast(e.message || 'Verification failed', 'error'); }
                  setTransferLoading(false);
                } }, transferLoading ? 'Verifying...' : 'Verify')
              )
            ),

            // Step: Set up PIN (first time)
            transferVerifyStep === 'setup_pin' && (function() {
              var pinVal = transferPinSetup.pin;
              var confVal = transferPinSetup.confirm;
              var isTrivial = pinVal.length === 6 && (/^(.)\1{5}$/.test(pinVal) || pinVal === '123456' || pinVal === '654321');
              var mismatch = pinVal.length === 6 && confVal.length === 6 && pinVal !== confVal;
              var canSubmit = pinVal.length === 6 && confVal.length === 6 && pinVal === confVal && !isTrivial && !transferLoading;
              return h('div', null,
                h('h3', { style: { marginBottom: 12 } }, 'Create Wallet PIN'),
                h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 } }, 'Set a 6-digit PIN for your wallet. This PIN is encrypted and stored securely. You\'ll need it to authorize fund transfers.'),
                h('div', { style: { marginBottom: 12 } },
                  h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'PIN (6 digits)'),
                  h('input', { type: 'password', inputMode: 'numeric', pattern: '[0-9]*', value: pinVal, maxLength: 6, placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022', autoComplete: 'new-password', style: { width: '100%', padding: '10px 14px', fontSize: 20, textAlign: 'center', letterSpacing: 8, fontFamily: 'var(--font-mono)', border: '2px solid ' + (isTrivial ? '#ef4444' : 'var(--border)'), borderRadius: 8, background: 'var(--bg-secondary)' },
                    onInput: function(e) { setTransferPinSetup(Object.assign({}, transferPinSetup, { pin: e.target.value.replace(/\D/g, '').slice(0, 6) })); }
                  }),
                  isTrivial && h('div', { style: { fontSize: 11, color: '#ef4444', marginTop: 4 } }, 'PIN is too simple (e.g. 111111, 123456). Choose a less predictable PIN.')
                ),
                h('div', { style: { marginBottom: 12 } },
                  h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Confirm PIN'),
                  h('input', { type: 'password', inputMode: 'numeric', pattern: '[0-9]*', value: confVal, maxLength: 6, placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022', autoComplete: 'new-password', style: { width: '100%', padding: '10px 14px', fontSize: 20, textAlign: 'center', letterSpacing: 8, fontFamily: 'var(--font-mono)', border: '2px solid ' + (mismatch ? '#ef4444' : 'var(--border)'), borderRadius: 8, background: 'var(--bg-secondary)' },
                    onInput: function(e) { setTransferPinSetup(Object.assign({}, transferPinSetup, { confirm: e.target.value.replace(/\D/g, '').slice(0, 6) })); }
                  }),
                  mismatch && h('div', { style: { fontSize: 11, color: '#ef4444', marginTop: 4 } }, 'PINs do not match')
                ),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
                  h('button', { className: 'btn btn-secondary', onClick: function() { setTransferVerifyStep('locked'); } }, 'Back'),
                  h('button', { className: 'btn btn-primary', disabled: !canSubmit, onClick: async function() {
                    setTransferLoading(true);
                    try {
                      var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/setup-pin', { method: 'POST', body: JSON.stringify({ pin: pinVal }) });
                      if (res.ok) {
                        toast('Wallet PIN created successfully! You can now use it to unlock transfers.', 'success');
                        setWalletSecurity(Object.assign({}, walletSecurity, { hasPin: true }));
                        // Auto-unlock after setup
                        setTransferUnlocked(true);
                        var expiry = Date.now() + 9 * 60 * 1000;
                        setTransferUnlockExpiry(expiry);
                        setTransferVerifyStep('unlocked');
                      } else { toast(res.error || 'Failed to set PIN', 'error'); }
                    } catch (e) { toast(e.message || 'Setup failed', 'error'); }
                    setTransferLoading(false);
                  } }, transferLoading ? 'Setting up...' : 'Create PIN')
                )
              );
            })(),

            // Step: Unlocked — show transfer form
            transferVerifyStep === 'unlocked' && h('div', null,
              h('div', { style: { padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                h('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, I('check'), ' Transfer window open'),
                transferUnlockExpiry && h('span', { style: { fontWeight: 600, color: '#10b981' } },
                  Math.max(0, Math.ceil((transferUnlockExpiry - Date.now()) / 60000)) + ' min remaining'
                )
              ),
              h('div', { style: { marginBottom: 12 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'To Address'),
                whitelist.length > 0
                  ? h('select', { value: transferForm.to_address, style: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 13 },
                      onChange: function(e) { setTransferForm(Object.assign({}, transferForm, { to_address: e.target.value })); }
                    },
                    h('option', { value: '' }, 'Select whitelisted address...'),
                    whitelist.map(function(a) { return h('option', { key: a.address, value: a.address }, a.label + ' (' + a.address.slice(0,6) + '...' + a.address.slice(-4) + ')'); })
                  )
                  : h('div', { style: { fontSize: 12, color: '#b45309', padding: '8px 12px', background: 'rgba(180,83,9,0.08)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 } }, I('warning'), ' No whitelisted addresses. Add one in the Withdrawal Addresses section first.')
              ),
              h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
                h('div', { style: { flex: 1 } },
                  h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Amount'),
                  h('input', { type: 'number', value: transferForm.amount, placeholder: '0.00', step: '0.01', min: '0', style: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 13 },
                    onChange: function(e) { setTransferForm(Object.assign({}, transferForm, { amount: e.target.value })); }
                  })
                ),
                h('div', { style: { width: 120 } },
                  h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Token'),
                  h('select', { value: transferForm.token, style: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 13 },
                    onChange: function(e) { setTransferForm(Object.assign({}, transferForm, { token: e.target.value })); }
                  },
                    h('option', { value: 'USDC.e' }, 'USDC.e'),
                    h('option', { value: 'USDC' }, 'USDC (Native)'),
                    h('option', { value: 'POL' }, 'POL')
                  )
                )
              ),
              h('div', { style: { marginBottom: 16 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Reason (optional)'),
                h('input', { type: 'text', value: transferForm.reason, placeholder: 'e.g. Withdraw profits', style: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 13 },
                  onChange: function(e) { setTransferForm(Object.assign({}, transferForm, { reason: e.target.value })); }
                })
              ),
              h('button', { className: 'btn btn-primary', style: { width: '100%' }, disabled: !transferForm.to_address || !transferForm.amount || parseFloat(transferForm.amount) <= 0 || transferLoading, onClick: async function() {
                var amt = parseFloat(transferForm.amount);
                if (!(await showConfirm('Transfer ' + amt.toFixed(2) + ' ' + transferForm.token + ' to ' + transferForm.to_address.slice(0,8) + '...?\n\nThis action is irreversible.'))) return;
                setTransferLoading(true);
                try {
                  var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/transfer', { method: 'POST', body: JSON.stringify({
                    to_address: transferForm.to_address,
                    amount: amt,
                    token: transferForm.token,
                    reason: transferForm.reason,
                  }) });
                  toast(res.message || 'Transfer submitted!', 'success');
                  setShowTransferModal(false);
                  loadWalletSecurity(selectedAgent);
                  loadWalletBalance(selectedAgent);
                } catch (e) { toast(e.message || 'Transfer failed', 'error'); }
                setTransferLoading(false);
              } }, transferLoading ? 'Processing...' : 'Send Transfer')
            )
          )
        )
      ),

      // Transaction history modal
      showImportWallet && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowImportWallet(false); setCreatedWallet(null); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 600, maxHeight: '90vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h2', { style: { fontSize: 16, flex: 1 } }, 'Set Up Wallet'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowImportWallet(false); setCreatedWallet(null); } }, '\u00d7')
          ),
          // Tab bar
          h('div', { style: { display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' } },
            ['create', 'import', 'api'].map(function(t) {
              var labels = { create: 'New Wallet', import: 'Import Private Key', api: 'Existing Account' };
              var icons = { create: 'plus', import: 'key', api: 'link' };
              return h('button', {
                key: t,
                onClick: function() { setWalletSetupTab(t); setCreatedWallet(null); },
                style: {
                  padding: '10px 16px', fontSize: 13, fontWeight: walletSetupTab === t ? 600 : 400, cursor: 'pointer',
                  background: 'none', border: 'none', borderBottom: walletSetupTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                  color: walletSetupTab === t ? 'var(--text)' : 'var(--text-muted)',
                }
              }, I(icons[t]), ' ', labels[t]);
            })
          ),
          h('div', { className: 'modal-body', style: { padding: 24 } },
            // ─── Tab 1: Create New Wallet ───
            walletSetupTab === 'create' && !createdWallet && h('div', null,
              h('p', { style: { color: 'var(--text-muted)', marginBottom: 20, fontSize: 13, lineHeight: 1.6 } },
                'Generate a fresh wallet for your agent. You\'ll need to register it on Polymarket and fund it before the agent can trade.'
              ),
              h('div', { style: { marginBottom: 20 } },
                h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 12 } }, 'How it works'),
                [
                  'Click "Generate Wallet" below \u2014 a new Ethereum wallet is created and encrypted in your database.',
                  'Copy the private key shown and import it into MetaMask (or any wallet app).',
                  'Go to polymarket.com and connect with MetaMask. Accept the Terms of Service.',
                  'Send USDC + a small amount of POL (for gas) on Polygon network to the wallet address.',
                  'Done! Your agent can now trade on Polymarket.'
                ].map(function(step, i) {
                  return h('div', { key: i, style: { display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 } },
                    h('div', { style: { minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 } }, i + 1),
                    h('span', { style: { color: 'var(--text-muted)', lineHeight: 1.5 } }, step)
                  );
                })
              ),
              h('button', {
                className: 'btn btn-primary',
                disabled: walletSetupLoading,
                style: { width: '100%' },
                onClick: async function() {
                  setWalletSetupLoading(true);
                  try {
                    var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/create', { method: 'POST', body: '{}' });
                    setCreatedWallet(res);
                    loadAgentData(selectedAgent);
                  } catch (e) { toast(e.message, 'error'); }
                  setWalletSetupLoading(false);
                }
              }, walletSetupLoading ? 'Generating...' : 'Generate Wallet')
            ),
            // Created wallet result
            walletSetupTab === 'create' && createdWallet && h('div', null,
              h('div', { style: { textAlign: 'center', marginBottom: 20 } },
                h('div', { style: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 } }, I('check')),
                h('div', { style: { fontWeight: 600, fontSize: 16 } }, 'Wallet Created')
              ),
              h('label', { style: _labelStyle }, 'Wallet Address'),
              h('div', { style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }), onClick: function() { navigator.clipboard.writeText(createdWallet.address); toast('Address copied', 'success'); } },
                createdWallet.address, ' ', h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, '(click to copy)')
              ),
              h('label', { style: Object.assign({}, _labelStyle, { marginTop: 12 }) }, 'Private Key'),
              h('div', { style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.2)', wordBreak: 'break-all' }), onClick: function() { navigator.clipboard.writeText(createdWallet.privateKey); toast('Private key copied', 'success'); } },
                createdWallet.privateKey, ' ', h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, '(click to copy)')
              ),
              h('div', { style: { marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#ef4444', lineHeight: 1.5 } },
                'Save this private key NOW. It will not be shown again. You need it to import into MetaMask and register on Polymarket.'
              ),
              h('div', { style: { marginTop: 16, fontWeight: 600, fontSize: 14, marginBottom: 8 } }, 'Next Steps'),
              [
                'Copy the private key above and import it into MetaMask (Account icon \u2192 Add account \u2192 Import account \u2192 Paste key)',
                'Go to polymarket.com, click Log In, select MetaMask, and accept the Terms of Service',
                'Send USDC on Polygon to ' + createdWallet.address,
                'Send a small amount of POL (formerly MATIC) on Polygon for gas fees (~$1 is plenty)',
              ].map(function(step, i) {
                return h('div', { key: i, style: { display: 'flex', gap: 10, marginBottom: 6, fontSize: 13 } },
                  h('div', { style: { minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 } }, i + 1),
                  h('span', { style: { color: 'var(--text-muted)', lineHeight: 1.5 } }, step)
                );
              })
            ),

            // ─── Tab 2: Import Private Key ───
            walletSetupTab === 'import' && h('div', null,
              h('p', { style: { color: 'var(--text-muted)', marginBottom: 20, fontSize: 13, lineHeight: 1.6 } },
                'If you already have a wallet with a private key (from MetaMask, Rabby, or another wallet app), paste it here. The key will be encrypted with AES-256-GCM before storage.'
              ),
              h('div', { style: { marginBottom: 16 } },
                h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 12 } }, 'Before importing'),
                [
                  'Make sure the wallet is registered on polymarket.com (connect via MetaMask and accept Terms of Service)',
                  'Fund the wallet with USDC on Polygon network',
                  'Send a small amount of POL (formerly MATIC) for gas fees',
                ].map(function(step, i) {
                  return h('div', { key: i, style: { display: 'flex', gap: 10, marginBottom: 6, fontSize: 13 } },
                    h('div', { style: { minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 } }, i + 1),
                    h('span', { style: { color: 'var(--text-muted)', lineHeight: 1.5 } }, step)
                  );
                })
              ),
              h('label', { style: _labelStyle }, 'Private Key'),
              h('input', {
                type: 'password', style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 13 }),
                placeholder: '0x...', value: importKey,
                onChange: function(e) { setImportKey(e.target.value); },
              }),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: 'rgba(180,83,9,0.08)', borderRadius: 6, border: '1px solid rgba(180,83,9,0.2)' } },
                I('shield'),
                h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Encrypted with AES-256-GCM. Never leaves the server.')
              ),
              walletBalance?.address && h('div', { style: { marginTop: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#ef4444' } },
                'This will replace the current wallet (', walletBalance.address.slice(0, 6), '...', walletBalance.address.slice(-4), ').'
              )
            ),

            // ─── Tab 3: Existing Account (API Credentials) ───
            walletSetupTab === 'api' && h('div', null,
              h('p', { style: { color: 'var(--text-muted)', marginBottom: 20, fontSize: 13, lineHeight: 1.6 } },
                'Already have a Polymarket account? Generate API credentials from your Polymarket settings and paste them here. The agent will trade using your existing account.'
              ),
              h('div', { style: { marginBottom: 16 } },
                h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 12 } }, 'How to get your API credentials'),
                [
                  'Go to polymarket.com and log in to your existing account',
                  'Click your profile icon \u2192 Settings \u2192 scroll to "API Keys"',
                  'Click "Generate API Key" to create a new key',
                  'Copy the API Key, Secret, and Passphrase (they\'re only shown once!)',
                  'Paste them below',
                ].map(function(step, i) {
                  return h('div', { key: i, style: { display: 'flex', gap: 10, marginBottom: 6, fontSize: 13 } },
                    h('div', { style: { minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 } }, i + 1),
                    h('span', { style: { color: 'var(--text-muted)', lineHeight: 1.5 } }, step)
                  );
                })
              ),
              h('label', { style: _labelStyle }, 'API Key'),
              h('input', { type: 'text', style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 13 }), placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', value: apiCredsForm.api_key, onChange: function(e) { setApiCredsForm(Object.assign({}, apiCredsForm, { api_key: e.target.value })); } }),
              h('label', { style: Object.assign({}, _labelStyle, { marginTop: 10 }) }, 'Secret'),
              h('input', { type: 'password', style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 13 }), placeholder: 'Base64 encoded secret', value: apiCredsForm.api_secret, onChange: function(e) { setApiCredsForm(Object.assign({}, apiCredsForm, { api_secret: e.target.value })); } }),
              h('label', { style: Object.assign({}, _labelStyle, { marginTop: 10 }) }, 'Passphrase'),
              h('input', { type: 'password', style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 13 }), placeholder: 'Hex passphrase', value: apiCredsForm.api_passphrase, onChange: function(e) { setApiCredsForm(Object.assign({}, apiCredsForm, { api_passphrase: e.target.value })); } }),
              h('label', { style: Object.assign({}, _labelStyle, { marginTop: 10 }) }, 'Wallet Address (optional)'),
              h('input', { type: 'text', style: Object.assign({}, _inputStyle, { fontFamily: 'monospace', fontSize: 13 }), placeholder: '0x... (shown in your Polymarket profile)', value: apiCredsForm.wallet_address, onChange: function(e) { setApiCredsForm(Object.assign({}, apiCredsForm, { wallet_address: e.target.value })); } }),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: 'rgba(180,83,9,0.08)', borderRadius: 6, border: '1px solid rgba(180,83,9,0.2)' } },
                I('shield'),
                h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'All credentials are encrypted with AES-256-GCM before storage.')
              )
            )
          ),

          // Footer with action buttons
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border)' } },
            h('button', { className: 'btn btn-secondary', onClick: function() { setShowImportWallet(false); setCreatedWallet(null); } }, createdWallet ? 'Done' : 'Cancel'),
            walletSetupTab === 'import' && h('button', {
              className: 'btn btn-primary', disabled: !importKey.trim() || walletSetupLoading,
              onClick: async function() {
                setWalletSetupLoading(true);
                try {
                  var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/import', { method: 'POST', body: JSON.stringify({ private_key: importKey.trim() }) });
                  toast('Wallet imported: ' + (res.address || ''), 'success');
                  setShowImportWallet(false); setImportKey(''); loadAgentData(selectedAgent);
                } catch (e) { toast('Import failed: ' + e.message, 'error'); }
                setWalletSetupLoading(false);
              }
            }, 'Import Wallet'),
            walletSetupTab === 'api' && h('button', {
              className: 'btn btn-primary', disabled: !apiCredsForm.api_key.trim() || !apiCredsForm.api_secret.trim() || !apiCredsForm.api_passphrase.trim() || walletSetupLoading,
              onClick: async function() {
                setWalletSetupLoading(true);
                try {
                  var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/import-api-creds', { method: 'POST', body: JSON.stringify(apiCredsForm) });
                  toast(res.message || 'API credentials saved', 'success');
                  setShowImportWallet(false); setApiCredsForm({ api_key: '', api_secret: '', api_passphrase: '', wallet_address: '' }); loadAgentData(selectedAgent);
                } catch (e) { toast('Failed: ' + e.message, 'error'); }
                setWalletSetupLoading(false);
              }
            }, 'Save Credentials')
          )
        )
      ),

      showTxHistory && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowTxHistory(false); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { minWidth: '75vw', maxHeight: '90vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h3', null, I('clock'), ' On-Chain Transaction History'),
            h('button', { className: 'btn btn-sm', onClick: function() { setShowTxHistory(false); } }, '\u2715')
          ),
          h('div', { className: 'modal-body', style: { padding: 20 } },
            // Filters bar
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
              h('input', { type: 'text', placeholder: 'Search by hash, address, token...', value: txSearch, onChange: function(e) { setTxSearch(e.target.value); }, style: Object.assign({}, _inputStyle, { flex: 1, minWidth: 200 }) }),
              ['all', 'erc20', 'native'].map(function(t) {
                return h('button', { key: t, className: 'btn btn-sm ' + (txFilter === t ? 'btn-primary' : 'btn-secondary'), onClick: async function() {
                  setTxFilter(t); setTxLoading(true); setTxPage(1);
                  try {
                    var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/transactions?page=1&pageSize=50&type=' + t);
                    setTxHistory(res.transactions || []); setTxHasMore(res.hasMore || false);
                  } catch (e) { setTxHistory([]); }
                  setTxLoading(false);
                } }, t === 'all' ? 'All' : t === 'erc20' ? 'Tokens' : 'Native')
              })
            ),
            txLoading ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading transactions...')
            : txHistory.length === 0 ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No transactions found')
            : h('div', null,
              h('table', { className: 'data-table', style: { width: '100%', fontSize: 12 } },
                h('thead', null, h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Token'),
                  h('th', null, 'Direction'),
                  h('th', { style: { textAlign: 'right' } }, 'Amount'),
                  h('th', null, 'From / To'),
                  h('th', null, 'Hash'),
                  h('th', null, 'Status')
                )),
                h('tbody', null,
                  txHistory.filter(function(tx) {
                    if (!txSearch) return true;
                    var s = txSearch.toLowerCase();
                    return (tx.hash || '').toLowerCase().includes(s) || (tx.from || '').toLowerCase().includes(s) || (tx.to || '').toLowerCase().includes(s) || (tx.token || '').toLowerCase().includes(s);
                  }).map(function(tx, i) {
                    var d = new Date(tx.timestamp);
                    var timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                    var isIn = tx.direction === 'in';
                    var counterparty = isIn ? tx.from : tx.to;
                    var shortAddr = counterparty ? counterparty.slice(0, 6) + '...' + counterparty.slice(-4) : 'N/A';
                    var shortHash = tx.hash ? tx.hash.slice(0, 8) + '...' + tx.hash.slice(-4) : 'N/A';
                    return h('tr', { key: tx.hash + '-' + i, onClick: function() { setSelectedTx(tx); }, style: { cursor: 'pointer' } },
                      h('td', { style: { whiteSpace: 'nowrap' } }, timeStr),
                      h('td', null, h('span', { style: { padding: '2px 6px', borderRadius: 4, fontSize: 11, background: tx.type === 'TRADE' ? 'rgba(59,130,246,0.1)' : tx.type === 'DEPOSIT' ? 'rgba(16,185,129,0.1)' : 'rgba(168,85,247,0.1)', color: tx.type === 'TRADE' ? '#3b82f6' : tx.type === 'DEPOSIT' ? '#10b981' : '#a855f7' } }, tx.type || 'Trade')),
                      h('td', { style: { fontWeight: 600 } }, tx.token),
                      h('td', null, h('span', { style: { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: isIn ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: isIn ? '#10b981' : '#ef4444' } }, isIn ? '\u2B07 IN' : '\u2B06 OUT')),
                      h('td', { style: { textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: isIn ? '#10b981' : '#ef4444' } }, (isIn ? '+' : '-') + tx.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })),
                      h('td', null, tx.market ? h('span', { style: { fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }, title: tx.market }, (tx.side ? tx.side + ' ' : '') + tx.market) : h('a', { href: 'https://polygonscan.com/address/' + counterparty, target: '_blank', style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand)' } }, shortAddr)),
                      h('td', null, h('a', { href: 'https://polygonscan.com/tx/' + tx.hash, target: '_blank', style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand)' } }, shortHash)),
                      h('td', null, h('span', { style: { padding: '2px 6px', borderRadius: 4, fontSize: 11, background: tx.status === 'confirmed' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: tx.status === 'confirmed' ? '#10b981' : '#ef4444' } }, tx.status))
                    );
                  })
                )
              ),
              // Pagination
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 } },
                h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, txHistory.length + ' transactions'),
                h('div', { style: { display: 'flex', gap: 8 } },
                  txPage > 1 && h('button', { className: 'btn btn-sm btn-secondary', onClick: async function() {
                    var p = txPage - 1; setTxPage(p); setTxLoading(true);
                    try {
                      var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/transactions?page=' + p + '&pageSize=50&type=' + txFilter);
                      setTxHistory(res.transactions || []); setTxHasMore(res.hasMore || false);
                    } catch (e) { }
                    setTxLoading(false);
                  } }, '\u2190 Prev'),
                  h('span', { style: { fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px' } }, 'Page ' + txPage),
                  txHasMore && h('button', { className: 'btn btn-sm btn-secondary', onClick: async function() {
                    var p = txPage + 1; setTxPage(p); setTxLoading(true);
                    try {
                      var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/transactions?page=' + p + '&pageSize=50&type=' + txFilter);
                      setTxHistory(res.transactions || []); setTxHasMore(res.hasMore || false);
                    } catch (e) { }
                    setTxLoading(false);
                  } }, 'Next \u2192')
                )
              )
            )
          )
        )
      ),

      // Transaction detail modal
      selectedTx && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setSelectedTx(null); }, style: { zIndex: 1100 } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { maxWidth: 520, padding: 24 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
            h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Transaction Details'),
            h('button', { className: 'btn btn-sm', onClick: function() { setSelectedTx(null); } }, '\u2715')
          ),
          // Direction + Amount header
          h('div', { style: { textAlign: 'center', padding: '16px 0', marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 12 } },
            h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 } }, selectedTx.direction === 'in' ? 'Received' : 'Sent'),
            h('div', { style: { fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: selectedTx.direction === 'in' ? '#10b981' : '#ef4444' } },
              (selectedTx.direction === 'in' ? '+' : '-') + selectedTx.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' ' + (selectedTx.token || 'USDC.e')
            ),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } },
              new Date(selectedTx.timestamp).toLocaleDateString() + ' ' + new Date(selectedTx.timestamp).toLocaleTimeString()
            )
          ),
          // Details grid
          h('div', { style: { display: 'grid', gap: 12 } },
            // Status
            h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Status'),
              h('span', { style: { padding: '2px 8px', borderRadius: 4, fontSize: 12, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 } }, selectedTx.status || 'confirmed')
            ),
            // Type
            h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Type'),
              h('span', { style: { fontSize: 13 } }, selectedTx.type || 'Transfer')
            ),
            // Token
            h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Token'),
              h('span', { style: { fontSize: 13, fontWeight: 600 } }, selectedTx.token || 'USDC.e')
            ),
            // From
            h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'From'),
              h('a', { href: 'https://polygonscan.com/address/' + selectedTx.from, target: '_blank', style: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)', wordBreak: 'break-all' } }, selectedTx.from || 'N/A')
            ),
            // To
            h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'To'),
              h('a', { href: 'https://polygonscan.com/address/' + selectedTx.to, target: '_blank', style: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)', wordBreak: 'break-all' } }, selectedTx.to || 'N/A')
            ),
            // Block
            selectedTx.block && h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Block'),
              h('a', { href: 'https://polygonscan.com/block/' + selectedTx.block, target: '_blank', style: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)' } }, selectedTx.block.toLocaleString())
            ),
            // Tx Hash
            h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0' } },
              h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Tx Hash'),
              h('a', { href: 'https://polygonscan.com/tx/' + selectedTx.hash, target: '_blank', style: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)', wordBreak: 'break-all' } }, selectedTx.hash || 'N/A')
            )
          ),
          // View on explorer button
          h('div', { style: { marginTop: 20, textAlign: 'center' } },
            h('a', { href: 'https://polygonscan.com/tx/' + selectedTx.hash, target: '_blank', className: 'btn btn-primary', style: { display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' } }, I('link'), ' View on PolygonScan')
          )
        )
      ),

      // Export key modal
      exportedKey && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setExportedKey(null); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 520, maxHeight: '85vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h2', { style: { fontSize: 16, flex: 1, display: 'flex', alignItems: 'center', gap: 8 } }, I('key'), ' Wallet Private Key'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setExportedKey(null); } }, '\u00d7')
          ),
          h('div', { className: 'modal-body', style: { padding: 20 } },
            h('div', { style: { padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#ef4444', lineHeight: 1.6 } },
              h('strong', null, '\u26A0 SECURITY WARNING'), h('br'),
              'Anyone with this key has FULL CONTROL of this wallet and all funds. Never share it. Never paste it into untrusted sites.'
            ),
            h('div', { style: { marginBottom: 16 } },
              h('label', { style: _labelStyle }, 'Wallet Address'),
              h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 13, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, wordBreak: 'break-all', userSelect: 'all' } }, exportedKey.address)
            ),
            h('div', { style: { marginBottom: 16 } },
              h('label', { style: _labelStyle }, 'Private Key'),
              h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, wordBreak: 'break-all', userSelect: 'all', border: '1px solid rgba(239,68,68,0.3)' } }, exportedKey.privateKey)
            ),
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
              h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { navigator.clipboard?.writeText(exportedKey.privateKey); toast('Private key copied', 'success'); } }, 'Copy Key'),
              h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { navigator.clipboard?.writeText(exportedKey.address); toast('Address copied', 'success'); } }, 'Copy Address')
            ),
            h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } },
              h('div', { style: { fontWeight: 600, marginBottom: 6 } }, 'Import into a wallet app:'),
              h('div', { style: { display: 'grid', gap: 8 } },
                h('div', { style: { padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12 } },
                  h('strong', null, 'MetaMask: '), 'Open MetaMask \u2192 Account menu \u2192 Import Account \u2192 Paste private key'
                ),
                h('div', { style: { padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12 } },
                  h('strong', null, 'Rabby: '), 'Open Rabby \u2192 Add Address \u2192 Import Private Key \u2192 Paste'
                ),
                h('div', { style: { padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12 } },
                  h('strong', null, 'Polymarket: '), 'Go to polymarket.com \u2192 Login \u2192 Connect Wallet \u2192 Use imported wallet via MetaMask/Rabby'
                )
              )
            )
          ),
          h('div', { className: 'modal-footer' },
            h('button', { className: 'btn btn-primary', onClick: function() { setExportedKey(null); } }, 'Done')
          )
        )
      ),

      // ── Pending Transfers (approval required) ──
      transfers.filter(function(t) { return t.status === 'pending'; }).length > 0 && h('div', { className: 'card', style: { padding: 20, marginTop: 16, border: '1px solid rgba(180,83,9,0.3)', background: 'rgba(180,83,9,0.04)' } },
        h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 } },
          I('zap'), 'Pending Transfers ',
          h(HelpButton, { label: 'Pending Transfers' },
            h('p', null, 'Transfers requested by the agent that need your approval before execution.'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Approve'), ' \u2014 Executes the on-chain transaction immediately.'),
              h('li', null, h('strong', null, 'Reject'), ' \u2014 Cancels the request. The agent will be notified.'),
              h('li', null, h('strong', null, 'Expiry'), ' \u2014 Pending transfers expire after 4 hours automatically.'),
              h('li', null, h('strong', null, 'Cannot auto-approve'), ' \u2014 Fund transfers always require human approval, regardless of trading mode.')
            )
          ),
          h('span', { className: 'badge badge-warning' }, transfers.filter(function(t) { return t.status === 'pending'; }).length)
        ),
        transfers.filter(function(t) { return t.status === 'pending'; }).map(function(tx) {
          var expired = tx.expires_at < new Date().toISOString();
          return h('div', { key: tx.id, style: { padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
            h('div', null,
              h('div', { style: { fontWeight: 600, fontSize: 15 } }, (tx.amount || 0).toFixed(2) + ' ' + (tx.token || 'USDC')),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'To: ', h('strong', null, tx.to_label), ' (' + (tx.to_address || '').slice(0,6) + '...' + (tx.to_address || '').slice(-4) + ')'),
              tx.reason && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Reason: ' + tx.reason),
              h('div', { style: { fontSize: 10, color: expired ? '#ef4444' : 'var(--text-muted)', marginTop: 2 } }, expired ? 'EXPIRED' : 'Expires: ' + fmtDate(tx.expires_at))
            ),
            !expired && h('div', { style: { display: 'flex', gap: 6 } },
              h('button', { className: 'btn btn-sm btn-success', onClick: async function() {
                if (!(await showConfirm('APPROVE transfer of ' + tx.amount + ' ' + tx.token + ' to "' + tx.to_label + '" (' + tx.to_address + ')?\n\nThis will execute an on-chain transaction immediately.'))) return;
                try {
                  var res = await apiCall('/polymarket/' + selectedAgent + '/transfers/' + tx.id + '/approve', { method: 'POST' });
                  if (res.success) { toast('Transfer approved! TX: ' + (res.txHash || '').slice(0,10) + '...', 'success'); loadWalletSecurity(selectedAgent); loadWalletBalance(selectedAgent); }
                  else toast(res.error || 'Failed', 'error');
                } catch (e) { toast(e.message || 'Failed — owner access required', 'error'); }
              } }, I('check'), ' Approve'),
              h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
                if (!(await showConfirm('Reject this transfer?'))) return;
                try {
                  await apiCall('/polymarket/' + selectedAgent + '/transfers/' + tx.id + '/reject', { method: 'POST', body: JSON.stringify({}) });
                  toast('Transfer rejected', 'success'); loadWalletSecurity(selectedAgent);
                } catch (e) { toast(e.message, 'error'); }
              } }, I('x'), ' Reject')
            )
          );
        })
      ),

      // ── Whitelisted Addresses ──
      (wallet || walletBalance) && h('div', { className: 'card', style: { padding: 20, marginTop: 16 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } }, I('shield'), 'Withdrawal Addresses'),
            h(HelpButton, { label: 'Withdrawal Addresses' },
              h('p', null, 'Pre-register addresses that your agent can send funds to.'),
              h('ul', { style: _ul },
                h('li', null, h('strong', null, 'Cooling period'), ' \u2014 Configurable delay after adding before transfers are allowed.'),
                h('li', null, h('strong', null, 'Per-tx limit'), ' \u2014 Max amount per single transfer request.'),
                h('li', null, h('strong', null, 'Daily limit'), ' \u2014 Max total transferred per day to this address.'),
                h('li', null, h('strong', null, 'Owner-only'), ' \u2014 Only account owners can add or remove addresses.')
              ),
              h('div', { style: _tip }, h('strong', null, 'Usage: '), 'Add an address, wait for cooling, then tell the agent "transfer $50 USDC to My MetaMask".')
            )
          ),
          h('button', { className: 'btn btn-sm btn-primary', onClick: function() { setShowAddAddr(true); setAddrForm({ label: '', address: '', per_tx_limit: 100, daily_limit: 500, cooling_hours: 24 }); } }, '+ Add Address')
        ),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Only whitelisted addresses can receive transfers. All transfers require owner approval.'),
        whitelist.length === 0
          ? h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'No addresses whitelisted. Add one to enable fund transfers.')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              whitelist.map(function(addr) {
                var coolingActive = addr.cooling_until > new Date().toISOString();
                var hoursLeft = coolingActive ? Math.ceil((new Date(addr.cooling_until).getTime() - Date.now()) / 3600000) : 0;
                return h('div', { key: addr.id, style: { padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: addr.is_active ? 1 : 0.5 } },
                  h('div', { style: { flex: 1, minWidth: 0 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                      h('strong', { style: { fontSize: 13 } }, addr.label),
                      coolingActive && h('span', { className: 'badge badge-warning', style: { fontSize: 10 } }, 'Cooling: ' + hoursLeft + 'h left'),
                      !coolingActive && addr.is_active && h('span', { className: 'badge badge-success', style: { fontSize: 10 } }, 'Active'),
                      !addr.is_active && h('span', { className: 'badge badge-secondary', style: { fontSize: 10 } }, 'Disabled')
                    ),
                    h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' } }, addr.address),
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Limits: $' + (addr.per_tx_limit || 100) + '/tx \u2022 $' + (addr.daily_limit || 500) + '/day')
                  ),
                  h('div', { style: { display: 'flex', gap: 4 } },
                    h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
                      if (!(await showConfirm('Remove "' + addr.label + '" from whitelist?\n\nAddress: ' + addr.address))) return;
                      try {
                        var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/whitelist/' + addr.id, { method: 'DELETE' });
                        if (res.success) { toast('Address removed', 'success'); loadWalletSecurity(selectedAgent); }
                        else toast(res.error || 'Failed', 'error');
                      } catch (e) { toast(e.message || 'Failed — owner access required', 'error'); }
                    } }, I('trash-2'))
                  )
                );
              })
            ),

        // Add address modal
        showAddAddr && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowAddAddr(false); } },
          h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 480, maxHeight: '85vh', overflow: 'auto' } },
            h('div', { className: 'modal-header' },
              h('h2', { style: { fontSize: 16, flex: 1 } }, I('shield'), ' Add Withdrawal Address'),
              h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowAddAddr(false); } }, '\u00d7')
            ),
            h('div', { className: 'modal-body', style: { padding: 20 } },
              h('div', { style: { padding: 12, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#b45309', lineHeight: 1.6 } },
                h('strong', null, '\u26A0 Cooling Period'), h('br'),
                'New addresses cannot receive transfers for the configured cooling period after being added. This protects against unauthorized address additions. Set to 0 to disable (not recommended).'
              ),
              h('div', { style: { display: 'grid', gap: 14 } },
                h('div', null,
                  h('label', { style: _labelStyle }, 'Label'),
                  h('input', { style: _inputStyle, placeholder: 'e.g. My MetaMask, Cold Wallet', value: addrForm.label, onChange: function(e) { setAddrForm(Object.assign({}, addrForm, { label: e.target.value })); } })
                ),
                h('div', null,
                  h('label', { style: _labelStyle }, 'Ethereum Address (Polygon)'),
                  h('input', { style: _inputStyle, placeholder: '0x...', value: addrForm.address, onChange: function(e) { setAddrForm(Object.assign({}, addrForm, { address: e.target.value })); } }),
                  h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, 'Must be a valid Ethereum address (0x + 40 hex characters)')
                ),
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
                  h('div', null,
                    h('label', { style: _labelStyle }, 'Per-Transaction Limit ($)'),
                    h('input', { style: _inputStyle, type: 'number', min: 1, value: addrForm.per_tx_limit, onChange: function(e) { setAddrForm(Object.assign({}, addrForm, { per_tx_limit: parseFloat(e.target.value) || 100 })); } })
                  ),
                  h('div', null,
                    h('label', { style: _labelStyle }, 'Daily Limit ($)'),
                    h('input', { style: _inputStyle, type: 'number', min: 1, value: addrForm.daily_limit, onChange: function(e) { setAddrForm(Object.assign({}, addrForm, { daily_limit: parseFloat(e.target.value) || 500 })); } })
                  ),
                  h('div', null,
                    h('label', { style: _labelStyle }, 'Cooling Period (hours)'),
                    h('input', { style: _inputStyle, type: 'number', min: 0, value: addrForm.cooling_hours, onChange: function(e) { setAddrForm(Object.assign({}, addrForm, { cooling_hours: parseInt(e.target.value) || 0 })); } }),
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, '0 = no wait (less secure)')
                  )
                )
              )
            ),
            h('div', { className: 'modal-footer' },
              h('button', { className: 'btn btn-secondary', onClick: function() { setShowAddAddr(false); } }, 'Cancel'),
              h('button', { className: 'btn btn-primary', onClick: async function() {
                if (!addrForm.label.trim()) { toast('Label is required', 'error'); return; }
                if (!/^0x[a-fA-F0-9]{40}$/.test(addrForm.address.trim())) { toast('Invalid Ethereum address', 'error'); return; }
                try {
                  var res = await apiCall('/polymarket/' + selectedAgent + '/wallet/whitelist', { method: 'POST', body: JSON.stringify(addrForm) });
                  if (res.success) { toast('Address added!' + (addrForm.cooling_hours > 0 ? ' ' + addrForm.cooling_hours + 'h cooling period active.' : ''), 'success'); setShowAddAddr(false); loadWalletSecurity(selectedAgent); }
                  else toast(res.error || 'Failed', 'error');
                } catch (e) { toast(e.message || 'Failed — owner access required', 'error'); }
              } }, 'Add Address')
            )
          )
        )
      ),

      // ── Transfer History ──
      (wallet || walletBalance) && transfers.length > 0 && h('div', { className: 'card', style: { padding: 20, marginTop: 16 } },
        h('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 } }, 'Transfer History',
          h(HelpButton, { label: 'Transfer History' },
            h('p', null, 'Complete record of all fund transfers \u2014 approved, rejected, expired, and failed.'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'TX Hash'), ' \u2014 Click to view the transaction on PolygonScan.'),
              h('li', null, h('strong', null, 'Audit'), ' \u2014 All transfers are logged in the audit trail with user ID and IP address.')
            )
          )
        ),
        h('div', { className: 'table-container' },
          h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, ['Amount', 'To', 'Status', 'TX Hash', 'Time'].map(function(hdr) { return h('th', { key: hdr }, hdr); }))),
            h('tbody', null, transfers.map(function(tx) {
              var stCls = tx.status === 'completed' ? 'badge-success' : tx.status === 'pending' ? 'badge-warning' : tx.status === 'rejected' ? 'badge-danger' : 'badge-secondary';
              return h('tr', { key: tx.id },
                h('td', null, h('strong', null, (tx.amount || 0).toFixed(2) + ' ' + (tx.token || 'USDC'))),
                h('td', null, h('div', null, h('strong', null, tx.to_label)), h('div', { style: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' } }, (tx.to_address || '').slice(0,10) + '...')),
                h('td', null, h('span', { className: 'badge ' + stCls }, tx.status)),
                h('td', null, tx.tx_hash ? h('a', { href: 'https://polygonscan.com/tx/' + tx.tx_hash, target: '_blank', style: { fontSize: 11, fontFamily: 'var(--font-mono)' } }, tx.tx_hash.slice(0,10) + '...') : '-'),
                h('td', null, fmtDate(tx.created_at))
              );
            }))
          )
        )
      ),

      // (Live positions moved to top of wallet tab)
    ),

    // Config modal (triggered from header button)
    editConfig && configModal(editConfig, setEditConfig, updateConfig),

    // ═══ ON-CHAIN ═══
    tab === 'onchain' && h('div', null,
      tabHeader('On-Chain Intelligence', 'link',
        h(Fragment, null,
          h('p', null, 'Track whale wallets, order book depth, on-chain flows, and liquidity maps. The agent auto-discovers whales when scanning markets.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Whale Tracker'), ' — Monitors large wallets and their trading patterns.'),
            h('li', null, h('strong', null, 'Wallet Profiler'), ' — Deep analysis of any wallet\'s history and performance.'),
            h('li', null, h('strong', null, 'Liquidity Map'), ' — Visualizes where liquidity sits in the order book.')
          )
        )
      ),
      renderFilteredTable('whales', whales, 'No whale wallets tracked yet. The agent auto-detects them when using poly_whale_tracker.',
        ['Address', 'Label', 'Volume', 'Markets', 'Win Rate', 'Last Seen'],
        function(w) { return [
          h('td', null, h('code', { style: { fontSize: "12px" } }, shortAddr(w.address))),
          h('td', null, w.label || 'Unknown'),
          h('td', null, '$' + (w.total_volume || 0).toFixed(0)),
          h('td', null, w.markets_traded || 0),
          h('td', null, w.win_rate ? (w.win_rate * 100).toFixed(0) + '%' : 'N/A'),
          h('td', null, fmtDate(w.last_seen)),
        ]; },
        { searchFields: ['address', 'label'] }
      )
    ),

    // ═══ SOCIAL ═══
    tab === 'social' && h('div', null,
      tabHeader('Social Intelligence', 'message-circle',
        h(Fragment, null,
          h('p', null, 'Sentiment analysis from Twitter, Reddit, Telegram, and Polymarket comments. Tracks social velocity — how fast sentiment is changing.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Sentiment'), ' — Ranges from -1 (bearish) to +1 (bullish).'),
            h('li', null, h('strong', null, 'Velocity'), ' — How quickly mention volume is changing. High velocity = potential breakout.')
          )
        )
      ),
      renderFilteredTable('social', socialSignals, 'No social signals captured yet. The agent records them when scanning Twitter, Reddit, Telegram.',
        ['Source', 'Topic', 'Sentiment', 'Volume', 'Velocity', 'Time'],
        function(s) { return [
          h('td', null, h('span', { className: 'badge badge-secondary' }, s.source)),
          h('td', null, h('strong', null, s.topic)),
          h('td', null, sentimentBadge(s.sentiment)),
          h('td', null, s.volume || 0),
          h('td', null, s.velocity ? s.velocity.toFixed(1) + 'x' : '-'),
          h('td', null, fmtDate(s.timestamp)),
        ]; },
        { searchFields: ['topic', 'source'], filters: [
          { key: 'source', label: 'Source', options: ['twitter', 'reddit', 'telegram', 'polymarket'] },
          { key: 'sentiment', label: 'Sentiment', options: [
            { value: 'bullish', label: 'Bullish' }, { value: 'bearish', label: 'Bearish' }, { value: 'neutral', label: 'Neutral' }
          ], fn: function(item, val) { return val === 'bullish' ? item.sentiment > 0.2 : val === 'bearish' ? item.sentiment < -0.2 : item.sentiment >= -0.2 && item.sentiment <= 0.2; } }
        ]}
      )
    ),

    // ═══ EVENTS ═══
    tab === 'events' && h('div', null,
      tabHeader('Events & News', 'calendar',
        h(Fragment, null,
          h('p', null, 'Calendar of market-moving events and breaking news alerts. Elections, court rulings, fed meetings, earnings, and sports.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Impact'), ' — Critical events often cause 10%+ price swings.'),
            h('li', null, h('strong', null, 'News Alerts'), ' — Real-time headlines with relevance scoring.')
          )
        )
      ),
      renderFilteredTable('events', events, 'No events tracked yet. The agent adds them with poly_calendar_events.',
        ['Title', 'Category', 'Date', 'Impact', 'Status', ''],
        function(ev) { return [
          h('td', null, h('div', { style: { maxWidth: "300px" } }, h('strong', null, ev.title), ev.description ? h('div', { className: 'text-muted small' }, ev.description.slice(0, 100)) : null)),
          h('td', null, h('span', { className: 'badge badge-secondary' }, ev.category)),
          h('td', null, fmtDate(ev.event_date)),
          h('td', null, h('span', { className: 'badge badge-' + (ev.impact === 'critical' ? 'danger' : ev.impact === 'high' ? 'warning' : 'secondary') }, ev.impact)),
          h('td', null, h('span', { className: 'badge badge-' + (ev.status === 'upcoming' ? 'info' : 'secondary') }, ev.status)),
          h('td', null, h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
            if (!(await showConfirm('Delete this event?'))) return;
            await apiCall('/polymarket/events/' + ev.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
          }}, I('trash-2'))),
        ]; },
        { searchFields: ['title', 'description'], filters: [
          { key: 'impact', label: 'Impact', options: ['critical', 'high', 'medium', 'low'] },
          { key: 'status', label: 'Status', options: ['upcoming', 'past'] }
        ]}
      ),
      // News alerts
      newsAlerts.length > 0 && h('div', { style: { marginTop: "24px" } },
        h('h3', null, I('zap'), ' Recent News Alerts'),
        renderFilteredTable('news', newsAlerts, '',
          ['Headline', 'Source', 'Relevance', 'Time'],
          function(n) { return [
            h('td', null, h('div', { style: { maxWidth: "400px" } }, n.url ? h('a', { href: n.url, target: '_blank', style: { color: "inherit" } }, n.headline) : n.headline)),
            h('td', null, n.source),
            h('td', null, n.relevance > 0.5 ? h('span', { className: 'badge badge-warning' }, 'High') : h('span', { className: 'badge badge-secondary' }, 'Low')),
            h('td', null, fmtDate(n.timestamp)),
          ]; },
          { searchFields: ['headline', 'source'], filters: [
            { key: 'relevance', label: 'Relevance', options: [
              { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }
            ], fn: function(item, val) { return val === 'high' ? item.relevance > 0.5 : item.relevance <= 0.5; } }
          ]}
        )
      )
    ),

    // ═══ ANALYTICS ═══
    tab === 'analytics' && h('div', null,
      tabHeader('Advanced Analytics', 'activity',
        h(Fragment, null,
          h('p', null, 'Quantitative analytics: market correlations, arbitrage opportunities, and regime detection.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Correlations'), ' — Discovers markets that move together (or inversely).'),
            h('li', null, h('strong', null, 'Arbitrage'), ' — Finds mispriced outcomes across related markets.'),
            h('li', null, h('strong', null, 'Regime Detection'), ' — Identifies if a market is trending, mean-reverting, or random (uses Hurst exponent).')
          )
        )
      ),
      // Correlations
      h('h3', { style: { marginTop: 8 } }, 'Market Correlations'),
      renderFilteredTable('correlations', correlations, 'No correlations detected yet. Agent discovers them with poly_market_correlation.',
        ['Market A', 'Market B', 'Correlation', 'Strength', 'Time'],
        function(c) { return [
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(c.market_a))),
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(c.market_b))),
          h('td', null, h('strong', { style: { color: Math.abs(c.correlation) > 0.7 ? '#10b981' : 'var(--text)' } }, c.correlation.toFixed(3))),
          h('td', null, Math.abs(c.correlation) > 0.8 ? 'Strong' : Math.abs(c.correlation) > 0.5 ? 'Moderate' : 'Weak'),
          h('td', null, fmtDate(c.timestamp)),
        ]; },
        { searchFields: ['market_a', 'market_b'], filters: [
          { key: '_strength', label: 'Strength', options: [
            { value: 'strong', label: 'Strong' }, { value: 'moderate', label: 'Moderate' }, { value: 'weak', label: 'Weak' }
          ], fn: function(item, val) { var a = Math.abs(item.correlation); return val === 'strong' ? a > 0.8 : val === 'moderate' ? a > 0.5 && a <= 0.8 : a <= 0.5; } }
        ]}
      ),
      // Arbitrage
      h('h3', { style: { marginTop: "24px" } }, I('shuffle'), ' Arbitrage Opportunities'),
      renderFilteredTable('arbitrage', arbitrage, 'No arbitrage opportunities found yet. Agent scans with poly_arbitrage_scanner.',
        ['Type', 'Expected Profit', 'Confidence', 'Status', 'Time'],
        function(a) { return [
          h('td', null, h('span', { className: 'badge badge-secondary' }, a.type)),
          h('td', null, h('strong', { style: { color: "var(--success)" } }, a.expected_profit.toFixed(2) + '%')),
          h('td', null, a.confidence ? (a.confidence * 100).toFixed(0) + '%' : '-'),
          h('td', null, h('span', { className: 'badge badge-' + (a.status === 'open' ? 'success' : 'secondary') }, a.status)),
          h('td', null, fmtDate(a.timestamp)),
        ]; },
        { searchFields: ['type'], filters: [
          { key: 'status', label: 'Status', options: ['open', 'closed', 'expired'] }
        ]}
      ),
      // Regime signals
      regimes.length > 0 && h('div', { style: { marginTop: "24px" } },
        h('h3', null, I('activity'), ' Regime Detection'),
        renderFilteredTable('regimes', regimes, '',
          ['Token', 'Regime', 'Confidence', 'Hurst', 'Volatility', 'Time'],
          function(r) { return [
            h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(r.token_id))),
            h('td', null, regimeBadge(r.regime)),
            h('td', null, (r.confidence * 100).toFixed(0) + '%'),
            h('td', null, r.hurst ? r.hurst.toFixed(3) : '-'),
            h('td', null, r.volatility ? (r.volatility * 100).toFixed(1) + '%' : '-'),
            h('td', null, fmtDate(r.timestamp)),
          ]; },
          { searchFields: ['token_id'], filters: [
            { key: 'regime', label: 'Regime', options: ['TRENDING', 'MEAN_REVERTING', 'RANDOM'] }
          ]}
        )
      )
    ),

    // ═══ EXECUTION (Snipers + Scale Orders) ═══
    tab === 'execution' && h('div', null,
      tabHeader('Execution Orders', 'crosshair',
        h(Fragment, null,
          h('p', null, 'Active execution orders: snipers and scale-in (TWAP/VWAP) orders.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Snipers'), ' — Limit orders that trigger when price hits a target. Supports trailing stops.'),
            h('li', null, h('strong', null, 'Scale-In'), ' — Splits a large order into slices over time to reduce market impact.')
          )
        )
      ),
      h('h3', { style: { marginTop: 8 } }, 'Sniper Orders'),
      renderFilteredTable('snipers', snipers, 'No sniper orders. Agent creates them with poly_sniper.',
        ['Token', 'Side', 'Target', 'Max', 'Shares', 'Trail', 'Status', ''],
        function(s) { return [
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(s.token_id))),
          h('td', null, sideBadge(s.side)),
          h('td', null, s.target_price?.toFixed(2) + '\u00a2'),
          h('td', null, s.max_price ? s.max_price.toFixed(2) + '\u00a2' : '-'),
          h('td', null, (s.size_usdc || 0).toFixed(1)),
          h('td', null, s.trail_amount?.toFixed(2)),
          h('td', null, statusBadge(s.status)),
          h('td', null, s.status === 'active' && h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
            if (!(await showConfirm('Cancel this sniper order?'))) return;
            await apiCall('/polymarket/snipers/' + s.id, { method: 'DELETE' }); toast('Cancelled', 'success'); loadAgentData(selectedAgent);
          }}, I('x'))),
        ]; },
        { searchFields: ['token_id'], filters: [
          { key: 'side', label: 'Side', options: ['BUY', 'SELL'] },
          { key: 'status', label: 'Status', options: ['active', 'filled', 'cancelled'] }
        ]}
      ),
      h('h3', { style: { marginTop: "24px" } }, I('layers'), ' Scale-In Orders (TWAP/VWAP)'),
      renderFilteredTable('scales', scaleOrders, 'No scale orders. Agent creates them with poly_scale_in.',
        ['Token', 'Side', 'Total', 'Slices', 'Completed', 'Strategy', 'Avg Price', 'Status'],
        function(s) { return [
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(s.token_id))),
          h('td', null, sideBadge(s.side)),
          h('td', null, '$' + (s.total_size || 0).toFixed(2)),
          h('td', null, s.slices),
          h('td', null, s.completed_slices + '/' + s.slices + ' (' + Math.round(s.completed_slices / s.slices * 100) + '%)'),
          h('td', null, h('span', { className: 'badge badge-secondary' }, s.strategy)),
          h('td', null, s.avg_price ? s.avg_price.toFixed(2) + '\u00a2' : '-'),
          h('td', null, statusBadge(s.status)),
        ]; },
        { searchFields: ['token_id'], filters: [
          { key: 'strategy', label: 'Strategy', options: ['TWAP', 'VWAP'] },
          { key: 'status', label: 'Status', options: ['active', 'completed', 'cancelled'] }
        ]}
      )
    ),

    // ═══ HEDGES ═══
    tab === 'hedges_tab' && h('div', null,
      tabHeader('Hedged Positions', 'shield',
        h(Fragment, null,
          h('p', null, 'Positions with opposing hedges to reduce risk. The agent pairs correlated markets and calculates optimal hedge ratios.'),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'A hedge ratio of 1.0 = fully hedged (delta neutral). Lower ratios maintain directional exposure.')
        )
      ),
      renderFilteredTable('hedges', hedges, 'No hedges. Agent creates them with poly_hedge.',
        ['Primary', 'Hedge', 'P. Side', 'H. Side', 'P. Shares', 'H. Shares', 'Ratio', 'Status'],
        function(hg) { return [
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(hg.primary_token))),
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(hg.hedge_token))),
          h('td', null, sideBadge(hg.primary_side)), h('td', null, sideBadge(hg.hedge_side)),
          h('td', null, (hg.primary_size || 0).toFixed(1)),
          h('td', null, (hg.hedge_size || 0).toFixed(1)),
          h('td', null, (hg.hedge_ratio || 0).toFixed(2)),
          h('td', null, statusBadge(hg.status)),
        ]; },
        { searchFields: ['primary_token', 'hedge_token'], filters: [
          { key: 'status', label: 'Status', options: ['active', 'closed', 'cancelled'] }
        ]}
      )
    ),

    // ═══ EXIT RULES ═══
    tab === 'exits' && h('div', null,
      tabHeader('Exit Rules', 'log-out',
        h(Fragment, null,
          h('p', null, 'Automated exit rules attached to positions. The agent monitors these and exits when conditions are met.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Take Profit'), ' — Sells when price reaches target.'),
            h('li', null, h('strong', null, 'Stop Loss'), ' — Sells when price drops below threshold.'),
            h('li', null, h('strong', null, 'Trailing Stop'), ' — Dynamic stop that follows the price up.'),
            h('li', null, h('strong', null, 'Time Exit'), ' — Closes position at a specific date/time.')
          )
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' } }, viewArchiveToggle('exits', '')),
      showArchive.exits ? (
        archiveLoading ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading archive...') :
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' } }, I('database'), ' Archived Exit Rules (', (showArchive.exits_data?.total || 0), ')'),
          (showArchive.exits_data?.rows || []).length === 0 ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No archived exit rules yet.') :
          h('div', { className: 'table-container' }, h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, ['Token', 'Entry', 'Take Profit', 'Stop Loss', 'Trailing', 'Time Exit', 'Highest', 'Status', 'Date'].map(function(hd) { return h('th', { key: hd }, hd); }))),
            h('tbody', null, (showArchive.exits_data?.rows || []).map(function(r) {
              return h('tr', { key: r.id },
                h('td', null, h('code', { style: { fontSize: '11px' } }, shortId(r.token_id))),
                h('td', null, r.entry_price ? r.entry_price.toFixed(2) + '\u00a2' : '-'),
                h('td', null, r.take_profit ? h('span', { style: { color: 'var(--success)' } }, r.take_profit.toFixed(2) + '\u00a2') : '-'),
                h('td', null, r.stop_loss ? h('span', { style: { color: 'var(--danger)' } }, r.stop_loss.toFixed(2) + '\u00a2') : '-'),
                h('td', null, r.trailing_stop_pct ? r.trailing_stop_pct + '%' : '-'),
                h('td', null, r.time_exit ? fmtDate(r.time_exit) : '-'),
                h('td', null, r.highest_price ? r.highest_price.toFixed(2) + '\u00a2' : '-'),
                h('td', null, h('span', { className: 'badge badge-secondary' }, r.status || 'archived')),
                h('td', null, fmtDate(r.created_at))
              );
            }))
          ))
        )
      ) :
      renderFilteredTable('exits', exitRules, 'No exit rules. Agent sets them with poly_exit_strategy after every trade.',
        ['Token', 'Entry', 'Take Profit', 'Stop Loss', 'Trailing', 'Time Exit', 'Highest', ''],
        function(r) { return [
          h('td', null, h('code', { style: { fontSize: "11px" } }, shortId(r.token_id))),
          h('td', null, r.entry_price?.toFixed(2) + '\u00a2'),
          h('td', null, r.take_profit ? h('span', { style: { color: "var(--success)" } }, r.take_profit.toFixed(2) + '\u00a2') : '-'),
          h('td', null, r.stop_loss ? h('span', { style: { color: "var(--danger)" } }, r.stop_loss.toFixed(2) + '\u00a2') : '-'),
          h('td', null, r.trailing_stop_pct ? r.trailing_stop_pct + '%' : '-'),
          h('td', null, r.time_exit ? fmtDate(r.time_exit) : '-'),
          h('td', null, r.highest_price ? r.highest_price.toFixed(2) + '\u00a2' : '-'),
          h('td', null, h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
            if (!(await showConfirm('Remove this exit rule?'))) return;
            await apiCall('/polymarket/exit-rules/' + r.id, { method: 'DELETE' }); toast('Removed', 'success'); loadAgentData(selectedAgent);
          }}, I('trash-2'))),
        ]; },
        { searchFields: ['token_id'] }
      )
    ),

    // ═══ ALERTS ═══
    tab === 'alerts' && h('div', null,
      tabHeader('Price Alerts', 'zap',
        h('p', null, 'Alerts that fire when a market hits a target price or percentage change. The agent creates these while monitoring markets.')
      ),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' } }, viewArchiveToggle('alerts', '')),
      showArchive.alerts ? (
        archiveLoading ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading archive...') :
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' } }, I('database'), ' Archived Alerts (', (showArchive.alerts_data?.total || 0), ')'),
          (showArchive.alerts_data?.rows || []).length === 0 ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No archived alerts yet.') :
          h('div', { className: 'table-container' }, h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, ['Market', 'Condition', 'Target', 'Status', 'Triggered', 'Created'].map(function(hd) { return h('th', { key: hd }, hd); }))),
            h('tbody', null, (showArchive.alerts_data?.rows || []).map(function(a) {
              return h('tr', { key: a.id },
                h('td', null, h('div', { style: { maxWidth: 220 } }, a.market_question || shortId(a.token_id))),
                h('td', null, a.condition || '-'),
                h('td', null, a.target_price ? a.target_price.toFixed(2) + '\u00a2' : a.pct_change ? a.pct_change + '%' : '-'),
                h('td', null, h('span', { className: 'badge badge-' + (a.status === 'triggered' ? 'success' : a.status === 'cancelled' ? 'warning' : 'secondary') }, a.status || 'archived')),
                h('td', null, a.triggered_at ? fmtDate(a.triggered_at) : '-'),
                h('td', null, fmtDate(a.created_at))
              );
            }))
          ))
        )
      ) :
      renderFilteredTable('alerts', alerts, 'No price alerts.',
      ['Market', 'Condition', 'Target', 'Created', ''],
      function(a) { return [
        h('td', null, a.market_question || shortId(a.token_id)),
        h('td', null, a.condition), h('td', null, a.target_price ? a.target_price.toFixed(2) + '\u00a2' : a.pct_change + '%'),
        h('td', null, fmtDate(a.created_at)),
        h('td', null, h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
          if (!(await showConfirm('Delete this alert?'))) return;
          await apiCall('/polymarket/alerts/' + a.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
        }}, I('trash-2'))),
      ]; },
      { searchFields: ['market_question', 'token_id', 'condition'] }
    )),

    // ═══ PAPER ═══
    tab === 'paper' && h('div', null,
      tabHeader('Paper Trading', 'layers',
        h('p', null, 'Simulated positions using paper money. Perfect for testing strategies before going live with real USDC.')
      ),
      (function() {
        // Add outcome field for filtering
        var withOutcome = (paperPositions || []).map(function(p) {
          return Object.assign({}, p, { outcome: resolveOutcome(p.side) });
        });
        var uniqueOutcomes = Array.from(new Set(withOutcome.map(function(p) { return p.outcome; }).filter(Boolean)));
        var filtered = applySearchFilter(withOutcome, 'paper', ['market_question', 'token_id'], [
          { key: 'outcome', label: 'Outcome', options: uniqueOutcomes },
          { key: '_status', label: 'Status', options: [
            { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }
          ], fn: function(item, val) { return val === 'closed' ? item.closed : !item.closed; } }
        ]);
        var result = paginateData(filtered, 'paper');
        return h('div', null,
          withOutcome.length > 0 && renderControls('paper', [
            { key: 'outcome', label: 'Outcome', options: uniqueOutcomes },
            { key: '_status', label: 'Status', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] }
          ], result),
          result.items.length === 0
            ? h('div', { className: 'empty-state card', style: { padding: '24px', textAlign: 'center' } }, getTC('paper').search ? 'No results match your filters.' : 'No paper positions.')
            : h('div', { className: 'table-container' },
              h('table', { className: 'data-table' },
                h('thead', null, h('tr', null, ['Market', 'Position', 'Outcome', 'Shares', 'Entry', 'Cost', 'P&L', 'Status', 'Date'].map(function(hdr) { return h('th', { key: hdr }, hdr); }))),
                h('tbody', null, result.items.map(function(p) {
                  var oc = p.outcome || resolveOutcome(p.side, p.outcome);
                  return h('tr', { key: p.id || Math.random(), style: { cursor: 'pointer' }, onClick: function() { setSelectedPaper(p); } },
                    h('td', null, p.market_question || shortId(p.token_id)),
                    h('td', null, sideBadge(p.side)),
                    h('td', null, oc
                      ? h('span', { className: 'badge ' + (oc.toLowerCase() === 'yes' ? 'badge-success' : oc.toLowerCase() === 'no' ? 'badge-danger' : 'badge-secondary') }, oc)
                      : h('span', { className: 'text-muted' }, '--')
                    ),
                    h('td', null, (p.size || 0).toFixed(1)),
                    h('td', null, ((p.entry_price || 0) * 100).toFixed(1) + '\u00a2'),
                    h('td', null, '$' + ((p.entry_price || 0) * (p.size || 0)).toFixed(2)), h('td', null, pnlCell(p.pnl)),
                    h('td', null, h('span', { className: 'badge badge-' + (p.closed ? 'secondary' : 'success') }, p.closed ? 'Closed' : 'Open')),
                    h('td', null, fmtDate(p.created_at))
                  );
                }))
              )
            )
        );
      })(),
      // Paper position detail modal
      selectedPaper && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setSelectedPaper(null); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 600, maxHeight: '85vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h2', { style: { fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              selectedPaper.market_question || 'Paper Position'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setSelectedPaper(null); } }, '\u00D7')
          ),
          h('div', { className: 'modal-body', style: { padding: 20 } },
            // Status + side badges
            h('div', { style: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' } },
              outcomeBadge(resolveOutcome(selectedPaper.side, selectedPaper.outcome)),
              h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: selectedPaper.closed ? 'rgba(107,115,148,0.15)' : 'rgba(16,185,129,0.15)',
                color: selectedPaper.closed ? '#6b7394' : '#10b981' } },
                selectedPaper.closed ? 'CLOSED' : 'OPEN'),
              selectedPaper.pnl != null && h('span', { style: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: selectedPaper.pnl >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: selectedPaper.pnl >= 0 ? '#10b981' : '#ef4444' } },
                (selectedPaper.pnl >= 0 ? '+' : '') + '$' + (selectedPaper.pnl || 0).toFixed(2))
            ),
            // Details grid
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13, marginBottom: 16 } },
              h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Entry Price'), h('div', null, ((selectedPaper.entry_price || 0) * 100).toFixed(1) + '\u00a2')),
              h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Shares'), h('div', null, (selectedPaper.size || 0).toFixed(1))),
              h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Cost'), h('div', null, '$' + ((selectedPaper.entry_price || 0) * (selectedPaper.size || 0)).toFixed(2))),
              selectedPaper.exit_price != null && h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Exit Price'), h('div', null, selectedPaper.exit_price.toFixed(4))),
              h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Opened'), h('div', null, selectedPaper.created_at ? new Date(selectedPaper.created_at).toLocaleString() : '-')),
              selectedPaper.closed_at && h('div', null, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Closed'), h('div', null, new Date(selectedPaper.closed_at).toLocaleString())),
              h('div', { style: { gridColumn: '1 / -1' } }, h('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 } }, 'Token ID'), h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' } }, selectedPaper.token_id || '-'))
            ),
            // Rationale
            selectedPaper.rationale && h('div', { style: { marginTop: 8 } },
              h('div', { style: { color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, marginBottom: 6 } }, 'RATIONALE'),
              h('div', { style: { padding: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' } }, selectedPaper.rationale)
            )
          )
        )
      ),
    ),

    // ═══ JOURNAL ═══
    tab === 'journal' && h('div', null,
      tabHeader('Prediction Journal', 'edit',
        h(Fragment, null,
          h('p', null, 'Log of all predictions the agent has made. Tracks predicted vs actual outcomes to measure accuracy.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Est. vs Market'), ' — Agent\'s estimated probability vs current market price.'),
            h('li', null, h('strong', null, 'Confidence'), ' — How sure the agent was about the prediction.'),
            h('li', null, h('strong', null, 'Outcome'), ' — Whether the resolved prediction was correct or wrong.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use the Calibration tab to see if the agent\'s confidence levels are well-calibrated.')
        )
      ),
      renderFilteredTable('journal', predictions, 'No predictions yet.',
        ['Market', 'Prediction', 'Est.', 'Mkt Price', 'Conf.', 'Outcome', 'P&L', 'Date'],
        function(p) {
          var wasRight = p.resolved && p.was_correct;
          return [
            h('td', null, h('div', { style: { maxWidth: "240px" } }, p.market_question || shortId(p.token_id))),
            h('td', null, h('span', { className: 'badge badge-secondary' }, p.predicted_outcome)),
            h('td', null, pct(p.predicted_probability)), h('td', null, pct(p.market_price_at_prediction)),
            h('td', null, h('strong', null, pct(p.confidence))),
            h('td', null, p.resolved ? h('span', { className: 'badge ' + (wasRight ? 'badge-success' : 'badge-danger') }, wasRight ? 'Correct' : 'Wrong') : h('span', { className: 'badge badge-warning' }, 'Open')),
            h('td', null, pnlCell(p.pnl)), h('td', null, fmtDate(p.created_at)),
          ];
        },
        { searchFields: ['market_question', 'predicted_outcome', 'token_id'], filters: [
          { key: '_outcome', label: 'Outcome', options: [
            { value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'correct', label: 'Correct' }, { value: 'wrong', label: 'Wrong' }
          ], fn: function(item, val) {
            if (val === 'open') return !item.resolved;
            if (val === 'correct') return item.resolved && item.was_correct;
            if (val === 'wrong') return item.resolved && !item.was_correct;
            return true;
          }}
        ]}
      )
    ),

    // ═══ CALIBRATION ═══
    tab === 'calibration' && h('div', null,
      tabHeader('Prediction Calibration', 'activity',
        h(Fragment, null,
          h('p', null, 'Measures how well the agent\'s confidence matches reality. A perfectly calibrated agent saying "70% confident" should be right ~70% of the time.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', { style: { color: 'var(--success)' } }, 'Calibrated'), ' — Actual accuracy matches stated confidence.'),
            h('li', null, h('strong', { style: { color: 'var(--danger)' } }, 'Overconfident'), ' — Agent says 80% but is only right 60%.'),
            h('li', null, h('strong', { style: { color: 'var(--info)' } }, 'Underconfident'), ' — Agent says 50% but is right 70%.')
          )
        )
      ),
      calibration.length === 0 ?
        h('div', { className: 'empty-state card', style: { padding: "24px", textAlign: "center" } }, 'No calibration data yet. Builds automatically as predictions resolve.') :
        h('div', null,
          h('div', { className: 'card', style: { padding: "24px", marginBottom: "24px" } },
            h('h3', { style: { margin: "0 0 16px 0" } }, 'Prediction Calibration'),
            h('p', { style: { color: "var(--text-muted)", margin: "0 0 16px 0" } }, 'A well-calibrated agent at "70% confident" should be right ~70% of the time.'),
            h('div', { style: { display: "flex", alignItems: "flex-end", gap: "8px", height: "200px", padding: "0 20px" } },
              calibration.map(function(c) {
                var expected = parseInt(c.bucket) + 5, actual = c.predictions > 0 ? Math.round(c.correct / c.predictions * 100) : 0, maxH = 180;
                return h('div', { key: c.bucket, style: { flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" } },
                  h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: maxH, justifyContent: 'flex-end' } },
                    h('div', { title: 'Actual: ' + actual + '%', style: { width: '60%', background: Math.abs(actual - expected) <= 5 ? '#10b981' : actual < expected ? '#ef4444' : '#06b6d4', borderRadius: '4px 4px 0 0', height: Math.max(4, actual / 100 * maxH), opacity: 0.8 } }),
                    h('div', { title: 'Expected: ' + expected + '%', style: { position: 'absolute', bottom: expected / 100 * maxH, left: '10%', width: '80%', height: 2, background: 'var(--text-muted)', opacity: 0.5 } }),
                  ),
                  h('div', { style: { fontSize: "11px", fontWeight: "600" } }, c.bucket),
                  h('div', { style: { fontSize: "10px", color: "var(--text-muted)" } }, c.predictions + ' pred'),
                );
              })
            ),
            h('div', { style: { display: "flex", gap: "16px", marginTop: "12px", justifyContent: "center", fontSize: "12px", color: "var(--text-muted)" } },
              h('span', null, colorDot('var(--success)'), ' Calibrated'),
              h('span', null, colorDot('var(--danger)'), ' Overconfident'),
              h('span', null, colorDot('var(--info)'), ' Underconfident'),
            )
          ),
          renderFilteredTable('calibration', calibration, '', ['Confidence', 'Predictions', 'Correct', 'Actual', 'Expected', 'Bias'],
            function(c) {
              var actual = c.predictions > 0 ? Math.round(c.correct / c.predictions * 100) : 0, expected = parseInt(c.bucket) + 5, diff = actual - expected;
              return [
                h('td', null, h('strong', null, c.bucket)), h('td', null, c.predictions), h('td', null, c.correct),
                h('td', null, h('strong', null, actual + '%')), h('td', null, '~' + expected + '%'),
                h('td', null, h('span', { style: { color: Math.abs(diff) <= 5 ? '#10b981' : diff < 0 ? '#ef4444' : '#06b6d4' } },
                  Math.abs(diff) <= 5 ? 'Calibrated' : diff < 0 ? 'Overconfident (' + diff + '%)' : 'Underconfident (+' + diff + '%)')),
              ];
            },
            { searchFields: ['bucket'], filters: [
              { key: '_bias', label: 'Bias', options: [
                { value: 'calibrated', label: 'Calibrated' }, { value: 'over', label: 'Overconfident' }, { value: 'under', label: 'Underconfident' }
              ], fn: function(item, val) {
                var actual = item.predictions > 0 ? Math.round(item.correct / item.predictions * 100) : 0, diff = actual - (parseInt(item.bucket) + 5);
                return val === 'calibrated' ? Math.abs(diff) <= 5 : val === 'over' ? diff < -5 : diff > 5;
              }}
            ]}
          )
        )
    ),

    // ═══ STRATEGIES ═══
    tab === 'strategies' && h('div', null,
      tabHeader('Strategy Performance', 'trending-up',
        h(Fragment, null,
          h('p', null, 'Breakdown of P&L and win rate by trading strategy. Helps identify which strategies to keep, refine, or drop.'),
          h('div', { style: _tip }, h('strong', null, 'Verdict: '), '"Keep" = >60% win rate, "Neutral" = 45-60%, "Drop" = <45%.')
        )
      ),
      strategies.length === 0 ?
        h('div', { className: 'empty-state card', style: { padding: "24px", textAlign: "center" } }, 'No strategy data yet.') :
        renderFilteredTable('strategies', strategies, '', ['Strategy', 'Trades', 'Wins', 'Win Rate', 'P&L', 'Avg Conf.', 'Verdict'],
          function(s) {
            var wr = parseFloat(s.win_rate || 0);
            return [
              h('td', null, h('strong', null, s.strategy_name)), h('td', null, s.total_predictions),
              h('td', null, s.correct_predictions),
              h('td', null, h('span', { style: { fontWeight: '600', color: wr > 55 ? '#10b981' : wr < 45 ? '#ef4444' : 'var(--text)' } }, wr + '%')),
              h('td', null, pnlCell(s.total_pnl)), h('td', null, Math.round((s.avg_confidence || 0) * 100) + '%'),
              h('td', null, h('span', { className: 'badge ' + (wr > 60 ? 'badge-success' : wr > 45 ? 'badge-warning' : 'badge-danger') }, wr > 60 ? 'Keep' : wr > 45 ? 'Neutral' : 'Drop')),
            ];
          },
          { searchFields: ['strategy_name'], filters: [
            { key: '_verdict', label: 'Verdict', options: [
              { value: 'keep', label: 'Keep' }, { value: 'neutral', label: 'Neutral' }, { value: 'drop', label: 'Drop' }
            ], fn: function(item, val) { var wr = parseFloat(item.win_rate || 0); return val === 'keep' ? wr > 60 : val === 'neutral' ? wr > 45 && wr <= 60 : wr <= 45; } }
          ]}
        )
    ),

    // ═══ LESSONS ═══
    tab === 'lessons' && h('div', null,
      tabHeader('Lessons Learned', 'edit',
        h('p', null, 'Insights the agent has recorded after reviewing trades. Categorized by importance and topic. The agent recalls these before making similar trades.')
      ),
      (function() {
        var filtered = applySearchFilter(lessons, 'lessons', ['lesson', 'category'], [
          { key: 'importance', label: 'Importance', options: ['critical', 'high', 'normal'] },
          { key: 'category', label: 'Category', options: (function() { var cats = {}; lessons.forEach(function(l) { if (l.category) cats[l.category] = 1; }); return Object.keys(cats); })() }
        ]);
        var result = paginateData(filtered, 'lessons');
        return result.items.length === 0 && lessons.length === 0 ?
          h('div', { className: 'empty-state card', style: { padding: "24px", textAlign: "center" } }, 'No lessons yet. The agent records them after reviewing trades.') :
          h('div', null,
            lessons.length > 0 && renderControls('lessons', [
              { key: 'importance', label: 'Importance', options: ['critical', 'high', 'normal'] },
              { key: 'category', label: 'Category', options: (function() { var cats = {}; lessons.forEach(function(l) { if (l.category) cats[l.category] = 1; }); return Object.keys(cats); })() }
            ], result),
            result.items.length === 0 ? h('div', { className: 'empty-state card', style: { padding: '24px', textAlign: 'center' } }, 'No results match your filters.') :
            result.items.map(function(l) {
          return h('div', { key: l.id, className: 'card', style: { padding: "16px", marginBottom: "12px" } },
            h('div', { style: { display: "flex", justifyContent: "space-between", alignItems: "start" } },
              h('div', { style: { flex: "1" } },
                h('div', { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" } },
                  h('span', { className: 'badge badge-' + (l.importance === 'critical' ? 'danger' : l.importance === 'high' ? 'warning' : 'secondary') }, l.importance || 'normal'),
                  h('span', { className: 'badge badge-secondary' }, l.category || 'general'),
                  l.times_applied > 0 && h('span', { style: { fontSize: "12px", color: "var(--text-muted)" } }, 'Applied ' + l.times_applied + 'x'),
                ),
                h('p', { style: { margin: "0", lineHeight: "1.5" } }, l.lesson),
                h('div', { style: { fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" } }, fmtDate(l.created_at)),
              ),
              h('button', { className: 'btn btn-sm btn-outline', style: { marginLeft: "12px" }, onClick: async function() {
                if (await showConfirm('Delete this lesson?')) {
                  await apiCall('/polymarket/lessons/' + l.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
                }
              }}, I('trash-2'))
            )
          );
        }))
      })()
    ),

    // ═══ DRAWDOWN ═══
    tab === 'drawdown_tab' && h('div', null,
      tabHeader('Drawdown Monitor', 'trending-down',
        h(Fragment, null,
          h('p', null, 'Tracks portfolio peak-to-trough decline. If drawdown exceeds the configured max, the circuit breaker pauses all trading.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, '<10%'), ' — Normal fluctuation.'),
            h('li', null, h('strong', null, '10-15%'), ' — Warning zone.'),
            h('li', null, h('strong', null, '>15%'), ' — Danger zone. Consider reducing exposure.')
          )
        )
      ),
      !drawdown || !drawdown.snapshots?.length ?
        h('div', { className: 'empty-state card', style: { padding: "24px", textAlign: "center" } }, 'No portfolio snapshots yet. The agent records them with poly_drawdown_monitor.') :
        h('div', null,
          h('div', { className: 'stats-grid', style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "12px", marginBottom: "24px" } },
            statCard('Current Value', '$' + (drawdown.current || 0).toFixed(2)),
            statCard('Peak Value', '$' + (drawdown.peak || 0).toFixed(2)),
            statCard('Drawdown', drawdown.drawdown_pct + '%', drawdown.drawdown_pct > 15 ? 'DANGER' : drawdown.drawdown_pct > 10 ? 'WARNING' : 'OK'),
            statCard('Snapshots', drawdown.snapshots.length),
          ),
          renderFilteredTable('drawdown', drawdown.snapshots, '', ['Value', 'Peak', 'Drawdown', 'P&L', 'Time'],
            function(s) { return [
              h('td', null, '$' + (s.total_value || 0).toFixed(2)),
              h('td', null, '$' + (s.peak_value || 0).toFixed(2)),
              h('td', null, h('span', { style: { color: s.drawdown_pct > 15 ? '#ef4444' : s.drawdown_pct > 10 ? '#b45309' : '#10b981' } }, s.drawdown_pct?.toFixed(1) + '%')),
              h('td', null, pnlCell(s.unrealized_pnl)),
              h('td', null, fmtDate(s.timestamp)),
            ]; },
            { searchFields: [], filters: [
              { key: '_severity', label: 'Severity', options: [
                { value: 'danger', label: 'Danger (>15%)' }, { value: 'warning', label: 'Warning (10-15%)' }, { value: 'ok', label: 'OK (<10%)' }
              ], fn: function(item, val) { return val === 'danger' ? item.drawdown_pct > 15 : val === 'warning' ? item.drawdown_pct > 10 && item.drawdown_pct <= 15 : item.drawdown_pct <= 10; } }
            ]}
          )
        )
    ),

    // ═══ P&L ATTRIBUTION ═══
    tab === 'attribution' && h('div', null,
      tabHeader('P&L Attribution', 'pie-chart',
        h(Fragment, null,
          h('p', null, 'Breaks down profit and loss by strategy, market category, and signal source. Shows which factors are driving returns.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'By Strategy'), ' — Which trading strategies generate the most P&L.'),
            h('li', null, h('strong', null, 'By Category'), ' — Performance across market types (politics, crypto, sports, etc.).'),
            h('li', null, h('strong', null, 'By Signal'), ' — Which data sources (social, on-chain, news) lead to the best trades.')
          )
        )
      ),
      !pnlAttrib || (!pnlAttrib.byStrategy?.length && !pnlAttrib.byCategory?.length) ?
        h('div', { className: 'empty-state card', style: { padding: "24px", textAlign: "center" } }, 'No P&L attribution data yet. Agent records with poly_pnl_attribution.') :
        h('div', null,
          pnlAttrib.byStrategy?.length > 0 && h('div', { style: { marginBottom: "24px" } },
            h('h4', null, 'By Strategy'),
            renderFilteredTable('attrib_strat', pnlAttrib.byStrategy, '', ['Strategy', 'Trades', 'Wins', 'Win Rate', 'P&L', 'Avg Hold'],
              function(s) { return [
                h('td', null, h('strong', null, s.strategy)),
                h('td', null, s.trades), h('td', null, s.wins),
                h('td', null, s.trades > 0 ? Math.round(s.wins / s.trades * 100) + '%' : '-'),
                h('td', null, pnlCell(s.total_pnl)),
                h('td', null, s.avg_hold ? s.avg_hold.toFixed(1) + 'h' : '-'),
              ]; },
              { searchFields: ['strategy'] }
            )
          ),
          pnlAttrib.byCategory?.length > 0 && h('div', { style: { marginBottom: "24px" } },
            h('h4', null, 'By Category'),
            renderFilteredTable('attrib_cat', pnlAttrib.byCategory, '', ['Category', 'Trades', 'Wins', 'Win Rate', 'P&L'],
              function(c) { return [
                h('td', null, h('strong', null, c.category)),
                h('td', null, c.trades), h('td', null, c.wins),
                h('td', null, c.trades > 0 ? Math.round(c.wins / c.trades * 100) + '%' : '-'),
                h('td', null, pnlCell(c.total_pnl)),
              ]; },
              { searchFields: ['category'] }
            )
          ),
          pnlAttrib.bySignal?.length > 0 && h('div', null,
            h('h4', null, 'By Signal Source'),
            renderFilteredTable('attrib_signal', pnlAttrib.bySignal, '', ['Signal', 'Trades', 'Wins', 'Win Rate', 'P&L'],
              function(s) { return [
                h('td', null, h('strong', null, s.signal_source)),
                h('td', null, s.trades), h('td', null, s.wins),
                h('td', null, s.trades > 0 ? Math.round(s.wins / s.trades * 100) + '%' : '-'),
                h('td', null, pnlCell(s.total_pnl)),
              ]; },
              { searchFields: ['signal_source'] }
            )
          )
        )
    ),

    // ═══ PERFORMANCE GOALS ═══
    tab === 'goals' && h('div', null,
      tabHeader('Performance Goals', 'chart',
        h(Fragment, null,
          h('p', null, 'Set daily, weekly, and monthly targets for your trading agent. Goals are auto-tracked against real portfolio performance.'),
          h('ul', { style: _ul },
            h('li', null, 'Goals are auto-evaluated on each dashboard load and when the agent checks via poly_goals tool.'),
            h('li', null, 'Met goals show a green checkmark. The agent is notified of goal achievements and remaining targets.'),
            h('li', null, 'Streaks track consecutive periods of meeting goals.')
          )
        )
      ),
      // Summary bar
      (function() {
        var metCount = goals.filter(function(g) { return g.met; }).length;
        var totalActive = goals.filter(function(g) { return g.enabled; }).length;
        var overallProgress = totalActive > 0 ? goals.filter(function(g) { return g.enabled; }).reduce(function(s, g) {
          return s + Math.min(100, g.target_value > 0 ? ((g.current_value || 0) / g.target_value) * 100 : 0);
        }, 0) / totalActive : 0;
        return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', { className: 'card', style: { padding: 16, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, fontWeight: 700, color: metCount === totalActive && totalActive > 0 ? '#10b981' : 'var(--text)' } }, metCount + '/' + totalActive),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Goals Met')
          ),
          h('div', { className: 'card', style: { padding: 16, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, fontWeight: 700, color: overallProgress >= 75 ? '#10b981' : overallProgress >= 50 ? '#b45309' : '#ef4444' } }, overallProgress.toFixed(0) + '%'),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Overall Progress')
          ),
          h('div', { className: 'card', style: { padding: 16, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, fontWeight: 700 } }, Math.max.apply(null, goals.map(function(g) { return g.streak || 0; }).concat([0]))),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Best Current Streak')
          ),
          h('div', { className: 'card', style: { padding: 16, textAlign: 'center' } },
            h('button', { className: 'btn btn-primary', style: { width: '100%' }, onClick: async function() {
              try {
                var res = await apiCall('/polymarket/' + selectedAgent + '/goals/evaluate', { method: 'POST' });
                setGoalEval(res);
                toast('Evaluated ' + res.evaluated + ' goals', 'success');
                var gRes = await apiCall('/polymarket/' + selectedAgent + '/goals');
                setGoals(gRes.goals || []);
              } catch (e) { toast(e.message, 'error'); }
            } }, I('refresh-cw'), ' Evaluate Now'),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Run live check')
          )
        );
      })(),
      // Action bar
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() {
          setEditGoal({ name: '', type: 'daily_pnl_pct', period: 'daily', target_value: 3, notify_on_met: true });
          setShowGoalForm(true);
        } }, I('activity'), ' Add Goal'),
        goals.length === 0 && h('button', { className: 'btn btn-secondary btn-sm', onClick: async function() {
          var defaults = [
            { name: 'Daily P&L Target', type: 'daily_pnl_pct', target_value: 3, notify_on_met: true },
            { name: 'Weekly P&L Target', type: 'weekly_pnl_pct', target_value: 15, notify_on_met: true },
            { name: 'Monthly P&L Target', type: 'monthly_pnl_pct', target_value: 50, notify_on_met: true },
            { name: 'Win Rate', type: 'win_rate', target_value: 60, notify_on_met: true },
            { name: 'Min Daily Trades', type: 'min_trades_daily', target_value: 3, notify_on_met: false },
            { name: 'Max Drawdown Limit', type: 'max_drawdown', target_value: 15, notify_on_met: true },
          ];
          try {
            for (var i = 0; i < defaults.length; i++) {
              await apiCall('/polymarket/' + selectedAgent + '/goals', { method: 'POST', body: JSON.stringify(defaults[i]) });
            }
            toast('6 default goals applied', 'success');
            var res = await apiCall('/polymarket/' + selectedAgent + '/goals');
            setGoals(res.goals || []);
          } catch (e) { toast(e.message, 'error'); }
        } }, I('check'), ' Apply Default Goals')
      ),
      // Goals list
      goals.length === 0
        ? h('div', { className: 'card', style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } },
            h('div', { style: { fontSize: 40, marginBottom: 12 } }, I('chart')),
            h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, 'No goals configured'),
            h('div', { style: { fontSize: 13 } }, 'Set performance targets for your trading agent. Goals are auto-tracked against real data.')
          )
        : h('div', { style: { display: 'grid', gap: 12 } },
            goals.map(function(goal) {
              var progress = goal.type === 'max_drawdown'
                ? ((goal.current_value || 0) <= goal.target_value ? 100 : 0)
                : Math.min(100, goal.target_value > 0 ? ((goal.current_value || 0) / goal.target_value) * 100 : 0);
              var met = goal.type === 'max_drawdown' ? (goal.current_value || 0) <= goal.target_value : !!goal.met;
              var remaining = goal.type === 'max_drawdown' ? 0 : Math.max(0, goal.target_value - (goal.current_value || 0));
              var goalTypeLabels = {
                daily_pnl_pct: 'Daily P&L %', daily_pnl_usd: 'Daily P&L $', weekly_pnl_pct: 'Weekly P&L %',
                weekly_pnl_usd: 'Weekly P&L $', monthly_pnl_pct: 'Monthly P&L %', monthly_pnl_usd: 'Monthly P&L $',
                win_rate: 'Win Rate %', min_trades_daily: 'Min Trades/Day', min_trades_weekly: 'Min Trades/Week',
                portfolio_value: 'Portfolio Value $', max_drawdown: 'Max Drawdown %', balance_target: 'Balance Target $',
              };
              return h('div', { key: goal.id, className: 'card', style: { padding: 16, cursor: 'pointer', opacity: goal.enabled ? 1 : 0.5 },
                onClick: function() { setGoalDetail(goal); }
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('div', { style: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                      background: met ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)',
                      color: met ? '#10b981' : '#ef4444',
                    } }, met ? '\u2713' : '\u2717'),
                    h('div', null,
                      h('div', { style: { fontWeight: 600, fontSize: 14 } }, goal.name),
                      h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, goalTypeLabels[goal.type] || goal.type, ' \u2022 ', goal.period || 'daily')
                    )
                  ),
                  h('div', { style: { textAlign: 'right' } },
                    h('div', { style: { fontWeight: 700, fontSize: 18, color: met ? '#10b981' : 'var(--text)' } },
                      (goal.current_value || 0).toFixed(goal.type.includes('pct') || goal.type === 'win_rate' || goal.type === 'max_drawdown' ? 1 : 2),
                      h('span', { style: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 } }, ' / ', goal.target_value,
                        goal.type.includes('pct') || goal.type === 'win_rate' || goal.type === 'max_drawdown' ? '%' : goal.type.includes('usd') || goal.type === 'portfolio_value' || goal.type === 'balance_target' ? '$' : ''
                      )
                    ),
                    !met && remaining > 0 && h('div', { style: { fontSize: 11, color: '#b45309' } }, remaining.toFixed(2) + ' remaining')
                  )
                ),
                // Progress bar
                h('div', { style: { height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' } },
                  h('div', { style: { height: '100%', borderRadius: 3, transition: 'width 0.3s',
                    width: progress + '%',
                    background: met ? '#10b981' : progress >= 75 ? '#b45309' : progress >= 50 ? '#3b82f6' : '#ef4444'
                  } })
                ),
                // Stats row
                h('div', { style: { display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' } },
                  h('span', null, I('activity'), ' Streak: ', h('strong', null, goal.streak || 0)),
                  h('span', null, I('chart'), ' Best: ', h('strong', null, goal.best_streak || 0)),
                  h('span', null, I('check'), ' Met: ', h('strong', null, goal.times_met || 0)),
                  h('span', null, I('x'), ' Missed: ', h('strong', null, goal.times_missed || 0)),
                  goal.last_evaluated && h('span', null, 'Last check: ', new Date(goal.last_evaluated).toLocaleString([], { hour: 'numeric', minute: '2-digit', hour12: true }))
                )
              );
            })
          ),
      // Goal detail modal
      goalDetail && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setGoalDetail(null); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 520, maxHeight: '85vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h3', null, I('chart'), ' ', goalDetail.name),
            h('button', { className: 'btn btn-sm', onClick: function() { setGoalDetail(null); } }, '\u2715')
          ),
          h('div', { className: 'modal-body', style: { padding: 20 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
              [
                ['Type', { daily_pnl_pct: 'Daily P&L %', daily_pnl_usd: 'Daily P&L $', weekly_pnl_pct: 'Weekly P&L %', weekly_pnl_usd: 'Weekly P&L $', monthly_pnl_pct: 'Monthly P&L %', monthly_pnl_usd: 'Monthly P&L $', win_rate: 'Win Rate', min_trades_daily: 'Min Trades/Day', min_trades_weekly: 'Min Trades/Week', portfolio_value: 'Portfolio Value', max_drawdown: 'Max Drawdown', balance_target: 'Balance Target' }[goalDetail.type] || goalDetail.type],
                ['Period', goalDetail.period || 'daily'],
                ['Target', goalDetail.target_value],
                ['Current', (goalDetail.current_value || 0).toFixed(4)],
                ['Status', goalDetail.met ? 'MET' : 'NOT MET'],
                ['Streak', goalDetail.streak || 0],
                ['Best Streak', goalDetail.best_streak || 0],
                ['Times Met', goalDetail.times_met || 0],
                ['Times Missed', goalDetail.times_missed || 0],
                ['Met At', goalDetail.met_at || 'Never'],
                ['Last Evaluated', goalDetail.last_evaluated || 'Never'],
                ['Notify on Met', goalDetail.notify_on_met ? 'Yes' : 'No'],
                ['Enabled', goalDetail.enabled ? 'Yes' : 'No'],
                ['Created', goalDetail.created_at || ''],
              ].map(function(pair) {
                return h('div', { key: pair[0], style: { padding: 10, background: 'var(--bg-secondary)', borderRadius: 6 } },
                  h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, pair[0]),
                  h('div', { style: { fontSize: 13, fontWeight: 600 } }, pair[1])
                );
              })
            )
          ),
          h('div', { className: 'modal-footer', style: { display: 'flex', gap: 8 } },
            h('button', { className: 'btn btn-sm btn-secondary', onClick: function() {
              setEditGoal(Object.assign({}, goalDetail)); setShowGoalForm(true); setGoalDetail(null);
            } }, 'Edit'),
            h('button', { className: 'btn btn-sm', style: { color: '#ef4444' }, onClick: async function() {
              if (!(await showConfirm('Delete goal "' + goalDetail.name + '"?'))) return;
              try {
                await apiCall('/polymarket/' + selectedAgent + '/goals/' + goalDetail.id, { method: 'DELETE' });
                toast('Goal deleted', 'success');
                setGoalDetail(null);
                var res = await apiCall('/polymarket/' + selectedAgent + '/goals');
                setGoals(res.goals || []);
              } catch (e) { toast(e.message, 'error'); }
            } }, 'Delete'),
            h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { setGoalDetail(null); } }, 'Close')
          )
        )
      ),
      // Create/edit goal modal
      showGoalForm && editGoal && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowGoalForm(false); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 480, maxHeight: '85vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h3', null, editGoal.id ? 'Edit Goal' : 'Add Performance Goal'),
            h('button', { className: 'btn btn-sm', onClick: function() { setShowGoalForm(false); } }, '\u2715')
          ),
          h('div', { className: 'modal-body', style: { padding: 20, display: 'grid', gap: 14 } },
            h('div', null,
              h('label', { style: _labelStyle }, 'Goal Name'),
              h('input', { style: _inputStyle, value: editGoal.name, placeholder: 'e.g., Daily 3% P&L Target',
                onChange: function(e) { setEditGoal(Object.assign({}, editGoal, { name: e.target.value })); }
              })
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
              h('div', null,
                h('label', { style: _labelStyle }, 'Goal Type'),
                h('select', { style: _selectStyle, value: editGoal.type,
                  onChange: function(e) { setEditGoal(Object.assign({}, editGoal, { type: e.target.value })); }
                },
                  h('optgroup', { label: 'P&L Targets' },
                    h('option', { value: 'daily_pnl_pct' }, 'Daily P&L (%)'),
                    h('option', { value: 'daily_pnl_usd' }, 'Daily P&L ($)'),
                    h('option', { value: 'weekly_pnl_pct' }, 'Weekly P&L (%)'),
                    h('option', { value: 'weekly_pnl_usd' }, 'Weekly P&L ($)'),
                    h('option', { value: 'monthly_pnl_pct' }, 'Monthly P&L (%)'),
                    h('option', { value: 'monthly_pnl_usd' }, 'Monthly P&L ($)')
                  ),
                  h('optgroup', { label: 'Performance' },
                    h('option', { value: 'win_rate' }, 'Win Rate (%)'),
                    h('option', { value: 'min_trades_daily' }, 'Min Trades per Day'),
                    h('option', { value: 'min_trades_weekly' }, 'Min Trades per Week')
                  ),
                  h('optgroup', { label: 'Portfolio' },
                    h('option', { value: 'portfolio_value' }, 'Portfolio Value ($)'),
                    h('option', { value: 'balance_target' }, 'USDC Balance Target ($)'),
                    h('option', { value: 'max_drawdown' }, 'Max Drawdown (%) - stay below')
                  )
                )
              ),
              h('div', null,
                h('label', { style: _labelStyle }, 'Target Value'),
                h('input', { style: _inputStyle, type: 'number', step: 'any', value: editGoal.target_value,
                  onChange: function(e) { setEditGoal(Object.assign({}, editGoal, { target_value: parseFloat(e.target.value) || 0 })); }
                })
              )
            ),
            h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 } },
                h('input', { type: 'checkbox', checked: editGoal.notify_on_met !== false,
                  onChange: function(e) { setEditGoal(Object.assign({}, editGoal, { notify_on_met: e.target.checked })); }
                }),
                'Notify manager when goal is met'
              )
            )
          ),
          h('div', { className: 'modal-footer' },
            h('button', { className: 'btn btn-secondary', onClick: function() { setShowGoalForm(false); } }, 'Cancel'),
            h('button', { className: 'btn btn-primary', onClick: async function() {
              if (!editGoal.name) { toast('Name is required', 'error'); return; }
              try {
                if (editGoal.id) {
                  await apiCall('/polymarket/' + selectedAgent + '/goals/' + editGoal.id, { method: 'PUT', body: JSON.stringify(editGoal) });
                  toast('Goal updated', 'success');
                } else {
                  await apiCall('/polymarket/' + selectedAgent + '/goals', { method: 'POST', body: JSON.stringify(editGoal) });
                  toast('Goal created', 'success');
                }
                setShowGoalForm(false);
                var res = await apiCall('/polymarket/' + selectedAgent + '/goals');
                setGoals(res.goals || []);
              } catch (e) { toast(e.message, 'error'); }
            } }, editGoal.id ? 'Update' : 'Create Goal')
          )
        )
      )
    ),

    // ═══ WATCHERS / MONITORS ═══
    tab === 'watchers' && h('div', null,
      tabHeader('Market Monitors', 'activity',
        h(Fragment, null,
          h('p', null, 'AI-powered market surveillance engine. Uses a configurable LLM (Grok, GPT-4o-mini, etc.) for real-time news analysis, geopolitical pattern detection, sentiment tracking, and cross-signal correlation. Engine only runs when active watchers exist.'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'price_level / price_change'), ' \u2014 Price threshold and % movement alerts.'),
            h('li', null, h('strong', null, 'news_intelligence'), ' \u2014 AI-analyzed news: assesses market impact, predicts outcomes, recommends actions.'),
            h('li', null, h('strong', null, 'geopolitical'), ' \u2014 AI scans world events, connects dots between headlines, predicts cascading effects on markets.'),
            h('li', null, h('strong', null, 'cross_signal'), ' \u2014 AI correlates multiple signals (news + price + sentiment) to detect emerging patterns.'),
            h('li', null, h('strong', null, 'sentiment_shift'), ' \u2014 Tracks sentiment over time, alerts on significant directional changes.'),
            h('li', null, h('strong', null, 'market_scan'), ' \u2014 Discover new markets matching keywords.'),
            h('li', null, h('strong', null, 'crypto_price'), ' \u2014 BTC/ETH price movement tracker.'),
            h('li', null, h('strong', null, 'resolution_watch'), ' \u2014 Markets approaching resolution deadline.'),
            h('li', null, h('strong', null, 'portfolio_drift'), ' \u2014 Portfolio P&L exceeds threshold.'),
            h('li', null, h('strong', null, 'volume_surge / arbitrage_scan'), ' \u2014 Volume spikes and cross-market mispricing.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Setup: '), 'Agent runs poly_watcher_config to set AI model (e.g., Grok for real-time X/Twitter access), then poly_setup_monitors for full surveillance suite. Engine auto-starts when watchers exist.')
        )
      ),

      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' } }, viewArchiveToggle('watchers', '')),

      showArchive.watchers ? (
        archiveLoading ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading archive...') :
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' } }, I('database'), ' Archived Monitors (', (showArchive.watchers_data?.total || 0), ')'),
          (showArchive.watchers_data?.rows || []).length === 0 ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No archived monitors yet.') :
          h('div', { className: 'table-container' }, h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, ['Name', 'Type', 'Status', 'Interval', 'Ticks', 'Last Run', 'Created'].map(function(hd) { return h('th', { key: hd }, hd); }))),
            h('tbody', null, (showArchive.watchers_data?.rows || []).map(function(w) {
              return h('tr', { key: w.id },
                h('td', null, h('div', { style: { maxWidth: 220 } }, w.name || 'Unnamed')),
                h('td', null, h('span', { className: 'badge badge-secondary' }, w.type || '-')),
                h('td', null, h('span', { className: 'badge badge-' + (w.status === 'paused' ? 'warning' : 'secondary') }, w.status || 'archived')),
                h('td', null, w.check_interval_ms ? Math.round(w.check_interval_ms / 1000) + 's' : '-'),
                h('td', null, w.tick_count || 0),
                h('td', null, w.last_run ? fmtDate(w.last_run) : '-'),
                h('td', null, fmtDate(w.created_at))
              );
            }))
          ))
        )
      ) : null,

      // ── Engine Status Panel ──
      engineStatus && h('div', { style: { marginBottom: 16, padding: '14px 18px', borderRadius: 'var(--radius)', border: '1px solid ' + (engineStatus.running ? 'rgba(16,185,129,0.3)' : engineStatus.idle ? 'rgba(234,179,8,0.3)' : 'rgba(107,114,128,0.3)'), background: engineStatus.running ? 'rgba(16,185,129,0.06)' : engineStatus.idle ? 'rgba(234,179,8,0.06)' : 'rgba(107,114,128,0.06)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('div', { style: { width: 10, height: 10, borderRadius: '50%', background: engineStatus.running ? '#10b981' : engineStatus.idle ? '#eab308' : '#6b7280', boxShadow: engineStatus.running ? '0 0 6px #10b981' : 'none' } }),
          h('strong', { style: { fontSize: 13 } }, 'Watcher Engine'),
          h('span', { className: 'badge ' + (engineStatus.running ? 'badge-success' : engineStatus.idle ? 'badge-warning' : 'badge-secondary') },
            engineStatus.running ? 'Running' : engineStatus.idle ? 'Idle (waiting for watchers)' : 'Stopped'
          )
        ),
        engineStatus.running && h('div', { style: { display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' } },
          h('span', null, 'Tick: ' + (engineStatus.tickMs / 1000) + 's'),
          h('span', null, 'Ticks: ' + (engineStatus.tickCount || 0)),
          h('span', null, 'Events: ' + (engineStatus.eventCount || 0)),
          h('span', null, 'Spawns: ' + (engineStatus.spawnCount || 0)),
          h('span', null, 'AI Analyses: ' + (engineStatus.analysisCount || 0)),
          engineStatus.startedAt && h('span', null, 'Uptime: ' + (function() { var s = Math.floor((Date.now() - engineStatus.startedAt) / 1000); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s/60) + 'm' : Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm'; })())
        ),
        h('div', { style: { display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' } },
          h('span', null, 'Active: ' + (engineStatus.activeWatchers || 0)),
          h('span', null, 'Paused: ' + (engineStatus.pausedWatchers || 0)),
          h('span', null, 'Unack signals: ' + (engineStatus.unacknowledgedEvents || 0))
        ),
        h('div', { style: { marginLeft: 'auto' } },
          h('button', { className: 'btn btn-sm ' + (engineStatus.running || engineStatus.idle ? 'btn-warning' : 'btn-success'), onClick: async function() {
            var action = (engineStatus.running || engineStatus.idle) ? 'stop' : 'start';
            if (action === 'stop' && !(await showConfirm('Stop watcher engine? Active watchers will stop monitoring.'))) return;
            var res = await apiCall('/polymarket/engine/control', { method: 'POST', body: JSON.stringify({ action: action }) });
            if (res.success) { toast(action === 'start' ? 'Engine started' : 'Engine stopped', 'success'); loadAgentData(selectedAgent); }
          } }, (engineStatus.running || engineStatus.idle) ? 'Stop Engine' : 'Start Engine')
        )
      ),

      // ── AI Analysis Status Bar + Configure Button ──
      h('div', { style: { marginBottom: 16, padding: '10px 16px', borderRadius: 'var(--radius)', border: '1px solid ' + (watcherAIConfig && watcherAIConfig.configured ? 'rgba(99,102,241,0.3)' : 'rgba(239,68,68,0.3)'), background: watcherAIConfig && watcherAIConfig.configured ? 'rgba(99,102,241,0.06)' : 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          I('brain'),
          h('strong', { style: { fontSize: 13 } }, 'AI Analysis'),
          watcherAIConfig && watcherAIConfig.configured
            ? h(Fragment, null,
                h('span', { className: 'badge badge-success' }, watcherAIConfig.provider + '/' + watcherAIConfig.model),
                h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, (watcherAIConfig.used_today || 0) + '/' + (watcherAIConfig.budget_daily || 100) + ' calls today')
              )
            : h('span', { className: 'badge badge-danger' }, 'Not Configured')
        ),
        h('button', { className: 'btn btn-sm btn-secondary', onClick: function() { setShowAIConfig(true); } }, I('settings'), ' Configure')
      ),

      // ── AI Config Modal ──
      showAIConfig && h('div', { className: 'modal-overlay', onMouseMove: hideTip, onClick: function() { setShowAIConfig(false); } },
        h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 520, maxHeight: '85vh', overflow: 'auto' } },
          h('div', { className: 'modal-header' },
            h('h2', { style: { fontSize: 16, flex: 1, display: 'flex', alignItems: 'center', gap: 8 } }, I('brain'), ' AI Analysis Model'),
            h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowAIConfig(false); } }, '\u00d7')
          ),
          h('div', { className: 'modal-body', style: { padding: 20 } },
            orgProviders.length === 0 && h('div', { style: { padding: '12px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 } },
              I('key'), ' No providers configured. Go to ', h('strong', null, 'Settings \u2192 Models & API Keys'), ' to add a provider and API key first.'
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 } },
              h('div', null,
                h('label', { style: _labelStyle }, 'Provider'),
                h('select', { style: _selectStyle, value: aiProvider,
                  onChange: function(e) { setAiProvider(e.target.value); setAiModel(''); }
                },
                  h('option', { value: '' }, '-- Select provider --'),
                  orgProviders.map(function(p) {
                    return h('option', { key: p.id, value: p.id }, p.name + (p.configured ? '' : ' (no key)'));
                  })
                )
              ),
              h('div', null,
                h('label', { style: _labelStyle }, 'Model'),
                aiModels.length > 0
                  ? h('select', { style: _selectStyle, value: aiModel,
                      onChange: function(e) { setAiModel(e.target.value); }
                    },
                      h('option', { value: '' }, '-- Select model --'),
                      aiModels.map(function(m) {
                        return h('option', { key: m.id, value: m.id }, m.name || m.id);
                      })
                    )
                  : h('input', { style: _inputStyle, placeholder: aiProvider ? 'Loading models...' : 'Select a provider first', value: aiModel,
                      onChange: function(e) { setAiModel(e.target.value); }
                    })
              )
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 } },
              h('div', null,
                h('label', { style: _labelStyle }, 'Daily Budget (API calls)'),
                h('input', { style: _inputStyle, type: 'number', min: 1, value: aiBudget,
                  onChange: function(e) { setAiBudget(parseInt(e.target.value) || 100); }
                }),
                h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, 'Max LLM analysis calls per day. Resets at midnight.')
              ),
              h('div', null,
                h('label', { style: _labelStyle }, 'Max Agent Spawns / hr'),
                h('input', { style: _inputStyle, type: 'number', min: 1, value: aiMaxSpawns,
                  onChange: function(e) { setAiMaxSpawns(parseInt(e.target.value) || 6); }
                }),
                h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, 'Max agent session spawns per hour from critical signals.')
              )
            ),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: aiUseOrgKey ? 0 : 10 } },
              h('input', { type: 'checkbox', checked: !aiUseOrgKey, onChange: function() { setAiUseOrgKey(!aiUseOrgKey); }, style: { cursor: 'pointer' } }),
              h('span', null, 'Use custom API key instead of organization key')
            ),
            !aiUseOrgKey && h('div', { style: { marginTop: 8 } },
              h('label', { style: _labelStyle }, 'Custom API Key'),
              h('input', { style: _inputStyle, type: 'password', placeholder: 'Enter API key for this provider', value: aiCustomKey, onChange: function(e) { setAiCustomKey(e.target.value); } })
            )
          ),
          h('div', { className: 'modal-footer' },
            h('button', { className: 'btn btn-secondary', onClick: function() { setShowAIConfig(false); } }, 'Cancel'),
            h('button', { className: 'btn btn-primary', onClick: async function() {
              if (!aiProvider) { toast('Select a provider', 'error'); return; }
              if (!aiModel) { toast('Select a model', 'error'); return; }
              var body = { ai_provider: aiProvider, ai_model: aiModel, analysis_budget_daily: aiBudget, max_spawn_per_hour: aiMaxSpawns, use_org_key: aiUseOrgKey };
              if (!aiUseOrgKey && aiCustomKey) body.ai_api_key = aiCustomKey;
              var res = await apiCall('/polymarket/' + selectedAgent + '/watcher-config', { method: 'POST', body: JSON.stringify(body) });
              if (res.success) { toast('AI config saved', 'success'); setShowAIConfig(false); loadAgentData(selectedAgent); }
              else toast(res.error || 'Save failed', 'error');
            } }, 'Save')
          )
        )
      ),

      h('div', { className: 'stats-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 16 } },
        statCard('Active', watchers.filter(function(w) { return w.status === 'active'; }).length),
        statCard('Paused', watchers.filter(function(w) { return w.status === 'paused'; }).length),
        statCard('Total Alerts', watchers.reduce(function(s, w) { return s + (w.alert_count || 0); }, 0)),
        statCard('Unread Signals', watcherEvents.filter(function(e) { return !e.acknowledged; }).length)
      ),
      renderFilteredTable('watchers', watchers, 'No monitors set up yet. The agent creates them automatically when trading, or ask it to set up specific monitors.',
        ['Name', 'Type', 'Interval', 'Alerts', 'Last Run', 'Status', ''],
        function(w) { return [
          h('td', null, h('strong', null, w.name || w.type)),
          h('td', null, h('span', { className: 'badge badge-secondary' }, w.type)),
          h('td', null, w.interval_ms < 60000 ? (w.interval_ms / 1000) + 's' : (w.interval_ms / 60000) + 'm'),
          h('td', null, w.alert_count || 0),
          h('td', null, w.last_run ? fmtDate(w.last_run) : 'Never'),
          h('td', null, statusBadge(w.status)),
          h('td', null, h('div', { style: { display: 'flex', gap: 4 } },
            h('button', { className: 'btn btn-sm ' + (w.status === 'active' ? 'btn-warning' : 'btn-success'), onClick: async function(e) {
              e.stopPropagation();
              await apiCall('/polymarket/watchers/' + w.id + '/toggle', { method: 'POST' });
              toast(w.status === 'active' ? 'Paused' : 'Resumed', 'success'); loadAgentData(selectedAgent);
            } }, w.status === 'active' ? I('pause') : I('play')),
            h('button', { className: 'btn btn-sm btn-danger', onClick: async function(e) {
              e.stopPropagation();
              if (!(await showConfirm('Delete this monitor?'))) return;
              await apiCall('/polymarket/watchers/' + w.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
            } }, I('trash-2'))
          )),
        ]; },
        { searchFields: ['name', 'type'], filters: [
          { key: 'status', label: 'Status', options: ['active', 'paused'] },
          { key: 'type', label: 'Type', options: ['price_level', 'price_change', 'market_scan', 'news_intelligence', 'crypto_price', 'resolution_watch', 'portfolio_drift', 'volume_surge', 'geopolitical', 'cross_signal', 'arbitrage_scan', 'sentiment_shift'] }
        ]}
      )
    ),

    // ═══ WATCHER SIGNALS / EVENTS ═══
    tab === 'signals' && h('div', null,
      tabHeader('Automation Signals', 'zap',
        h(Fragment, null,
          h('p', null, 'Alerts generated by your market monitors. Critical signals auto-wake the agent. Info signals are batched for the next session.'),
          h('ul', { style: _ul },
            h('li', null, h('span', { className: 'badge badge-danger', style: { marginRight: 4 } }, 'critical'), ' \u2014 Agent woken immediately. Price crashes, resolution events, stop-loss triggers.'),
            h('li', null, h('span', { className: 'badge badge-warning', style: { marginRight: 4 } }, 'warning'), ' \u2014 Queued for next session. Unusual volume, news alerts, price thresholds.'),
            h('li', null, h('span', { className: 'badge badge-secondary', style: { marginRight: 4 } }, 'info'), ' \u2014 Logged for review. New markets, social mentions, general updates.')
          )
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'flex-end' } }, viewArchiveToggle('signals', '')),
      showArchive.signals ? (
        archiveLoading ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading archive...') :
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' } }, I('database'), ' Archived Signals (', (showArchive.signals_data?.total || 0), ')'),
          (showArchive.signals_data?.rows || []).length === 0 ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No archived signals yet.') :
          h('div', { className: 'table-container' }, h('table', { className: 'data-table' },
            h('thead', null, h('tr', null, ['Severity', 'Type', 'Title', 'Summary', 'Routed', 'Time'].map(function(hd) { return h('th', { key: hd }, hd); }))),
            h('tbody', null, (showArchive.signals_data?.rows || []).map(function(evt) {
              return h('tr', { key: evt.id },
                h('td', null, h('span', { className: 'badge badge-' + (evt.severity === 'critical' ? 'danger' : evt.severity === 'warning' ? 'warning' : 'secondary') }, evt.severity)),
                h('td', null, h('span', { className: 'badge badge-secondary' }, evt.type)),
                h('td', null, h('div', { style: { maxWidth: 250 } }, h('strong', null, evt.title))),
                h('td', null, h('div', { style: { maxWidth: 200, fontSize: 12, color: 'var(--text-muted)' } }, evt.summary || '-')),
                h('td', null, evt.routed ? h('span', { style: { color: '#10b981' } }, '\u2713 Sent') : h('span', { style: { color: 'var(--text-muted)' } }, '-')),
                h('td', null, fmtDate(evt.created_at))
              );
            }))
          ))
        )
      ) : null,
      watcherEvents.filter(function(e) { return !e.acknowledged; }).length > 0 && h('div', { style: { marginBottom: 12 } },
        h('button', { className: 'btn btn-sm btn-secondary', onClick: async function() {
          await apiCall('/polymarket/' + selectedAgent + '/watcher-events/acknowledge-all', { method: 'POST' });
          toast('All acknowledged', 'success'); loadAgentData(selectedAgent);
        } }, I('check'), ' Acknowledge All Unread')
      ),
      renderFilteredTable('signals', watcherEvents, 'No signals yet. Set up monitors in the Monitors tab \u2014 alerts appear here automatically.',
        ['Severity', 'Type', 'Title', 'Routed', 'Ack', 'Time'],
        function(evt) { return [
          h('td', null, h('span', { className: 'badge badge-' + (evt.severity === 'critical' ? 'danger' : evt.severity === 'warning' ? 'warning' : 'secondary') }, evt.severity)),
          h('td', null, h('span', { className: 'badge badge-secondary' }, evt.type)),
          h('td', null, h('div', { style: { maxWidth: 300 } }, h('strong', null, evt.title), evt.summary ? h('div', { className: 'text-muted small' }, evt.summary) : null)),
          h('td', null, evt.routed ? h('span', { style: { color: '#10b981' } }, '\u2713 Sent') : h('span', { style: { color: 'var(--text-muted)' } }, 'Queued')),
          h('td', null, evt.acknowledged ? h('span', { style: { color: '#10b981' } }, '\u2713') : h('span', { className: 'badge badge-warning' }, 'New')),
          h('td', null, fmtDate(evt.created_at)),
        ]; },
        { searchFields: ['title', 'summary', 'type'], filters: [
          { key: 'severity', label: 'Severity', options: ['critical', 'warning', 'info'] },
          { key: 'acknowledged', label: 'Status', options: [
            { value: 'unread', label: 'Unread' }, { value: 'read', label: 'Read' }
          ], fn: function(item, val) { return val === 'unread' ? !item.acknowledged : !!item.acknowledged; } }
        ]}
      )
    ),

    // ═══ PROXY SETTINGS ═══
    tab === 'proxy' && (function() {
      var authMethod = proxyStatus?.config?.authMethod || 'password';
      var _helpText = { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 };
      var _sectionCard = { padding: 20, marginBottom: 20 };

      function updateAuthVisibility() {
        var sel = document.getElementById('proxy-auth');
        var keyBlock = document.getElementById('proxy-key-block');
        var passBlock = document.getElementById('proxy-pass-block');
        if (!sel || !keyBlock || !passBlock) return;
        var isKey = sel.value === 'key';
        keyBlock.style.display = isKey ? 'block' : 'none';
        passBlock.style.display = isKey ? 'none' : 'block';
      }

      // Schedule DOM updates after render
      setTimeout(function() { updateAuthVisibility(); }, 50);

      return h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 } },
          h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 700 } }, I('globe'), ' Order Routing')
        ),

        // Explainer banner
        h('div', { className: 'card', style: { padding: 16, marginBottom: 20, background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.3)', borderRadius: 8 } },
          h('div', { style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
            I('alert-triangle', { style: { color: '#b45309', flexShrink: 0 } }),
            h('div', null,
              h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'Why do I need this?'),
              h('p', { style: { margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 } },
                'Polymarket blocks trade orders from certain countries (including the US) based on your IP address. This proxy routes your orders through a server in an allowed location so they go through.'
              ),
              h('p', { style: { margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 } },
                'Only order placement is affected \u2014 viewing markets, prices, and your portfolio works without a proxy.'
              ),
              h('p', { style: { margin: 0, fontSize: 13, fontWeight: 600 } },
                'You need a small server ($4-6/mo) in a non-blocked country. We\'ll walk you through it.'
              )
            )
          )
        ),

        // Connection status
        h('div', { className: 'card', style: _sectionCard },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
            h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, 'Status'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: proxyStatus?.connected ? '#10b981' : proxyStatus?.configured ? '#ef4444' : '#888' } }),
              h('span', { style: { fontSize: 13, fontWeight: 600, color: proxyStatus?.connected ? '#10b981' : proxyStatus?.configured ? '#ef4444' : '#888' } },
                proxyStatus?.connected ? 'Connected' : proxyStatus?.configured ? 'Saved (not connected)' : 'Not set up'
              )
            )
          ),
          proxyStatus?.connected && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
            cfgField('Server', proxyStatus.config?.vpsHost || '?'),
            cfgField('Connected since', proxyStatus.startedAt ? new Date(proxyStatus.startedAt).toLocaleTimeString() : '-')
          ),
          h('div', { style: { display: 'flex', gap: 8 } },
            !proxyStatus?.connected && proxyStatus?.configured && h('button', { className: 'btn btn-primary', onClick: async function() {
              try {
                var r = await apiCall('/polymarket/proxy/connect', { method: 'POST' });
                if (r.connected) toast('Connected!', 'success');
                else toast(r.error || 'Connection failed', 'error');
                loadProxyStatus();
              } catch(e) { toast(e.message, 'error'); }
            } }, I('play'), ' Connect'),
            proxyStatus?.connected && h('button', { className: 'btn btn-danger', onClick: async function() {
              try {
                await apiCall('/polymarket/proxy/disconnect', { method: 'POST' });
                toast('Disconnected', 'success');
                loadProxyStatus();
              } catch(e) { toast(e.message, 'error'); }
            } }, I('pause'), ' Disconnect'),
            proxyStatus?.connected && h('button', { className: 'btn btn-secondary', onClick: async function() {
              try {
                var r = await apiCall('/polymarket/proxy/test', { method: 'POST' });
                if (r.status === 'ok') {
                  var blocked = r.geoblock?.blocked;
                  toast(blocked ? 'Server works but region is blocked \u2014 use a different location' : 'Working! Orders will go through.', blocked ? 'warning' : 'success');
                } else toast(r.error || 'Test failed', 'error');
              } catch(e) { toast(e.message, 'error'); }
            } }, I('check'), ' Test')
          ),
          proxyStatus?.error && h('div', { style: { marginTop: 12, padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 12, color: '#ef4444' } }, proxyStatus.error)
        ),

        // Configuration form
        h('div', { className: 'card', style: { padding: 20 } },
          h('h3', { style: { margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 } }, 'Server Setup'),
          h('p', { style: { margin: '0 0 16px 0', fontSize: 12, color: 'var(--text-muted)' } }, 'Enter the details of your proxy server. Don\'t have one yet? See the setup guide below.'),

          h('div', { style: { display: 'grid', gap: 16 } },
                        // Server address
            h('div', null,
              h('label', { style: _labelStyle }, 'Server IP Address'),
              h('input', { id: 'proxy-host', type: 'text', style: _selectStyle, placeholder: 'e.g. 159.203.59.191', defaultValue: proxyStatus?.config?.vpsHost || '' }),
              h('div', { style: _helpText }, 'The IP address from your hosting provider. You\'ll get this in a confirmation email after creating the server.')
            ),

            // Login method
            h('div', null,
              h('label', { style: _labelStyle }, 'Login Method'),
              h('select', { id: 'proxy-auth', style: _selectStyle, defaultValue: authMethod, onChange: updateAuthVisibility },
                h('option', { value: 'password' }, 'Password (easiest)'),
                h('option', { value: 'key' }, 'SSH Key (advanced)')
              )
            ),

            // Password block
            h('div', { id: 'proxy-pass-block', style: { display: authMethod === 'password' ? 'block' : 'none' } },
              h('div', { style: { display: 'grid', gap: 14 } },
                h('div', null,
                  h('label', { style: _labelStyle }, 'Username'),
                  h('input', { id: 'proxy-user', type: 'text', style: _selectStyle, placeholder: 'root', defaultValue: proxyStatus?.config?.vpsUser || 'root' }),
                  h('div', { style: _helpText }, 'Usually "root". Check the email from your hosting provider.')
                ),
                h('div', null,
                  h('label', { style: _labelStyle }, 'Password'),
                  h('input', { id: 'proxy-password', type: 'password', style: _selectStyle, placeholder: 'Your server password' }),
                  h('div', { style: _helpText }, 'The password from your hosting provider\'s email. Stored encrypted.')
                )
              )
            ),

            // SSH Key block
            h('div', { id: 'proxy-key-block', style: { display: authMethod === 'key' ? 'block' : 'none' } },
              h('div', { style: { display: 'grid', gap: 14 } },
                h('div', null,
                  h('label', { style: _labelStyle }, 'Username'),
                  h('input', { id: 'proxy-user-key', type: 'text', style: _selectStyle, placeholder: 'root', defaultValue: proxyStatus?.config?.vpsUser || 'root' })
                ),
                h('div', null,
                  h('label', { style: _labelStyle }, 'Private Key'),
                  h('textarea', { id: 'proxy-key-paste', style: Object.assign({}, _selectStyle, { minHeight: 120, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }), placeholder: 'Paste your private key here\n\n-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----\n\nOR type a file path like ~/.ssh/id_ed25519' }),
                  h('div', { style: _helpText }, 'Paste the contents of your key file, or type the path to it on this machine.')
                )
              )
            ),

            // Setup log area (hidden until setup runs)
            h('div', { id: 'proxy-setup-log', style: { display: 'none', marginTop: 8, padding: 12, background: '#0d1117', borderRadius: 8, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8, color: '#8b949e', maxHeight: 200, overflow: 'auto' } }),

            // Action buttons
            h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
              h('button', { id: 'proxy-setup-btn', className: 'btn btn-primary', onClick: async function() {
                var host = document.getElementById('proxy-host')?.value?.trim();
                if (!host) { toast('Please enter a server IP address', 'error'); return; }

                var auth = document.getElementById('proxy-auth')?.value || 'password';
                var body = { host: host };

                if (auth === 'password') {
                  body.user = document.getElementById('proxy-user')?.value || 'root';
                  body.password = document.getElementById('proxy-password')?.value || '';
                  if (!body.password) { toast('Please enter a password', 'error'); return; }
                } else {
                  body.user = document.getElementById('proxy-user-key')?.value || 'root';
                  var keyVal = document.getElementById('proxy-key-paste')?.value?.trim() || '';
                  if (keyVal.includes('BEGIN')) {
                    body.sshKeyContent = keyVal;
                  } else if (keyVal) {
                    body.sshKeyPath = keyVal;
                  }
                  if (!body.sshKeyContent && !body.sshKeyPath) { toast('Please enter an SSH key', 'error'); return; }
                }

                // Show log area
                var logEl = document.getElementById('proxy-setup-log');
                var btn = document.getElementById('proxy-setup-btn');
                if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = '<div style="color:#58a6ff">Setting up your server... this takes 1-2 minutes.</div>'; }
                if (btn) { btn.disabled = true; btn.textContent = 'Setting up...'; }

                try {
                  var r = await apiCall('/polymarket/proxy/setup', { method: 'POST', body: JSON.stringify(body) });
                  if (logEl && r.logs) {
                    logEl.innerHTML = r.logs.map(function(l) {
                      var color = l.includes('Warning') ? '#b45309' : l.includes('failed') || l.includes('Failed') ? '#f85149' : '#8b949e';
                      return '<div style="color:' + color + '">&#9654; ' + l + '</div>';
                    }).join('');
                  }
                  if (r.success) {
                    if (logEl) logEl.innerHTML += '<div style="color:#3fb950;font-weight:bold;margin-top:8px">Setup complete! Connecting...</div>';
                    // Auto-connect
                    try {
                      var cr = await apiCall('/polymarket/proxy/connect', { method: 'POST' });
                      if (cr.connected) {
                        if (logEl) logEl.innerHTML += '<div style="color:#3fb950;font-weight:bold">Connected! Orders will now route through your proxy.</div>';
                        toast('All set! Proxy is active.', 'success');
                      } else {
                        if (logEl) logEl.innerHTML += '<div style="color:#b45309">Setup done but auto-connect failed. Click the Connect button above.</div>';
                        toast('Setup done! Click Connect above to activate.', 'success');
                      }
                    } catch(ce) {
                      if (logEl) logEl.innerHTML += '<div style="color:#b45309">Setup done! Click the Connect button above to activate.</div>';
                    }
                    loadProxyStatus();
                  } else {
                    if (logEl) logEl.innerHTML += '<div style="color:#f85149;font-weight:bold;margin-top:8px">' + (r.error || 'Setup failed') + '</div>';
                    toast(r.error || 'Setup failed', 'error');
                  }
                } catch(e) {
                  if (logEl) logEl.innerHTML += '<div style="color:#f85149">' + e.message + '</div>';
                  toast(e.message, 'error');
                } finally {
                  if (btn) { btn.disabled = false; btn.textContent = 'Set Up Server'; }
                }
              } }, 'Set Up Server'),
              proxyStatus?.configured && h('button', { className: 'btn btn-secondary', style: { color: '#ef4444' }, onClick: async function() {
                if (!confirm('Remove proxy configuration? Orders will go direct (may be blocked in restricted regions).')) return;
                try {
                  await apiCall('/polymarket/proxy/config', { method: 'POST', body: JSON.stringify({ enabled: false }) });
                  await apiCall('/polymarket/proxy/disconnect', { method: 'POST' }).catch(function(){});
                  toast('Proxy removed', 'success');
                  loadProxyStatus();
                } catch(e) { toast(e.message, 'error'); }
              } }, 'Remove')
            )
          ),

          // Setup guide
          h('div', { style: { marginTop: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 } },
            h('h4', { style: { margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 } }, I('rocket'), ' Setup Guide \u2014 Get Running in 5 Minutes'),
            h('p', { style: { margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 } },
              'You need a small cloud server ($5/mo) in India (Mumbai). We recommend Vultr \u2014 their IPs work correctly with Polymarket\'s region check.'
            ),

            // Recommended provider
            h('div', { style: { padding: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, marginBottom: 16 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                I('star', { style: { color: '#b45309' } }),
                h('span', { style: { fontWeight: 700, fontSize: 14 } }, 'Recommended: Vultr (Mumbai, India) \u2014 $5/mo')
              ),
              h('a', { href: 'https://www.vultr.com/', target: '_blank', style: { display: 'inline-block', padding: '8px 16px', background: '#6366f1', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13, marginBottom: 12 } }, 'Sign Up at Vultr \u2192'),
              h('div', { style: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 } },
                h('strong', { style: { display: 'block', marginBottom: 4, color: 'var(--text)' } }, 'Step-by-step:'),
                h('ol', { style: { margin: '0', paddingLeft: 20 } },
                  h('li', null, h('strong', null, 'Create account'), ' \u2014 Go to ', h('a', { href: 'https://www.vultr.com/', target: '_blank', style: { color: '#6366f1' } }, 'vultr.com'), ' and sign up (credit card or PayPal)'),
                  h('li', null, h('strong', null, 'Deploy New Server'), ' \u2014 Click the blue "+" button, then "Deploy New Server"'),
                  h('li', null, h('strong', null, 'Choose Cloud Compute'), ' \u2014 Select "Cloud Compute" (shared CPU)'),
                  h('li', null, h('strong', null, 'Server Location'), ' \u2014 Select ', h('span', { style: { fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4 } }, 'Mumbai (India)'), ' \u2014 this is critical!'),
                  h('li', null, h('strong', null, 'Server Image'), ' \u2014 Choose ', h('strong', null, 'Ubuntu 24.04 LTS')),
                  h('li', null, h('strong', null, 'Server Size'), ' \u2014 Pick the cheapest: ', h('strong', null, '$5/mo'), ' (1 vCPU, 1 GB RAM) \u2014 more than enough'),
                  h('li', null, h('strong', null, 'Deploy'), ' \u2014 Click "Deploy Now" and wait 1-2 minutes for it to boot'),
                  h('li', null, h('strong', null, 'Get credentials'), ' \u2014 Click on your new server, find the ', h('strong', null, 'IP Address'), ' and ', h('strong', null, 'Password'), ' on the overview page'),
                  h('li', null, h('strong', null, 'Enter above'), ' \u2014 Paste the IP and password in the form above, then click ', h('strong', null, '"Set Up Server"'))
                )
              )
            ),

            // Why Mumbai
            h('div', { style: { padding: 12, background: 'rgba(99,102,241,0.08)', borderRadius: 8, marginBottom: 12 } },
              h('div', { style: { fontSize: 12, fontWeight: 600, color: '#6366f1', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 } }, I('info', { size: 14 }), ' Why Mumbai?'),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 } },
                'Polymarket blocks orders from the US and many other countries. India is not blocked, and Vultr\'s Mumbai datacenter IPs are correctly geolocated to India. Other providers (like DigitalOcean) register all IPs under their US headquarters, which gets blocked.'
              )
            ),

            // Blocked countries
            h('div', { style: { padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 8 } },
              h('div', { style: { fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 } }, I('x-circle', { size: 14 }), ' Don\'t use these server locations:'),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 } }, 'US, Canada (Ontario), Australia, Belgium, Germany, France, UK, Italy, Netherlands, Singapore, Thailand, Taiwan, Russia, and all sanctioned countries. Also avoid DigitalOcean \u2014 their IPs are flagged as US regardless of datacenter.'),
              h('div', { style: { fontSize: 12, fontWeight: 600, color: '#10b981', marginTop: 8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 } }, I('check-circle', { size: 14 }), ' Safe locations:'),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'India (Mumbai/Delhi/Bangalore), Japan (Tokyo/Osaka), South Korea (Seoul), Brazil (S\u00e3o Paulo), Mexico City, and most of Latin America, Africa, and Southeast Asia.')
            )
          )
        )
      );
    })(),

    ) // close content pane div
    ) // close flex container div
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function statCard(label, value, sub) {
  return h('div', { className: 'stat-card card' },
    h('div', { className: 'stat-label' }, label),
    h('div', { className: 'stat-value' }, value),
    sub && h('div', { className: 'stat-sub' }, sub)
  );
}
function cfgField(label, value) {
  return h('div', { style: { padding: "10px", background: "var(--bg-secondary)", borderRadius: "8px" } },
    h('div', { style: { fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" } }, label),
    h('div', { style: { fontSize: "15px", fontWeight: "600" } }, value)
  );
}
function sideBadge(side, opts) { var label = opts && opts.asOutcome ? (side === 'BUY' ? 'YES' : 'NO') : side; return h('span', { className: 'badge ' + (side === 'BUY' ? 'badge-success' : 'badge-danger') }, label); }
function statusBadge(status) {
  var cls = status === 'active' ? 'badge-success' : status === 'cancelled' ? 'badge-danger' : 'badge-secondary';
  return h('span', { className: 'badge ' + cls }, status);
}
function sentimentBadge(val) {
  if (val == null) return '-';
  var label = val > 0.2 ? 'Bullish' : val < -0.2 ? 'Bearish' : 'Neutral';
  var cls = val > 0.2 ? 'badge-success' : val < -0.2 ? 'badge-danger' : 'badge-secondary';
  return h('span', { className: 'badge ' + cls }, label + ' (' + val.toFixed(2) + ')');
}
function regimeBadge(regime) {
  var cls = regime === 'TRENDING' ? 'badge-success' : regime === 'MEAN_REVERTING' ? 'badge-warning' : 'badge-secondary';
  return h('span', { className: 'badge ' + cls }, regime);
}
function pnlCell(pnl) {
  if (pnl == null) return '-';
  return h('span', { style: { fontWeight: '600', color: pnl >= 0 ? '#10b981' : '#ef4444' } }, (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2));
}
function pct(v) { return v == null ? '-' : (v * 100).toFixed(1) + '%'; }
function fmtDate(d) { return d ? new Date(d).toLocaleString() : ''; }
function shortAddr(addr) { return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '?'; }
function shortId(id) { return id ? id.slice(0, 10) + '...' : '?'; }
function colorDot(color) { return h('span', { style: { display: 'inline-block', width: 10, height: 10, background: color, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' } }); }

function renderTable(data, emptyMsg, headers, rowFn) {
  if (!data || data.length === 0) return h('div', { className: 'empty-state card', style: { padding: "24px", textAlign: "center" } }, emptyMsg);
  return h('div', { className: 'table-container' },
    h('table', { className: 'data-table' },
      h('thead', null, h('tr', null, headers.map(function(hdr) { return h('th', { key: hdr }, hdr); }))),
      h('tbody', null, data.map(function(item, idx) { return h.apply(null, ['tr', { key: item.id || item.bucket || item.strategy_name || idx }].concat(rowFn(item))); }))
    )
  );
}
var _inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)', fontSize: 13 };
var _selectStyle = Object.assign({}, _inputStyle, { cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7394\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28 });
var _labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };

function numberField(label, key, obj, setter) {
  return h('div', null,
    h('label', { style: _labelStyle }, label),
    h('input', { type: 'number', style: _inputStyle, value: obj[key] || 0,
      onChange: function(e) { var u = Object.assign({}, obj); u[key] = parseFloat(e.target.value) || 0; setter(u); } })
  );
}
function configModal(editConfig, setEditConfig, updateConfig) {
  return h('div', { className: 'modal-overlay', onClick: function() { setEditConfig(null); } },
    h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 520, maxHeight: '85vh', overflow: 'auto' } },
      h('div', { className: 'modal-header' },
        h('h2', { style: { fontSize: 16, flex: 1, display: 'flex', alignItems: 'center', gap: 8 } }, 'Trading Configuration',
          h(HelpButton, { label: 'Trading Configuration' },
            h(Fragment, null,
              h('p', null, 'Configure risk limits, trading behavior, and proactive check schedule for your Polymarket agent. Changes take effect immediately on the next tool call.'),
              h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Trading Modes'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
                h('li', null, h('strong', null, 'Approval'), ' \u2014 Every trade queued for human review. Best for learning the system and compliance.'),
                h('li', null, h('strong', null, 'Autonomous'), ' \u2014 Agent trades within configured risk limits. Circuit breakers auto-pause on loss thresholds.'),
                h('li', null, h('strong', null, 'Paper'), ' \u2014 Simulated trading with real market data. No real money at risk.')
              ),
              h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Risk Parameters'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
                h('li', null, h('strong', null, 'Max Position Size'), ' \u2014 Maximum dollar value for any single position.'),
                h('li', null, h('strong', null, 'Max Order Size'), ' \u2014 Maximum dollar value per individual order.'),
                h('li', null, h('strong', null, 'Max Total Exposure'), ' \u2014 Maximum total portfolio value across all positions.'),
                h('li', null, h('strong', null, 'Max Daily Trades'), ' \u2014 Circuit breaker: stops trading after this many trades per day.'),
                h('li', null, h('strong', null, 'Max Daily Loss'), ' \u2014 Circuit breaker: halts all trading if daily losses exceed this amount.'),
                h('li', null, h('strong', null, 'Max Drawdown %'), ' \u2014 Circuit breaker: halts if portfolio drops this % from peak value.'),
                h('li', null, h('strong', null, 'Stop Loss %'), ' \u2014 Default stop-loss percentage for auto-created exit rules.'),
                h('li', null, h('strong', null, 'Take Profit %'), ' \u2014 Default take-profit percentage for auto-created exit rules.'),
                h('li', null, h('strong', null, 'Cash Reserve %'), ' \u2014 Percentage of balance to keep uninvested as a safety buffer.')
              ),
              h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Proactive Checks'),
              h('p', { style: { margin: '4px 0 4px', fontSize: 13 } }, 'The watcher engine periodically wakes the agent to manage positions, review P&L, and find opportunities. Each wake runs a structured checklist: check signals, review drawdown, scan momentum, then optionally trade.'),
              h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
                h('li', null, h('strong', null, 'Proactive Check Interval'), ' \u2014 Minutes between automatic portfolio check-ins. Set to ', h('strong', null, '0'), ' to disable proactive checks entirely.'),
                h('li', null, h('strong', null, 'Max Proactive Checks/Day'), ' \u2014 Daily cap on automatic check-ins. Set to ', h('strong', null, '0'), ' to disable. The Pause button on the dashboard also stops proactive checks until resumed.')
              ),
              h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Start with conservative limits and paper mode. Increase limits as you gain confidence in your agent\'s strategy performance. Each proactive check costs ~$0.50\u20131.50 in API tokens.')
            )
          )
        ),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setEditConfig(null); } }, '\u00d7')
      ),
      h('div', { className: 'modal-body', style: { padding: 20, display: "grid", gap: "14px" } },
        h('div', null,
          h('label', { style: _labelStyle }, 'Trading Mode'),
          h('select', { style: _selectStyle, value: editConfig.mode,
            onChange: function(e) { setEditConfig(Object.assign({}, editConfig, { mode: e.target.value })); }
          }, h('option', { value: 'approval' }, 'Approval (Human-in-the-loop)'),
             h('option', { value: 'autonomous' }, 'Autonomous'),
             h('option', { value: 'paper' }, 'Paper Trading'))
        ),
        // Two-column grid for numbers
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
          numberField('Max Position Size ($)', 'max_position_size', editConfig, setEditConfig),
          numberField('Max Order Size ($)', 'max_order_size', editConfig, setEditConfig),
          numberField('Max Total Exposure ($)', 'max_total_exposure', editConfig, setEditConfig),
          numberField('Max Daily Trades', 'max_daily_trades', editConfig, setEditConfig),
          numberField('Max Daily Loss ($)', 'max_daily_loss', editConfig, setEditConfig),
          numberField('Max Drawdown (%)', 'max_drawdown_pct', editConfig, setEditConfig),
          numberField('Stop Loss (%)', 'stop_loss_pct', editConfig, setEditConfig),
          numberField('Take Profit (%)', 'take_profit_pct', editConfig, setEditConfig),
          numberField('Cash Reserve (%)', 'cash_reserve_pct', editConfig, setEditConfig),
          numberField('Proactive Check Interval (min, 0=off)', 'proactive_interval_mins', editConfig, setEditConfig),
          numberField('Max Proactive Checks/Day (0=off)', 'proactive_max_daily', editConfig, setEditConfig)
        )
      ),
      h('div', { className: 'modal-footer' },
        h('button', { className: 'btn btn-secondary', onClick: function() { setEditConfig(null); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: function() { updateConfig(editConfig); } }, 'Save')
      )
    )
  );
}

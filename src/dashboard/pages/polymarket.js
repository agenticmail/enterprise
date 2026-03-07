import { h, useState, useEffect, Fragment, useApp, apiCall, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
import { HelpButton } from '../components/help-button.js';
import { useOrgContext } from '../components/org-switcher.js';

export function PolymarketPage() {
  var orgCtx = useOrgContext();
  const { toast } = useApp();
  const [tab, setTab] = useState('overview');
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
  const [editConfig, setEditConfig] = useState(null);
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

  var POLY_SKILLS = ['polymarket', 'polymarket-quant', 'polymarket-onchain', 'polymarket-social',
    'polymarket-feeds', 'polymarket-analytics', 'polymarket-execution', 'polymarket-counterintel', 'polymarket-portfolio'];

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const d = await apiCall('/polymarket/dashboard');
      setDashboard(d);
      const a = await apiCall('/agents');
      var polyAgents = (a.agents || []).filter(function(ag) {
        return (ag.skills || []).some(function(s) { return POLY_SKILLS.indexOf(s) !== -1; });
      });
      setAgents(polyAgents);
      if (polyAgents.length > 0 && !selectedAgent) setSelectedAgent(polyAgents[0].id);
    } catch (e) {
      setDashboard({ configs: [], wallets: [], pendingTrades: [], dailyCounters: [] });
    } finally { setLoading(false); }
  };

  const loadAgentData = async (agentId) => {
    if (!agentId) return;
    try {
      const [c, p, t, al, pp, w, preds, cal, strats, less,
             wh, soc, ev, na, cor, arb, reg, sn, sc, hd, ex, dd, pnl] = await Promise.all([
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
      ]);
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
    } catch {}
  };

  useEffect(function() { loadDashboard(); }, []);
  useEffect(function() { if (selectedAgent) loadAgentData(selectedAgent); }, [selectedAgent]);

  // SSE stream
  useEffect(function() {
    if (!selectedAgent) return;
    var es;
    try {
      es = new EventSource('/api/polymarket/stream?agentId=' + selectedAgent);
      es.onmessage = function(e) {
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'update') loadAgentData(selectedAgent);
        } catch {}
      };
      es.onerror = function() { if (es) es.close(); };
    } catch {}
    return function() { if (es) es.close(); };
  }, [selectedAgent]);

  const decideTrade = async (tradeId, decision) => {
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
    try {
      await apiCall('/polymarket/' + selectedAgent + '/pause', { method: 'POST', body: JSON.stringify({ action: isPaused ? 'resume' : 'pause', reason: 'Dashboard toggle' }) });
      toast(isPaused ? 'Trading resumed' : 'Trading paused', 'success'); loadDashboard();
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };

  if (loading) return h('div', { className: 'page-loading' }, 'Loading Polymarket data...');

  var resolvedPreds = predictions.filter(function(p) { return p.resolved; });
  var correctPreds = resolvedPreds.filter(function(p) { return p.was_correct; });
  var totalPredPnl = resolvedPreds.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
  var activeSnipers = snipers.filter(function(s) { return s.status === 'active'; });
  var activeScales = scaleOrders.filter(function(s) { return s.status === 'active'; });
  var activeHedges = hedges.filter(function(s) { return s.status === 'active'; });

  // Tab groups for organization
  var tabGroups = [
    { label: 'Core', tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'pending', label: 'Pending (' + pendingTrades.length + ')' },
      { id: 'history', label: 'Trades' },
      { id: 'config', label: 'Config' },
    ]},
    { label: 'Intelligence', tabs: [
      { id: 'onchain', label: 'On-Chain' },
      { id: 'social', label: 'Social' },
      { id: 'events', label: 'Events' },
      { id: 'analytics', label: 'Analytics' },
    ]},
    { label: 'Execution', tabs: [
      { id: 'execution', label: 'Orders (' + (activeSnipers.length + activeScales.length) + ')' },
      { id: 'hedges_tab', label: 'Hedges (' + activeHedges.length + ')' },
      { id: 'exits', label: 'Exit Rules (' + exitRules.length + ')' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'paper', label: 'Paper' },
    ]},
    { label: 'Learning', tabs: [
      { id: 'journal', label: 'Journal' },
      { id: 'calibration', label: 'Calibration' },
      { id: 'strategies', label: 'Strategies' },
      { id: 'lessons', label: 'Lessons (' + lessons.length + ')' },
    ]},
    { label: 'Portfolio', tabs: [
      { id: 'drawdown_tab', label: 'Drawdown' },
      { id: 'attribution', label: 'Attribution' },
    ]},
  ];

  return h('div', { className: 'page-content' },
    h('div', { className: 'page-header' },
      h('div', { style: 'display:flex;align-items:center;gap:12px' },
        h('h1', null, I('trending-up'), ' Polymarket Trading'),
        h(HelpButton, { topic: 'polymarket' })
      ),
      h('div', { style: 'display:flex;gap:8px;align-items:center' },
        agents.length > 0 && h('select', {
          value: selectedAgent || '', onChange: function(e) { setSelectedAgent(e.target.value); },
          className: 'form-select', style: 'min-width:200px'
        }, agents.map(function(a) { return h('option', { key: a.id, value: a.id }, a.name || a.id); })),
        selectedAgent && h('button', { className: 'btn btn-outline', onClick: togglePause },
          I(dashboard?.dailyCounters?.some(function(c) { return c.agent_id === selectedAgent && c.paused; }) ? 'play' : 'pause'),
          dashboard?.dailyCounters?.some(function(c) { return c.agent_id === selectedAgent && c.paused; }) ? ' Resume' : ' Pause'
        ),
        h('button', { className: 'btn btn-secondary', onClick: function() { loadDashboard(); loadAgentData(selectedAgent); } }, I('refresh-cw'), ' Refresh')
      )
    ),

    // Grouped tabs
    h('div', { style: 'margin-bottom:16px' },
      tabGroups.map(function(g) {
        return h('div', { key: g.label, style: 'display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap' },
          h('span', { style: 'font-size:10px;color:var(--text-muted);text-transform:uppercase;width:80px;flex-shrink:0;letter-spacing:1px' }, g.label),
          h('div', { className: 'tabs', style: 'margin:0;flex-wrap:wrap' },
            g.tabs.map(function(t) {
              return h('button', { key: t.id, className: 'tab' + (tab === t.id ? ' active' : ''), onClick: function() { setTab(t.id); } }, t.label);
            })
          )
        );
      })
    ),

    // ═══ OVERVIEW ═══
    tab === 'overview' && h('div', null,
      h('div', { className: 'stats-grid', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px' },
        statCard('Wallet', wallet ? shortAddr(wallet.address) : 'Not set', wallet ? 'Connected' : null),
        statCard('Mode', config?.mode || 'N/A'),
        statCard('Pending', pendingTrades.length),
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
      agents.length === 0 && h('div', { className: 'empty-state card', style: 'padding:40px;text-align:center' },
        h('h3', null, 'No Polymarket Agents'),
        h('p', null, 'Create an agent with the Polymarket Trader template to get started.'),
        h('p', { style: 'color:var(--text-muted)' }, 'Agents \u2192 Create Agent \u2192 "Polymarket Trader" (Finance)')
      )
    ),

    // ═══ PENDING TRADES ═══
    tab === 'pending' && renderTable(pendingTrades, 'No pending trades',
      ['Market', 'Side', 'Size', 'Price', 'Urgency', 'Created', 'Actions'],
      function(t) { return [
        h('td', null, h('div', { style: 'max-width:280px' }, h('strong', null, t.outcome || '?'), h('div', { className: 'text-muted small' }, t.market_question || ''))),
        h('td', null, sideBadge(t.side)), h('td', null, '$' + (t.size || 0).toFixed(2)),
        h('td', null, t.price ? t.price.toFixed(2) + '\u00a2' : 'Market'),
        h('td', null, h('span', { className: 'badge badge-' + (t.urgency === 'high' ? 'warning' : 'secondary') }, t.urgency || 'normal')),
        h('td', null, fmtDate(t.created_at)),
        h('td', null, h('div', { style: 'display:flex;gap:4px' },
          h('button', { className: 'btn btn-sm btn-success', onClick: function() { decideTrade(t.id, 'approve'); } }, I('check')),
          h('button', { className: 'btn btn-sm btn-danger', onClick: function() { decideTrade(t.id, 'reject'); } }, I('x'))
        )),
      ]; }
    ),

    // ═══ TRADE HISTORY ═══
    tab === 'history' && renderTable(tradeHistory, 'No trade history',
      ['Market', 'Side', 'Size', 'Price', 'Status', 'P&L', 'Date'],
      function(t) { return [
        h('td', null, h('div', { style: 'max-width:280px' }, t.market_question || shortId(t.token_id))),
        h('td', null, sideBadge(t.side)), h('td', null, '$' + (t.size || 0).toFixed(2)),
        h('td', null, (t.fill_price || t.price || 0).toFixed(2) + '\u00a2'),
        h('td', null, h('span', { className: 'badge badge-secondary' }, t.status)),
        h('td', null, pnlCell(t.pnl)), h('td', null, fmtDate(t.created_at)),
      ]; }
    ),

    // ═══ CONFIG ═══
    tab === 'config' && h('div', null,
      !config ?
        h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' },
          'No config yet.', h('br'), h('br'),
          h('button', { className: 'btn btn-primary', onClick: function() { setEditConfig({ mode: 'approval', max_position_size: 100, max_order_size: 50, max_total_exposure: 500, max_daily_trades: 10, max_daily_loss: 50, max_drawdown_pct: 20, stop_loss_pct: 0, take_profit_pct: 0, cash_reserve_pct: 20 }); } }, 'Create Config')
        ) :
        h('div', { className: 'card', style: 'padding:24px' },
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px' },
            h('h3', { style: 'margin:0' }, 'Trading Configuration'),
            h('button', { className: 'btn btn-secondary', onClick: function() { setEditConfig({
              mode: config.mode, max_position_size: config.max_position_size, max_order_size: config.max_order_size,
              max_total_exposure: config.max_total_exposure, max_daily_trades: config.max_daily_trades,
              max_daily_loss: config.max_daily_loss, max_drawdown_pct: config.max_drawdown_pct,
              stop_loss_pct: config.stop_loss_pct, take_profit_pct: config.take_profit_pct, cash_reserve_pct: config.cash_reserve_pct,
            }); } }, I('edit'), ' Edit')
          ),
          h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px' },
            cfgField('Mode', config.mode), cfgField('Max Position', '$' + config.max_position_size),
            cfgField('Max Order', '$' + config.max_order_size), cfgField('Max Exposure', '$' + config.max_total_exposure),
            cfgField('Daily Trades', config.max_daily_trades), cfgField('Daily Loss', '$' + config.max_daily_loss),
            cfgField('Max Drawdown', config.max_drawdown_pct + '%'), cfgField('Stop Loss', config.stop_loss_pct ? config.stop_loss_pct + '%' : 'Off'),
            cfgField('Take Profit', config.take_profit_pct ? config.take_profit_pct + '%' : 'Off'), cfgField('Cash Reserve', config.cash_reserve_pct + '%'),
          )
        )
    ),
    editConfig && configModal(editConfig, setEditConfig, updateConfig),

    // ═══ ON-CHAIN ═══
    tab === 'onchain' && h('div', null,
      h('h3', null, I('link'), ' Tracked Whale Wallets'),
      renderTable(whales, 'No whale wallets tracked yet. The agent auto-detects them when using poly_whale_tracker.',
        ['Address', 'Label', 'Volume', 'Markets', 'Win Rate', 'Last Seen'],
        function(w) { return [
          h('td', null, h('code', { style: 'font-size:12px' }, shortAddr(w.address))),
          h('td', null, w.label || 'Unknown'),
          h('td', null, '$' + (w.total_volume || 0).toFixed(0)),
          h('td', null, w.markets_traded || 0),
          h('td', null, w.win_rate ? (w.win_rate * 100).toFixed(0) + '%' : 'N/A'),
          h('td', null, fmtDate(w.last_seen)),
        ]; }
      )
    ),

    // ═══ SOCIAL ═══
    tab === 'social' && h('div', null,
      h('h3', null, I('message-circle'), ' Social Signals'),
      renderTable(socialSignals, 'No social signals captured yet. The agent records them when scanning Twitter, Reddit, Telegram.',
        ['Source', 'Topic', 'Sentiment', 'Volume', 'Velocity', 'Time'],
        function(s) { return [
          h('td', null, h('span', { className: 'badge badge-secondary' }, s.source)),
          h('td', null, h('strong', null, s.topic)),
          h('td', null, sentimentBadge(s.sentiment)),
          h('td', null, s.volume || 0),
          h('td', null, s.velocity ? s.velocity.toFixed(1) + 'x' : '-'),
          h('td', null, fmtDate(s.timestamp)),
        ]; }
      )
    ),

    // ═══ EVENTS ═══
    tab === 'events' && h('div', null,
      h('h3', null, I('calendar'), ' Event Calendar'),
      h('div', { style: 'margin-bottom:16px;color:var(--text-muted)' }, 'Market-moving events tracked by the agent. Elections, court rulings, fed meetings, earnings, sports.'),
      renderTable(events, 'No events tracked yet. The agent adds them with poly_calendar_events.',
        ['Title', 'Category', 'Date', 'Impact', 'Status', ''],
        function(ev) { return [
          h('td', null, h('div', { style: 'max-width:300px' }, h('strong', null, ev.title), ev.description ? h('div', { className: 'text-muted small' }, ev.description.slice(0, 100)) : null)),
          h('td', null, h('span', { className: 'badge badge-secondary' }, ev.category)),
          h('td', null, fmtDate(ev.event_date)),
          h('td', null, h('span', { className: 'badge badge-' + (ev.impact === 'critical' ? 'danger' : ev.impact === 'high' ? 'warning' : 'secondary') }, ev.impact)),
          h('td', null, h('span', { className: 'badge badge-' + (ev.status === 'upcoming' ? 'info' : 'secondary') }, ev.status)),
          h('td', null, h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
            await apiCall('/polymarket/events/' + ev.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
          }}, I('trash-2'))),
        ]; }
      ),
      // News alerts
      newsAlerts.length > 0 && h('div', { style: 'margin-top:24px' },
        h('h3', null, I('zap'), ' Recent News Alerts'),
        renderTable(newsAlerts.slice(0, 20), '',
          ['Headline', 'Source', 'Relevance', 'Time'],
          function(n) { return [
            h('td', null, h('div', { style: 'max-width:400px' }, n.url ? h('a', { href: n.url, target: '_blank', style: 'color:inherit' }, n.headline) : n.headline)),
            h('td', null, n.source),
            h('td', null, n.relevance > 0.5 ? h('span', { className: 'badge badge-warning' }, 'High') : h('span', { className: 'badge badge-secondary' }, 'Low')),
            h('td', null, fmtDate(n.timestamp)),
          ]; }
        )
      )
    ),

    // ═══ ANALYTICS ═══
    tab === 'analytics' && h('div', null,
      // Correlations
      h('h3', null, I('git-branch'), ' Market Correlations'),
      renderTable(correlations, 'No correlations detected yet. Agent discovers them with poly_market_correlation.',
        ['Market A', 'Market B', 'Correlation', 'Strength', 'Time'],
        function(c) { return [
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(c.market_a))),
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(c.market_b))),
          h('td', null, h('strong', { style: 'color:' + (Math.abs(c.correlation) > 0.7 ? 'var(--success)' : 'var(--text)') }, c.correlation.toFixed(3))),
          h('td', null, Math.abs(c.correlation) > 0.8 ? 'Strong' : Math.abs(c.correlation) > 0.5 ? 'Moderate' : 'Weak'),
          h('td', null, fmtDate(c.timestamp)),
        ]; }
      ),
      // Arbitrage
      h('h3', { style: 'margin-top:24px' }, I('shuffle'), ' Arbitrage Opportunities'),
      renderTable(arbitrage, 'No arbitrage opportunities found yet. Agent scans with poly_arbitrage_scanner.',
        ['Type', 'Expected Profit', 'Confidence', 'Status', 'Time'],
        function(a) { return [
          h('td', null, h('span', { className: 'badge badge-secondary' }, a.type)),
          h('td', null, h('strong', { style: 'color:var(--success)' }, a.expected_profit.toFixed(2) + '%')),
          h('td', null, a.confidence ? (a.confidence * 100).toFixed(0) + '%' : '-'),
          h('td', null, h('span', { className: 'badge badge-' + (a.status === 'open' ? 'success' : 'secondary') }, a.status)),
          h('td', null, fmtDate(a.timestamp)),
        ]; }
      ),
      // Regime signals
      regimes.length > 0 && h('div', { style: 'margin-top:24px' },
        h('h3', null, I('activity'), ' Regime Detection'),
        renderTable(regimes.slice(0, 20), '',
          ['Token', 'Regime', 'Confidence', 'Hurst', 'Volatility', 'Time'],
          function(r) { return [
            h('td', null, h('code', { style: 'font-size:11px' }, shortId(r.token_id))),
            h('td', null, regimeBadge(r.regime)),
            h('td', null, (r.confidence * 100).toFixed(0) + '%'),
            h('td', null, r.hurst ? r.hurst.toFixed(3) : '-'),
            h('td', null, r.volatility ? (r.volatility * 100).toFixed(1) + '%' : '-'),
            h('td', null, fmtDate(r.timestamp)),
          ]; }
        )
      )
    ),

    // ═══ EXECUTION (Snipers + Scale Orders) ═══
    tab === 'execution' && h('div', null,
      h('h3', null, I('crosshair'), ' Sniper Orders'),
      renderTable(snipers, 'No sniper orders. Agent creates them with poly_sniper.',
        ['Token', 'Side', 'Target', 'Max', 'Size', 'Trail', 'Status', ''],
        function(s) { return [
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(s.token_id))),
          h('td', null, sideBadge(s.side)),
          h('td', null, s.target_price?.toFixed(2) + '\u00a2'),
          h('td', null, s.max_price ? s.max_price.toFixed(2) + '\u00a2' : '-'),
          h('td', null, '$' + (s.size_usdc || 0).toFixed(2)),
          h('td', null, s.trail_amount?.toFixed(2)),
          h('td', null, statusBadge(s.status)),
          h('td', null, s.status === 'active' && h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
            await apiCall('/polymarket/snipers/' + s.id, { method: 'DELETE' }); toast('Cancelled', 'success'); loadAgentData(selectedAgent);
          }}, I('x'))),
        ]; }
      ),
      h('h3', { style: 'margin-top:24px' }, I('layers'), ' Scale-In Orders (TWAP/VWAP)'),
      renderTable(scaleOrders, 'No scale orders. Agent creates them with poly_scale_in.',
        ['Token', 'Side', 'Total', 'Slices', 'Completed', 'Strategy', 'Avg Price', 'Status'],
        function(s) { return [
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(s.token_id))),
          h('td', null, sideBadge(s.side)),
          h('td', null, '$' + (s.total_size || 0).toFixed(2)),
          h('td', null, s.slices),
          h('td', null, s.completed_slices + '/' + s.slices + ' (' + Math.round(s.completed_slices / s.slices * 100) + '%)'),
          h('td', null, h('span', { className: 'badge badge-secondary' }, s.strategy)),
          h('td', null, s.avg_price ? s.avg_price.toFixed(2) + '\u00a2' : '-'),
          h('td', null, statusBadge(s.status)),
        ]; }
      )
    ),

    // ═══ HEDGES ═══
    tab === 'hedges_tab' && h('div', null,
      h('h3', null, I('shield'), ' Hedged Positions'),
      renderTable(hedges, 'No hedges. Agent creates them with poly_hedge.',
        ['Primary', 'Hedge', 'P. Side', 'H. Side', 'P. Size', 'H. Size', 'Ratio', 'Status'],
        function(hg) { return [
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(hg.primary_token))),
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(hg.hedge_token))),
          h('td', null, sideBadge(hg.primary_side)), h('td', null, sideBadge(hg.hedge_side)),
          h('td', null, '$' + (hg.primary_size || 0).toFixed(2)),
          h('td', null, '$' + (hg.hedge_size || 0).toFixed(2)),
          h('td', null, (hg.hedge_ratio || 0).toFixed(2)),
          h('td', null, statusBadge(hg.status)),
        ]; }
      )
    ),

    // ═══ EXIT RULES ═══
    tab === 'exits' && h('div', null,
      h('h3', null, I('log-out'), ' Active Exit Rules'),
      renderTable(exitRules, 'No exit rules. Agent sets them with poly_exit_strategy after every trade.',
        ['Token', 'Entry', 'Take Profit', 'Stop Loss', 'Trailing', 'Time Exit', 'Highest', ''],
        function(r) { return [
          h('td', null, h('code', { style: 'font-size:11px' }, shortId(r.token_id))),
          h('td', null, r.entry_price?.toFixed(2) + '\u00a2'),
          h('td', null, r.take_profit ? h('span', { style: 'color:var(--success)' }, r.take_profit.toFixed(2) + '\u00a2') : '-'),
          h('td', null, r.stop_loss ? h('span', { style: 'color:var(--danger)' }, r.stop_loss.toFixed(2) + '\u00a2') : '-'),
          h('td', null, r.trailing_stop_pct ? r.trailing_stop_pct + '%' : '-'),
          h('td', null, r.time_exit ? fmtDate(r.time_exit) : '-'),
          h('td', null, r.highest_price ? r.highest_price.toFixed(2) + '\u00a2' : '-'),
          h('td', null, h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
            await apiCall('/polymarket/exit-rules/' + r.id, { method: 'DELETE' }); toast('Removed', 'success'); loadAgentData(selectedAgent);
          }}, I('trash-2'))),
        ]; }
      )
    ),

    // ═══ ALERTS ═══
    tab === 'alerts' && renderTable(alerts, 'No price alerts.',
      ['Market', 'Condition', 'Target', 'Created', ''],
      function(a) { return [
        h('td', null, a.market_question || shortId(a.token_id)),
        h('td', null, a.condition), h('td', null, a.target_price ? a.target_price.toFixed(2) + '\u00a2' : a.pct_change + '%'),
        h('td', null, fmtDate(a.created_at)),
        h('td', null, h('button', { className: 'btn btn-sm btn-danger', onClick: async function() {
          await apiCall('/polymarket/alerts/' + a.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
        }}, I('trash-2'))),
      ]; }
    ),

    // ═══ PAPER ═══
    tab === 'paper' && renderTable(paperPositions, 'No paper positions.',
      ['Market', 'Side', 'Entry', 'Size', 'P&L', 'Status', 'Date'],
      function(p) { return [
        h('td', null, p.market_question || shortId(p.token_id)),
        h('td', null, sideBadge(p.side)), h('td', null, (p.entry_price || 0).toFixed(2) + '\u00a2'),
        h('td', null, '$' + (p.size || 0).toFixed(2)), h('td', null, pnlCell(p.pnl)),
        h('td', null, h('span', { className: 'badge badge-' + (p.closed ? 'secondary' : 'success') }, p.closed ? 'Closed' : 'Open')),
        h('td', null, fmtDate(p.created_at)),
      ]; }
    ),

    // ═══ JOURNAL ═══
    tab === 'journal' && h('div', null,
      h('div', { style: 'display:flex;gap:8px;margin-bottom:16px' },
        ['all', 'unresolved', 'resolved'].map(function(f) {
          return h('button', { key: f, className: 'btn btn-sm ' + (predFilter === f ? 'btn-primary' : 'btn-outline'),
            onClick: function() { setPredFilter(f); } }, f === 'all' ? 'All' : f === 'unresolved' ? 'Open' : 'Resolved');
        })
      ),
      renderTable(predictions.filter(function(p) {
        if (predFilter === 'resolved') return p.resolved; if (predFilter === 'unresolved') return !p.resolved; return true;
      }), 'No predictions yet.',
        ['Market', 'Prediction', 'Est.', 'Market', 'Conf.', 'Outcome', 'P&L', 'Date'],
        function(p) {
          var wasRight = p.resolved && p.was_correct;
          return [
            h('td', null, h('div', { style: 'max-width:240px' }, p.market_question || shortId(p.token_id))),
            h('td', null, h('span', { className: 'badge badge-secondary' }, p.predicted_outcome)),
            h('td', null, pct(p.predicted_probability)), h('td', null, pct(p.market_price_at_prediction)),
            h('td', null, h('strong', null, pct(p.confidence))),
            h('td', null, p.resolved ? h('span', { className: 'badge ' + (wasRight ? 'badge-success' : 'badge-danger') }, wasRight ? 'Correct' : 'Wrong') : h('span', { className: 'badge badge-warning' }, 'Open')),
            h('td', null, pnlCell(p.pnl)), h('td', null, fmtDate(p.created_at)),
          ];
        }
      )
    ),

    // ═══ CALIBRATION ═══
    tab === 'calibration' && h('div', null,
      calibration.length === 0 ?
        h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' }, 'No calibration data yet. Builds automatically as predictions resolve.') :
        h('div', null,
          h('div', { className: 'card', style: 'padding:24px;margin-bottom:24px' },
            h('h3', { style: 'margin:0 0 16px 0' }, 'Prediction Calibration'),
            h('p', { style: 'color:var(--text-muted);margin:0 0 16px 0' }, 'A well-calibrated agent at "70% confident" should be right ~70% of the time.'),
            h('div', { style: 'display:flex;align-items:flex-end;gap:8px;height:200px;padding:0 20px' },
              calibration.map(function(c) {
                var expected = parseInt(c.bucket) + 5, actual = c.predictions > 0 ? Math.round(c.correct / c.predictions * 100) : 0, maxH = 180;
                return h('div', { key: c.bucket, style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px' },
                  h('div', { style: 'width:100%;display:flex;flex-direction:column;align-items:center;position:relative;height:' + maxH + 'px;justify-content:flex-end' },
                    h('div', { title: 'Actual: ' + actual + '%', style: 'width:60%;background:' + (Math.abs(actual - expected) <= 5 ? 'var(--success)' : actual < expected ? 'var(--danger)' : 'var(--info)') + ';border-radius:4px 4px 0 0;height:' + Math.max(4, actual / 100 * maxH) + 'px;opacity:0.8' }),
                    h('div', { title: 'Expected: ' + expected + '%', style: 'position:absolute;bottom:' + (expected / 100 * maxH) + 'px;left:10%;width:80%;height:2px;background:var(--text-muted);opacity:0.5' }),
                  ),
                  h('div', { style: 'font-size:11px;font-weight:600' }, c.bucket),
                  h('div', { style: 'font-size:10px;color:var(--text-muted)' }, c.predictions + ' pred'),
                );
              })
            ),
            h('div', { style: 'display:flex;gap:16px;margin-top:12px;justify-content:center;font-size:12px;color:var(--text-muted)' },
              h('span', null, colorDot('var(--success)'), ' Calibrated'),
              h('span', null, colorDot('var(--danger)'), ' Overconfident'),
              h('span', null, colorDot('var(--info)'), ' Underconfident'),
            )
          ),
          renderTable(calibration, '', ['Confidence', 'Predictions', 'Correct', 'Actual', 'Expected', 'Bias'],
            function(c) {
              var actual = c.predictions > 0 ? Math.round(c.correct / c.predictions * 100) : 0, expected = parseInt(c.bucket) + 5, diff = actual - expected;
              return [
                h('td', null, h('strong', null, c.bucket)), h('td', null, c.predictions), h('td', null, c.correct),
                h('td', null, h('strong', null, actual + '%')), h('td', null, '~' + expected + '%'),
                h('td', null, h('span', { style: 'color:' + (Math.abs(diff) <= 5 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--info)') },
                  Math.abs(diff) <= 5 ? 'Calibrated' : diff < 0 ? 'Overconfident (' + diff + '%)' : 'Underconfident (+' + diff + '%)')),
              ];
            }
          )
        )
    ),

    // ═══ STRATEGIES ═══
    tab === 'strategies' && h('div', null,
      strategies.length === 0 ?
        h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' }, 'No strategy data yet.') :
        renderTable(strategies, '', ['Strategy', 'Trades', 'Wins', 'Win Rate', 'P&L', 'Avg Conf.', 'Verdict'],
          function(s) {
            var wr = parseFloat(s.win_rate || 0);
            return [
              h('td', null, h('strong', null, s.strategy_name)), h('td', null, s.total_predictions),
              h('td', null, s.correct_predictions),
              h('td', null, h('span', { style: 'font-weight:600;color:' + (wr > 55 ? 'var(--success)' : wr < 45 ? 'var(--danger)' : 'var(--text)') }, wr + '%')),
              h('td', null, pnlCell(s.total_pnl)), h('td', null, Math.round((s.avg_confidence || 0) * 100) + '%'),
              h('td', null, h('span', { className: 'badge ' + (wr > 60 ? 'badge-success' : wr > 45 ? 'badge-warning' : 'badge-danger') }, wr > 60 ? 'Keep' : wr > 45 ? 'Neutral' : 'Drop')),
            ];
          }
        )
    ),

    // ═══ LESSONS ═══
    tab === 'lessons' && h('div', null,
      lessons.length === 0 ?
        h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' }, 'No lessons yet. The agent records them after reviewing trades.') :
        h('div', null, lessons.map(function(l) {
          return h('div', { key: l.id, className: 'card', style: 'padding:16px;margin-bottom:12px' },
            h('div', { style: 'display:flex;justify-content:space-between;align-items:start' },
              h('div', { style: 'flex:1' },
                h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:8px' },
                  h('span', { className: 'badge badge-' + (l.importance === 'critical' ? 'danger' : l.importance === 'high' ? 'warning' : 'secondary') }, l.importance || 'normal'),
                  h('span', { className: 'badge badge-secondary' }, l.category || 'general'),
                  l.times_applied > 0 && h('span', { style: 'font-size:12px;color:var(--text-muted)' }, 'Applied ' + l.times_applied + 'x'),
                ),
                h('p', { style: 'margin:0;line-height:1.5' }, l.lesson),
                h('div', { style: 'font-size:12px;color:var(--text-muted);margin-top:8px' }, fmtDate(l.created_at)),
              ),
              h('button', { className: 'btn btn-sm btn-outline', style: 'margin-left:12px', onClick: async function() {
                if (await showConfirm('Delete this lesson?')) {
                  await apiCall('/polymarket/lessons/' + l.id, { method: 'DELETE' }); toast('Deleted', 'success'); loadAgentData(selectedAgent);
                }
              }}, I('trash-2'))
            )
          );
        }))
    ),

    // ═══ DRAWDOWN ═══
    tab === 'drawdown_tab' && h('div', null,
      h('h3', null, I('trending-down'), ' Portfolio Drawdown Monitor'),
      !drawdown || !drawdown.snapshots?.length ?
        h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' }, 'No portfolio snapshots yet. The agent records them with poly_drawdown_monitor.') :
        h('div', null,
          h('div', { className: 'stats-grid', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px' },
            statCard('Current Value', '$' + (drawdown.current || 0).toFixed(2)),
            statCard('Peak Value', '$' + (drawdown.peak || 0).toFixed(2)),
            statCard('Drawdown', drawdown.drawdown_pct + '%', drawdown.drawdown_pct > 15 ? 'DANGER' : drawdown.drawdown_pct > 10 ? 'WARNING' : 'OK'),
            statCard('Snapshots', drawdown.snapshots.length),
          ),
          renderTable(drawdown.snapshots.slice(0, 30), '', ['Value', 'Peak', 'Drawdown', 'P&L', 'Time'],
            function(s) { return [
              h('td', null, '$' + (s.total_value || 0).toFixed(2)),
              h('td', null, '$' + (s.peak_value || 0).toFixed(2)),
              h('td', null, h('span', { style: 'color:' + (s.drawdown_pct > 15 ? 'var(--danger)' : s.drawdown_pct > 10 ? 'var(--warning)' : 'var(--success)') }, s.drawdown_pct?.toFixed(1) + '%')),
              h('td', null, pnlCell(s.unrealized_pnl)),
              h('td', null, fmtDate(s.timestamp)),
            ]; }
          )
        )
    ),

    // ═══ P&L ATTRIBUTION ═══
    tab === 'attribution' && h('div', null,
      h('h3', null, I('pie-chart'), ' P&L Attribution'),
      !pnlAttrib || (!pnlAttrib.byStrategy?.length && !pnlAttrib.byCategory?.length) ?
        h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' }, 'No P&L attribution data yet. Agent records with poly_pnl_attribution.') :
        h('div', null,
          pnlAttrib.byStrategy?.length > 0 && h('div', { style: 'margin-bottom:24px' },
            h('h4', null, 'By Strategy'),
            renderTable(pnlAttrib.byStrategy, '', ['Strategy', 'Trades', 'Wins', 'Win Rate', 'P&L', 'Avg Hold'],
              function(s) { return [
                h('td', null, h('strong', null, s.strategy)),
                h('td', null, s.trades), h('td', null, s.wins),
                h('td', null, s.trades > 0 ? Math.round(s.wins / s.trades * 100) + '%' : '-'),
                h('td', null, pnlCell(s.total_pnl)),
                h('td', null, s.avg_hold ? s.avg_hold.toFixed(1) + 'h' : '-'),
              ]; }
            )
          ),
          pnlAttrib.byCategory?.length > 0 && h('div', { style: 'margin-bottom:24px' },
            h('h4', null, 'By Category'),
            renderTable(pnlAttrib.byCategory, '', ['Category', 'Trades', 'Wins', 'Win Rate', 'P&L'],
              function(c) { return [
                h('td', null, h('strong', null, c.category)),
                h('td', null, c.trades), h('td', null, c.wins),
                h('td', null, c.trades > 0 ? Math.round(c.wins / c.trades * 100) + '%' : '-'),
                h('td', null, pnlCell(c.total_pnl)),
              ]; }
            )
          ),
          pnlAttrib.bySignal?.length > 0 && h('div', null,
            h('h4', null, 'By Signal Source'),
            renderTable(pnlAttrib.bySignal, '', ['Signal', 'Trades', 'Wins', 'Win Rate', 'P&L'],
              function(s) { return [
                h('td', null, h('strong', null, s.signal_source)),
                h('td', null, s.trades), h('td', null, s.wins),
                h('td', null, s.trades > 0 ? Math.round(s.wins / s.trades * 100) + '%' : '-'),
                h('td', null, pnlCell(s.total_pnl)),
              ]; }
            )
          )
        )
    ),
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
  return h('div', { style: 'padding:10px;background:var(--bg-secondary);border-radius:8px' },
    h('div', { style: 'font-size:11px;color:var(--text-muted);margin-bottom:2px' }, label),
    h('div', { style: 'font-size:15px;font-weight:600' }, value)
  );
}
function sideBadge(side) { return h('span', { className: 'badge ' + (side === 'BUY' ? 'badge-success' : 'badge-danger') }, side); }
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
  return h('span', { style: 'font-weight:600;color:' + (pnl >= 0 ? 'var(--success)' : 'var(--danger)') }, (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2));
}
function pct(v) { return v == null ? '-' : (v * 100).toFixed(1) + '%'; }
function fmtDate(d) { return d ? new Date(d).toLocaleString() : ''; }
function shortAddr(addr) { return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '?'; }
function shortId(id) { return id ? id.slice(0, 10) + '...' : '?'; }
function colorDot(color) { return h('span', { style: 'display:inline-block;width:10px;height:10px;background:' + color + ';border-radius:2px;margin-right:4px;vertical-align:middle' }); }

function renderTable(data, emptyMsg, headers, rowFn) {
  if (!data || data.length === 0) return h('div', { className: 'empty-state card', style: 'padding:24px;text-align:center' }, emptyMsg);
  return h('div', { className: 'table-container' },
    h('table', { className: 'data-table' },
      h('thead', null, h('tr', null, headers.map(function(hdr) { return h('th', { key: hdr }, hdr); }))),
      h('tbody', null, data.map(function(item) { return h('tr', { key: item.id || Math.random() }, rowFn(item)); }))
    )
  );
}
function numberField(label, key, obj, setter) {
  return h('div', { className: 'form-group' },
    h('label', null, label),
    h('input', { type: 'number', className: 'form-input', value: obj[key] || 0,
      onChange: function(e) { var u = Object.assign({}, obj); u[key] = parseFloat(e.target.value) || 0; setter(u); } })
  );
}
function configModal(editConfig, setEditConfig, updateConfig) {
  return h('div', { className: 'modal-backdrop', onClick: function() { setEditConfig(null); } },
    h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: 'max-width:500px' },
      h('div', { className: 'modal-header' },
        h('h3', null, 'Trading Configuration'),
        h('button', { className: 'btn-close', onClick: function() { setEditConfig(null); } }, '\u00d7')
      ),
      h('div', { className: 'modal-body', style: 'display:grid;gap:12px' },
        h('div', { className: 'form-group' },
          h('label', null, 'Trading Mode'),
          h('select', { className: 'form-select', value: editConfig.mode,
            onChange: function(e) { setEditConfig(Object.assign({}, editConfig, { mode: e.target.value })); }
          }, h('option', { value: 'approval' }, 'Approval (Human-in-the-loop)'),
             h('option', { value: 'autonomous' }, 'Autonomous'),
             h('option', { value: 'paper' }, 'Paper Trading'))
        ),
        numberField('Max Position Size ($)', 'max_position_size', editConfig, setEditConfig),
        numberField('Max Order Size ($)', 'max_order_size', editConfig, setEditConfig),
        numberField('Max Total Exposure ($)', 'max_total_exposure', editConfig, setEditConfig),
        numberField('Max Daily Trades', 'max_daily_trades', editConfig, setEditConfig),
        numberField('Max Daily Loss ($)', 'max_daily_loss', editConfig, setEditConfig),
        numberField('Max Drawdown (%)', 'max_drawdown_pct', editConfig, setEditConfig),
        numberField('Stop Loss (%)', 'stop_loss_pct', editConfig, setEditConfig),
        numberField('Take Profit (%)', 'take_profit_pct', editConfig, setEditConfig),
        numberField('Cash Reserve (%)', 'cash_reserve_pct', editConfig, setEditConfig),
      ),
      h('div', { className: 'modal-footer' },
        h('button', { className: 'btn btn-secondary', onClick: function() { setEditConfig(null); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: function() { updateConfig(editConfig); } }, 'Save')
      )
    )
  );
}

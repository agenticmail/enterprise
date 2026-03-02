import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { StatCard, ProgressBar, formatNumber, formatCost } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';

// ════════════════════════════════════════════════════════════
// BUDGET SECTION
// ════════════════════════════════════════════════════════════

export function BudgetSection(props) {
  var agentId = props.agentId;

  var app = useApp();
  var toast = app.toast;

  var _usage = useState(null);
  var usageData = _usage[0]; var setUsageData = _usage[1];
  var _budget = useState(null);
  var budgetConfig = _budget[0]; var setBudgetConfig = _budget[1];
  var _alerts = useState([]);
  var budgetAlerts = _alerts[0]; var setBudgetAlerts = _alerts[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({ dailyTokens: 0, dailyCost: 0, monthlyTokens: 0, monthlyCost: 0 });
  var form = _form[0]; var setForm = _form[1];

  var loadData = function() {
    setLoading(true);
    Promise.all([
      engineCall('/agents/' + agentId + '/usage').catch(function() { return null; }),
      engineCall('/agents/' + agentId + '/budget').catch(function() { return null; }),
      engineCall('/budget/alerts?agentId=' + agentId).catch(function() { return { alerts: [] }; })
    ]).then(function(results) {
      setUsageData(results[0]);
      // Unwrap: GET /agents/:id/budget returns { budgetConfig: {...} }
      var bc = results[1]?.budgetConfig || results[1] || null;
      setBudgetConfig(bc);
      setBudgetAlerts(results[2]?.alerts || results[2] || []);
      if (bc) {
        setForm({
          dailyTokens: bc.dailyTokens || bc.daily_tokens || bc.limits?.dailyTokens || 0,
          dailyCost: bc.dailyCost || bc.daily_cost || bc.limits?.dailyCost || 0,
          monthlyTokens: bc.monthlyTokens || bc.monthly_tokens || bc.limits?.monthlyTokens || 0,
          monthlyCost: bc.monthlyCost || bc.monthly_cost || bc.limits?.monthlyCost || 0
        });
      }
      setLoading(false);
    });
  };

  useEffect(function() { loadData(); }, [agentId]);

  // ─── Derived Usage Values ───────────────────────────────

  var bu = usageData?.usage || usageData || {};
  var tokensToday = bu.tokensToday || bu.today?.tokens || 0;
  var tokensMonth = bu.tokensThisMonth || bu.tokensMonth || bu.month?.tokens || 0;
  var costToday = bu.costToday || bu.today?.cost || 0;
  var costMonth = bu.costThisMonth || bu.costMonth || bu.month?.cost || 0;
  var sessionsToday = bu.sessionsToday || bu.today?.sessions || 0;
  var errorsToday = bu.errorsToday || bu.today?.errors || 0;

  // ─── Budget Limits ──────────────────────────────────────

  var limits = budgetConfig?.limits || budgetConfig || null;
  var hasBudget = limits && (limits.dailyTokens || limits.daily_tokens || limits.dailyCost || limits.daily_cost || limits.monthlyTokens || limits.monthly_tokens || limits.monthlyCost || limits.monthly_cost || form.dailyTokens || form.dailyCost || form.monthlyTokens || form.monthlyCost);
  var budgetDailyTokens = limits?.dailyTokens || limits?.daily_tokens || form.dailyTokens || 0;
  var budgetDailyCost = limits?.dailyCost || limits?.daily_cost || form.dailyCost || 0;
  var budgetMonthlyTokens = limits?.monthlyTokens || limits?.monthly_tokens || form.monthlyTokens || 0;
  var budgetMonthlyCost = limits?.monthlyCost || limits?.monthly_cost || form.monthlyCost || 0;

  // ─── Save Budget ────────────────────────────────────────

  var saveBudget = function() {
    setSaving(true);
    engineCall('/agents/' + agentId + '/budget', {
      method: 'PUT',
      body: JSON.stringify({
        dailyTokens: Number(form.dailyTokens) || 0,
        dailyCost: Number(form.dailyCost) || 0,
        monthlyTokens: Number(form.monthlyTokens) || 0,
        monthlyCost: Number(form.monthlyCost) || 0
      })
    })
      .then(function() { toast('Budget updated', 'success'); setEditing(false); loadData(); })
      .catch(function(err) { toast(err.message, 'error'); })
      .finally(function() { setSaving(false); });
  };

  // ─── Acknowledge Alert ──────────────────────────────────

  var acknowledgeAlert = function(alertId) {
    engineCall('/budget/alerts/' + alertId + '/acknowledge', { method: 'POST' })
      .then(function() { toast('Alert acknowledged', 'success'); loadData(); })
      .catch(function(err) { toast(err.message, 'error'); });
  };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading budget data...');
  }

  return h(Fragment, null,

    // ─── Usage Stats Grid ───────────────────────────────
    h('div', { className: 'stat-grid', style: { marginBottom: 20 } },
      h(StatCard, { label: 'Tokens Today', value: formatNumber(tokensToday) }),
      h(StatCard, { label: 'Tokens This Month', value: formatNumber(tokensMonth) }),
      h(StatCard, { label: 'Cost Today', value: formatCost(costToday) }),
      h(StatCard, { label: 'Cost This Month', value: formatCost(costMonth) }),
      h(StatCard, { label: 'Sessions Today', value: String(sessionsToday) }),
      h(StatCard, { label: 'Errors Today', value: String(errorsToday), color: errorsToday > 0 ? 'var(--danger)' : undefined })
    ),

    // ─── Budget Limits Card ─────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Budget Limits',
          h(HelpButton, { label: 'Budget Limits' },
            h('p', null, 'Set spending caps to prevent this agent from exceeding your API budget. When a limit is reached, the agent is automatically paused.'),
            h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Limit Types'),
            h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
              h('li', null, h('strong', null, 'Daily Limit'), ' — Maximum spend per day (resets at midnight UTC). Prevents runaway costs from a single day\'s usage.'),
              h('li', null, h('strong', null, 'Monthly Limit'), ' — Maximum spend per calendar month. Your overall budget control.'),
              h('li', null, h('strong', null, 'Per-Request Limit'), ' — Maximum cost for a single API call. Prevents accidentally using expensive models or very long prompts.')
            ),
            h('p', null, 'Set to 0 or leave blank for no limit. The progress bars show current usage against each limit.'),
            h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Start with a conservative daily limit, monitor usage for a week, then adjust. It\'s easier to raise limits than to deal with a surprise $500 bill.')
          )
        ),
        !editing && h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setEditing(true); } }, 'Edit Budget')
      ),
      h('div', { className: 'card-body' },

        // Edit Mode
        editing ? h('div', null,
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Daily Token Limit'),
              h('input', {
                className: 'input', type: 'number', value: form.dailyTokens,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { dailyTokens: e.target.value }); }); }
              })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Daily Cost Limit ($)'),
              h('input', {
                className: 'input', type: 'number', step: '0.01', value: form.dailyCost,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { dailyCost: e.target.value }); }); }
              })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Monthly Token Limit'),
              h('input', {
                className: 'input', type: 'number', value: form.monthlyTokens,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { monthlyTokens: e.target.value }); }); }
              })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Monthly Cost Limit ($)'),
              h('input', {
                className: 'input', type: 'number', step: '0.01', value: form.monthlyCost,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { monthlyCost: e.target.value }); }); }
              })
            )
          ),
          h('div', { style: { display: 'flex', gap: 10 } },
            h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: saveBudget }, saving ? 'Saving...' : 'Save Budget'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel')
          )
        )

        // Display Mode
        : hasBudget ? h('div', null,
            budgetDailyTokens > 0 && h(ProgressBar, { label: 'Daily Tokens', value: tokensToday, total: budgetDailyTokens, unit: 'tokens' }),
            budgetDailyCost > 0 && h(ProgressBar, { label: 'Daily Cost', value: costToday, total: budgetDailyCost, unit: '$' }),
            budgetMonthlyTokens > 0 && h(ProgressBar, { label: 'Monthly Tokens', value: tokensMonth, total: budgetMonthlyTokens, unit: 'tokens' }),
            budgetMonthlyCost > 0 && h(ProgressBar, { label: 'Monthly Cost', value: costMonth, total: budgetMonthlyCost, unit: '$' }),
            !budgetDailyTokens && !budgetDailyCost && !budgetMonthlyTokens && !budgetMonthlyCost && h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'No budget limits configured.')
          )
        : h('div', { style: { textAlign: 'center', padding: 20 } },
            h('div', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 } }, 'No budget limits configured.'),
            h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setEditing(true); } }, I.plus(), ' Set Budget')
          )
      )
    ),

    // ─── Budget Alerts Table ────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Budget Alerts',
        h(HelpButton, { label: 'Budget Alerts' },
          h('p', null, 'Get notified when the agent approaches or exceeds budget thresholds.'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Warning'), ' — Sent when usage reaches a percentage of the limit (e.g., 80%). Agent continues running.'),
            h('li', null, h('strong', null, 'Critical'), ' — Sent when usage is very close to the limit (e.g., 95%). Consider pausing non-essential tasks.'),
            h('li', null, h('strong', null, 'Exceeded'), ' — The limit was hit and the agent was automatically paused. Requires manual resume or limit increase.')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Alerts are sent to the agent\'s manager (if configured) and to the admin email.')
        )
      )),
      budgetAlerts.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Type'),
                  h('th', null, 'Budget Type'),
                  h('th', null, 'Current'),
                  h('th', null, 'Limit'),
                  h('th', null, 'Status'),
                  h('th', null, '')
                )
              ),
              h('tbody', null,
                budgetAlerts.map(function(alert, i) {
                  var alertType = alert.type || alert.alertType || 'warning';
                  var budgetType = alert.budgetType || alert.budget_type || 'tokens';
                  var current = alert.currentValue || alert.current || 0;
                  var limit = alert.limitValue || alert.limit || 0;
                  var acknowledged = alert.acknowledged || alert.acked || false;
                  var time = alert.createdAt || alert.created_at || alert.timestamp;
                  var typeColor = alertType === 'critical' ? 'badge-danger' : alertType === 'warning' ? 'badge-warning' : 'badge-info';

                  return h('tr', { key: alert.id || i },
                    h('td', { style: { fontSize: 12 } }, time ? new Date(time).toLocaleString() : '-'),
                    h('td', null, h('span', { className: 'badge ' + typeColor }, alertType)),
                    h('td', null, h('span', { className: 'badge badge-neutral' }, budgetType)),
                    h('td', { style: { fontFamily: 'monospace', fontSize: 12 } }, budgetType === 'cost' ? formatCost(current) : formatNumber(current)),
                    h('td', { style: { fontFamily: 'monospace', fontSize: 12 } }, budgetType === 'cost' ? formatCost(limit) : formatNumber(limit)),
                    h('td', null, h('span', { className: acknowledged ? 'badge badge-neutral' : 'badge badge-warning' }, acknowledged ? 'Acknowledged' : 'Pending')),
                    h('td', null,
                      !acknowledged && h('button', {
                        className: 'btn btn-ghost btn-sm',
                        onClick: function() { acknowledgeAlert(alert.id); }
                      }, I.check(), ' Ack')
                    )
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No budget alerts.')
          )
    )
  );
}

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import { formatDate, formatMoney, startOfMonthKarachi, todayKarachi, lastNMonthsKarachi, monthRangeKarachi } from '../lib/format';

export default function Hub({ profile }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(startOfMonthKarachi());
  const [dateTo, setDateTo] = useState(todayKarachi());

  const [addOpen, setAddOpen] = useState(false);
  const [costDate, setCostDate] = useState(todayKarachi());
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costSaving, setCostSaving] = useState(false);
  const [costError, setCostError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: inv, error: invErr }, { data: pay, error: payErr }, { data: exp, error: expErr }] = await Promise.all([
      fetchAllRows(() => supabase.from('invoices').select('id, procedure, cost, discount, lab_cost, created_at')),
      fetchAllRows(() => supabase.from('payments').select('id, amount, paid_at')),
      fetchAllRows(() => supabase.from('expenses').select('*').order('expense_date', { ascending: false })),
    ]);
    if (invErr) console.error(invErr);
    if (payErr) console.error(payErr);
    if (expErr) console.error(expErr);
    setInvoices(inv || []);
    setPayments(pay || []);
    setExpenses(exp || []);
    setLoading(false);
  }

  async function handleAddCost(e) {
    e.preventDefault();
    const amt = Number(costAmount);
    if (!amt || amt <= 0) { setCostError('Enter a valid amount.'); return; }
    setCostSaving(true);
    setCostError('');
    const { error } = await supabase.from('expenses').insert({
      category: 'general',
      description: costDescription.trim() || 'Material cost',
      amount: amt,
      expense_date: costDate,
      created_by: profile?.id,
    });
    setCostSaving(false);
    if (error) { setCostError(error.message); return; }
    setCostDescription('');
    setCostAmount('');
    setAddOpen(false);
    load();
  }

  // ---- Period filter (dateFrom..dateTo inclusive, Karachi-local) ----
  // Normalized via toISOString() (UTC 'Z' form) to match what Supabase
  // returns for timestamptz columns — comparing raw "+05:00" strings
  // against those lexically would silently misorder rows.
  const periodStartIso = new Date(`${dateFrom}T00:00:00+05:00`).toISOString();
  const periodEndIso = new Date(`${dateTo}T23:59:59.999+05:00`).toISOString();

  const periodInvoices = useMemo(
    () => invoices.filter((i) => i.created_at >= periodStartIso && i.created_at <= periodEndIso),
    [invoices, periodStartIso, periodEndIso]
  );
  const periodPayments = useMemo(
    () => payments.filter((p) => p.paid_at >= periodStartIso && p.paid_at <= periodEndIso),
    [payments, periodStartIso, periodEndIso]
  );
  const periodExpenses = useMemo(
    () => expenses.filter((x) => x.expense_date >= dateFrom && x.expense_date <= dateTo),
    [expenses, dateFrom, dateTo]
  );

  const totals = useMemo(() => {
    const collected = periodPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const spent = periodExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { collected, spent, net: collected - spent };
  }, [periodPayments, periodExpenses]);

  // ---- Daily breakdown ----
  const dailyRows = useMemo(() => {
    const byDay = new Map();
    for (const p of periodPayments) {
      const day = formatYmdKarachi(p.paid_at);
      if (!byDay.has(day)) byDay.set(day, { day, collected: 0, spent: 0 });
      byDay.get(day).collected += Number(p.amount) || 0;
    }
    for (const x of periodExpenses) {
      const day = x.expense_date;
      if (!byDay.has(day)) byDay.set(day, { day, collected: 0, spent: 0 });
      byDay.get(day).spent += Number(x.amount) || 0;
    }
    return Array.from(byDay.values())
      .map((row) => ({ ...row, net: row.collected - row.spent }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [periodPayments, periodExpenses]);

  // ---- Procedure breakdown (by invoice created_at, count desc) ----
  const procedureRows = useMemo(() => {
    const byProc = new Map();
    for (const inv of periodInvoices) {
      const key = inv.procedure || 'Unspecified';
      const net = Math.max((Number(inv.cost) || 0) - (Number(inv.discount) || 0), 0) + (Number(inv.lab_cost) || 0);
      if (!byProc.has(key)) byProc.set(key, { procedure: key, count: 0, revenue: 0 });
      const row = byProc.get(key);
      row.count += 1;
      row.revenue += net;
    }
    return Array.from(byProc.values()).sort((a, b) => b.count - a.count);
  }, [periodInvoices]);

  // ---- Fixed last-3-months chart (independent of the date filter above) ----
  const chartData = useMemo(() => {
    const months = lastNMonthsKarachi(3);
    return months.map(({ yyyyMm, label }) => {
      const [start, end] = monthRangeKarachi(yyyyMm);
      const collected = payments
        .filter((p) => p.paid_at >= start && p.paid_at < end)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const spent = expenses
        .filter((x) => x.expense_date.slice(0, 7) === yyyyMm)
        .reduce((s, x) => s + (Number(x.amount) || 0), 0);
      return { label, net: collected - spent };
    });
  }, [payments, expenses]);

  return (
    <section id="hubSection" className="pane active">
      <div className="card hub-chart-card">
        <h2 className="hub-chart-title">Net P/L — Last 3 Months</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(v) => formatMoney(v)} width={90} />
            <Tooltip formatter={(v) => formatMoney(v)} />
            <Bar dataKey="net" radius={[6, 6, 0, 0]}>
              <LabelList dataKey="net" position="top" formatter={(v) => formatMoney(v)} />
              {chartData.map((row, i) => (
                <Cell key={i} fill={row.net < 0 ? '#ef4444' : '#f0b429'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card billing-toolbar toolbar-row">
        <div className="toolbar-left">
          <label className="sort-toggle">
            From
            <input type="date" className="input-month" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="sort-toggle">
            To
            <input type="date" className="input-month" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? 'Cancel' : '+ Add Material Cost'}
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="card">
          <form className="billing-add-form" onSubmit={handleAddCost}>
            {costError && <div className="error-text">{costError}</div>}
            <div className="billing-add-row">
              <input type="date" className="billing-select" value={costDate} onChange={(e) => setCostDate(e.target.value)} />
              <input
                type="text"
                className="billing-select"
                placeholder="Description (e.g. dental material restock)"
                value={costDescription}
                onChange={(e) => setCostDescription(e.target.value)}
              />
              <input
                type="number"
                className="billing-select"
                placeholder="Amount"
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                min="0"
                step="1"
              />
              <button type="submit" className="btn btn-primary" disabled={costSaving}>
                {costSaving ? 'Adding…' : 'Add Cost'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="billing-kpis card">
        <div className="kpi-card">
          <span className="kpi-label">Collected</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.collected)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Expenses</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.spent)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Net P/L</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.net)}</span>
        </div>
      </div>

      <div className="card billing-table-card">
        <h2 className="hub-section-title">Daily Breakdown</h2>
        <div className="table-scroll">
          <table className="billing-table">
            <thead>
              <tr><th>Date</th><th>Collected</th><th>Expenses</th><th>Net</th></tr>
            </thead>
            <tbody>
              {dailyRows.map((row) => (
                <tr key={row.day}>
                  <td>{formatDate(`${row.day}T12:00:00+05:00`)}</td>
                  <td>{formatMoney(row.collected)}</td>
                  <td>{formatMoney(row.spent)}</td>
                  <td>{formatMoney(row.net)}</td>
                </tr>
              ))}
              {!loading && dailyRows.length === 0 && (
                <tr><td colSpan={4} className="empty-state">No activity in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card billing-table-card">
        <h2 className="hub-section-title">Procedure Breakdown</h2>
        <div className="table-scroll">
          <table className="billing-table">
            <thead>
              <tr><th>Procedure</th><th>Times Done</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {procedureRows.map((row) => (
                <tr key={row.procedure}>
                  <td>{row.procedure}</td>
                  <td>{row.count}</td>
                  <td>{formatMoney(row.revenue)}</td>
                </tr>
              ))}
              {!loading && procedureRows.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No invoices in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function formatYmdKarachi(isoValue) {
  const d = new Date(isoValue);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

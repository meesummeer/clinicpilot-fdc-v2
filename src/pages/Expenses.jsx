import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import { formatDate, formatMoney, startOfMonthKarachi, todayKarachi, EXPENSE_CATEGORY_LABELS } from '../lib/format';
import ExpenseForm from '../components/ExpenseForm';
import EditExpenseModal from '../components/EditExpenseModal';

export default function Expenses({ profile }) {
  const canManage = profile?.role === 'admin' || (profile?.role === 'csr' && profile?.has_expenses_access === true);

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(startOfMonthKarachi());
  const [dateTo, setDateTo] = useState(todayKarachi());
  const [editExpense, setEditExpense] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() =>
      supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    );
    if (error) console.error(error);
    setExpenses(data || []);
    setLoading(false);
  }

  const periodExpenses = useMemo(
    () => expenses.filter((x) => x.expense_date >= dateFrom && x.expense_date <= dateTo),
    [expenses, dateFrom, dateTo]
  );

  const totals = useMemo(() => {
    const byCategory = { general: 0, salary: 0, utility: 0 };
    let total = 0;
    for (const x of periodExpenses) {
      const amt = Number(x.amount) || 0;
      total += amt;
      if (byCategory[x.category] != null) byCategory[x.category] += amt;
    }
    return { total, ...byCategory };
  }, [periodExpenses]);

  if (!canManage) {
    return (
      <section id="expensesSection" className="pane active">
        <div className="card empty-state">You don't have access to Expenses. Ask Dr. Faseeh to grant it.</div>
      </section>
    );
  }

  return (
    <section id="expensesSection" className="pane active">
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
        </div>
      </div>

      <div className="billing-kpis kpi-grid-4 card">
        <div className="kpi-card">
          <span className="kpi-label">Total</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.total)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">General</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.general)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Salary</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.salary)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Utility Bills</span>
          <span className="kpi-value">{loading ? '—' : formatMoney(totals.utility)}</span>
        </div>
      </div>

      <div className="card">
        <ExpenseForm profile={profile} onSaved={load} />
      </div>

      <div className="card billing-table-card">
        <div className="table-scroll">
          <table className="billing-table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr>
            </thead>
            <tbody>
              {periodExpenses.map((x) => (
                <tr key={x.id}>
                  <td>{formatDate(`${x.expense_date}T12:00:00+05:00`)}</td>
                  <td>{EXPENSE_CATEGORY_LABELS[x.category] || x.category}</td>
                  <td>{x.description || '—'}</td>
                  <td>{formatMoney(x.amount)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditExpense(x)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && periodExpenses.length === 0 && (
                <tr><td colSpan={5} className="empty-state">No expenses in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editExpense && (
        <EditExpenseModal
          expense={editExpense}
          onClose={() => setEditExpense(null)}
          onSaved={() => { setEditExpense(null); load(); }}
        />
      )}
    </section>
  );
}

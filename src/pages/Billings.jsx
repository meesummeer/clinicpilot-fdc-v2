import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import { formatDate, formatMoney, currentMonthKarachi, monthRangeKarachi, PAYMENT_METHOD_LABELS } from '../lib/format';
import { invoiceNet, invoicePaid, invoiceDue, invoiceStatus, groupPaymentsByInvoice } from '../lib/billing';
import EditInvoiceModal from '../components/EditInvoiceModal';
import PatientPicker from '../components/PatientPicker';
import InvoiceForm from '../components/InvoiceForm';
import InvoiceViewModal from '../components/InvoiceViewModal';

export default function Billings({ profile }) {
  const isAdmin = profile?.role === 'admin';
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allTime, setAllTime] = useState(false);
  const [month, setMonth] = useState(currentMonthKarachi());
  const [view, setView] = useState('invoices');
  const [editInvoice, setEditInvoice] = useState(null);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
  const [addInvoicePatient, setAddInvoicePatient] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: inv, error: invErr }, { data: pay, error: payErr }] = await Promise.all([
      fetchAllRows(() => supabase.from('invoices').select('*, patients(name, mr_no, phone)').order('created_at', { ascending: false })),
      fetchAllRows(() => supabase.from('payments').select('*, patients(name, mr_no), invoices(procedure)').order('paid_at', { ascending: false })),
    ]);
    if (invErr) console.error(invErr);
    if (payErr) console.error(payErr);
    setInvoices(inv || []);
    setPayments(pay || []);
    setLoading(false);
  }

  const paymentsByInvoice = useMemo(() => groupPaymentsByInvoice(payments), [payments]);

  const [periodStart, periodEnd] = useMemo(() => {
    if (allTime) return [null, null];
    return monthRangeKarachi(month);
  }, [allTime, month]);

  const periodInvoices = useMemo(() => {
    if (!periodStart) return invoices;
    return invoices.filter((i) => i.created_at >= periodStart && i.created_at < periodEnd);
  }, [invoices, periodStart, periodEnd]);

  const periodPayments = useMemo(() => {
    if (!periodStart) return payments;
    return payments.filter((p) => p.paid_at >= periodStart && p.paid_at < periodEnd);
  }, [payments, periodStart, periodEnd]);

  const kpis = useMemo(() => {
    const totalInvoiced = periodInvoices.reduce((sum, inv) => sum + invoiceNet(inv), 0);
    const totalCollected = periodPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalOutstanding = periodInvoices.reduce((sum, inv) => sum + invoiceDue(inv, paymentsByInvoice), 0);
    return { totalInvoiced, totalCollected, totalOutstanding };
  }, [periodInvoices, periodPayments, paymentsByInvoice]);

  return (
    <section id="billingsSection" className="pane active">
      <div className="billing-toolbar card toolbar-row">
        <div className="toolbar-left">
          <input
            type="month"
            className="input-month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setAllTime(false); }}
            disabled={allTime}
          />
          <button
            type="button"
            id="billingAllTime"
            className={'btn btn-secondary' + (allTime ? ' active' : '')}
            onClick={() => setAllTime((v) => !v)}
          >
            All Time
          </button>
        </div>
        <div className="toolbar-right">
          <button type="button" className="btn btn-primary" onClick={() => { setAddInvoicePatient(null); setAddInvoiceOpen(true); }}>
            + Add Invoice
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="billing-kpis card">
          <div className="kpi-card">
            <span className="kpi-label">Total Invoiced</span>
            <span className="kpi-value">{loading ? '—' : formatMoney(kpis.totalInvoiced)}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Total Collected</span>
            <span className="kpi-value">{loading ? '—' : formatMoney(kpis.totalCollected)}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Outstanding</span>
            <span className="kpi-value">{loading ? '—' : formatMoney(kpis.totalOutstanding)}</span>
          </div>
        </div>
      )}

      <div className="card billing-table-card">
        <div className="tabs">
          <button type="button" className={'tab' + (view === 'invoices' ? ' active' : '')} onClick={() => setView('invoices')}>Invoices</button>
          <button type="button" className={'tab' + (view === 'payments' ? ' active' : '')} onClick={() => setView('payments')}>Payments Received</button>
        </div>

        {view === 'invoices' && (
          <div className="table-scroll">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Date</th><th>MR No</th><th>Patient Name</th><th>Procedure</th>
                  <th>Invoice Total</th><th>Paid</th><th>Due</th><th>Status</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periodInvoices.map((inv) => {
                  const net = invoiceNet(inv);
                  const paid = invoicePaid(inv, paymentsByInvoice);
                  const due = invoiceDue(inv, paymentsByInvoice);
                  const status = invoiceStatus(inv, paymentsByInvoice);
                  return (
                    <tr key={inv.id}>
                      <td>{formatDate(inv.created_at)}</td>
                      <td>#{inv.patients?.mr_no ?? '—'}</td>
                      <td>{inv.patients?.name || 'Unknown'}</td>
                      <td>{inv.procedure || '—'}</td>
                      <td>{formatMoney(net)}</td>
                      <td>{formatMoney(paid)}</td>
                      <td>{formatMoney(due)}</td>
                      <td><span className={`statusBadge status-${status}`}>{status}</span></td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => setViewInvoice(inv)}>
                          View Invoice
                        </button>
                      </td>
                      <td>
                        <button type="button" className="btn btn-dark btn-small" onClick={() => setEditInvoice(inv)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && periodInvoices.length === 0 && (
                  <tr><td colSpan={10} className="empty-state">No invoices in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {view === 'payments' && (
          <div className="table-scroll">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Date</th><th>MR No</th><th>Patient Name</th><th>Procedure</th>
                  <th>Amount</th><th>Mode</th><th>Invoice Status</th>
                </tr>
              </thead>
              <tbody>
                {periodPayments.map((p) => {
                  const inv = invoices.find((i) => i.id === p.invoice_id);
                  const status = inv ? invoiceStatus(inv, paymentsByInvoice) : '—';
                  return (
                    <tr key={p.id}>
                      <td>{formatDate(p.paid_at)}</td>
                      <td>#{p.patients?.mr_no ?? '—'}</td>
                      <td>{p.patients?.name || 'Unknown'}</td>
                      <td>{p.invoices?.procedure || '—'}</td>
                      <td>{formatMoney(p.amount)}</td>
                      <td>{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                      <td>{inv ? <span className={`statusBadge status-${status}`}>{status}</span> : '—'}</td>
                    </tr>
                  );
                })}
                {!loading && periodPayments.length === 0 && (
                  <tr><td colSpan={7} className="empty-state">No payments in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editInvoice && (
        <EditInvoiceModal
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
          onSaved={() => { setEditInvoice(null); load(); }}
        />
      )}

      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          payments={paymentsByInvoice.get(viewInvoice.id) || []}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {addInvoiceOpen && (
        <div className="modal" onClick={() => setAddInvoiceOpen(false)}>
          <div className="modal-content modal-content--billing" onClick={(e) => e.stopPropagation()}>
            <h2 className="payment-modal-title">Add Invoice</h2>
            {!addInvoicePatient && (
              <PatientPicker onSelect={(p) => setAddInvoicePatient(p)} />
            )}
            {addInvoicePatient && (
              <>
                <div className="add-invoice-patient-chip">
                  <span>
                    <strong>{addInvoicePatient.name}</strong> · MR #{addInvoicePatient.mr_no}
                  </span>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setAddInvoicePatient(null)}>
                    Change Patient
                  </button>
                </div>
                <InvoiceForm
                  patientId={addInvoicePatient.id}
                  profile={profile}
                  onSaved={() => { setAddInvoiceOpen(false); setAddInvoicePatient(null); load(); }}
                />
              </>
            )}
            <div className="payment-actions-stack">
              <button type="button" className="btn btn-secondary" onClick={() => setAddInvoiceOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

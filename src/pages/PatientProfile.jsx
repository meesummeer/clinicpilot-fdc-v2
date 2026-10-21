import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { formatDate, formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import { invoiceNet, invoicePaid, invoiceDue, invoiceStatus, groupPaymentsByInvoice } from '../lib/billing';
import PatientDrawer from '../components/PatientDrawer';
import InvoiceForm from '../components/InvoiceForm';
import PaymentModal from '../components/PaymentModal';

export default function PatientProfile({ profile }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';

  const [patient, setPatient] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('profile');
  const [editOpen, setEditOpen] = useState(false);
  const [payModalInvoice, setPayModalInvoice] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: p, error: pErr }, { data: inv, error: invErr }, { data: pay, error: payErr }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('invoices').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('patient_id', id).order('paid_at', { ascending: false }),
    ]);
    if (pErr) console.error(pErr);
    if (invErr) console.error(invErr);
    if (payErr) console.error(payErr);
    setPatient(p || null);
    setInvoices(inv || []);
    setPayments(pay || []);
    setLoading(false);
  }

  async function handleDeletePatient() {
    if (!window.confirm(`Delete ${patient.name} and all their records? This cannot be undone.`)) return;
    const { error } = await supabase.from('patients').delete().eq('id', patient.id);
    if (error) { alert(error.message); return; }
    navigate('/patients');
  }

  async function handleDeleteInvoice(invoiceId) {
    if (!window.confirm('Delete this invoice and its payments?')) return;
    const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
    if (error) { alert(error.message); return; }
    load();
  }

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!patient) return <div className="empty-state">Patient not found.</div>;

  const paymentsByInvoice = groupPaymentsByInvoice(payments);

  return (
    <div className="patient-profile">
      <button type="button" className="btn btn-ghost back-btn" onClick={() => navigate('/patients')}>← Back</button>
      <div className="card profile-card">
        <h2 className="profile-name">{patient.name}</h2>
        <p className="profile-sub">
          MR #{patient.mr_no} · {patient.phone || 'No phone'} {patient.address ? `· ${patient.address}` : ''}
        </p>
        <div className="tabs">
          <button type="button" className={'tab' + (tab === 'profile' ? ' active' : '')} onClick={() => setTab('profile')}>Profile</button>
          <button type="button" className={'tab' + (tab === 'billing' ? ' active' : '')} onClick={() => setTab('billing')}>Billing</button>
        </div>

        {tab === 'profile' && (
          <div>
            <p><strong>Phone:</strong> {patient.phone || '—'}</p>
            <p><strong>Address:</strong> {patient.address || '—'}</p>
            <p><strong>Gender:</strong> {patient.gender || '—'}</p>
            <p><strong>Patient since:</strong> {formatDate(patient.created_at)}</p>
          </div>
        )}

        {tab === 'billing' && (
          <div>
            <InvoiceForm patientId={patient.id} profile={profile} onSaved={load} />
            {invoices.length === 0 && <div className="empty-state">No invoices yet.</div>}
            {invoices.map((inv) => {
              const net = invoiceNet(inv);
              const paid = invoicePaid(inv, paymentsByInvoice);
              const due = invoiceDue(inv, paymentsByInvoice);
              const status = invoiceStatus(inv, paymentsByInvoice);
              const invPayments = paymentsByInvoice.get(inv.id) || [];
              return (
                <div className="invoice-block" key={inv.id}>
                  <div className="invoice-block-head">
                    <div>
                      <div className="invoice-block-title">{inv.procedure || 'Procedure not specified'}</div>
                      <div className="invoice-block-meta">
                        {formatDate(inv.created_at)} · Cost {formatMoney(inv.cost)}
                        {Number(inv.discount) > 0 && ` · Discount ${formatMoney(inv.discount)}`}
                        {Number(inv.lab_cost) > 0 && ` · Lab ${formatMoney(inv.lab_cost)}`}
                        {' · '}Net {formatMoney(net)}
                      </div>
                      {inv.notes && <div className="invoice-notes-line">{inv.notes}</div>}
                    </div>
                    <span className={`statusBadge status-${status}`}>{status}</span>
                  </div>
                  <div className="invoice-block-meta">Paid {formatMoney(paid)} · Due {formatMoney(due)}</div>
                  {invPayments.length > 0 && (
                    <div className="payment-list">
                      {invPayments.map((p) => (
                        <div className="payment-list-row" key={p.id}>
                          <span>{formatDate(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                          <span>{formatMoney(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="invoice-block-actions">
                    {due > 0 && (
                      <button type="button" className="btn btn-primary btn-small" onClick={() => setPayModalInvoice(inv)}>
                        Record Payment
                      </button>
                    )}
                    {isAdmin && (
                      <button type="button" className="btn btn-danger btn-small" onClick={() => handleDeleteInvoice(inv.id)}>
                        Delete Invoice
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pane-foot">
          <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(true)}>Edit Patient</button>
          {isAdmin && (
            <button type="button" className="btn btn-danger" onClick={handleDeletePatient}>Delete Patient</button>
          )}
        </div>
      </div>

      {editOpen && (
        <PatientDrawer
          patient={patient}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); load(); }}
        />
      )}

      {payModalInvoice && (
        <PaymentModal
          invoice={payModalInvoice}
          patientId={patient.id}
          due={invoiceDue(payModalInvoice, paymentsByInvoice)}
          profile={profile}
          onClose={() => setPayModalInvoice(null)}
          onSaved={() => { setPayModalInvoice(null); load(); }}
        />
      )}
    </div>
  );
}

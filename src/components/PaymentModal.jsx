import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatMoney } from '../lib/format';

function todayKarachi() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function PaymentModal({ invoice, patientId, due, profile, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(todayKarachi());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      patient_id: patientId,
      amount: amt,
      payment_method: method,
      paid_at: `${date}T12:00:00+05:00`,
      created_by: profile?.id,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content modal-content--payment-record" onClick={(e) => e.stopPropagation()}>
        <h2 className="payment-modal-title">Record Payment</h2>
        <p className="payment-modal-sub">{invoice.procedure || 'Invoice'} — balance due {formatMoney(due)}</p>
        {error && <div className="error-text">{error}</div>}
        <form className="payment-form-stack" onSubmit={handleSave}>
          <label>
            Amount
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="1" required />
          </label>
          <p className="payment-remaining-hint">
            {Number(amount) < due ? `Remaining after this: ${formatMoney(due - Number(amount || 0))}` : 'Fully settles this invoice.'}
          </p>
          <label>
            Payment Method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <div className="payment-actions-stack">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

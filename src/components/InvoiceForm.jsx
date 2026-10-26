import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayKarachi } from '../lib/format';
import { PROCEDURE_SUGGESTIONS } from '../lib/procedures';

let lineItemSeq = 0;
function newLine() {
  lineItemSeq += 1;
  return { key: `li-${lineItemSeq}`, name: '', cost: '' };
}

// Create-invoice form. Used both on a patient's own Billing tab (patientId
// fixed) and from the Billings page's "+ Add Invoice" flow (patientId
// chosen via a patient picker first). A single invoice row either carries
// one procedure/cost, or — when "+ Multi-Service" is used — a `line_items`
// jsonb array of { name, cost }, same shape as the 63 legacy multi-service
// invoices already in the data (procedure becomes the joined names, same
// as those legacy rows). Discount, Paid Now and payment method always
// apply to the invoice as a whole, matching how payments already work.
export default function InvoiceForm({ patientId, profile, onSaved }) {
  const [date, setDate] = useState(todayKarachi());
  const [multiMode, setMultiMode] = useState(false);
  const [procedure, setProcedure] = useState('');
  const [cost, setCost] = useState('');
  const [lines, setLines] = useState([newLine(), newLine()]);
  const [discount, setDiscount] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setDate(todayKarachi());
    setMultiMode(false);
    setProcedure('');
    setCost('');
    setLines([newLine(), newLine()]);
    setDiscount('');
    setPaidNow('');
    setMethod('cash');
    setNotes('');
  }

  function updateLine(key, field, value) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');

    let finalProcedure, finalCost, lineItemsPayload;
    if (multiMode) {
      const validLines = lines
        .map((l) => ({ name: l.name.trim(), cost: Number(l.cost) || 0 }))
        .filter((l) => l.name && l.cost > 0);
      if (validLines.length === 0) { setError('Add at least one service with a name and cost.'); return; }
      finalProcedure = validLines.map((l) => l.name).join(', ');
      finalCost = validLines.reduce((sum, l) => sum + l.cost, 0);
      lineItemsPayload = validLines;
    } else {
      finalProcedure = procedure.trim();
      if (!finalProcedure) { setError('Enter the procedure.'); return; }
      finalCost = Number(cost) || 0;
      if (finalCost <= 0) { setError('Enter the invoice cost.'); return; }
      lineItemsPayload = null;
    }

    setSaving(true);
    const timestamp = `${date}T12:00:00+05:00`;
    const { data: inserted, error: invErr } = await supabase
      .from('invoices')
      .insert({
        patient_id: patientId,
        procedure: finalProcedure,
        cost: finalCost,
        discount: Number(discount) || 0,
        lab_cost: 0,
        notes: notes.trim() || null,
        line_items: lineItemsPayload,
        created_at: timestamp,
        created_by: profile?.id,
      })
      .select()
      .single();
    if (invErr) { setSaving(false); setError(invErr.message); return; }

    const paidAmt = Number(paidNow) || 0;
    if (paidAmt > 0) {
      const { error: payErr } = await supabase.from('payments').insert({
        invoice_id: inserted.id,
        patient_id: patientId,
        amount: paidAmt,
        payment_method: method,
        paid_at: timestamp,
        created_by: profile?.id,
      });
      if (payErr) { setSaving(false); setError(`Invoice saved, but recording the payment failed: ${payErr.message}`); onSaved(); return; }
    }

    setSaving(false);
    resetForm();
    onSaved();
  }

  return (
    <form className="billing-add-form invoice-form" onSubmit={handleAdd}>
      {error && <div className="error-text">{error}</div>}

      <div className="billing-add-row">
        <input type="date" className="billing-select" value={date} onChange={(e) => setDate(e.target.value)} />

        {!multiMode && (
          <>
            <input
              type="text"
              list="procedure-suggestions"
              className="billing-select"
              placeholder="Select or type procedure…"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
            />
            <input
              type="number"
              className="billing-select"
              placeholder="Total Cost"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              min="0"
              step="1"
            />
          </>
        )}

        <input
          type="number"
          className="billing-select"
          placeholder="Discount"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          min="0"
          step="1"
        />
        <input
          type="number"
          className="billing-select"
          placeholder="Paid Now"
          value={paidNow}
          onChange={(e) => setPaidNow(e.target.value)}
          min="0"
          step="1"
        />
        <select className="billing-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>
      </div>

      {multiMode && (
        <div className="invoice-lines">
          {lines.map((l) => (
            <div className="invoice-line-row" key={l.key}>
              <input
                type="text"
                list="procedure-suggestions"
                className="billing-select"
                placeholder="Select or type procedure…"
                value={l.name}
                onChange={(e) => updateLine(l.key, 'name', e.target.value)}
              />
              <input
                type="number"
                className="billing-select invoice-line-cost"
                placeholder="Cost"
                value={l.cost}
                onChange={(e) => updateLine(l.key, 'cost', e.target.value)}
                min="0"
                step="1"
              />
              <button
                type="button"
                className="btn btn-secondary btn-small invoice-line-remove"
                onClick={() => removeLine(l.key)}
                disabled={lines.length <= 1}
                aria-label="Remove service"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-small" onClick={addLine}>+ Add Service</button>
          <div className="invoice-line-total">Total: {lines.reduce((s, l) => s + (Number(l.cost) || 0), 0).toLocaleString('en-PK')}</div>
        </div>
      )}

      <datalist id="procedure-suggestions">
        {PROCEDURE_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
      </datalist>

      <div className="billing-add-row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Adding…' : '+ Add Invoice'}
        </button>
        <button
          type="button"
          className={'btn btn-secondary' + (multiMode ? ' active' : '')}
          onClick={() => setMultiMode((v) => !v)}
        >
          {multiMode ? 'Single Service' : '+ Multi-Service'}
        </button>
      </div>

      <textarea
        className="billing-notes"
        placeholder="Treatment notes, observations…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </form>
  );
}

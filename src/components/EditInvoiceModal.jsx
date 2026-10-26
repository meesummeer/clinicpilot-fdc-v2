import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const PROCEDURES = [
  'Consultation',
  'Scaling & Polishing',
  'Filling',
  'Root Canal Treatment',
  'Extraction',
  'Crown',
  'Bridge',
  'Denture',
  'Implant',
  'Whitening',
  'X-Ray',
  'Other',
];

let lineItemSeq = 0;
function newLine(name = '', cost = '') {
  lineItemSeq += 1;
  return { key: `eli-${lineItemSeq}`, name, cost };
}

// Available to all staff (admin and CSR). RLS backs this regardless of
// frontend gating (staff update invoices); every edit is still audit-logged.
// Multi-service invoices (non-empty `line_items`) get the same per-service
// editor as InvoiceForm, and procedure/cost are re-derived from the lines on
// save so they can't drift from line_items.
export default function EditInvoiceModal({ invoice, onClose, onSaved }) {
  const multiMode = Array.isArray(invoice.line_items) && invoice.line_items.length > 0;
  const [lines, setLines] = useState(() =>
    multiMode ? invoice.line_items.map((li) => newLine(li.name || '', String(li.cost ?? ''))) : []
  );
  const knownProcedure = PROCEDURES.includes(invoice.procedure);
  const [procedure, setProcedure] = useState(knownProcedure ? invoice.procedure : 'Other');
  const [otherProcedure, setOtherProcedure] = useState(knownProcedure ? '' : (invoice.procedure || ''));
  const [cost, setCost] = useState(String(invoice.cost ?? ''));
  const [discount, setDiscount] = useState(String(invoice.discount ?? ''));
  const [notes, setNotes] = useState(invoice.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateLine(key, field, value) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSave(e) {
    e.preventDefault();
    let update;
    if (multiMode) {
      const validLines = lines
        .map((l) => ({ name: l.name.trim(), cost: Number(l.cost) || 0 }))
        .filter((l) => l.name && l.cost > 0);
      if (validLines.length === 0) { setError('Add at least one service with a name and cost.'); return; }
      update = {
        procedure: validLines.map((l) => l.name).join(', '),
        cost: validLines.reduce((sum, l) => sum + l.cost, 0),
        line_items: validLines,
      };
    } else {
      const finalProcedure = procedure === 'Other' ? otherProcedure.trim() : procedure;
      if (!finalProcedure) { setError('Pick or enter a procedure.'); return; }
      if (!cost || Number(cost) <= 0) { setError('Enter the invoice cost.'); return; }
      update = { procedure: finalProcedure, cost: Number(cost) || 0 };
    }
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('invoices')
      .update({
        ...update,
        discount: Number(discount) || 0,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content modal-content--billing" onClick={(e) => e.stopPropagation()}>
        <h2 className="payment-modal-title">Edit Invoice</h2>
        {error && <div className="error-text">{error}</div>}
        <form className="billing-add-form" onSubmit={handleSave}>
          {multiMode ? (
            <div className="form-field">
              <label>Services</label>
              <div className="invoice-lines">
                {lines.map((l) => (
                  <div className="invoice-line-row" key={l.key}>
                    <input
                      type="text"
                      list="edit-procedure-suggestions"
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
              <datalist id="edit-procedure-suggestions">
                {PROCEDURES.filter((p) => p !== 'Other').map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
          ) : (
            <>
              <div className="form-field">
                <label>Procedure</label>
                <select className="billing-select" value={procedure} onChange={(e) => setProcedure(e.target.value)}>
                  {PROCEDURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {procedure === 'Other' && (
                <div className="form-field">
                  <label>Describe the procedure</label>
                  <input
                    type="text"
                    className="billing-other-input"
                    value={otherProcedure}
                    onChange={(e) => setOtherProcedure(e.target.value)}
                  />
                </div>
              )}
              <div className="form-field">
                <label>Cost</label>
                <input type="number" className="billing-select" value={cost} onChange={(e) => setCost(e.target.value)} min="0" step="1" />
              </div>
            </>
          )}
          <div className="form-field">
            <label>Discount</label>
            <input type="number" className="billing-select" value={discount} onChange={(e) => setDiscount(e.target.value)} min="0" step="1" />
          </div>
          <div className="form-field">
            <label>Notes</label>
            <textarea className="billing-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="payment-actions-stack">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

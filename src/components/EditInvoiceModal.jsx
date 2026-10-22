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

// Admin-only. RLS backs this regardless of frontend gating (admin update invoices).
export default function EditInvoiceModal({ invoice, onClose, onSaved }) {
  const knownProcedure = PROCEDURES.includes(invoice.procedure);
  const [procedure, setProcedure] = useState(knownProcedure ? invoice.procedure : 'Other');
  const [otherProcedure, setOtherProcedure] = useState(knownProcedure ? '' : (invoice.procedure || ''));
  const [cost, setCost] = useState(String(invoice.cost ?? ''));
  const [discount, setDiscount] = useState(String(invoice.discount ?? ''));
  const [labCost, setLabCost] = useState(String(invoice.lab_cost ?? ''));
  const [notes, setNotes] = useState(invoice.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    const finalProcedure = procedure === 'Other' ? otherProcedure.trim() : procedure;
    if (!finalProcedure) { setError('Pick or enter a procedure.'); return; }
    if (!cost || Number(cost) <= 0) { setError('Enter the invoice cost.'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('invoices')
      .update({
        procedure: finalProcedure,
        cost: Number(cost) || 0,
        discount: Number(discount) || 0,
        lab_cost: Number(labCost) || 0,
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
          <div className="form-field">
            <label>Discount</label>
            <input type="number" className="billing-select" value={discount} onChange={(e) => setDiscount(e.target.value)} min="0" step="1" />
          </div>
          <div className="form-field">
            <label>Lab Cost</label>
            <input type="number" className="billing-select" value={labCost} onChange={(e) => setLabCost(e.target.value)} min="0" step="1" />
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

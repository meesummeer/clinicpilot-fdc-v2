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

export default function InvoiceForm({ patientId, profile, onSaved }) {
  const [procedure, setProcedure] = useState('Consultation');
  const [otherProcedure, setOtherProcedure] = useState('');
  const [cost, setCost] = useState('');
  const [discount, setDiscount] = useState('');
  const [labCost, setLabCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    const finalProcedure = procedure === 'Other' ? otherProcedure.trim() : procedure;
    if (!finalProcedure) { setError('Pick or enter a procedure.'); return; }
    if (!cost || Number(cost) <= 0) { setError('Enter the invoice cost.'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase.from('invoices').insert({
      patient_id: patientId,
      procedure: finalProcedure,
      cost: Number(cost) || 0,
      discount: Number(discount) || 0,
      lab_cost: Number(labCost) || 0,
      notes: notes.trim() || null,
      created_by: profile?.id,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setProcedure('Consultation');
    setOtherProcedure('');
    setCost('');
    setDiscount('');
    setLabCost('');
    setNotes('');
    onSaved();
  }

  return (
    <form className="billing-add-form" onSubmit={handleAdd}>
      {error && <div className="error-text">{error}</div>}
      <div className="billing-add-row">
        <select className="billing-select" value={procedure} onChange={(e) => setProcedure(e.target.value)}>
          {PROCEDURES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input
          type="number"
          className="billing-select"
          placeholder="Cost"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          min="0"
          step="1"
        />
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
          placeholder="Lab Cost"
          value={labCost}
          onChange={(e) => setLabCost(e.target.value)}
          min="0"
          step="1"
        />
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Adding…' : '+ Add Invoice'}
        </button>
      </div>
      {procedure === 'Other' && (
        <div className="billing-other-row">
          <input
            type="text"
            className="billing-other-input"
            placeholder="Describe the procedure"
            value={otherProcedure}
            onChange={(e) => setOtherProcedure(e.target.value)}
          />
        </div>
      )}
      <textarea
        className="billing-notes"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </form>
  );
}

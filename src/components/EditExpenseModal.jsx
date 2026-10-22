import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function EditExpenseModal({ expense, onClose, onSaved }) {
  const [category, setCategory] = useState(expense.category);
  const [description, setDescription] = useState(expense.description || '');
  const [amount, setAmount] = useState(String(expense.amount ?? ''));
  const [date, setDate] = useState(expense.expense_date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter the expense amount.'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('expenses')
      .update({
        category,
        description: description.trim() || null,
        amount: amt,
        expense_date: date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', expense.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  async function handleDelete() {
    if (!window.confirm('Delete this expense?')) return;
    setSaving(true);
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content modal-content--billing" onClick={(e) => e.stopPropagation()}>
        <h2 className="payment-modal-title">Edit Expense</h2>
        {error && <div className="error-text">{error}</div>}
        <form className="billing-add-form" onSubmit={handleSave}>
          <div className="form-field">
            <label>Category</label>
            <select className="billing-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="general">General</option>
              <option value="salary">Salary</option>
              <option value="utility">Utility Bills</option>
              <option value="miscellaneous">Miscellaneous</option>
              <option value="doctors_share">Doctor's Share</option>
              <option value="lab">Lab</option>
              <option value="material">Material</option>
            </select>
          </div>
          <div className="form-field">
            <label>Description</label>
            <input type="text" className="billing-select" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Amount</label>
            <input type="number" className="billing-select" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="1" />
          </div>
          <div className="form-field">
            <label>Date</label>
            <input type="date" className="billing-select" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="payment-actions-stack">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>Delete</button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

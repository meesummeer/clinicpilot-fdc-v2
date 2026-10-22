import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayKarachi } from '../lib/format';

export default function ExpenseForm({ profile, onSaved }) {
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKarachi());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter the expense amount.'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase.from('expenses').insert({
      category,
      description: description.trim() || null,
      amount: amt,
      expense_date: date,
      created_by: profile?.id,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setCategory('general');
    setDescription('');
    setAmount('');
    setDate(todayKarachi());
    onSaved();
  }

  return (
    <form className="billing-add-form" onSubmit={handleAdd}>
      {error && <div className="error-text">{error}</div>}
      <div className="billing-add-row">
        <select className="billing-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="general">General</option>
          <option value="salary">Salary</option>
          <option value="utility">Utility Bills</option>
          <option value="miscellaneous">Miscellaneous</option>
          <option value="doctors_share">Doctor's Share</option>
          <option value="lab">Lab</option>
          <option value="material">Material</option>
        </select>
        <input
          type="text"
          className="billing-select"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="number"
          className="billing-select"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="1"
        />
        <input
          type="date"
          className="billing-select"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Adding…' : '+ Add Expense'}
        </button>
      </div>
    </form>
  );
}

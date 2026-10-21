import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function PatientDrawer({ patient, onClose, onSaved }) {
  const isEdit = Boolean(patient);
  const [name, setName] = useState(patient?.name || '');
  const [phone, setPhone] = useState(patient?.phone || '');
  const [address, setAddress] = useState(patient?.address || '');
  const [gender, setGender] = useState(patient?.gender || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      gender: gender || null,
    };
    const { error } = isEdit
      ? await supabase.from('patients').update(payload).eq('id', patient.id)
      : await supabase.from('patients').insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 199 }}
        onClick={onClose}
      />
      <aside className="drawer">
        <div className="drawer-inner">
          <h2 className="drawer-title">{isEdit ? 'Edit Patient' : 'New Patient'}</h2>
          <form className="drawer-content" onSubmit={handleSave} id="patient-drawer-form">
            {error && <div className="error-text">{error}</div>}
            <div className="form-field">
              <label>Full Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </form>
          <div className="drawer-actions">
            <button type="submit" form="patient-drawer-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </div>
      </aside>
    </>
  );
}

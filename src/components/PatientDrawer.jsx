import { useEffect, useState } from 'react';
import { supabase, fetchAllRows } from '../lib/supabaseClient';

function distinctValues(rows, field) {
  const seen = new Set();
  for (const r of rows) {
    const v = r[field]?.trim();
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export default function PatientDrawer({ patient, onClose, onSaved }) {
  const isEdit = Boolean(patient);
  const [name, setName] = useState(patient?.name || '');
  const [phone, setPhone] = useState(patient?.phone || '');
  const [address, setAddress] = useState(patient?.address || '');
  const [gender, setGender] = useState(patient?.gender || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Areas repeat across patients and families share a phone, so offer
  // existing values as suggestions. Still free text, not a locked dropdown.
  const [phoneSuggestions, setPhoneSuggestions] = useState([]);
  const [addressSuggestions, setAddressSuggestions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchAllRows(() =>
        supabase.from('patients').select('phone, address').or('phone.not.is.null,address.not.is.null').order('id')
      );
      if (error) console.error(error);
      if (cancelled) return;
      setPhoneSuggestions(distinctValues(data || [], 'phone'));
      setAddressSuggestions(distinctValues(data || [], 'address'));
    })();
    return () => { cancelled = true; };
  }, []);

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
    const { data, error } = isEdit
      ? await supabase.from('patients').update(payload).eq('id', patient.id)
      : await supabase.from('patients').insert(payload).select().single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    // On create, hand the newly inserted row (with its DB-assigned mr_no)
    // back to the caller so flows like PatientPicker's "+ New Patient" can
    // select it immediately. Callers that don't need it just ignore the arg.
    onSaved(data);
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
              <input type="text" list="patient-phone-suggestions" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <datalist id="patient-phone-suggestions">
                {phoneSuggestions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="form-field">
              <label>Address</label>
              <input type="text" list="patient-address-suggestions" value={address} onChange={(e) => setAddress(e.target.value)} />
              <datalist id="patient-address-suggestions">
                {addressSuggestions.map((v) => <option key={v} value={v} />)}
              </datalist>
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

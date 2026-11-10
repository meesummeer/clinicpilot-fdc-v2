import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import PatientDrawer from './PatientDrawer';

// Searchable patient select by MR number, name, phone, or UID. Used by Billings'
// "+ Add Invoice" flow, which (unlike the per-patient Billing tab) has no
// patient already in context.
export default function PatientPicker({ onSelect, autoFocus = true }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addingPatient, setAddingPatient] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await fetchAllRows(() =>
        supabase.from('patients').select('id, mr_no, name, phone, uid').order('name')
      );
      if (error) console.error(error);
      setPatients(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const qUid = q.replace(/^fdc[\s:-]*/, '').replace(/[\s-]/g, '');
    return patients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone || '').toLowerCase().includes(q) ||
          String(p.mr_no).includes(q) ||
          (qUid.length >= 4 && (p.uid || '').toLowerCase().includes(qUid))
      )
      .slice(0, 20);
  }, [patients, search]);

  return (
    <div className="patient-picker">
      <input
        type="text"
        className="search-wide"
        placeholder="Search by MR number, name, phone, or UID…"
        autoComplete="off"
        autoFocus={autoFocus}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading && <p className="patientSmall">Loading patients…</p>}
      {!loading && search.trim() && filtered.length === 0 && (
        <div className="empty-state">
          No matching patients.
          <div className="empty-state-action">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setAddingPatient(true)}>
              + New Patient
            </button>
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="patient-picker-list">
          {filtered.map((p) => (
            <button type="button" key={p.id} className="patient-row" onClick={() => onSelect(p)}>
              <span className="patient-row__badge">#{p.mr_no}</span>
              <span className="patient-row__main">
                <span className="patient-row__name">{p.name}</span>
                <div className="patient-row__phone">{p.phone || 'No phone on file'}</div>
              </span>
              <span className="patient-row__chevron">›</span>
            </button>
          ))}
        </div>
      )}

      {addingPatient && (
        <PatientDrawer
          patient={null}
          onClose={() => setAddingPatient(false)}
          onSaved={(newPatient) => {
            setAddingPatient(false);
            if (newPatient) onSelect(newPatient);
          }}
        />
      )}
    </div>
  );
}

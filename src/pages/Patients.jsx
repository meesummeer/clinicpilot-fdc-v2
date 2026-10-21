import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import PatientDrawer from '../components/PatientDrawer';

export default function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newestFirst, setNewestFirst] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() =>
      supabase.from('patients').select('*').order('mr_no')
    );
    if (error) console.error(error);
    setPatients(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = patients;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone || '').toLowerCase().includes(q) ||
          String(p.mr_no).includes(q)
      );
    }
    list = [...list];
    if (newestFirst) list.sort((a, b) => b.mr_no - a.mr_no);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [patients, search, newestFirst]);

  return (
    <section id="patientsSection" className="pane active">
      <div id="patientBrowse">
        <div className="pane-head patients-toolbar">
          <input
            type="text"
            className="search-wide"
            placeholder="Search by name, phone, or MR number…"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="sort-toggle">
            <input type="checkbox" checked={newestFirst} onChange={(e) => setNewestFirst(e.target.checked)} />
            Newest first
          </label>
          <button type="button" className="btn btn-primary" onClick={() => setDrawerOpen(true)}>+ New Patient</button>
        </div>
        <div className="patient-list">
          {loading && <p className="patientSmall">Loading…</p>}
          {!loading && filtered.length === 0 && <div className="empty-state">No patients found.</div>}
          {filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              className="patient-row"
              onClick={() => navigate(`/patients/${p.id}`)}
            >
              <span className="patient-row__badge">#{p.mr_no}</span>
              <span className="patient-row__main">
                <span className="patient-row__name">{p.name}</span>
                <div className="patient-row__phone">{p.phone || 'No phone on file'}</div>
              </span>
              <span className="patient-row__chevron">›</span>
            </button>
          ))}
        </div>
      </div>

      {drawerOpen && (
        <PatientDrawer
          patient={null}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => { setDrawerOpen(false); load(); }}
        />
      )}
    </section>
  );
}

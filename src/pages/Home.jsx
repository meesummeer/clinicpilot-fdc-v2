import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import { formatDate } from '../lib/format';
import { PROCEDURE_SUGGESTIONS } from '../lib/procedures';

const STATUS_COLOR_CLASS = {
  scheduled: 'status-yellow',
  in_progress: 'status-blue',
  fulfilled: 'status-green',
  cancelled: 'status-red',
};

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });
const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' });
const DAY_LABELS =['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function karachiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return { y: Number(y), m: Number(m), d: Number(d) };
}

export default function Home({ profile }) {
  const today = karachiToday();
  const [cursor, setCursor] = useState({ y: today.y, m: today.m }); // 1-indexed month
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAppt, setModalAppt] = useState(null); // null = closed, {} = new, object = editing

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.y, cursor.m]);

  useEffect(() => {
    fetchAllRows(() => supabase.from('patients').select('id, name, mr_no').order('mr_no')).then(({ data }) => {
      setPatients(data || []);
    });
  }, []);

  async function loadMonth() {
    setLoading(true);
    const start = new Date(`${cursor.y}-${String(cursor.m).padStart(2, '0')}-01T00:00:00+05:00`);
    const nextM = cursor.m === 12 ? 1 : cursor.m + 1;
    const nextY = cursor.m === 12 ? cursor.y + 1 : cursor.y;
    const end = new Date(`${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00+05:00`);
    const { data, error } = await fetchAllRows(() =>
      supabase
        .from('appointments')
        .select('*, patients(name, mr_no)')
        .gte('scheduled_at', start.toISOString())
        .lt('scheduled_at', end.toISOString())
        .order('scheduled_at')
    );
    if (error) console.error(error);
    setAppointments(data || []);
    setLoading(false);
  }

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m - 1, 1));
    const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
    const leadingBlanks = first.getUTCDay();
    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [cursor.y, cursor.m]);

  const apptsByDay = useMemo(() => {
    const map = new Map();
    for (const a of appointments) {
      const karachiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', day: '2-digit' }).format(new Date(a.scheduled_at));
      const day = Number(karachiDate);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(a);
    }
    return map;
  }, [appointments]);

  function changeMonth(delta) {
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCursor({ y, m });
  }

  return (
    <section className="pane active">
      <div className="card">
        <div className="pane-head">
          <div className="monthNav">
            <button type="button" className="btn btn-ghost" onClick={() => changeMonth(-1)}>◀</button>
            <h2 className="month-title">{MONTH_FMT.format(new Date(Date.UTC(cursor.y, cursor.m - 1, 1)))}</h2>
            <button type="button" className="btn btn-ghost" onClick={() => changeMonth(1)}>▶</button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModalAppt({})}>+ Add Appointment</button>
        </div>
        <div className="legend">
          <span className="legend-pill lg-yellow">Scheduled</span>
          <span className="legend-pill lg-blue">In Progress</span>
          <span className="legend-pill lg-green">Fulfilled</span>
          <span className="legend-pill lg-red">Cancelled</span>
        </div>
      </div>
      <div className="card cal-wrap">
        <div className="dayLabels">
          {DAY_LABELS.map((d) => <div key={d} className="day">{d}</div>)}
        </div>
        <div className="calGrid">
          {grid.map((day, idx) =>
            day === null ? (
              <div key={`b${idx}`} className="cell empty" />
            ) : (
              <div key={day} className="cell">
                <div className="date">{day}</div>
                {(apptsByDay.get(day) || []).map((a) => (
                  <div
                    key={a.id}
                    className={`appt ${STATUS_COLOR_CLASS[a.status] || 'status-yellow'}`}
                    onClick={() => setModalAppt(a)}
                    title={`${a.patients?.name || 'Unknown'} — ${a.procedure || ''}`}
                  >
                    {a.patients?.name || 'Unknown'} — {TIME_FMT.format(new Date(a.scheduled_at))}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
        {loading && <p className="patientSmall" style={{ marginTop: 10 }}>Loading…</p>}
      </div>

      {modalAppt && (
        <ApptModal
          appt={modalAppt}
          patients={patients}
          profile={profile}
          onClose={() => setModalAppt(null)}
          onSaved={() => { setModalAppt(null); loadMonth(); }}
        />
      )}
    </section>
  );
}

function ApptModal({ appt, patients, profile, onClose, onSaved }) {
  const isEdit = Boolean(appt.id);
  const initialDate = appt.scheduled_at
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(appt.scheduled_at))
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const initialTime = appt.scheduled_at
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(appt.scheduled_at))
    : '09:00';

  const [patientQuery, setPatientQuery] = useState(appt.patients?.name || '');
  const [patientId, setPatientId] = useState(appt.patient_id || '');
  const [procedure, setProcedure] = useState(appt.procedure || '');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [status, setStatus] = useState(appt.status || 'scheduled');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const matches = patientQuery.trim().length > 0
    ? patients.filter((p) =>
        p.name.toLowerCase().includes(patientQuery.toLowerCase()) || String(p.mr_no).includes(patientQuery)
      ).slice(0, 8)
    : [];

  async function handleSave(e) {
    e.preventDefault();
    if (!patientId) { setError('Pick a patient from the list.'); return; }
    setSaving(true);
    setError('');
    const scheduled_at = `${date}T${time}:00+05:00`;
    const payload = { patient_id: patientId, procedure: procedure || null, scheduled_at, status };
    const { error } = isEdit
      ? await supabase.from('appointments').update(payload).eq('id', appt.id)
      : await supabase.from('appointments').insert({ ...payload, created_by: profile?.id });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  async function handleDelete() {
    if (!window.confirm('Delete this appointment?')) return;
    setSaving(true);
    const { error } = await supabase.from('appointments').delete().eq('id', appt.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="modal modal--appt" onClick={onClose}>
      <div className="modal-content modal-content--appt" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-card-title">{isEdit ? 'Edit Appointment' : 'New Appointment'}</h2>
        {error && <div className="error-text">{error}</div>}
        <form className="modal-form-stack" onSubmit={handleSave}>
          <div style={{ position: 'relative' }}>
            <label>Patient</label>
            <input
              type="text"
              value={patientQuery}
              placeholder="Search by name or MR number…"
              onChange={(e) => { setPatientQuery(e.target.value); setPatientId(''); }}
              autoComplete="off"
            />
            {matches.length > 0 && !patientId && (
              <div className="card" style={{ position: 'absolute', zIndex: 10, width: '100%', maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                {matches.map((p) => (
                  <div
                    key={p.id}
                    className="patient-row"
                    style={{ marginBottom: 4 }}
                    onClick={() => { setPatientId(p.id); setPatientQuery(`${p.name} (MR #${p.mr_no})`); }}
                  >
                    <span className="patient-row__badge">#{p.mr_no}</span>
                    <span className="patient-row__main"><span className="patient-row__name">{p.name}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label>
            Procedure
            <input type="text" list="appt-procedure-suggestions" value={procedure} onChange={(e) => setProcedure(e.target.value)} />
            <datalist id="appt-procedure-suggestions">
              {PROCEDURE_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
            </datalist>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <div className="modal-actions-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            {isEdit && <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>Delete</button>}
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

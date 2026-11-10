import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QrScanner from '../components/QrScanner';
import { lockPortal } from '../lib/portal';
import PatientPicker from '../components/PatientPicker';
import { PROCEDURE_SUGGESTIONS } from '../lib/procedures';
import { formatDuration, formatTime, karachiDayRange, todayKarachi } from '../lib/format';
import {
  checkInPatient,
  checkOutVisit,
  describeVisitsError,
  fetchClosedToday,
  fetchOpenVisits,
  fetchTodayAppointments,
  findPatient,
  parsePatientCode,
  stars,
} from '../lib/visits';

const POLL_MS = 30000;
const RESCAN_COOLDOWN_MS = 5000;
const PREF_KEY = 'fdc.checkin.scanner';
const QUICK_REASONS = PROCEDURE_SUGGESTIONS.slice(0, 6);

function readPref() {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writePref(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // preference is a convenience only
  }
}

let audioCtx = null;
function feedback(ok) {
  try {
    navigator.vibrate?.(ok ? 60 : [40, 60, 40]);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    audioCtx.resume?.();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (ok ? 0.12 : 0.25));
  } catch {
    // sound and vibration are best-effort
  }
}

function CheckInPanel({ patient, onClose, onDone, onAlreadyIn }) {
  const [appointments, setAppointments] = useState([]);
  const [apptId, setApptId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetchTodayAppointments(patient.id).then(({ data }) => {
      if (!live || !data?.length) return;
      setAppointments(data);
      if (data.length === 1) {
        setApptId(data[0].id);
        setReason(data[0].procedure || '');
      }
    });
    return () => {
      live = false;
    };
  }, [patient.id]);

  function pickAppointment(a) {
    setApptId(a.id);
    setReason(a.procedure || '');
  }

  function pickQuick(text) {
    setApptId('');
    setReason(text);
  }

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError('');
    const res = await checkInPatient({ patientId: patient.id, reason, appointmentId: apptId });
    setBusy(false);
    if (res.duplicate) {
      onAlreadyIn(patient);
      return;
    }
    if (res.error) {
      setError(res.error);
      return;
    }
    onDone(res.visit);
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Check in">
      <form className="modal-content checkin-panel" onSubmit={submit}>
        <h2 className="checkin-panel__title">Check in</h2>
        <p className="checkin-panel__who">
          <strong>{patient.name}</strong>
          <span className="checkin-muted"> · MR #{patient.mr_no}{patient.phone ? ` · ${patient.phone}` : ''}</span>
        </p>

        {appointments.length > 0 && (
          <div className="form-field">
            <label>Booked for today</label>
            <div className="checkin-chips">
              {appointments.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={'checkin-chip' + (apptId === a.id ? ' on' : '')}
                  onClick={() => pickAppointment(a)}
                >
                  {a.procedure || 'Appointment'} · {formatTime(a.scheduled_at)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-field">
          <label htmlFor="checkin-reason">What are they here for?</label>
          <input
            id="checkin-reason"
            type="text"
            autoComplete="off"
            placeholder="e.g. Filling, check-up, pain in lower left tooth"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setApptId('');
            }}
          />
          <div className="checkin-chips" style={{ marginTop: 8 }}>
            {QUICK_REASONS.map((r) => (
              <button
                type="button"
                key={r}
                className={'checkin-chip' + (!apptId && reason === r ? ' on' : '')}
                onClick={() => pickQuick(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <p className="checkin-muted checkin-hint">The check-in time is recorded automatically when you tap Check in.</p>
        {error && <p className="form-error">{error}</p>}

        <div className="checkin-panel__actions">
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={!reason.trim() || busy}>
            {busy ? 'Checking in…' : 'Check in'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CheckOutPanel({ visit, now, onClose, onDone, onAlreadyOut }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mins = formatDuration(now - new Date(visit.checked_in_at).getTime());

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await checkOutVisit(visit.id, { rating, comment });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.already) {
      onAlreadyOut(visit);
      return;
    }
    onDone(res.visit);
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Check out">
      <form className="modal-content checkin-panel" onSubmit={submit}>
        <h2 className="checkin-panel__title">Check out</h2>
        <p className="checkin-panel__who">
          <strong>{visit.patients?.name}</strong>
          <span className="checkin-muted"> · MR #{visit.patients?.mr_no}</span>
        </p>
        <p className="checkin-muted">
          {visit.reason} · in at {formatTime(visit.checked_in_at)} ({mins} so far)
        </p>

        <div className="form-field">
          <label>How was your visit today? (optional)</label>
          <div className="checkin-stars" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className={'checkin-star' + (n <= rating ? ' on' : '')}
                onClick={() => setRating(rating === n ? 0 : n)}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="checkin-comment">Anything we could do better? (optional)</label>
          <textarea id="checkin-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="checkin-panel__actions">
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Checking out…' : 'Check out'}
          </button>
        </div>
      </form>
    </div>
  );
}

// In the Portal window names are plain text, so nobody is one tap from a
// patient's billing page.
function PatientName({ visit, link }) {
  const name = visit.patients?.name;
  if (!link) return <span className="checkin-visit__name">{name}</span>;
  return <Link to={`/patients/${visit.patient_id}`} className="checkin-visit__name">{name}</Link>;
}

export default function CheckIn({ portal = false }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState([]);
  const [closed, setClosed] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [scanOn, setScanOn] = useState(readPref);
  const [facing, setFacing] = useState('environment');
  const [camError, setCamError] = useState('');
  const [looking, setLooking] = useState(false);
  const [notice, setNotice] = useState(null);
  const [panel, setPanel] = useState(null);
  const [pickerKey, setPickerKey] = useState(0);

  const openRef = useRef([]);
  const panelRef = useRef(null);
  const lookingRef = useRef(false);
  const lastScan = useRef({ code: '', at: 0 });
  const noticeTimer = useRef(0);

  openRef.current = open;
  panelRef.current = panel;

  // Showing the Portal locks this tab to it until the staff PIN is entered.
  useEffect(() => {
    if (portal) lockPortal();
  }, [portal]);

  const load = useCallback(async () => {
    const [o, c] = await Promise.all([fetchOpenVisits(), fetchClosedToday()]);
    const err = o.error || c.error;
    if (err) {
      setLoadError(describeVisitsError(err));
    } else {
      setLoadError('');
      setOpen(o.data || []);
      setClosed(c.data || []);
    }
    setNow(Date.now());
    setLoaded(true);
    return o.error ? null : o.data || [];
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Keep the tablet screen awake while the scanner is running.
  useEffect(() => {
    if (!scanOn || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let gone = false;
    const grab = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (gone) lock.release?.();
      } catch {
        // not allowed right now (low battery, background tab)
      }
    };
    grab();
    const onVisible = () => document.visibilityState === 'visible' && grab();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch(() => {});
    };
  }, [scanOn]);

  function say(kind, text) {
    clearTimeout(noticeTimer.current);
    setNotice({ kind, text });
    if (kind !== 'err') noticeTimer.current = setTimeout(() => setNotice(null), 7000);
  }

  function closePanel() {
    // Holding the same QR in front of the camera must not instantly reopen it.
    lastScan.current = { ...lastScan.current, at: Date.now() };
    setPanel(null);
  }

  async function openForPatient(patient) {
    const fresh = await load();
    const list = fresh || openRef.current;
    const existing = list.find((v) => v.patient_id === patient.id);
    if (existing) setPanel({ type: 'out', visit: existing });
    else setPanel({ type: 'in', patient });
  }

  const handleCode = useCallback(async (raw) => {
    if (panelRef.current || lookingRef.current) return;
    const t = Date.now();
    if (lastScan.current.code === raw && t - lastScan.current.at < RESCAN_COOLDOWN_MS) return;
    lastScan.current = { code: raw, at: t };
    lookingRef.current = true;
    setLooking(true);
    setNotice(null);
    try {
      const parsed = parsePatientCode(raw);
      if (!parsed) {
        feedback(false);
        say('warn', "That QR code isn't a ClinicPilot patient code.");
        return;
      }
      const { patient, error } = await findPatient(parsed);
      if (!patient) {
        feedback(false);
        say(
          error === 'not_found' ? 'warn' : 'err',
          error === 'not_found' ? 'No patient found for that QR code.' : `Could not look up the patient: ${error}`
        );
        return;
      }
      feedback(true);
      await openForPatient(patient);
    } finally {
      lookingRef.current = false;
      setLooking(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link from a patient's profile: /portal?patient=<id>
  const wanted = params.get('patient');
  useEffect(() => {
    if (!wanted || !loaded) return;
    setParams({}, { replace: true });
    (async () => {
      const { patient, error } = await findPatient({ id: wanted });
      if (patient) openForPatient(patient);
      else say('warn', error === 'not_found' ? 'Patient not found.' : `Could not look up the patient: ${error}`);
    })();
  }, [wanted, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleScanner() {
    const next = !scanOn;
    setScanOn(next);
    writePref(next);
    setCamError('');
  }

  function onPicked(p) {
    setPickerKey((k) => k + 1);
    openForPatient(p);
  }

  function checkedIn(visit) {
    closePanel();
    say('ok', `${visit.patients?.name} checked in at ${formatTime(visit.checked_in_at)}.`);
    load();
  }

  function checkedOut(visit) {
    closePanel();
    const rated = visit.feedback_rating ? ` Rated ${visit.feedback_rating}/5.` : '';
    say('ok', `${visit.patients?.name} checked out at ${formatTime(visit.checked_out_at)}.${rated}`);
    load();
  }

  async function alreadyIn(patient) {
    // Another device checked them in a moment ago: show that visit for check-out.
    const fresh = await load();
    const existing = (fresh || []).find((v) => v.patient_id === patient.id);
    if (existing) {
      say('warn', `${patient.name} is already checked in.`);
      setPanel({ type: 'out', visit: existing });
    } else {
      closePanel();
    }
  }

  function alreadyOut(visit) {
    closePanel();
    say('warn', `${visit.patients?.name} was already checked out.`);
    load();
  }

  const [dayStart] = karachiDayRange(todayKarachi());
  const staleCutoff = new Date(dayStart).getTime();
  const rated = closed.filter((v) => v.feedback_rating);
  const avg = rated.length ? (rated.reduce((s, v) => s + v.feedback_rating, 0) / rated.length).toFixed(1) : null;

  return (
    <div className="checkin">
      {notice && (
        <div className={`checkin-notice checkin-notice--${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {loadError && <div className="checkin-notice checkin-notice--err" role="alert">{loadError}</div>}

      <div className="checkin-grid">
        <section className="card checkin-col">
          <div className="pane-head">
            <h2 className="checkin-h">Scan patient QR</h2>
            <div className="checkin-head-actions">
              {scanOn && (
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                >
                  Flip camera
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-small" onClick={toggleScanner}>
                {scanOn ? 'Stop scanner' : 'Start scanner'}
              </button>
            </div>
          </div>

          {scanOn && !camError ? (
            <QrScanner facing={facing} paused={Boolean(panel) || looking} onCode={handleCode} onError={setCamError} />
          ) : (
            <div className="checkin-scanner checkin-scanner--off">
              <p>{camError || 'Scanner is off.'}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setCamError('');
                  setScanOn(true);
                  writePref(true);
                }}
              >
                Start scanner
              </button>
            </div>
          )}
          <p className="checkin-muted checkin-hint">
            {looking ? 'Looking up patient…' : 'Hold the patient’s QR code inside the frame. Scanning someone who is already in the clinic checks them out.'}
          </p>

          <h3 className="checkin-h2">Or find a patient</h3>
          <PatientPicker key={pickerKey} onSelect={onPicked} autoFocus={false} />
        </section>

        <section className="checkin-col">
          <div className="card">
            <div className="pane-head">
              <h2 className="checkin-h">In clinic now ({open.length})</h2>
            </div>
            {!loaded && <div className="empty-state">Loading…</div>}
            {loaded && open.length === 0 && !loadError && <div className="empty-state">Nobody checked in.</div>}
            {open.map((v) => {
              const stale = new Date(v.checked_in_at).getTime() < staleCutoff;
              return (
                <div className="checkin-visit" key={v.id}>
                  <div className="checkin-visit__main">
                    <PatientName visit={v} link={!portal} />
                    <div className="checkin-muted">
                      #{v.patients?.mr_no} · {v.reason}
                    </div>
                    <div className="checkin-muted">
                      in at {formatTime(v.checked_in_at)} · {formatDuration(now - new Date(v.checked_in_at).getTime())}
                      {stale && <span className="checkin-badge"> Since yesterday</span>}
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => setPanel({ type: 'out', visit: v })}>
                    Check out
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="pane-head">
              <h2 className="checkin-h">Checked out today ({closed.length})</h2>
              {avg && <span className="checkin-muted">Average rating {avg} / 5</span>}
            </div>
            {loaded && closed.length === 0 && !loadError && <div className="empty-state">No check-outs yet today.</div>}
            {closed.map((v) => (
              <div className="checkin-visit" key={v.id}>
                <div className="checkin-visit__main">
                  <PatientName visit={v} link={!portal} />
                  <div className="checkin-muted">
                    #{v.patients?.mr_no} · {v.reason}
                  </div>
                  <div className="checkin-muted">
                    {formatTime(v.checked_in_at)} → {formatTime(v.checked_out_at)} ·{' '}
                    {formatDuration(new Date(v.checked_out_at) - new Date(v.checked_in_at))}
                  </div>
                  {v.feedback_comment && <div className="checkin-comment">“{v.feedback_comment}”</div>}
                </div>
                {v.feedback_rating && <span className="checkin-rating" aria-label={`${v.feedback_rating} out of 5`}>{stars(v.feedback_rating)}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {panel?.type === 'in' && (
        <CheckInPanel patient={panel.patient} onClose={closePanel} onDone={checkedIn} onAlreadyIn={alreadyIn} />
      )}
      {panel?.type === 'out' && (
        <CheckOutPanel visit={panel.visit} now={now} onClose={closePanel} onDone={checkedOut} onAlreadyOut={alreadyOut} />
      )}
    </div>
  );
}

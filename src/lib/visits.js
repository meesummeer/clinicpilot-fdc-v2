import { supabase, fetchAllRows } from './supabaseClient';
import { karachiDayRange, todayKarachi } from './format';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Same 32-character alphabet as supabase/05_patient_uid.sql (no I, O, 0, 1).
const UID_RE = /^(FDC[\s:-]*)?([2-9A-HJ-NP-Z]{4})[\s-]?([2-9A-HJ-NP-Z]{4})$/i;

// Turns whatever a patient's QR code contains into a patient lookup key.
// The patient QR cards carry "FDC-K7Q2-9XMD" (the patient's UID); also
// accepted: the UID typed without the prefix or dash, "FDC:25123", "MR#25123"
// or a bare "25123" (MR number), a bare patient id (uuid), or a link
// containing a patient id such as ".../patients/<uuid>". Anything else
// returns null. Change the QR format by editing this one function.
export function parsePatientCode(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const uuid = text.match(UUID_RE);
  if (uuid) return { id: uuid[0].toLowerCase() };
  const u = text.match(UID_RE);
  // A bare run of digits with no FDC prefix is an MR number, not a UID.
  if (u && (u[1] || /[A-Z]/i.test(u[2] + u[3]))) return { uid: (u[2] + u[3]).toUpperCase() };
  const mr = text.match(/^(?:FDC|MR)?[\s:#-]*(\d{3,9})$/i);
  if (mr) return { mrNo: Number(mr[1]) };
  return null;
}

export function stars(n) {
  const r = Math.max(0, Math.min(5, Number(n) || 0));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

const VISIT_SELECT = '*, patients(id, name, mr_no, phone)';

// The visits table comes from supabase/04_visits.sql. Until that has been run
// the API says it cannot find the table; surface that as a readable message.
export function describeVisitsError(error) {
  if (!error) return '';
  const msg = error.message || String(error);
  if (/visits/i.test(msg) && /(schema cache|does not exist|not find)/i.test(msg)) {
    return 'The visits table is missing. Run supabase/04_visits.sql in the Supabase SQL Editor.';
  }
  return msg;
}

export async function findPatient(parsed) {
  if (!parsed) return { patient: null, error: 'unrecognised' };
  const base = supabase.from('patients').select('id, mr_no, name, phone, address, gender');
  const query = parsed.id ? base.eq('id', parsed.id) : parsed.uid ? base.eq('uid', parsed.uid) : base.eq('mr_no', parsed.mrNo);
  const { data, error } = await query.maybeSingle();
  if (error) return { patient: null, error: error.message };
  return { patient: data, error: data ? null : 'not_found' };
}

export function fetchOpenVisits() {
  return supabase.from('visits').select(VISIT_SELECT).is('checked_out_at', null).order('checked_in_at', { ascending: true });
}

export function fetchClosedToday() {
  const [start, end] = karachiDayRange(todayKarachi());
  return supabase
    .from('visits')
    .select(VISIT_SELECT)
    .gte('checked_out_at', start)
    .lt('checked_out_at', end)
    .order('checked_out_at', { ascending: false });
}

// Today's still-to-happen appointments for one patient, so the reason for
// the visit can be filled in with one tap.
export function fetchTodayAppointments(patientId) {
  const [start, end] = karachiDayRange(todayKarachi());
  return supabase
    .from('appointments')
    .select('id, procedure, scheduled_at, status')
    .eq('patient_id', patientId)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .in('status', ['scheduled', 'in_progress'])
    .order('scheduled_at');
}

// The database stamps the real check-in time. A second open visit for the
// same patient is rejected by a unique index; that comes back as duplicate.
export async function checkInPatient({ patientId, reason, appointmentId }) {
  const { data, error } = await supabase
    .from('visits')
    .insert({ patient_id: patientId, reason: reason.trim(), appointment_id: appointmentId || null })
    .select(VISIT_SELECT)
    .single();
  if (error) return { visit: null, duplicate: error.code === '23505', error: describeVisitsError(error) };
  return { visit: data, duplicate: false, error: null };
}

// The database overrides the time we send with its own clock. The is-null
// guard means a visit already closed from another device is left untouched.
export async function checkOutVisit(visitId, { rating, comment }) {
  const { data, error } = await supabase
    .from('visits')
    .update({
      checked_out_at: new Date().toISOString(),
      feedback_rating: rating || null,
      feedback_comment: (comment || '').trim() || null,
    })
    .eq('id', visitId)
    .is('checked_out_at', null)
    .select(VISIT_SELECT)
    .maybeSingle();
  if (error) return { visit: null, already: false, error: describeVisitsError(error) };
  return { visit: data, already: !data, error: null };
}

// Pure: numbers for the Home strip from today's visits and the still-open ones.
// "Visits today" = checked in today; the rating average covers those same
// visits (a rating is only given at check-out).
export function summariseToday(todayRows, openRows) {
  const rated = todayRows.filter((v) => v.feedback_rating);
  const sum = rated.reduce((s, v) => s + v.feedback_rating, 0);
  return {
    visitsToday: todayRows.length,
    inClinic: openRows.length,
    ratedCount: rated.length,
    avgRating: rated.length ? sum / rated.length : null,
  };
}

// Returns { stats } or { error }. Never throws, so Home still loads without it.
export async function fetchTodayStats() {
  const [start, end] = karachiDayRange(todayKarachi());
  const [today, open] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('visits')
        .select('id, feedback_rating')
        .gte('checked_in_at', start)
        .lt('checked_in_at', end)
        .order('id')
    ),
    fetchAllRows(() => supabase.from('visits').select('id').is('checked_out_at', null).order('id')),
  ]);
  const err = today.error || open.error;
  if (err) return { error: describeVisitsError(err) };
  return { stats: summariseToday(today.data || [], open.data || []) };
}

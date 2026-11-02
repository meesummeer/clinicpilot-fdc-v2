import { supabase, fetchAllRows } from './supabaseClient';

// URL of the deployed Google Apps Script web app that saves snapshots to
// Google Drive (see backup/README.md). Not a secret: the script only acts on
// a valid admin Supabase login token. Leave empty until the script is deployed;
// the Settings page then falls back to a plain file download.
export const BACKUP_ENDPOINT = '';

// Every table, so a snapshot is a complete restore source. All have a uuid
// primary key `id`, which gives fetchAllRows the deterministic order it needs.
export const BACKUP_TABLES = [
  'patients',
  'invoices',
  'payments',
  'appointments',
  'expenses',
  'patient_notes',
  'staff_profiles',
  'audit_log',
];

// Karachi wall-clock stamp for filenames: 2026-11-02_1805.
function stampKarachi() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}`;
}

export function backupFilename() {
  return `clinicpilot-fdc-backup-${stampKarachi()}.json`;
}

// Reads every row of every table. Throws on the first failed table so a
// partial snapshot is never saved as if it were complete.
export async function buildSnapshot() {
  const results = await Promise.all(
    BACKUP_TABLES.map((t) => fetchAllRows(() => supabase.from(t).select('*').order('id')))
  );
  const snapshot = { exported_at: new Date().toISOString() };
  const counts = {};
  BACKUP_TABLES.forEach((t, i) => {
    if (results[i].error) throw new Error(`${t}: ${results[i].error.message}`);
    snapshot[t] = results[i].data;
    counts[t] = results[i].data.length;
  });
  return { snapshot, counts };
}

export function downloadSnapshot(snapshot, filename = backupFilename()) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// text/plain keeps this a "simple" CORS request (no preflight), which Apps
// Script web apps cannot answer. The token goes in the body, never the URL.
async function callEndpoint(payload) {
  if (!BACKUP_ENDPOINT) throw new Error('Drive backup is not set up yet.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session expired. Sign in again and retry.');

  const res = await fetch(BACKUP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, ...payload }),
  });
  if (!res.ok) throw new Error(`Backup server returned ${res.status}.`);
  let out;
  try {
    out = await res.json();
  } catch {
    throw new Error('Backup server sent an unreadable reply. Check the script deployment.');
  }
  if (!out.ok) throw new Error(out.error || 'Backup server rejected the request.');
  return out;
}

// Saves the snapshot to Drive and checks the script's read-back row counts
// against what we sent. Returns { filename, size, counts, verified, mismatches }.
export async function uploadSnapshot(snapshot, counts, filename = backupFilename()) {
  const out = await callEndpoint({ action: 'save', filename, snapshot });
  const saved = out.counts || {};
  const mismatches = BACKUP_TABLES.filter((t) => saved[t] !== counts[t]);
  return { filename: out.filename || filename, size: out.size, counts: saved, verified: mismatches.length === 0, mismatches };
}

// Most recent backup files in the Drive folder, newest first.
export async function listBackups() {
  const out = await callEndpoint({ action: 'list' });
  return out.files || [];
}

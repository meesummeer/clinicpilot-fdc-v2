import { supabase, fetchAllRows } from './supabaseClient';

// Base URL of the deployed Cloudflare Worker that stores snapshots in R2
// (see backup/README.md), e.g. 'https://fdc-backup.<account>.workers.dev'.
// Not a secret: the Worker only acts on a valid admin Supabase login token.
// Leave empty until the Worker is deployed; Back Up Now then falls back to a
// plain file download.
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

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// The login token goes in the Authorization header, never the URL.
async function callWorker(path, init = {}) {
  if (!BACKUP_ENDPOINT) throw new Error('Cloud backup is not set up yet.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session expired. Sign in again and retry.');

  const res = await fetch(BACKUP_ENDPOINT.replace(/\/+$/, '') + path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  let out = null;
  try {
    out = await res.json();
  } catch {
    // fall through to the generic error below
  }
  if (!res.ok || !out?.ok) throw new Error(out?.error || `Backup server returned ${res.status}.`);
  return out;
}

// Sends the snapshot to R2. The Worker passes our SHA-256 to R2, which
// rejects the upload unless the bytes it received hash to the same value, and
// the Worker then confirms the stored size. We double-check that size here.
// Returns { filename, size, counts, verified }.
export async function uploadSnapshot(snapshot, counts, filename = backupFilename()) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const sha256 = await sha256Hex(bytes);
  const out = await callWorker('/backups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Backup-Filename': filename,
      'X-Backup-Sha256': sha256,
      'X-Backup-Counts': JSON.stringify(counts),
    },
    body: bytes,
  });
  return { filename: out.filename || filename, size: out.size, counts, verified: out.size === bytes.byteLength };
}

// Most recent backup files in the bucket, newest first.
export async function listBackups() {
  const out = await callWorker('/backups');
  return out.files || [];
}

/**
 * ClinicPilot FDC — Google Drive backup receiver.
 *
 * Deployed as an Apps Script web app. The "Back Up Now" button in
 * ClinicPilot (Settings, admin only) POSTs a full JSON snapshot here; this
 * script checks the caller is a signed-in ClinicPilot ADMIN, saves the file
 * to a Drive folder, reads it back, and returns per-table row counts so the
 * app can confirm nothing was lost on the way.
 *
 * Setup steps: see backup/README.md.
 */

// ---- Fill these three in (see README) ----
const SUPABASE_URL = 'https://pipddzentbstvatiioqm.supabase.co';
const SUPABASE_ANON_KEY = 'PASTE_SUPABASE_ANON_KEY_HERE'; // public key, same one the app uses
const FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID_HERE';           // the part after /folders/ in the Drive URL
// -------------------------------------------

// Must match BACKUP_TABLES in src/lib/backup.js.
const TABLES = [
  'patients', 'invoices', 'payments', 'appointments',
  'expenses', 'patient_notes', 'staff_profiles', 'audit_log',
];
const LIST_LIMIT = 10;
const FILENAME_RE = /^clinicpilot-fdc-backup-\d{4}-\d{2}-\d{2}_\d{4}\.json$/;

function doGet() {
  // Open the web app URL in a browser to confirm the deployment is live.
  return json_({ ok: true, service: 'ClinicPilot FDC backup', note: 'Send backups from ClinicPilot > Settings.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!verifyAdmin_(body.token)) {
      return json_({ ok: false, error: 'Not authorised. Sign in to ClinicPilot as the admin and try again.' });
    }
    if (body.action === 'list') return json_({ ok: true, files: listFiles_() });
    if (body.action === 'save') return json_(saveSnapshot_(body));
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: 'Script error: ' + err.message });
  }
}

// Valid Supabase login AND role = admin. The role lookup runs with the
// caller's own token, so row-level security applies to it as well.
function verifyAdmin_(token) {
  if (!token || typeof token !== 'string') return false;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token };

  const who = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', { headers: headers, muteHttpExceptions: true });
  if (who.getResponseCode() !== 200) return false;
  const user = JSON.parse(who.getContentText());
  if (!user || !user.id) return false;

  const prof = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/staff_profiles?select=role&id=eq.' + encodeURIComponent(user.id),
    { headers: headers, muteHttpExceptions: true }
  );
  if (prof.getResponseCode() !== 200) return false;
  const rows = JSON.parse(prof.getContentText());
  return rows.length === 1 && rows[0].role === 'admin';
}

function saveSnapshot_(body) {
  const name = String(body.filename || '');
  if (!FILENAME_RE.test(name)) return { ok: false, error: 'Bad backup filename.' };

  const snap = body.snapshot;
  if (!snap || typeof snap !== 'object') return { ok: false, error: 'No snapshot in request.' };
  for (var i = 0; i < TABLES.length; i++) {
    if (!Array.isArray(snap[TABLES[i]])) return { ok: false, error: 'Snapshot is missing table: ' + TABLES[i] };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'Another backup is running. Try again in a minute.' };
  try {
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(name, JSON.stringify(snap), 'application/json');

    // Read the saved file back from Drive and count what is actually in it.
    var counts = {};
    try {
      const saved = JSON.parse(file.getBlob().getDataAsString());
      TABLES.forEach(function (t) { counts[t] = Array.isArray(saved[t]) ? saved[t].length : -1; });
    } catch (readErr) {
      file.setTrashed(true); // do not leave a corrupt file looking like a good backup
      return { ok: false, error: 'Saved file could not be read back, so it was discarded. Try again.' };
    }
    return { ok: true, filename: name, size: file.getSize(), counts: counts };
  } finally {
    lock.releaseLock();
  }
}

function listFiles_() {
  const it = DriveApp.getFolderById(FOLDER_ID).getFiles();
  const files = [];
  while (it.hasNext()) {
    const f = it.next();
    if (FILENAME_RE.test(f.getName())) {
      files.push({ name: f.getName(), size: f.getSize(), createdAt: f.getDateCreated().toISOString() });
    }
  }
  files.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  return files.slice(0, LIST_LIMIT);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this ONCE from the editor (Run > authorizeOnce) after filling in the
// constants. It triggers Google's permission prompt and checks both
// connections, so problems show up here instead of on the first real backup.
function authorizeOnce() {
  Logger.log('Drive folder: ' + DriveApp.getFolderById(FOLDER_ID).getName());
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/health', {
    headers: { apikey: SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  });
  Logger.log('Supabase health HTTP ' + res.getResponseCode() + ' (200 = reachable, key accepted)');
}

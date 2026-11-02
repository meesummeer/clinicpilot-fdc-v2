/**
 * ClinicPilot FDC — backup receiver (Cloudflare Worker + R2).
 *
 * The "Back Up Now" button in ClinicPilot (Settings, admin only) sends the
 * snapshot here. The Worker checks the caller is a signed-in ClinicPilot
 * ADMIN, stores the file in a private R2 bucket, and R2 itself verifies the
 * SHA-256 checksum of what arrived. The Worker never parses the JSON (the
 * free plan allows only 10 ms CPU per request), it just moves the bytes.
 *
 *   GET  /          health check (no login needed, reveals nothing sensitive)
 *   GET  /backups   newest backups, admin only
 *   POST /backups   save a backup, admin only
 *
 * Setup steps: backup/README.md.
 */

const KEY_PREFIX = 'backups/';
const FILENAME_RE = /^clinicpilot-fdc-backup-\d{4}-\d{2}-\d{2}_\d{4}\.json$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_BYTES = 50 * 1024 * 1024;
const LIST_LIMIT = 10;
const DEFAULT_ORIGINS =
  'https://clinicpilot.faseehdentalclinic.com,https://meesummeer.github.io,http://localhost:5173';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === '/' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'ClinicPilot FDC backup',
          bucket_bound: Boolean(env.BACKUPS),
          supabase_configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
        }, 200, cors);
      }
      if (url.pathname !== '/backups') return json({ ok: false, error: 'Not found.' }, 404, cors);
      if (request.method !== 'GET' && request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405, cors);
      if (!env.BACKUPS) return json({ ok: false, error: 'R2 bucket is not bound to this Worker (binding name BACKUPS).' }, 500, cors);

      const admin = await verifyAdmin(request, env);
      if (!admin) return json({ ok: false, error: 'Not authorised. Sign in to ClinicPilot as the admin and try again.' }, 401, cors);

      return request.method === 'GET' ? await listBackups(env, cors) : await saveBackup(request, env, admin, cors);
    } catch (err) {
      return json({ ok: false, error: 'Server error: ' + err.message }, 500, cors);
    }
  },
};

// Valid Supabase login AND role = admin. The role lookup uses the caller's
// own token, so row-level security applies to it too.
async function verifyAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token };

  const who = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers });
  if (!who.ok) return null;
  const user = await who.json();
  if (!user || !user.id) return null;

  const prof = await fetch(
    env.SUPABASE_URL + '/rest/v1/staff_profiles?select=role&id=eq.' + encodeURIComponent(user.id),
    { headers }
  );
  if (!prof.ok) return null;
  const rows = await prof.json();
  return rows.length === 1 && rows[0].role === 'admin' ? { id: user.id } : null;
}

async function saveBackup(request, env, admin, cors) {
  const filename = request.headers.get('X-Backup-Filename') || '';
  const sha256 = (request.headers.get('X-Backup-Sha256') || '').toLowerCase();
  if (!FILENAME_RE.test(filename)) return json({ ok: false, error: 'Bad backup filename.' }, 400, cors);
  if (!SHA256_RE.test(sha256)) return json({ ok: false, error: 'Missing or bad checksum.' }, 400, cors);

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BYTES) return json({ ok: false, error: 'Backup is too large.' }, 413, cors);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ ok: false, error: 'Empty backup.' }, 400, cors);
  if (body.byteLength > MAX_BYTES) return json({ ok: false, error: 'Backup is too large.' }, 413, cors);

  // Row counts ride along as metadata so a listing can show them later.
  let counts = request.headers.get('X-Backup-Counts') || '{}';
  if (counts.length > 1000) counts = '{}';

  const key = KEY_PREFIX + filename;
  try {
    // R2 recomputes the SHA-256 of what it received and rejects on mismatch.
    await env.BACKUPS.put(key, body, {
      sha256,
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { counts, saved_by: admin.id, saved_at: new Date().toISOString() },
    });
  } catch (err) {
    if (/sha-?256|checksum|digest/i.test(err.message)) {
      return json({ ok: false, error: 'Upload was corrupted in transit (checksum mismatch). Nothing was saved. Try again.' }, 422, cors);
    }
    throw err;
  }

  const stored = await env.BACKUPS.head(key);
  if (!stored || stored.size !== body.byteLength) {
    return json({ ok: false, error: 'Stored file does not match what was sent. Try again.' }, 500, cors);
  }
  return json({ ok: true, filename, size: stored.size }, 200, cors);
}

async function listBackups(env, cors) {
  const all = [];
  let cursor;
  let pages = 0;
  do {
    const page = await env.BACKUPS.list({ prefix: KEY_PREFIX, cursor });
    all.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
    pages += 1;
  } while (cursor && pages < 10);

  all.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
  const files = all.slice(0, LIST_LIMIT).map((o) => ({
    name: o.key.slice(KEY_PREFIX.length),
    size: o.size,
    createdAt: o.uploaded.toISOString(),
  }));
  return json({ ok: true, files }, 200, cors);
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Backup-Filename, X-Backup-Sha256, X-Backup-Counts',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

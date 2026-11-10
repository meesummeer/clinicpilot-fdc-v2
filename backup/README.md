# Cloud backup (the "Back Up Now" button)

ClinicPilot > Settings > **Back Up Now** (admin only) saves a dated JSON copy of every table to a private
**Cloudflare R2** bucket. It lives outside Supabase, so it survives a Supabase problem.

```
Browser (admin login) --> Cloudflare Worker --> R2 bucket "fdc-backups" (private)
                              |
                              +-- checks the login with Supabase and requires role = admin
```

Why a Worker in the middle: R2 access keys must never sit in browser code. The Worker holds the bucket
connection and only lets a logged-in ClinicPilot **admin** through.

Files are named `clinicpilot-fdc-backup-YYYY-MM-DD_HHMM.json` (Karachi time), stored under `backups/`.
Pressing twice in the same minute overwrites that minute's file; otherwise nothing is overwritten or
auto-deleted.

## What "verified" means

The app hashes the exact bytes it sends (SHA-256). R2 re-hashes what it received and refuses the upload if
they differ, then the Worker confirms the stored size. So a green "verified" means the file in R2 is
byte-for-byte what the app sent. It does **not** mean a restore has been tested (see Restoring).

## Cost

R2 free allowance per month: 10 GB storage, 1M Class A and 10M Class B operations, free egress. One backup
is a few MB, so a year of daily backups is a couple of GB. Expected cost: $0. The Worker runs on Cloudflare's
free plan (100,000 requests/day). R2 needs a payment method on the account to be switched on, even for the
free allowance.

## One-time setup

Needs Node (already installed for ClinicPilot development). Run the commands from the repo root.

1. **Cloudflare account.** Sign up at <https://dash.cloudflare.com/sign-up>. Prefer an account under the
   clinic's own email (Dr. Faseeh) so the clinic owns its data; add yourself as a member.
2. **Turn on R2.** Dashboard > Storage & databases > R2 > Overview > complete the checkout (free plan, card
   required).
3. **Log in the CLI.**
   ```bash
   cd backup/worker
   npx wrangler login
   ```
   A browser tab opens; approve it.
4. **Create the private bucket.**
   ```bash
   npx wrangler r2 bucket create fdc-backups --location apac
   ```
   Never enable public access or an r2.dev URL on this bucket: it holds patient data.
5. **Deploy the Worker.**
   ```bash
   npx wrangler deploy
   ```
   If asked to register a `workers.dev` subdomain, accept. It prints the Worker URL, like
   `https://fdc-backup.<something>.workers.dev`.
6. **Give it the Supabase anon key** (Supabase dashboard > Project Settings > API > `anon` `public`; the same
   key the app is built with, not the `service_role` key):
   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   ```
   Paste it when prompted.
7. **Check it is live.** Open the Worker URL in a browser. You should see
   `{"ok":true,"service":"ClinicPilot FDC backup","bucket_bound":true,"supabase_configured":true}`.
   Both flags must be `true`.
8. **Connect the app.** Put the Worker URL in `BACKUP_ENDPOINT` in `src/lib/backup.js` (no trailing slash,
   no `/backups`), then `npm run build`, commit, push to `main`.
9. **Test.** Sign in as admin > Settings > **Back Up Now**. Expect "Backed up to cloud storage and verified".
   The file also appears in Dashboard > R2 > fdc-backups > `backups/`.

## Changing things later

- **Worker code** (`src/index.js`): `npx wrangler deploy` from `backup/worker`.
- **Allowed websites** (`ALLOWED_ORIGINS` in `wrangler.toml`): if the app moves to a new domain, add it
  there and redeploy. This only stops other sites' pages from calling the Worker; the login token is the
  real lock.
- **Old backups:** Dashboard > R2 > fdc-backups > Settings > Object lifecycle rules can expire files after
  N days if you ever want that. Nothing is deleted by default.

## Security

- Every call needs a valid Supabase login **and** `staff_profiles.role = 'admin'`, checked on every request.
  A CSR login, a stranger, or an expired session gets 401 and nothing is read or written.
- Bucket is private; only the Worker can reach it. No R2 keys exist in the app or the repo.
- `SUPABASE_ANON_KEY` is a Worker secret, not in the repo.

## Restoring

The backup is plain JSON: one array of rows per table (`patients`, `invoices`, `payments`, `appointments`,
`visits`, `expenses`, `patient_notes`, `staff_profiles`, `audit_log`) plus `exported_at`. Download the file from
Dashboard > R2 and load the arrays back with SQL or a script. Restore is manual and has not been tested yet:
do one practice restore into a scratch Supabase project before you ever need it for real.

## Limits to know about

- It is a snapshot at the moment of the press, not continuous. Anything entered afterwards is not in it.
- It depends on someone pressing it. The Settings card shows the last backup time so a gap is visible.
- If the cloud save fails, the app downloads the file to the computer instead so the data is not lost.

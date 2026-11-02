# Drive backup (the "Back Up Now" button)

ClinicPilot > Settings > **Back Up Now** (admin only) saves a dated JSON copy of every table to a Google
Drive folder, then confirms the saved file holds the same row counts that were sent. The copy lives outside
Supabase, so it survives a Supabase problem.

Files are named `clinicpilot-fdc-backup-YYYY-MM-DD_HHMM.json` (Karachi time). Each press makes a new file;
nothing is overwritten or auto-deleted.

## One-time setup (about 5 minutes)

Do this logged into the Google account that should **own** the backups. Use a clinic-owned account
(Dr. Faseeh's), not a personal one that could be lost or closed.

1. **Drive folder.** In Google Drive create a folder, e.g. `ClinicPilot Backups`. Open it and copy the ID
   from the address bar: `drive.google.com/drive/folders/<THIS_PART>`.
2. **Script.** Go to <https://script.google.com> > New project. Replace the default code with the contents of
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. **Fill in the constants** at the top:
   - `SUPABASE_URL`: already set to the FDC project.
   - `SUPABASE_ANON_KEY`: Supabase dashboard > Project Settings > API > the `anon` `public` key (the same
     one the app is built with; it is not secret).
   - `FOLDER_ID`: from step 1.
4. **Authorize.** Pick `authorizeOnce` in the function dropdown, press Run, accept Google's permission
   prompts (Drive and external requests). The log should show the folder name and `Supabase health HTTP 200`.
5. **Deploy.** Deploy > New deployment > type **Web app**. Set *Execute as*: **Me** and *Who has access*:
   **Anyone**. Deploy and copy the Web app URL (ends in `/exec`).
6. **Connect the app.** Put that URL into `BACKUP_ENDPOINT` in `src/lib/backup.js`, commit, push to `main`.
7. **Test.** Sign in to ClinicPilot as admin > Settings > Back Up Now. You should see "Backed up to Google
   Drive and verified" and the file in the folder.

Opening the `/exec` URL in a browser should show a small JSON "service" message, which confirms the
deployment is live.

## Why "Anyone" is safe here

"Anyone" only means Google does not ask for a login to reach the URL. The script itself rejects every request
unless it carries a valid ClinicPilot login token **and** that user's `staff_profiles.role` is `admin`
(checked against Supabase on every call). A CSR login, a stranger, or an expired session gets "Not
authorised" and nothing is read or written.

## Changing the script later

Apps Script does not publish edits automatically. After changing `Code.gs`: Deploy > Manage deployments >
pencil icon > Version: **New version** > Deploy. The URL stays the same.

## Restoring

The backup is plain JSON: one array of rows per table (`patients`, `invoices`, `payments`, `appointments`,
`expenses`, `patient_notes`, `staff_profiles`, `audit_log`), plus `exported_at`. Restore is manual: load the
arrays back with SQL or a script. Do one practice restore into a scratch Supabase project before you
ever need it for real.

## Limits to know about

- It is a snapshot at the moment of the press, not continuous. Anything entered afterwards is not in it.
- It depends on someone pressing it. The Settings card shows the last backup time so a gap is visible.
- Storage files are not included (ClinicPilot does not currently use Supabase Storage).

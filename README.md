# ClinicPilot FDC v2

React + Vite + Supabase rebuild of ClinicPilot for Faseeh Dental Clinic.
Replaces the old Firebase/Google-Sheets app with Postgres (Supabase), real
auth, and role-based access (admin vs. CSR) enforced by Row-Level Security
— not by JS in the browser.

## Stack

- React 18 + Vite, deployed to GitHub Pages via GitHub Actions
- Supabase: Postgres + Auth + RLS (project ref `kxdqaqrqcoqouirjesdg`, region `ap-south-1`)
- No build step talks to Firebase or Google Sheets — this is a clean break

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_ANON_KEY from Supabase > Project Settings > API
npm run dev
```

## Deployment

Pushes to `main` build and deploy to GitHub Pages automatically
(`.github/workflows/deploy.yml`). The workflow needs two repo secrets
(Settings → Secrets and variables → Actions):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Until the custom domain (`app.faseehdentalclinic.com`) is pointed here, the
app is live at the default GitHub Pages project URL:
`https://meesummeer.github.io/clinicpilot-fdc-v2/` (Settings → Pages →
Source: GitHub Actions). `vite.config.js` defaults `base` to
`/clinicpilot-fdc-v2/` to match that. When the custom domain goes live,
switch it without touching code: add a repo Actions **variable** (not
secret) named `VITE_BASE_PATH` set to `/`, and add a `CNAME` file in
`public/` with the domain.

## Data model

See `supabase/01_schema_and_rls.sql` for the schema, enums, and RLS
policies. Key points:

- `staff_profiles` links `auth.users` to a `role` (`admin` | `csr`).
  CSR can read everything and create patients/invoices/payments/appointments,
  but cannot edit or delete invoices/payments, and cannot delete patients —
  admin only. This is enforced in Postgres, not the frontend.
- Every invoice/payment UPDATE or DELETE is logged to `audit_log`
  (admin-readable), including admin's own edits.
- `patients.mr_no` continues the legacy `25xxx` numbering via
  `patients_mr_no_seq` — no prefix change.
- Invoice `due` and `status` are always computed from `cost - discount +
  lab_cost` minus the sum of its payments, never stored, so a later
  discount/payment edit can't leave a stale number on screen.

## Onboarding a staff account

1. Supabase dashboard → Authentication → Users → Add user (email + password).
2. Insert a matching row into `staff_profiles`:
   ```sql
   insert into staff_profiles (id, full_name, role) values
     ('<auth-user-uuid>', 'Dr. Faseeh', 'admin');
   ```

## Credits

Built by CyberHealth Solutions / Meesum Mir for Dr. Faseeh.

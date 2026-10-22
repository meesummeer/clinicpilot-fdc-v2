# ClinicPilot FDC v2

React + Vite + Supabase rebuild of the billing/patients/appointments system
for Faseeh Dental Clinic (FDC), replacing the old Firebase/Google-Sheets app
(`meesummeer/clinicpilot-fdc`, no `-v2` — a separate, still-live repo, left
untouched during this rebuild). Owner: Dr. Faseeh. Managed by Pluto
(Meesum Mir) under CyberHealth Solutions.

## Status

Pre-cutover. The custom domain `clinicpilot.faseehdentalclinic.com` already
points at this app, but the old system at `app.faseehdentalclinic.com` is
still what clinic staff use day to day. Don't treat data created here as
disposable test data — the Supabase project is the real one that will go
live — but also don't assume real staff are depending on it yet.

## Stack

- React 18 + Vite, deployed to GitHub Pages via GitHub Actions
  (`.github/workflows/deploy.yml`, triggers on push to `main`)
- Supabase: Postgres + Auth + RLS (project "FDC", ref `pipddzentbstvatiioqm`,
  region `ap-south-1`). Role split (`admin` / `csr`) is enforced in Postgres
  via `staff_profiles.role` and RLS policies — **not** in the frontend. See
  `supabase/01_schema_and_rls.sql` for the schema and every policy.
- `react-router-dom`, `recharts` (Hub charts), `html2canvas` (invoice
  image export for WhatsApp)

## Local dev

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_ANON_KEY from Supabase dashboard -> Project Settings -> API
npm run dev
```

`npm run build` before calling anything done — it's the fastest way to
catch a broken import or JSX typo.

## Deploy

Push to `main` -> GitHub Actions builds and deploys to GitHub Pages
automatically. No separate deploy step. Two repo secrets already set
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). `gh run list` /
`gh run watch <id>` to check a deploy.

Note: the cloud sandbox this project was built in during Oct 2026 has a
`stop-hook-git-check.sh` that force-nags an uncommitted-changes commit+push
at the end of every turn. That hook lives in that sandbox's home directory,
not in this repo — a local Claude Code session won't have it. Commit and
push explicitly when a change is ready; don't assume it happens for you.

## Key invariants (don't relitigate these)

- **Invoice math is always derived, never stored.** `src/lib/billing.js`
  computes net/paid/due/status from `cost`, `discount`, `lab_cost`, and the
  linked `payments` rows every time, so a later discount or payment edit
  can't leave a stale number on screen. Never add a stored `due` or
  `status` column.
- **Billing KPI non-reconciliation is intentional.** The three Billings
  KPIs (Invoiced / Collected / Outstanding) use different date anchors by
  design (invoice date vs. payment date). They won't match each other for
  a given period — that's correct, not a bug to "fix."
- **PostgREST caps a response at 1000 rows.** Always fetch patients/
  invoices/payments through `fetchAllRows()` / `fetchAllRowsByIds()` in
  `src/lib/supabaseClient.js`, never a bare `.select()`, or large clinics
  will silently lose rows past 1000. `fetchAllRowsByIds` also exists
  because a big `.in(id, [...])` list can blow the URL length limit.
- Every invoice/payment UPDATE or DELETE is logged to `audit_log`
  (admin-readable), including admin's own edits — don't bypass the
  existing update/delete paths with raw inserts that skip it.
- `patients.mr_no` keeps the legacy `25xxx` numbering via
  `patients_mr_no_seq` (DB default) — never assign it client-side.
- GitHub Pages has no SPA fallback, so the build step copies
  `dist/index.html` to `dist/404.html` (see the workflow) — don't remove
  that step or deep links will 404 on refresh.

## Layout

- `src/pages/` — routed screens (Home, Patients, PatientProfile, Billings,
  Expenses, Hub, Settings, Login)
- `src/components/` — modals/drawers/forms shared across pages
  (PatientDrawer, InvoiceForm, EditInvoiceModal, PaymentModal,
  InvoiceViewModal, PatientPicker, ExpenseForm, EditExpenseModal)
- `src/lib/` — `supabaseClient.js` (client + pagination helpers),
  `billing.js` (invoice math), `format.js` (money/date formatting, WhatsApp
  number helper), `useAuth.js`

## Working style

Pluto directs requirements and reviews; ship short, single-concern changes
rather than broad refactors, run `npm run build` to verify, and say in one
line what changed and why rather than narrating the process.

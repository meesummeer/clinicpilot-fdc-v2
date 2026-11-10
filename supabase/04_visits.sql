-- =========================================================
-- ClinicPilot FDC v2 — Phase 4: patient visits (check-in / check-out)
-- Run this in the Supabase SQL Editor after 03_add_expense_categories.sql.
--
-- Additive only: creates one new table (visits) and its policies. Touches
-- no existing table or row. Safe to re-run.
--
-- One row = one clinic visit: what the patient came for, when they were
-- checked in, when they left, and the feedback they gave at check-out.
-- =========================================================

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete restrict,
  appointment_id uuid references appointments(id) on delete set null,
  reason text not null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  feedback_rating smallint check (feedback_rating between 1 and 5),
  feedback_comment text,
  checked_in_by uuid references staff_profiles(id),
  checked_out_by uuid references staff_profiles(id),
  created_at timestamptz not null default now(),
  constraint visits_checkout_after_checkin
    check (checked_out_at is null or checked_out_at >= checked_in_at)
);

create index if not exists visits_patient_id_idx on visits(patient_id);
create index if not exists visits_checked_in_at_idx on visits(checked_in_at);

-- A patient can only have one open (not yet checked-out) visit at a time,
-- so scanning the same QR twice cannot create a duplicate check-in.
create unique index if not exists visits_one_open_per_patient
  on visits(patient_id) where checked_out_at is null;

-- Times always come from the database clock, never from the tablet's
-- (tablet clocks drift or get set wrong). Once a visit is closed, its times
-- are frozen; feedback can still be added. Edits made directly in the
-- Supabase SQL Editor (no signed-in user) are left alone so an admin can
-- still correct a time by hand.
create or replace function visits_stamp_times()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.checked_in_at := now();
    new.checked_out_at := null;
    new.checked_out_by := null;
    new.checked_in_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.checked_in_at := old.checked_in_at;
    new.checked_in_by := old.checked_in_by;
    if old.checked_out_at is not null then
      new.checked_out_at := old.checked_out_at;
      new.checked_out_by := old.checked_out_by;
    elsif new.checked_out_at is not null then
      new.checked_out_at := now();
      new.checked_out_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists visits_stamp_times_trg on visits;
create trigger visits_stamp_times_trg before insert or update on visits
  for each row execute function visits_stamp_times();

-- ---- RLS: any signed-in staff member, same as appointments ----
alter table visits enable row level security;

drop policy if exists "staff manage visits" on visits;
create policy "staff manage visits" on visits for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- Log deletions only (every check-out is an UPDATE, which would flood the
-- audit log). Reuses the existing generic audit trigger function.
drop trigger if exists visits_audit on visits;
create trigger visits_audit after delete on visits
  for each row execute function log_invoice_payment_changes();

-- =========================================================
-- ClinicPilot FDC v2 — Phase 1: schema + RLS (final, revised
-- against the real Firestore export — supersedes any earlier
-- draft pasted in chat; safe to run fresh on the empty project)
-- =========================================================

drop table if exists audit_log cascade;
drop table if exists patient_notes cascade;
drop table if exists appointments cascade;
drop table if exists payments cascade;
drop table if exists invoices cascade;
drop table if exists patients cascade;
drop table if exists staff_profiles cascade;
drop type if exists staff_role cascade;
drop type if exists payment_method cascade;
drop type if exists appointment_status cascade;
drop sequence if exists patients_mr_no_seq cascade;

create type staff_role as enum ('admin', 'csr');

create table staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role staff_role not null default 'csr',
  created_at timestamptz not null default now()
);

create sequence patients_mr_no_seq start 1; -- restarted by the data import script

create table patients (
  id uuid primary key default gen_random_uuid(),
  mr_no integer not null unique default nextval('patients_mr_no_seq'),
  name text not null,
  phone text,
  address text,
  age integer,
  gender text,
  created_at timestamptz default now(), -- nullable: most historical patients have no real creation date
  updated_at timestamptz not null default now()
);
create index patients_mr_no_idx on patients(mr_no);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete restrict,
  legacy_invoice_id text unique, -- old Firestore doc id, for traceability + idempotent re-import
  procedure text,
  cost numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  lab_cost numeric(12,2) not null default 0,
  notes text,
  line_items jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references staff_profiles(id),
  updated_at timestamptz not null default now()
);
create index invoices_patient_id_idx on invoices(patient_id);
create index invoices_created_at_idx on invoices(created_at);

create type payment_method as enum ('cash', 'card', 'bank_transfer');

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,
  legacy_payment_id text unique,
  amount numeric(12,2) not null,
  payment_method payment_method not null default 'cash',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references staff_profiles(id)
);
create index payments_invoice_id_idx on payments(invoice_id);
create index payments_patient_id_idx on payments(patient_id);
create index payments_paid_at_idx on payments(paid_at);

create type appointment_status as enum ('scheduled','in_progress','fulfilled','cancelled');

create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete restrict,
  legacy_appointment_id text unique,
  procedure text,
  scheduled_at timestamptz not null,
  status appointment_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references staff_profiles(id)
);
create index appointments_patient_id_idx on appointments(patient_id);
create index appointments_scheduled_at_idx on appointments(scheduled_at);

create table patient_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  created_by uuid references staff_profiles(id)
);
create index patient_notes_patient_id_idx on patient_notes(patient_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('update','delete')),
  changed_by uuid references staff_profiles(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

-- ---- RLS ----
alter table staff_profiles enable row level security;
alter table patients enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table appointments enable row level security;
alter table patient_notes enable row level security;
alter table audit_log enable row level security;

create or replace function current_staff_role()
returns staff_role
language sql stable security definer
set search_path = public
as $$
  select role from staff_profiles where id = auth.uid();
$$;

create policy "staff read profiles" on staff_profiles for select using (auth.uid() is not null);
create policy "admin manages profiles" on staff_profiles for all
  using (current_staff_role() = 'admin') with check (current_staff_role() = 'admin');

create policy "staff read patients" on patients for select using (auth.uid() is not null);
create policy "staff insert patients" on patients for insert with check (auth.uid() is not null);
create policy "staff update patients" on patients for update using (auth.uid() is not null);
create policy "admin delete patients" on patients for delete using (current_staff_role() = 'admin');

create policy "staff read invoices" on invoices for select using (auth.uid() is not null);
create policy "staff insert invoices" on invoices for insert with check (auth.uid() is not null);
create policy "admin update invoices" on invoices for update using (current_staff_role() = 'admin');
create policy "admin delete invoices" on invoices for delete using (current_staff_role() = 'admin');

create policy "staff read payments" on payments for select using (auth.uid() is not null);
create policy "staff insert payments" on payments for insert with check (auth.uid() is not null);
create policy "admin update payments" on payments for update using (current_staff_role() = 'admin');
create policy "admin delete payments" on payments for delete using (current_staff_role() = 'admin');

create policy "staff manage appointments" on appointments for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "staff manage notes" on patient_notes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "admin read audit log" on audit_log for select using (current_staff_role() = 'admin');

-- auto-log every invoice/payment edit or delete, including admin's own
create or replace function log_invoice_payment_changes()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'UPDATE') then
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values (tg_table_name, old.id, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values (tg_table_name, old.id, 'delete', auth.uid(), to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

create trigger invoices_audit after update or delete on invoices
  for each row execute function log_invoice_payment_changes();
create trigger payments_audit after update or delete on payments
  for each row execute function log_invoice_payment_changes();

-- ---- NOTE on staff_profiles rows ----
-- After creating the two Auth users in the Supabase dashboard
-- (Authentication -> Users -> Add user) for Faseeh (admin) and
-- the CSR account, insert their profile rows with their real
-- auth.users ids, e.g.:
--
-- insert into staff_profiles (id, full_name, role) values
--   ('<faseeh-auth-uid>', 'Dr. Faseeh', 'admin'),
--   ('<csr-auth-uid>', 'CSR', 'csr');

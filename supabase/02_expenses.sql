-- =========================================================
-- ClinicPilot FDC v2 — Phase 2: expenses + per-CSR expenses
-- access flag. Run this in the Supabase SQL Editor after
-- 01_schema_and_rls.sql (and the data import) are in place.
-- Safe to run once; re-running will error on the duplicate
-- type/column (drop the "if exists" guards below if you need
-- to re-run during testing).
-- =========================================================

-- Admin can selectively grant a CSR account access to the
-- Expenses page (mirrors ClinicPilot-YMDC's has_expenses_access
-- flag). Admin always has full access regardless of this flag.
alter table staff_profiles
  add column if not exists has_expenses_access boolean not null default false;

create type expense_category as enum ('general', 'salary', 'utility');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category expense_category not null default 'general',
  description text,
  amount numeric(12,2) not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references staff_profiles(id),
  updated_at timestamptz not null default now()
);
create index expenses_expense_date_idx on expenses(expense_date);
create index expenses_category_idx on expenses(category);

-- ---- RLS ----
alter table expenses enable row level security;

create or replace function current_staff_has_expenses_access()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select has_expenses_access from staff_profiles where id = auth.uid()),
    false
  );
$$;

-- Admin always; CSR only if explicitly granted has_expenses_access.
create policy "expenses access read" on expenses for select
  using (current_staff_role() = 'admin' or current_staff_has_expenses_access());

create policy "expenses access insert" on expenses for insert
  with check (current_staff_role() = 'admin' or current_staff_has_expenses_access());

create policy "expenses access update" on expenses for update
  using (current_staff_role() = 'admin' or current_staff_has_expenses_access())
  with check (current_staff_role() = 'admin' or current_staff_has_expenses_access());

create policy "expenses access delete" on expenses for delete
  using (current_staff_role() = 'admin' or current_staff_has_expenses_access());

-- Reuse the existing generic audit trigger function (already
-- created in 01_schema_and_rls.sql) so expense edits/deletes show
-- up in the same admin-readable audit_log as invoices/payments.
create trigger expenses_audit after update or delete on expenses
  for each row execute function log_invoice_payment_changes();

-- ---- NOTE on granting a CSR access to Expenses ----
-- insert into staff_profiles row already exists for the CSR; to
-- grant them the Expenses page, run:
--
-- update staff_profiles set has_expenses_access = true where id = '<csr-auth-uid>';

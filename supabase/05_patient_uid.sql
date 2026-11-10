-- =========================================================
-- ClinicPilot FDC v2 — Phase 5: patient UID (the ID in each patient's QR code)
-- Run this in the Supabase SQL Editor after 04_visits.sql.
--
-- Adds one column, patients.uid: 8 random letters/digits (like K7Q29XMD),
-- unique per patient, created by the database, and never reassigned. Gives
-- every existing patient a UID. Changes nothing else about the patients
-- table. Safe to re-run: existing UIDs are never regenerated.
--
-- Why not the MR number in the QR? MR numbers are sequential (25101, 25102…),
-- so anyone could guess another patient's code. A random UID cannot be
-- guessed. The MR number stays the human-friendly number on invoices.
--
-- Alphabet: 2-9 and A-Z without I and O (32 characters, nothing that looks
-- like 0, 1 or O), so a UID read aloud or typed by hand is hard to get wrong.
-- =========================================================

alter table patients add column if not exists uid text;

create unique index if not exists patients_uid_key on patients(uid);

-- 8 characters from the alphabet above, re-drawn if the value is taken.
-- Randomness comes from gen_random_uuid(); bytes 6 and 8 of a UUID carry
-- fixed version/variant bits, so they are skipped. 32 characters x 5 bits
-- means no modulo bias.
create or replace function generate_patient_uid()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  positions constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10];
  bytes bytea;
  candidate text;
  i int;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, positions[i]) & 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from patients where uid = candidate);
  end loop;
  return candidate;
end;
$$;

-- Give every existing patient a UID (only those without one).
update patients set uid = generate_patient_uid() where uid is null;

alter table patients alter column uid set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patients_uid_format') then
    alter table patients
      add constraint patients_uid_format check (uid ~ '^[2-9A-HJ-NP-Z]{8}$');
  end if;
end
$$;

-- The app can neither choose nor change a UID: new patients always get a
-- fresh one, and edits keep the old one. Work done directly in the Supabase
-- SQL Editor (no signed-in user) is left alone, so a backup restore keeps its
-- UIDs and an admin can still fix one by hand.
create or replace function patients_guard_uid()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.uid is null or auth.uid() is not null then
      new.uid := generate_patient_uid();
    end if;
  elsif auth.uid() is not null then
    new.uid := old.uid;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_guard_uid_trg on patients;
create trigger patients_guard_uid_trg before insert or update on patients
  for each row execute function patients_guard_uid();

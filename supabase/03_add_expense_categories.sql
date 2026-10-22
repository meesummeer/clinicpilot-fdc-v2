-- =========================================================
-- ClinicPilot FDC v2 — Phase 3: additional expense categories
-- Run this in the Supabase SQL Editor after 02_expenses.sql.
--
-- Adds Miscellaneous, Doctor's Share, Lab and Material to the
-- expense_category enum, alongside the existing general / salary
-- / utility values. ADD VALUE IF NOT EXISTS makes this safe to
-- re-run.
-- =========================================================

alter type expense_category add value if not exists 'miscellaneous';
alter type expense_category add value if not exists 'doctors_share';
alter type expense_category add value if not exists 'lab';
alter type expense_category add value if not exists 'material';

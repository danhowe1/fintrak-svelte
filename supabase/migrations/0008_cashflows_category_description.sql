-- Add category and description to cashflows.

do $$ begin
  create type cashflow_category as enum ('living_expenses','employment_income','other');
exception when duplicate_object then null; end $$;

alter table cashflows
add column if not exists category cashflow_category not null default 'other';

alter table cashflows
add column if not exists description text;

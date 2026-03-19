-- Cashflows: user-created transfers with frequency and date range.

do $$ begin
  create type cashflow_type as enum ('expense','income','transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cashflow_frequency as enum ('monthly','quarterly','annually','one_time');
exception when duplicate_object then null; end $$;

create table if not exists cashflows (
  id uuid primary key default gen_random_uuid(),

  scenario_id uuid not null references scenarios(id) on delete cascade,

  cashflow_type cashflow_type not null,
  frequency cashflow_frequency not null default 'monthly',

  amount numeric not null check (amount > 0),

  start_date date not null,
  end_date date,

  source_account_id uuid references accounts(id) on delete restrict,
  destination_account_id uuid references accounts(id) on delete restrict,

  created_by uuid not null references auth.users(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (end_date is null or end_date >= start_date),
  check (
    (cashflow_type = 'expense' and source_account_id is not null and destination_account_id is null)
    or (cashflow_type = 'income' and source_account_id is null and destination_account_id is not null)
    or (cashflow_type = 'transfer' and source_account_id is not null and destination_account_id is not null)
  )
);

create index if not exists cashflows_scenario_idx on cashflows(scenario_id);
create index if not exists cashflows_source_account_idx on cashflows(source_account_id);
create index if not exists cashflows_destination_account_idx on cashflows(destination_account_id);
create index if not exists cashflows_created_by_idx on cashflows(created_by);
create index if not exists cashflows_start_date_idx on cashflows(start_date);

drop trigger if exists cashflows_set_updated_at on cashflows;
create trigger cashflows_set_updated_at
before update on cashflows
for each row execute function set_updated_at();

create or replace function enforce_cashflows_scenario_match()
returns trigger language plpgsql as $$
declare
  src_scenario uuid;
  dst_scenario uuid;
begin
  if new.source_account_id is not null then
    select scenario_id into src_scenario from accounts where id = new.source_account_id;
    if src_scenario is null then
      raise exception 'source account not found';
    end if;
    if new.scenario_id <> src_scenario then
      raise exception 'scenario mismatch for cashflows source account';
    end if;
  end if;

  if new.destination_account_id is not null then
    select scenario_id into dst_scenario from accounts where id = new.destination_account_id;
    if dst_scenario is null then
      raise exception 'destination account not found';
    end if;
    if new.scenario_id <> dst_scenario then
      raise exception 'scenario mismatch for cashflows destination account';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cashflows_scenario_match on cashflows;
create trigger trg_cashflows_scenario_match
before insert or update on cashflows
for each row execute function enforce_cashflows_scenario_match();

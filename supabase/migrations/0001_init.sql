-- Consolidated schema for fresh development databases.
-- Includes all changes previously spread across 0001-0005 migrations.

-- =========================
-- 0) Extensions
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- 1) Reset existing schema (destructive)
-- =========================
drop table if exists auto_sweep_rules cascade;
drop table if exists account_balance_targets cascade;
drop table if exists auto_funding_rules cascade;
drop table if exists cashflows cascade;
drop table if exists asset_accounts cascade;
drop table if exists accounts cascade;
drop table if exists assets cascade;
drop table if exists scenario_members cascade;
drop table if exists scenarios cascade;
drop table if exists app_user_identities cascade;
drop table if exists app_users cascade;

drop type if exists cashflow_category;
drop type if exists cashflow_frequency;
drop type if exists cashflow_type;
drop type if exists asset_account_role;
drop type if exists account_type;
drop type if exists asset_type;
drop type if exists scenario_role;

-- =========================
-- 2) Enum types
-- =========================
do $$ begin
  create type asset_type as enum ('person', 'property', 'mortgage', 'superannuation', 'shares');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum (
    'cash_account',
    'mortgage_account',
    'credit_card',
    'brokerage',
    'super_account'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_account_role as enum (
    'held_in',
    'funding_source',
    'offsets',
    'secured_by',
    'pays_into'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type scenario_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cashflow_type as enum ('expense', 'income', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cashflow_frequency as enum ('monthly', 'quarterly', 'annually', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cashflow_category as enum (
    'living_expenses',
    'employment_income',
    'misc_income',
    'asset_ownership',
    'rental_income',
    'transfer',
    'shares_purchase',
    'shares_sale'
  );
exception when duplicate_object then null; end $$;

-- =========================
-- 3) Helpers
-- =========================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function is_year_month(value int)
returns boolean language sql immutable as $$
  select value between 100001 and 999912
     and (value % 100) between 1 and 12;
$$;

-- =========================
-- 4) App users + identities
-- =========================
create table if not exists app_users (
  id text primary key,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

create table if not exists app_user_identities (
  id uuid primary key default gen_random_uuid(),
  app_user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists app_user_identities_app_user_idx on app_user_identities(app_user_id);

-- =========================
-- 5) Scenarios + members
-- =========================
create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null references app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_created_by_name_key unique (created_by, name)
);

drop trigger if exists scenarios_set_updated_at on scenarios;
create trigger scenarios_set_updated_at
before update on scenarios
for each row execute function set_updated_at();

create table if not exists scenario_members (
  scenario_id uuid not null references scenarios(id) on delete cascade,
  user_id text not null references app_users(id) on delete cascade,
  role scenario_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (scenario_id, user_id)
);

create index if not exists scenario_members_user_idx on scenario_members(user_id);

-- =========================
-- 6) Assets
-- =========================
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  asset_type asset_type not null,
  name text not null,
  details jsonb not null default '{}'::jsonb,
  property_id uuid,
  person_id uuid,
  start_date int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_unique_name unique (scenario_id, name),
  constraint assets_linked_asset_check
    check (
      (asset_type = 'mortgage' and property_id is not null and person_id is null)
      or (asset_type = 'superannuation' and person_id is not null and property_id is null)
      or (asset_type not in ('mortgage', 'superannuation') and property_id is null and person_id is null)
    ),
  constraint assets_start_date_check
    check (is_year_month(start_date))
);

alter table assets
drop constraint if exists assets_property_id_fkey;

alter table assets
add constraint assets_property_id_fkey
foreign key (property_id) references assets(id) on delete cascade;

alter table assets
drop constraint if exists assets_person_id_fkey;

alter table assets
add constraint assets_person_id_fkey
foreign key (person_id) references assets(id) on delete cascade;

create index if not exists assets_scenario_idx on assets(scenario_id);
create index if not exists assets_type_idx on assets(asset_type);
create index if not exists assets_start_date_idx on assets(start_date);
create index if not exists assets_details_gin_idx on assets using gin(details);

create or replace function enforce_mortgage_property()
returns trigger language plpgsql as $$
declare
  property_type asset_type;
  property_scenario uuid;
  person_type asset_type;
  person_scenario uuid;
begin
  if new.property_id is not null then
    select asset_type, scenario_id
    into property_type, property_scenario
    from assets
    where id = new.property_id;

    if property_type is null then
      raise exception 'property asset not found';
    end if;

    if property_type <> 'property' then
      raise exception 'mortgage property_id must reference a property asset';
    end if;

    if new.scenario_id <> property_scenario then
      raise exception 'mortgage property must be in the same scenario';
    end if;
  end if;

  if new.person_id is not null then
    select asset_type, scenario_id
    into person_type, person_scenario
    from assets
    where id = new.person_id;

    if person_type is null then
      raise exception 'person asset not found';
    end if;

    if person_type <> 'person' then
      raise exception 'superannuation person_id must reference a person asset';
    end if;

    if new.scenario_id <> person_scenario then
      raise exception 'superannuation person must be in the same scenario';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mortgage_property on assets;
create trigger trg_mortgage_property
before insert or update on assets
for each row execute function enforce_mortgage_property();

create or replace function enforce_share_rate_precision()
returns trigger language plpgsql as $$
begin
  if new.asset_type = 'shares' then
    if new.details ? 'capitalGrowthRate' then
      new.details := jsonb_set(
        coalesce(new.details, '{}'::jsonb),
        '{capitalGrowthRate}',
        to_jsonb(round((new.details->>'capitalGrowthRate')::numeric, 1)),
        true
      );
    end if;

    if new.details ? 'dividendYield' then
      new.details := jsonb_set(
        coalesce(new.details, '{}'::jsonb),
        '{dividendYield}',
        to_jsonb(round((new.details->>'dividendYield')::numeric, 1)),
        true
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_share_rate_precision on assets;
create trigger trg_share_rate_precision
before insert or update on assets
for each row execute function enforce_share_rate_precision();

drop trigger if exists assets_set_updated_at on assets;
create trigger assets_set_updated_at
before update on assets
for each row execute function set_updated_at();

-- =========================
-- 7) Accounts
-- =========================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  account_type account_type not null,
  name text not null,
  currency char(3) not null default 'AUD',
  details jsonb not null default '{}'::jsonb,
  start_date int not null,
  opening_balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_unique_name unique (scenario_id, name),
  constraint accounts_start_date_check
    check (is_year_month(start_date))
);

create index if not exists accounts_scenario_idx on accounts(scenario_id);
create index if not exists accounts_type_idx on accounts(account_type);
create index if not exists accounts_start_date_idx on accounts(start_date);
create index if not exists accounts_details_gin_idx on accounts using gin(details);

drop trigger if exists accounts_set_updated_at on accounts;
create trigger accounts_set_updated_at
before update on accounts
for each row execute function set_updated_at();

-- =========================
-- 8) Asset <-> Account links
-- =========================
create table if not exists asset_accounts (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  relationship_role asset_account_role not null default 'held_in',
  constraint asset_accounts_unique unique (scenario_id, asset_id, account_id, relationship_role)
);

create index if not exists asset_accounts_scenario_idx on asset_accounts(scenario_id);
create index if not exists asset_accounts_account_idx on asset_accounts(account_id);
create index if not exists asset_accounts_asset_idx on asset_accounts(asset_id);

create or replace function enforce_asset_accounts_scenario_match()
returns trigger language plpgsql as $$
declare
  a_scenario uuid;
  acc_scenario uuid;
begin
  select scenario_id into a_scenario from assets where id = new.asset_id;
  select scenario_id into acc_scenario from accounts where id = new.account_id;

  if a_scenario is null or acc_scenario is null then
    raise exception 'asset or account not found';
  end if;

  if new.scenario_id <> a_scenario or new.scenario_id <> acc_scenario then
    raise exception 'scenario mismatch for asset_accounts';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asset_accounts_scenario_match on asset_accounts;
create trigger trg_asset_accounts_scenario_match
before insert or update on asset_accounts
for each row execute function enforce_asset_accounts_scenario_match();

-- =========================
-- 9) Cashflows
-- =========================
create table if not exists cashflows (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  cashflow_type cashflow_type not null,
  frequency cashflow_frequency not null default 'monthly',
  category cashflow_category not null,
  amount numeric not null check (amount > 0),
  inflation_affected boolean not null default true,
  start_date int not null,
  end_date int,
  source_asset_account_id uuid references asset_accounts(id) on delete restrict,
  destination_asset_account_id uuid references asset_accounts(id) on delete restrict,
  description text not null,
  created_by text not null references app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashflows_check
    check (
      (cashflow_type = 'expense' and source_asset_account_id is not null and destination_asset_account_id is null)
      or (cashflow_type = 'income' and source_asset_account_id is null and destination_asset_account_id is not null)
      or (cashflow_type = 'transfer' and source_asset_account_id is not null and destination_asset_account_id is not null)
    ),
  constraint cashflows_date_check
    check (
      is_year_month(start_date)
      and (end_date is null or is_year_month(end_date))
      and (end_date is null or end_date >= start_date)
    )
);

create index if not exists cashflows_scenario_idx on cashflows(scenario_id);
create index if not exists cashflows_source_asset_account_idx on cashflows(source_asset_account_id);
create index if not exists cashflows_destination_asset_account_idx on cashflows(destination_asset_account_id);
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
  if new.source_asset_account_id is not null then
    select scenario_id into src_scenario from asset_accounts where id = new.source_asset_account_id;
    if src_scenario is null then
      raise exception 'source asset_account not found';
    end if;
    if new.scenario_id <> src_scenario then
      raise exception 'scenario mismatch for cashflows source asset_account';
    end if;
  end if;

  if new.destination_asset_account_id is not null then
    select scenario_id into dst_scenario from asset_accounts where id = new.destination_asset_account_id;
    if dst_scenario is null then
      raise exception 'destination asset_account not found';
    end if;
    if new.scenario_id <> dst_scenario then
      raise exception 'scenario mismatch for cashflows destination asset_account';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cashflows_scenario_match on cashflows;
create trigger trg_cashflows_scenario_match
before insert or update on cashflows
for each row execute function enforce_cashflows_scenario_match();

-- =========================
-- 10) Auto funding rules
-- =========================
create table if not exists auto_funding_rules (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  source_account_id uuid not null references accounts(id) on delete cascade,
  target_account_id uuid not null references accounts(id) on delete cascade,
  priority_order int not null,
  enabled boolean not null default true,
  min_target_balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_funding_rules_source_target_diff
    check (source_account_id <> target_account_id),
  constraint auto_funding_rules_priority_order_check
    check (priority_order > 0),
  constraint auto_funding_rules_min_target_balance_check
    check (min_target_balance >= 0)
);

create unique index if not exists auto_funding_rules_unique_source_target_idx
  on auto_funding_rules(scenario_id, target_account_id, source_account_id);

create unique index if not exists auto_funding_rules_unique_priority_idx
  on auto_funding_rules(scenario_id, target_account_id, priority_order);

create index if not exists auto_funding_rules_scenario_idx on auto_funding_rules(scenario_id);
create index if not exists auto_funding_rules_source_idx on auto_funding_rules(source_account_id);
create index if not exists auto_funding_rules_target_idx on auto_funding_rules(target_account_id);

drop trigger if exists auto_funding_rules_set_updated_at on auto_funding_rules;
create trigger auto_funding_rules_set_updated_at
before update on auto_funding_rules
for each row execute function set_updated_at();

create or replace function enforce_auto_funding_rules_scenario_match()
returns trigger language plpgsql as $$
declare
  src_scenario uuid;
  dst_scenario uuid;
begin
  select scenario_id into src_scenario from accounts where id = new.source_account_id;
  select scenario_id into dst_scenario from accounts where id = new.target_account_id;

  if src_scenario is null or dst_scenario is null then
    raise exception 'source or target account not found';
  end if;

  if new.scenario_id <> src_scenario or new.scenario_id <> dst_scenario then
    raise exception 'scenario mismatch for auto_funding_rules';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_funding_rules_scenario_match on auto_funding_rules;
create trigger trg_auto_funding_rules_scenario_match
before insert or update on auto_funding_rules
for each row execute function enforce_auto_funding_rules_scenario_match();

-- =========================
-- 11) Account balance targets + auto sweep rules
-- =========================
create table if not exists account_balance_targets (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  min_balance numeric not null default 0,
  max_balance numeric null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_balance_targets_min_balance_check
    check (min_balance >= 0),
  constraint account_balance_targets_max_balance_check
    check (max_balance is null or max_balance >= 0)
);

create unique index if not exists account_balance_targets_unique_account_idx
  on account_balance_targets(scenario_id, account_id);

create index if not exists account_balance_targets_scenario_idx
  on account_balance_targets(scenario_id);

drop trigger if exists account_balance_targets_set_updated_at on account_balance_targets;
create trigger account_balance_targets_set_updated_at
before update on account_balance_targets
for each row execute function set_updated_at();

create or replace function enforce_account_balance_targets_scenario_match()
returns trigger language plpgsql as $$
declare
  account_scenario uuid;
begin
  select scenario_id into account_scenario
  from accounts
  where id = new.account_id;

  if account_scenario is null then
    raise exception 'account not found';
  end if;

  if new.scenario_id <> account_scenario then
    raise exception 'scenario mismatch for account_balance_targets';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_account_balance_targets_scenario_match on account_balance_targets;
create trigger trg_account_balance_targets_scenario_match
before insert or update on account_balance_targets
for each row execute function enforce_account_balance_targets_scenario_match();

create table if not exists auto_sweep_rules (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  source_account_id uuid not null references accounts(id) on delete cascade,
  destination_account_id uuid not null references accounts(id) on delete cascade,
  priority_order int not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_sweep_rules_source_destination_diff
    check (source_account_id <> destination_account_id),
  constraint auto_sweep_rules_priority_order_check
    check (priority_order > 0)
);

create unique index if not exists auto_sweep_rules_unique_source_destination_idx
  on auto_sweep_rules(scenario_id, source_account_id, destination_account_id);

create unique index if not exists auto_sweep_rules_unique_priority_idx
  on auto_sweep_rules(scenario_id, source_account_id, priority_order);

create index if not exists auto_sweep_rules_scenario_idx
  on auto_sweep_rules(scenario_id);

create index if not exists auto_sweep_rules_source_idx
  on auto_sweep_rules(source_account_id);

create index if not exists auto_sweep_rules_destination_idx
  on auto_sweep_rules(destination_account_id);

drop trigger if exists auto_sweep_rules_set_updated_at on auto_sweep_rules;
create trigger auto_sweep_rules_set_updated_at
before update on auto_sweep_rules
for each row execute function set_updated_at();

create or replace function enforce_auto_sweep_rules_scenario_match()
returns trigger language plpgsql as $$
declare
  src_scenario uuid;
  dst_scenario uuid;
begin
  select scenario_id into src_scenario from accounts where id = new.source_account_id;
  select scenario_id into dst_scenario from accounts where id = new.destination_account_id;

  if src_scenario is null or dst_scenario is null then
    raise exception 'source or destination account not found';
  end if;

  if new.scenario_id <> src_scenario or new.scenario_id <> dst_scenario then
    raise exception 'scenario mismatch for auto_sweep_rules';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_sweep_rules_scenario_match on auto_sweep_rules;
create trigger trg_auto_sweep_rules_scenario_match
before insert or update on auto_sweep_rules
for each row execute function enforce_auto_sweep_rules_scenario_match();

-- =========================
-- 12) Row level security
-- =========================
alter table app_users enable row level security;
alter table app_user_identities enable row level security;
alter table scenarios enable row level security;
alter table scenario_members enable row level security;
alter table assets enable row level security;
alter table accounts enable row level security;
alter table asset_accounts enable row level security;
alter table cashflows enable row level security;
alter table auto_funding_rules enable row level security;
alter table account_balance_targets enable row level security;
alter table auto_sweep_rules enable row level security;

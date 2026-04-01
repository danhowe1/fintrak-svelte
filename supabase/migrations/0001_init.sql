-- Consolidated schema for fresh development databases.
-- Includes all changes previously spread across 0001-0010 migrations.

-- =========================
-- 0) Extensions
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- 1) Reset existing schema (destructive)
-- =========================
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
  updated_at timestamptz not null default now()
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
-- 10) Row level security
-- =========================
alter table app_users enable row level security;
alter table app_user_identities enable row level security;
alter table scenarios enable row level security;
alter table scenario_members enable row level security;
alter table assets enable row level security;
alter table accounts enable row level security;
alter table asset_accounts enable row level security;
alter table cashflows enable row level security;

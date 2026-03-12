-- Supabase / Postgres schema for:
-- scenarios (shared), scenario_members (user access),
-- assets + accounts (scenario-scoped, JSONB details),
-- asset_accounts (M:N), asset_owners (ownership),
-- with NOT NULL scenario_id on all scenario-scoped tables,
-- plus updated_at triggers and scenario-consistency triggers.

-- =========================
-- 0) Extensions (usually already enabled in Supabase)
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- 1) ENUM TYPES
-- =========================
do $$ begin
  create type asset_type as enum ('person','property','mortgage','superannuation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum (
    'current_account',
    'mortgage_account',
    'savings_account',
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
  create type scenario_role as enum ('owner','editor','viewer');
exception when duplicate_object then null; end $$;

-- =========================
-- 2) UPDATED_AT TRIGGER
-- =========================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- 3) SCENARIOS + MEMBERS
-- =========================
create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  details jsonb not null default '{}'::jsonb,

  created_by uuid not null references auth.users(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists scenarios_set_updated_at on scenarios;
create trigger scenarios_set_updated_at
before update on scenarios
for each row execute function set_updated_at();

create table if not exists scenario_members (
  scenario_id uuid not null references scenarios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role scenario_role not null default 'viewer',

  created_at timestamptz not null default now(),
  primary key (scenario_id, user_id)
);

create index if not exists scenario_members_user_idx on scenario_members(user_id);

-- =========================
-- 4) ASSETS (scenario-scoped)
-- =========================
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),

  scenario_id uuid not null references scenarios(id) on delete cascade,

  asset_type asset_type not null,
  name text not null,
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_scenario_idx on assets(scenario_id);
create index if not exists assets_type_idx on assets(asset_type);
create index if not exists assets_details_gin_idx on assets using gin(details);

drop trigger if exists assets_set_updated_at on assets;
create trigger assets_set_updated_at
before update on assets
for each row execute function set_updated_at();

-- =========================
-- 5) ACCOUNTS (scenario-scoped)
-- =========================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),

  scenario_id uuid not null references scenarios(id) on delete cascade,

  account_type account_type not null,
  name text not null,

  institution text,
  currency char(3) not null default 'AUD',

  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_scenario_idx on accounts(scenario_id);
create index if not exists accounts_type_idx on accounts(account_type);
create index if not exists accounts_details_gin_idx on accounts using gin(details);

drop trigger if exists accounts_set_updated_at on accounts;
create trigger accounts_set_updated_at
before update on accounts
for each row execute function set_updated_at();

-- =========================
-- 6) ASSET <-> ACCOUNT (M:N) (scenario-scoped)
-- =========================
create table if not exists asset_accounts (
  scenario_id uuid not null references scenarios(id) on delete cascade,

  asset_id uuid not null references assets(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,

  relationship_role asset_account_role not null default 'held_in',

  effective_from date,
  effective_to date,
  notes text,

  primary key (scenario_id, asset_id, account_id, relationship_role)
);

create index if not exists asset_accounts_scenario_idx on asset_accounts(scenario_id);
create index if not exists asset_accounts_account_idx on asset_accounts(account_id);
create index if not exists asset_accounts_asset_idx on asset_accounts(asset_id);

-- =========================
-- 7) ASSET OWNERS (scenario-scoped)
-- =========================
create table if not exists asset_owners (
  scenario_id uuid not null references scenarios(id) on delete cascade,

  asset_id uuid not null references assets(id) on delete cascade,
  owner_asset_id uuid not null references assets(id) on delete cascade,

  ownership_pct numeric(5,2) not null
    check (ownership_pct > 0 and ownership_pct <= 100),

  effective_from date,
  effective_to date,

  primary key (scenario_id, asset_id, owner_asset_id)
);

create index if not exists asset_owners_scenario_idx on asset_owners(scenario_id);
create index if not exists asset_owners_asset_idx on asset_owners(asset_id);
create index if not exists asset_owners_owner_idx on asset_owners(owner_asset_id);

-- =========================
-- 8) SCENARIO CONSISTENCY TRIGGERS
--    Prevent cross-scenario linking in join tables.
-- =========================
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

create or replace function enforce_asset_owners_scenario_match()
returns trigger language plpgsql as $$
declare
  asset_scenario uuid;
  owner_scenario uuid;
begin
  select scenario_id into asset_scenario from assets where id = new.asset_id;
  select scenario_id into owner_scenario from assets where id = new.owner_asset_id;

  if asset_scenario is null or owner_scenario is null then
    raise exception 'asset or owner not found';
  end if;

  if new.scenario_id <> asset_scenario or new.scenario_id <> owner_scenario then
    raise exception 'scenario mismatch for asset_owners';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asset_owners_scenario_match on asset_owners;
create trigger trg_asset_owners_scenario_match
before insert or update on asset_owners
for each row execute function enforce_asset_owners_scenario_match();

-- =========================
-- 9) OPTIONAL: Ensure owner_asset_id is a person (enforce now or later)
--    Uncomment if you want strict enforcement at DB level.
-- =========================
-- create or replace function enforce_owner_is_person()
-- returns trigger language plpgsql as $$
-- declare
--   owner_type asset_type;
-- begin
--   select asset_type into owner_type from assets where id = new.owner_asset_id;
--   if owner_type is distinct from 'person' then
--     raise exception 'owner_asset_id must refer to an asset of type person';
--   end if;
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists trg_owner_is_person on asset_owners;
-- create trigger trg_owner_is_person
-- before insert or update on asset_owners
-- for each row execute function enforce_owner_is_person();

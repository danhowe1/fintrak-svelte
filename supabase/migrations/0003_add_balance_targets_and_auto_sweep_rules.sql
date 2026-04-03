-- Add per-account balance targets (reserve/cap) and outbound auto-sweep priorities.

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

alter table account_balance_targets enable row level security;

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

alter table auto_sweep_rules enable row level security;

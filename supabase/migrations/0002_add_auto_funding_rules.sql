-- Add persisted auto-funding rules for projection-time top-ups.

drop table if exists auto_funding_rules cascade;

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

alter table auto_funding_rules enable row level security;

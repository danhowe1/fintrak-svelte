-- Link cashflows to asset_accounts instead of accounts.

-- 1) Add surrogate id to asset_accounts for FK references.
alter table asset_accounts
add column if not exists id uuid default gen_random_uuid();

update asset_accounts
set id = gen_random_uuid()
where id is null;

alter table asset_accounts
drop constraint if exists asset_accounts_pkey;

alter table asset_accounts
add constraint asset_accounts_pkey primary key (id);

alter table asset_accounts
add constraint asset_accounts_unique
unique (scenario_id, asset_id, account_id, relationship_role);

-- 2) Update cashflows to reference asset_accounts.
alter table cashflows
drop constraint if exists cashflows_source_account_id_fkey;

alter table cashflows
drop constraint if exists cashflows_destination_account_id_fkey;

alter table cashflows
drop constraint if exists cashflows_check;

alter table cashflows
drop column if exists source_account_id;

alter table cashflows
drop column if exists destination_account_id;

alter table cashflows
add column if not exists source_asset_account_id uuid references asset_accounts(id) on delete restrict;

alter table cashflows
add column if not exists destination_asset_account_id uuid references asset_accounts(id) on delete restrict;

alter table cashflows
add constraint cashflows_check
check (
  (cashflow_type = 'expense' and source_asset_account_id is not null and destination_asset_account_id is null)
  or (cashflow_type = 'income' and source_asset_account_id is null and destination_asset_account_id is not null)
  or (cashflow_type = 'transfer' and source_asset_account_id is not null and destination_asset_account_id is not null)
);

drop index if exists cashflows_source_account_idx;
drop index if exists cashflows_destination_account_idx;

create index if not exists cashflows_source_asset_account_idx on cashflows(source_asset_account_id);
create index if not exists cashflows_destination_asset_account_idx on cashflows(destination_asset_account_id);

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

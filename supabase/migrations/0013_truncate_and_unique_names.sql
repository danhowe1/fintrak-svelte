-- Add unique name constraints per scenario.

create unique index if not exists accounts_scenario_name_unique
  on accounts (scenario_id, name);

create unique index if not exists assets_scenario_name_unique
  on assets (scenario_id, name);

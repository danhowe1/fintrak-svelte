-- Enforce one-decimal precision for share rates in assets.details
-- and backfill existing data.

create or replace function enforce_share_rate_precision()
returns trigger
language plpgsql
as $$
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

update assets
set details = jsonb_set(
  coalesce(details, '{}'::jsonb),
  '{capitalGrowthRate}',
  to_jsonb(round((details->>'capitalGrowthRate')::numeric, 1)),
  true
)
where asset_type = 'shares'
  and details ? 'capitalGrowthRate';

update assets
set details = jsonb_set(
  coalesce(details, '{}'::jsonb),
  '{dividendYield}',
  to_jsonb(round((details->>'dividendYield')::numeric, 1)),
  true
)
where asset_type = 'shares'
  and details ? 'dividendYield';

alter table assets
add column if not exists property_id uuid;

alter table assets
drop constraint if exists assets_property_id_fkey;

alter table assets
add constraint assets_property_id_fkey
foreign key (property_id) references assets(id) on delete cascade;

alter table assets
drop constraint if exists assets_property_id_mortgage_check;

alter table assets
add constraint assets_property_id_mortgage_check
check (
	(asset_type = 'mortgage' and property_id is not null)
	or (asset_type <> 'mortgage' and property_id is null)
);

create or replace function enforce_mortgage_property()
returns trigger language plpgsql as $$
declare
  property_type asset_type;
  property_scenario uuid;
begin
  if new.property_id is null then
    return new;
  end if;

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

  return new;
end;
$$;

drop trigger if exists trg_mortgage_property on assets;
create trigger trg_mortgage_property
before insert or update on assets
for each row execute function enforce_mortgage_property();

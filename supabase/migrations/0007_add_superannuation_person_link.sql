-- Link superannuation assets to a person asset, similar to mortgages linking to a property.

alter table assets
add column if not exists person_id uuid;

alter table assets
drop constraint if exists assets_property_id_mortgage_check;

alter table assets
add constraint assets_linked_asset_check
check (
	(asset_type = 'mortgage' and property_id is not null and person_id is null)
	or (asset_type = 'superannuation' and person_id is not null and property_id is null)
	or (asset_type not in ('mortgage', 'superannuation') and property_id is null and person_id is null)
);

alter table assets
drop constraint if exists assets_person_id_fkey;

alter table assets
add constraint assets_person_id_fkey
foreign key (person_id) references assets(id) on delete cascade;

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

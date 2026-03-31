-- Promote asset/account start dates from JSON details into first-class columns.

alter table assets
add column if not exists start_date int;

alter table accounts
add column if not exists start_date int;

update assets
set start_date = case
	when details ? 'startDate' and (details->>'startDate') ~ '^\d{6}$' then (details->>'startDate')::int
	else (extract(year from created_at)::int * 100 + extract(month from created_at)::int)
end
where start_date is null;

update accounts
set start_date = case
	when details ? 'startDate' and (details->>'startDate') ~ '^\d{6}$' then (details->>'startDate')::int
	else (extract(year from created_at)::int * 100 + extract(month from created_at)::int)
end
where start_date is null;

alter table assets
drop constraint if exists assets_start_date_check;

alter table assets
add constraint assets_start_date_check
check (is_year_month(start_date));

alter table accounts
drop constraint if exists accounts_start_date_check;

alter table accounts
add constraint accounts_start_date_check
check (is_year_month(start_date));

alter table assets
alter column start_date set not null;

alter table accounts
alter column start_date set not null;

create index if not exists assets_start_date_idx on assets(start_date);
create index if not exists accounts_start_date_idx on accounts(start_date);

update assets
set details = details - 'startDate'
where details ? 'startDate';

update accounts
set details = details - 'startDate'
where details ? 'startDate';

-- Add inflation_affected toggle to cashflows.

alter table cashflows
add column if not exists inflation_affected boolean not null default true;

update cashflows
set inflation_affected = true
where inflation_affected is null;
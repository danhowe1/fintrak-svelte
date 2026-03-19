-- Align cashflows.created_by with app_users (text ids) instead of auth.users (uuid).

alter table cashflows
drop constraint if exists cashflows_created_by_fkey;

alter table cashflows
alter column created_by type text using created_by::text;

alter table cashflows
add constraint cashflows_created_by_fkey
foreign key (created_by) references app_users(id) on delete restrict;

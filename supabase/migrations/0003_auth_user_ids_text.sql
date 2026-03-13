alter table scenarios
drop constraint if exists scenarios_created_by_fkey;

alter table scenarios
alter column created_by type text using created_by::text;

alter table scenario_members
drop constraint if exists scenario_members_user_id_fkey;

alter table scenario_members
alter column user_id type text using user_id::text;

create table if not exists app_users (
  id text primary key,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

alter table scenarios
drop constraint if exists scenarios_created_by_fkey;

alter table scenarios
add constraint scenarios_created_by_fkey
foreign key (created_by) references app_users(id) on delete restrict;

alter table scenario_members
drop constraint if exists scenario_members_user_id_fkey;

alter table scenario_members
add constraint scenario_members_user_id_fkey
foreign key (user_id) references app_users(id) on delete cascade;

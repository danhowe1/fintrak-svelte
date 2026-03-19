create table if not exists app_user_identities (
  id uuid primary key default gen_random_uuid(),
  app_user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists app_user_identities_app_user_idx on app_user_identities(app_user_id);

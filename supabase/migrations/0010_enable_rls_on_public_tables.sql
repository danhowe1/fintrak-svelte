-- Enable Row Level Security on all application tables in the public schema.
-- Note: no policies are added here; this blocks anon/authenticated PostgREST access by default.

alter table app_users enable row level security;
alter table app_user_identities enable row level security;
alter table scenarios enable row level security;
alter table scenario_members enable row level security;
alter table assets enable row level security;
alter table accounts enable row level security;
alter table asset_accounts enable row level security;
alter table cashflows enable row level security;

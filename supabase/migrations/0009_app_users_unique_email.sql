create unique index if not exists app_users_email_unique on app_users (lower(email))
where email is not null;

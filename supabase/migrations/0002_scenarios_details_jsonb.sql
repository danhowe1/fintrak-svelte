alter table scenarios
add column if not exists details jsonb not null default '{}'::jsonb;

alter table scenarios
drop column if exists description;

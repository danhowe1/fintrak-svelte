-- Scenario-level details are no longer used.
alter table scenarios
drop column if exists details;

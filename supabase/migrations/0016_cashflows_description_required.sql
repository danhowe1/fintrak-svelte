-- Make cashflow descriptions mandatory.

update cashflows
set description = ''
where description is null;

alter table cashflows
alter column description set not null;

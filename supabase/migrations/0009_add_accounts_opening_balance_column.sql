-- Promote account opening balance from details JSON into a first-class column.

alter table accounts
add column if not exists opening_balance numeric;

update accounts
set opening_balance = case
	when details ? 'openingBalance' and (details->>'openingBalance') ~ '^-?\d+(\.\d+)?$'
		then (details->>'openingBalance')::numeric
	else 0::numeric
end
where opening_balance is null;

alter table accounts
alter column opening_balance set default 0;

alter table accounts
alter column opening_balance set not null;

update accounts
set details = details - 'openingBalance'
where details ? 'openingBalance';

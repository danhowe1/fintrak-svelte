-- Merge current/savings account types into a single cash account type.

alter type account_type rename to account_type_old;

create type account_type as enum (
	'cash_account',
	'mortgage_account',
	'credit_card',
	'brokerage',
	'super_account'
);

alter table accounts
alter column account_type type account_type
using (
	case
		when account_type::text in ('current_account', 'savings_account') then 'cash_account'
		else account_type::text
	end
)::account_type;

drop type account_type_old;

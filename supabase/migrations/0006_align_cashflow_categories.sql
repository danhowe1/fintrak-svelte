-- Remove legacy 'other' cashflow category and align to transaction-facing categories.

alter type cashflow_category rename to cashflow_category_old;

create type cashflow_category as enum (
	'living_expenses',
	'employment_income',
	'asset_ownership',
	'rental_income',
	'transfer',
	'shares_purchase',
	'shares_sale'
);

alter table cashflows
alter column category type cashflow_category
using (
	case
		when category::text = 'other' and cashflow_type::text = 'transfer' then 'transfer'
		when category::text = 'other' and cashflow_type::text = 'income' then 'employment_income'
		when category::text = 'other' and cashflow_type::text = 'expense' then 'living_expenses'
		else category::text
	end
)::cashflow_category;

drop type cashflow_category_old;

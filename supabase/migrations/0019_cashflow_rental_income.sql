do $$
begin
	if not exists (
		select 1
		from pg_type t
		join pg_enum e on t.oid = e.enumtypid
		where t.typname = 'cashflow_category'
		  and e.enumlabel = 'rental_income'
	) then
		alter type cashflow_category add value 'rental_income';
	end if;
end $$;

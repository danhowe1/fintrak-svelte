do $$
begin
	if exists (
		select 1
		from pg_type t
		join pg_enum e on e.enumtypid = t.oid
		where t.typname = 'asset_type'
		  and e.enumlabel = 'share'
	) then
		alter type asset_type rename value 'share' to 'shares';
	end if;
end
$$;

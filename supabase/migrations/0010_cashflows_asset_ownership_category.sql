do $$
begin
	alter type cashflow_category add value if not exists 'asset_ownership';
exception
	when duplicate_object then null;
end $$;

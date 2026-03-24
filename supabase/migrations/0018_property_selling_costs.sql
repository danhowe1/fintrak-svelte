-- Add selling costs defaults to property assets.

update assets
set details = jsonb_set(
	jsonb_set(
		coalesce(details, '{}'::jsonb),
		'{fixedSellingCosts}',
		to_jsonb(10000),
		true
	),
	'{variableSellingCosts}',
	to_jsonb(1.65),
	true
)
where asset_type = 'property'
  and (
	details is null
	or not (details ? 'fixedSellingCosts')
	or not (details ? 'variableSellingCosts')
);

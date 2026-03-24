-- Add default market growth rate to property assets.

update assets
set details = jsonb_set(
	coalesce(details, '{}'::jsonb),
	'{marketGrowthRate}',
	to_jsonb(5),
	true
)
where asset_type = 'property'
  and (details is null or not (details ? 'marketGrowthRate'));

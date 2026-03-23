-- Rename scenarios.details key interestRateRise -> interestRateChange
-- and keep value if present.

update scenarios
set details =
	case
		when details ? 'interestRateRise' then
			(details - 'interestRateRise') || jsonb_build_object('interestRateChange', details->'interestRateRise')
		else details
	end;
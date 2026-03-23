-- Remove inflation/interest rate fields from scenarios.details (session-only going forward).

update scenarios
set details = details - 'inflationRate' - 'interestRateChange' - 'interestRateRise';
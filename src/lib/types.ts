export type ScenarioDetails = {
	id: string;
	name: string;
	startDate: string;
	inflationRate: number;
	interestRateRise: number;
	assets: Asset[];
};

export type PersonDetails = {
	type: 'person';
	id: string;
	name: string;
	dob: string;
	retirementAge: number;
	startDate: string;
};

export type PropertyDetails = {
	type: 'property';
	id: string;
	name: string;
	address: string;
	value: number;
	startDate: string;
};

export type Asset = PersonDetails | PropertyDetails;

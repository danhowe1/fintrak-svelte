import { z } from 'zod';
import type {
	AccountBalanceTarget,
	AccountListItem,
	AssetAccountLink,
	AssetListItem,
	AutoFundingRule,
	AutoSweepRule,
	CashflowSummary
} from '$lib/server/database';
import type { ProjectionResult } from '$lib/server/projection';

export const projectionRangeSchema = z.enum(['1y', '5y', '10y', 'all']);
export type ProjectionRangeValue = z.infer<typeof projectionRangeSchema>;

const objectArraySchema = z.array(z.record(z.string(), z.unknown()));
const projectionSchema = z
	.object({
		startDate: z.number(),
		endDate: z.number(),
		transactions: objectArraySchema,
		accounts: objectArraySchema,
		assets: objectArraySchema,
		liquidity: z.object({
			series: objectArraySchema,
			points: objectArraySchema
		}),
		planner: z.record(z.string(), z.unknown()),
		events: objectArraySchema
	})
	.passthrough();

export type DashboardWhatIfResponse = {
	accounts: AccountListItem[];
	assets: AssetListItem[];
	assetAccounts: AssetAccountLink[];
	cashflows: CashflowSummary[];
	autoFundingRules: AutoFundingRule[];
	accountBalanceTargets: AccountBalanceTarget[];
	autoSweepRules: AutoSweepRule[];
};

export const dashboardWhatIfResponseSchema = z
	.object({
		accounts: objectArraySchema,
		assets: objectArraySchema,
		assetAccounts: objectArraySchema,
		cashflows: objectArraySchema,
		autoFundingRules: objectArraySchema,
		accountBalanceTargets: objectArraySchema,
		autoSweepRules: objectArraySchema
	})
	.transform((value) => value as DashboardWhatIfResponse);

export type DashboardProjectionResponse = {
	projection: ProjectionResult;
	autoFundingRules: AutoFundingRule[];
	accountBalanceTargets: AccountBalanceTarget[];
	autoSweepRules: AutoSweepRule[];
	cashflows?: CashflowSummary[];
	projectionRange: ProjectionRangeValue;
	sessionRates: {
		inflationRate: number;
	};
};

export const dashboardProjectionResponseSchema = z
	.object({
		projection: projectionSchema,
		autoFundingRules: objectArraySchema,
		accountBalanceTargets: objectArraySchema,
		autoSweepRules: objectArraySchema,
		cashflows: objectArraySchema.optional(),
		projectionRange: projectionRangeSchema,
		sessionRates: z.object({
			inflationRate: z.number()
		})
	})
	.transform((value) => value as DashboardProjectionResponse);

export const parseDashboardWhatIfResponse = (input: unknown): DashboardWhatIfResponse =>
	dashboardWhatIfResponseSchema.parse(input);

export const parseDashboardProjectionResponse = (input: unknown): DashboardProjectionResponse =>
	dashboardProjectionResponseSchema.parse(input);

import type { ComponentProps } from 'svelte';
import type ProjectionPanel from '$lib/components/dashboard/sections/ProjectionPanel.svelte';
import type WhatIfPanel from '$lib/components/dashboard/sections/WhatIfPanel.svelte';
import type PlannerPanel from '$lib/components/dashboard/sections/PlannerPanel.svelte';

type ProjectionPanelProps = ComponentProps<typeof ProjectionPanel>;
type WhatIfPanelProps = ComponentProps<typeof WhatIfPanel>;
type PlannerPanelProps = ComponentProps<typeof PlannerPanel>;

export type ProjectionPanelStaticProps = Omit<
	ProjectionPanelProps,
	'projectionView' | 'projectionBalanceSource' | 'autoRunProjection' | 'chartCanvas'
>;

export type WhatIfPanelStaticProps = Omit<WhatIfPanelProps, 'assetPanelTab' | 'whatIfPanelElement'>;

export type PlannerPanelStaticProps = Omit<
	PlannerPanelProps,
	'plannerSourceAccountId' | 'plannerAdvancedOpenStage'
>;

export type DashboardSectionsControllerState = {
	projectionPanelProps: ProjectionPanelStaticProps;
	whatIfPanelProps: WhatIfPanelStaticProps;
	plannerPanelProps: PlannerPanelStaticProps;
};

export const createDashboardSectionsController = (
	state: DashboardSectionsControllerState
): DashboardSectionsControllerState => state;

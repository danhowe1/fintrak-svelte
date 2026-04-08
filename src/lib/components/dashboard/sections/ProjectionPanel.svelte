<script lang="ts">
	import type { TransactionSortKey } from '$lib/dashboard/types';
	export let scenarioName: string;
	export let projectionStartDate: number;
	export let formatYearMonthInput: (value: number) => string;
	export let projectionView: 'balances' | 'balance_sheet' | 'profit_loss' | 'transactions';
	export let projectionBalanceSource: 'assets' | 'accounts' | 'net_worth' | 'liquidity';
	export let projectionRange: '1y' | '5y' | '10y' | 'all';
	export let isUpdating: boolean;
	export let autoRunProjection: boolean;
	export let runProjectionNow: () => void | Promise<void>;
	export let updateProjectionRange: (range: '1y' | '5y' | '10y' | 'all') => void | Promise<void>;
	export let sessionInflationRate: number;
	export let formatRate: (value: number, decimals: number) => string;
	export let queueInflationRateChange: (delta: number) => void;
	export let projectionError: string | null;
	export let chartProjection: {
		series: any[];
		transactions: any[];
	};
	export let chartCanvas: HTMLCanvasElement | null = null;
	export let balanceSheetHeaders: string[];
	export let balanceSheetRows: Array<{ name: string; values: number[] }>;
	export let profitLossRows: any[];
	export let isAllPnlExpanded: boolean;
	export let expandAllPnlNodes: () => void;
	export let collapseAllPnlNodes: () => void;
	export let expandedPnlNodes: Set<string>;
	export let togglePnlNode: (id: string) => void;
	export let formatWholeCurrency: (value: number) => string;
	export let transactionSortKey: TransactionSortKey;
	export let transactionSortDirection: 'asc' | 'desc';
	export let toggleTransactionSort: (key: TransactionSortKey) => void;
	export let transactionPivot: {
		headers: string[];
		totalValues: number[];
		rows: Array<{
			assetName: string;
			accountName: string;
			type: string;
			category: string;
			description: string;
			values: number[];
		}>;
	};
	export let isInitialProjectionLoading: boolean;

	let transactionSearchText = '';

	$: normalizedTransactionSearch = transactionSearchText.trim().toLowerCase();
	$: filteredTransactionRows =
		normalizedTransactionSearch.length === 0
			? transactionPivot.rows
			: transactionPivot.rows.filter((row) =>
					[
						row.assetName,
						row.accountName,
						row.type,
						row.category,
						row.description
					].some((value) => value.toLowerCase().includes(normalizedTransactionSearch))
				);
</script>

<div class="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold text-slate-900">
			Projections for {scenarioName} ({formatYearMonthInput(projectionStartDate)})
		</h2>
		<div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
			<div
				class={`inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 ${
					projectionView === 'balances' || projectionView === 'balance_sheet'
						? ''
						: 'pointer-events-none invisible'
				}`}
				aria-hidden={projectionView === 'balances' || projectionView === 'balance_sheet'
					? undefined
					: 'true'}
			>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionBalanceSource === 'assets'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionBalanceSource = 'assets')}
				>
					Assets
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionBalanceSource === 'accounts'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionBalanceSource = 'accounts')}
				>
					Accounts
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionBalanceSource === 'net_worth'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionBalanceSource = 'net_worth')}
				>
					Net worth
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionBalanceSource === 'liquidity'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionBalanceSource = 'liquidity')}
				>
					Liquidity
				</button>
			</div>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'balances'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'balances')}
				>
					Balances chart
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'balance_sheet'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'balance_sheet')}
				>
					Balance sheet
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'profit_loss'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'profit_loss')}
				>
					P&amp;L
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'transactions'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'transactions')}
				>
					Transactions
				</button>
			</div>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === '1y'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('1y')}
				>
					1Y
				</button>
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === '5y'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('5y')}
				>
					5Y
				</button>
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === '10y'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('10y')}
				>
					10Y
				</button>
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === 'all'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('all')}
				>
					All
				</button>
			</div>
			<div
				class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"
			>
				<span>Auto-run</span>
				<button
					type="button"
					class={`rounded-full px-2 py-0.5 transition ${
						autoRunProjection ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
					}`}
					aria-pressed={autoRunProjection}
					on:click={() => (autoRunProjection = !autoRunProjection)}
				>
					{autoRunProjection ? 'On' : 'Off'}
				</button>
				{#if !autoRunProjection}
					<button
						type="button"
						class="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={isUpdating}
						on:click={runProjectionNow}
					>
						Run now
					</button>
				{/if}
			</div>
		</div>
	</div>
	<div class="mt-4 flex flex-wrap items-center gap-6 text-sm text-slate-700">
		<div class="flex items-center gap-3">
			<span class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Inflation rate</span>
			<span class="text-sm font-semibold text-slate-900">{formatRate(sessionInflationRate, 1)}%</span>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => queueInflationRateChange(-0.5)}
				>
					-
				</button>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => queueInflationRateChange(0.5)}
				>
					+
				</button>
			</div>
		</div>
	</div>
	{#if projectionError}
		<div class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
			{projectionError}
		</div>
	{/if}

	{#if projectionView === 'balances'}
		{#if chartProjection.series.length === 0}
			<p class="mt-3 text-sm text-slate-600">No series available for projection.</p>
		{:else}
			<div class="relative mt-4 h-72">
				<canvas bind:this={chartCanvas} class="h-full w-full"></canvas>
				{#if isUpdating}
					<div class="absolute inset-0 grid place-items-center rounded-xl bg-white/70">
						<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
							></span>
							<span>Updating projection…</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if projectionView === 'balance_sheet'}
		{#if chartProjection.series.length === 0}
			<p class="mt-3 text-sm text-slate-600">No series available for projection.</p>
		{:else}
			<div class="relative mt-4">
				<div class="max-h-96 overflow-x-auto overflow-y-auto">
					<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
						<thead
							class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
						>
							<tr>
								<th class="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3">Line item</th>
								{#each balanceSheetHeaders as header}
									<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100 text-slate-700">
							{#each balanceSheetRows as row, rowIndex}
								<tr class={`whitespace-nowrap ${rowIndex === 0 ? 'font-semibold text-slate-900' : ''}`}>
									<td
										class={`sticky left-0 z-10 px-4 py-3 ${
											rowIndex === 0 ? 'bg-white text-slate-900' : 'bg-white'
										}`}
									>
										{row.name}
									</td>
									{#each row.values as value}
										<td
											class={`px-4 py-3 text-right ${value >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
										>
											{formatWholeCurrency(value)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if isUpdating}
					<div class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70">
						<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
							></span>
							<span>Updating projection…</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if projectionView === 'profit_loss'}
		{#if profitLossRows.length === 0}
			<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
		{:else}
			<div class="mt-3 flex justify-end">
				<button
					type="button"
					class="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
					on:click={isAllPnlExpanded ? collapseAllPnlNodes : expandAllPnlNodes}
				>
					{isAllPnlExpanded ? 'Collapse all levels' : 'Expand all levels'}
				</button>
			</div>
			<div class="relative mt-4">
				<div class="max-h-96 overflow-x-auto overflow-y-auto">
					<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
						<thead
							class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
						>
							<tr>
								<th class="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3">Item</th>
								{#each balanceSheetHeaders as header}
									<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100 text-slate-700">
							{#each profitLossRows as row}
								{@const isNetRow = row.id === 'net' && row.level === 0}
								<tr class={`whitespace-nowrap ${row.level === 0 ? 'font-semibold text-slate-900' : ''}`}>
									<td
										class={`sticky left-0 px-4 py-3 ${
											isNetRow
												? 'top-10 z-30 bg-slate-100 text-slate-900'
												: row.level === 0
													? 'z-10 bg-white text-slate-900'
													: 'z-10 bg-white'
										}`}
									>
										<div class="flex items-center gap-2" style={`padding-left: ${row.level * 14}px`}>
											{#if row.children?.length}
												<button
													type="button"
													class="text-slate-500 hover:text-slate-900"
													on:click={() => togglePnlNode(row.id)}
													aria-label="Toggle P&L row"
												>
													{expandedPnlNodes.has(row.id) ? '▾' : '▸'}
												</button>
											{:else}
												<span class="w-3 text-slate-400">•</span>
											{/if}
											<span>{row.label}</span>
										</div>
									</td>
									{#each row.values as value}
										<td
											class={`px-4 py-3 text-right ${
												isNetRow ? 'sticky top-10 z-20 bg-slate-100' : ''
											} ${
												value === 0
													? 'text-slate-400'
													: value > 0
														? 'text-emerald-600'
														: 'text-rose-600'
											}
											`}
										>
											{value === 0 ? '-' : formatWholeCurrency(value)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if isUpdating}
					<div class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70">
						<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
							></span>
							<span>Updating projection…</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if chartProjection.transactions.length === 0}
		<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
	{:else}
		<div class="relative mt-4">
			<div class="max-h-96 overflow-x-auto overflow-y-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
					<thead
						class="sticky top-0 z-40 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
					>
						<tr>
							<th class="sticky top-0 left-0 z-50 min-w-[160px] bg-slate-50 px-4 py-3">
								<button
									type="button"
									class="inline-flex items-center gap-1 text-left"
									on:click={() => toggleTransactionSort('assetName')}
								>
									<span>Asset</span>
									<span class="text-[10px] text-slate-400">
										{transactionSortKey === 'assetName'
											? transactionSortDirection === 'asc'
												? '▲'
												: '▼'
											: '↕'}
									</span>
								</button>
							</th>
							<th class="sticky top-0 z-50 min-w-[160px] bg-slate-50 px-4 py-3" style="left: 160px;">
								<button
									type="button"
									class="inline-flex items-center gap-1 text-left"
									on:click={() => toggleTransactionSort('accountName')}
								>
									<span>Account</span>
									<span class="text-[10px] text-slate-400">
										{transactionSortKey === 'accountName'
											? transactionSortDirection === 'asc'
												? '▲'
												: '▼'
											: '↕'}
									</span>
								</button>
							</th>
							<th class="sticky top-0 z-50 min-w-[110px] bg-slate-50 px-4 py-3" style="left: 320px;">
								<button
									type="button"
									class="inline-flex items-center gap-1 text-left"
									on:click={() => toggleTransactionSort('type')}
								>
									<span>Type</span>
									<span class="text-[10px] text-slate-400">
										{transactionSortKey === 'type'
											? transactionSortDirection === 'asc'
												? '▲'
												: '▼'
											: '↕'}
									</span>
								</button>
							</th>
							<th class="sticky top-0 z-50 min-w-[140px] bg-slate-50 px-4 py-3" style="left: 430px;">
								<button
									type="button"
									class="inline-flex items-center gap-1 text-left"
									on:click={() => toggleTransactionSort('category')}
								>
									<span>Category</span>
									<span class="text-[10px] text-slate-400">
										{transactionSortKey === 'category'
											? transactionSortDirection === 'asc'
												? '▲'
												: '▼'
											: '↕'}
									</span>
								</button>
							</th>
							<th class="sticky top-0 z-50 min-w-[220px] bg-slate-50 px-4 py-3" style="left: 570px;">
								<button
									type="button"
									class="inline-flex items-center gap-1 text-left"
									on:click={() => toggleTransactionSort('description')}
								>
									<span>Description</span>
									<span class="text-[10px] text-slate-400">
										{transactionSortKey === 'description'
											? transactionSortDirection === 'asc'
												? '▲'
												: '▼'
											: '↕'}
									</span>
								</button>
							</th>
							{#each transactionPivot.headers as header}
								<th class="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-right">{header}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 text-slate-700">
						<tr class="font-semibold text-slate-900">
							<td class="sticky top-10 left-0 z-40 bg-slate-100 px-4 py-2" colspan="5">
								<input
									type="text"
									class="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-800 focus:border-slate-500 focus:ring-0 focus:outline-none"
									placeholder="Search asset, account, type, category, or description"
									bind:value={transactionSearchText}
								/>
							</td>
							{#each transactionPivot.totalValues as value}
								<td
									class={`sticky top-10 z-30 bg-slate-100 px-4 py-3 text-right ${
										value === 0
											? 'text-slate-500'
											: value > 0
												? 'text-emerald-700'
												: 'text-rose-700'
									}`}
								>
									{value === 0 ? '-' : formatWholeCurrency(value)}
								</td>
							{/each}
						</tr>
						{#each filteredTransactionRows as row}
							<tr class="whitespace-nowrap">
								<td class="sticky left-0 z-10 bg-white px-4 py-3">{row.assetName}</td>
								<td class="sticky z-10 bg-white px-4 py-3" style="left: 160px;">{row.accountName}</td>
								<td class="sticky z-10 bg-white px-4 py-3" style="left: 320px;">{row.type}</td>
								<td class="sticky z-10 bg-white px-4 py-3" style="left: 430px;">{row.category}</td>
								<td class="sticky z-10 bg-white px-4 py-3" style="left: 570px;">
									{row.description}
								</td>
								{#each row.values as value}
									<td
										class={`px-4 py-3 text-right ${
											value === 0
												? 'text-slate-400'
												: row.type === 'Transfer'
													? 'text-amber-600'
													: value > 0
														? 'text-emerald-600'
														: 'text-rose-600'
										}`}
									>
										{value === 0 ? '-' : formatWholeCurrency(value)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if isUpdating}
				<div class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70">
					<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
						<span class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"></span>
						<span>Updating projection…</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}
	{#if isInitialProjectionLoading}
		<div class="absolute inset-0 z-20 rounded-2xl bg-white/85 p-6">
			<div class="animate-pulse space-y-4">
				<div class="h-5 w-64 rounded bg-slate-200"></div>
				<div class="h-10 w-full rounded-xl bg-slate-100"></div>
				<div class="h-10 w-80 rounded-xl bg-slate-100"></div>
				<div class="h-72 w-full rounded-xl bg-slate-100"></div>
			</div>
		</div>
	{/if}
</div>

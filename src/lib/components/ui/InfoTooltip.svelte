<script lang="ts">
	let {
		label,
		theme = 'amber',
		children
	} = $props<{
		label: string;
		theme?: 'amber' | 'sky';
		children: import('svelte').Snippet;
	}>();

	const getTooltipClass = () =>
		theme === 'sky'
			? 'border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-teal-50 text-sky-900'
			: 'border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 text-amber-900';
</script>

<span class="group relative inline-flex">
	<button
		type="button"
		class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
		aria-label={label}
	>
		i
	</button>
	<span
		role="tooltip"
		class={`pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border px-2 py-1.5 text-[11px] leading-relaxed opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 ${getTooltipClass()}`}
	>
		{@render children()}
	</span>
</span>

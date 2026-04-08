<script lang="ts">
	type SegmentedOption = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	let {
		options,
		value,
		onChange,
		class: className = ''
	} = $props<{
		options: SegmentedOption[];
		value: string;
		onChange: (value: string) => void;
		class?: string;
	}>();
</script>

<div class={`app-chip-group ${className}`.trim()}>
	{#each options as option}
		<button
			type="button"
			class={`app-chip-btn ${
				value === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
			}`}
			disabled={option.disabled}
			onclick={() => onChange(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		label,
		error,
		class: className = '',
		...rest
	} = $props<
		HTMLInputAttributes & {
			label: string;
			error?: string;
		}
	>();
</script>

<label class="app-label">
	{label}
	<input {...rest} class={`app-input ${className}`.trim()} />
	{#if error}
		<span class="app-error">{error}</span>
	{/if}
</label>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'info' | 'success' | 'warning' | 'error';

	const toneClassMap: Record<Tone, string> = {
		info: 'app-status-info',
		success: 'app-status-success',
		warning: 'app-status-warning',
		error: 'app-status-error'
	};

	let {
		tone = 'info' as Tone,
		class: className = '',
		children
	} = $props<{
		tone?: Tone;
		class?: string;
		children: Snippet;
	}>();
</script>

<div class={`app-status ${toneClassMap[tone as Tone]} ${className}`.trim()}>
	{@render children()}
</div>

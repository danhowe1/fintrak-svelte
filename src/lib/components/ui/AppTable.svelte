<script lang="ts">
	import type { Snippet } from 'svelte';

	let { class: className = '', children } = $props<{
		class?: string;
		children: Snippet;
	}>();
</script>

<table class={`app-table ${className}`.trim()}>
	{@render children()}
</table>

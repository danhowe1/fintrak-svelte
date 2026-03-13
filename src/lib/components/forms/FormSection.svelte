<script lang="ts">
	let { title, class: className = '', children } = $props<{
		title: string;
		class?: string;
		children: import('svelte').Snippet;
	}>();
</script>

<div class={`grid gap-4 ${className}`.trim()}>
	<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
	{@render children()}
</div>

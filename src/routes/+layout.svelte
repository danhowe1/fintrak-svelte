<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<main class="mx-auto min-h-screen max-w-6xl px-3 py-12">
	<article class="prose prose-slate max-w-none">
		{@render children()}
	</article>
</main>

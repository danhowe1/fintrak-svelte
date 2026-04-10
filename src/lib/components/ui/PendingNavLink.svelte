<script lang="ts">
	import { preloadData } from '$app/navigation';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let {
		href,
		class: className = '',
		children,
		...rest
	} = $props<
		HTMLAnchorAttributes & {
			href: string;
			children: import('svelte').Snippet;
		}
	>();

	const warmRoute = () => {
		void preloadData(href);
	};
</script>

<a
	{...rest}
	{href}
	class={className}
	data-sveltekit-preload-data="hover"
	onpointerenter={warmRoute}
	onfocus={warmRoute}
	ontouchstart={warmRoute}
>
	{@render children()}
</a>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type ButtonVariant =
		| 'primary'
		| 'secondary'
		| 'secondary-subtle'
		| 'danger'
		| 'ghost'
		| 'pill-secondary';
	type ButtonSize = '2xs' | 'xs' | 'sm' | 'md';

	const variantClassMap: Record<ButtonVariant, string> = {
		primary: 'bg-slate-900 text-white hover:bg-slate-800',
		secondary:
			'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
		'secondary-subtle': 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
		danger:
			'bg-rose-600 text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60',
		ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
		'pill-secondary':
			'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60'
	};

	const sizeClassMap: Record<ButtonSize, string> = {
		'2xs': 'px-2 py-0.5 text-[11px]',
		xs: 'px-3 py-1 text-xs',
		sm: 'px-4 py-2 text-sm',
		md: 'px-4 py-2 text-sm'
	};

	let {
		class: className = '',
		type = 'button',
		variant = 'primary' as ButtonVariant,
		size = 'md' as ButtonSize,
		pill = false,
		children,
		...rest
	} = $props<
		HTMLButtonAttributes & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			pill?: boolean;
			children: import('svelte').Snippet;
		}
	>();
</script>

<button
	{...rest}
	{type}
	class={`inline-flex items-center justify-center font-semibold transition ${
		pill ? 'rounded-full' : 'rounded-lg'
	} ${sizeClassMap[size as ButtonSize]} ${variantClassMap[variant as ButtonVariant]} ${className}`.trim()}
>
	{@render children()}
</button>

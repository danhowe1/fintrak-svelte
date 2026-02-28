<script lang="ts">
	import { signIn } from '@auth/sveltekit/client';
	import { AUTH_PROVIDER_ID, DEFAULT_AUTHENTICATED_REDIRECT } from '$lib/auth';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Button from '$lib/components/ui/Button.svelte';

	let { children, data } = $props();

	function getUserInitials() {
		const source = data.session?.user?.name ?? data.session?.user?.email ?? '';
		const parts = source
			.split(/\s+/)
			.map((part) => part.trim())
			.filter(Boolean);

		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		}

		return source.slice(0, 2).toUpperCase() || 'U';
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="min-h-screen bg-slate-50">
	<header class="border-b border-slate-200 bg-white/90 backdrop-blur">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-3 py-4">
			<a class="flex items-center gap-3 no-underline" href="/">
				<span
					class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold tracking-[0.24em] text-white"
				>
					FT
				</span>
				<span class="text-xl font-semibold tracking-tight text-slate-900">FinTrak</span>
			</a>

			<div class="flex items-center gap-3">
				{#if data.session}
					<span
						class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700"
						aria-label="Signed in user"
						title={data.session.user?.name ?? data.session.user?.email ?? 'Signed in user'}
					>
						{getUserInitials()}
					</span>
					<form method="POST" action="/logout">
						<input type="hidden" name="redirectTo" value="/logout" />
						<Button type="submit">Log out</Button>
					</form>
				{:else}
					<Button onclick={() => signIn(AUTH_PROVIDER_ID, { redirectTo: DEFAULT_AUTHENTICATED_REDIRECT })}>
						Log in
					</Button>
				{/if}
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-6xl px-3 py-12">
		<article class="prose prose-slate max-w-none">
			{@render children()}
		</article>
	</main>
</div>

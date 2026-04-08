<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	export let open = false;
	export let title = 'Confirm';
	export let message = '';
	export let confirmLabel = 'Confirm';
	export let cancelLabel = 'Cancel';
	export let onConfirm: () => void | Promise<void>;
	export let onCancel: () => void;
</script>

{#if open}
	<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 px-4">
		<div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
			<h3 class="text-sm font-semibold text-slate-900">{title}</h3>
			<p class="mt-2 text-xs text-slate-600">{message}</p>
			<div class="mt-4 flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="secondary"
					size="xs"
					class="border-slate-200 text-slate-600"
					onclick={onCancel}
				>
					{cancelLabel}
				</Button>
				<Button type="button" variant="danger" size="xs" onclick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</div>
	</div>
{/if}

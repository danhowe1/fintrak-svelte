<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
</script>

<h1>Welcome to FinTrak</h1>

<Card>
	<h2>Fitness for your finances</h2>
	<p>Want to take control of your families' future financial well-being and have fun doing it?</p>
	<p>
		<a class="text-slate-700" href="/dashboard">Go to dashboard (requires login)</a>
	</p>
</Card>

<section class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
	<Card>
		<h3>Why FinTrak?</h3>
		<p>
			Have you heard the phrase, 'If you look after the pennies, the pounds will look after
			themselves'? Well, we take the opposite approach - if you look after the big picture you won't
			need to worry about the day-to-day.
		</p>
		<p>Want to know if you can buy a house? Or pay off your mortgage? Or retire early?</p>
		<p>
			Perhaps you're worrying about money? Do you dream of paying off credit cards or are concerned
			about interest rates?
		</p>
		<p>We can help put your mind at rest and free you up to follow your life goals.</p>
		<Button class="mt-4">Tell me more...</Button>
	</Card>
	<Card>
		<h3>Container Two</h3>
		<p>Add your text here.</p>
	</Card>
</section>

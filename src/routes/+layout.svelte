<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		background-color: #0a0a0a;
		color: #fff;
		overflow: hidden;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
	}
</style>

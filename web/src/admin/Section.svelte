<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, hint = '', children }: { title: string; hint?: string; children: Snippet } = $props();
</script>

<section class="card">
  <div class="card-title">{title}{#if hint}<span class="hint">{hint}</span>{/if}</div>
  {@render children()}
</section>

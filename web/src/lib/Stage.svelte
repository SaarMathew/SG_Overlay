<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { MatchConfig } from '../../../shared/types.ts';

  let { match, children }: { match: MatchConfig | null; children: Snippet } = $props();

  // In OBS the page is exactly 1920x1080; in a normal browser window scale the stage to fit.
  let scale = $state(1);
  const fit = () => { scale = Math.min(innerWidth / 1920, innerHeight / 1080, 1); };
  $effect(() => {
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  });
</script>

<div
  class="stage"
  style:transform={scale < 0.999 ? `scale(${scale})` : null}
  style:--a={match?.teamA.color ?? null}
  style:--b={match?.teamB.color ?? null}
>
  {@render children()}
</div>

<style>
  .stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; transform-origin: 0 0; }
</style>

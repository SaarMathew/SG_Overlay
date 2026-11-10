<script lang="ts">
  import type { TeamConfig } from '../../../shared/types.ts';
  // Logo (or tag circle in the team colour) as drawn in the full-screen scenes.
  let { team, size }: { team: TeamConfig; size: number } = $props();
</script>

{#if team.logo}
  <img src={team.logo} alt="" style:width="{size}px" style:height="{size}px" />
{:else}
  <div class="c" style:width="{size * 0.93}px" style:height="{size * 0.93}px" style:border-color={team.color}
       style:border-width="{Math.max(3, size * 0.04)}px" style:font-size="{size * 0.29}px">{team.tag}</div>
{/if}

<style>
  img { object-fit: contain; display: block; flex: none; }
  .c { border-radius: 50%; border-style: solid; display: grid; place-items: center; font-family: var(--font-num); font-weight: 800; flex: none; }
</style>

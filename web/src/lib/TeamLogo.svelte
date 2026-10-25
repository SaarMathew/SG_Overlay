<script lang="ts">
  import type { TeamConfig } from '../../../shared/types.ts';
  let { team, size }: { team: TeamConfig; size: number } = $props();
</script>

{#if team.logo}
  <img src={team.logo} alt="" style:width="{size}px" style:height="{size}px" />
{:else}
  <div class="ph" style:width="{size}px" style:height="{size}px" style:background={team.color} style:font-size="{size * 0.26}px">{team.tag}</div>
{/if}

<style>
  img { object-fit: contain; display: block; flex: none; }
  .ph { border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #fff; flex: none; }
</style>

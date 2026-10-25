<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TeamLogo from '../lib/TeamLogo.svelte';

  const { state: app } = connect(['match', 'series', 'ui']);
  const m = $derived(app.match);
  const s = $derived(app.series);
</script>

<Stage match={m}>
  <div class="scene-bg"></div>
  {#if m && s}
    <div class="wrap">
      <img class="brand" src="/assets/saargaming-logo.png" alt="SaarGaming" />
      <div class="eyebrow">{m.leagueLine}</div>
      <h1>{app.ui?.pauseText ?? 'Pause'}</h1>
      <div class="sub">We'll be right back</div>
      <div class="score">
        <TeamLogo team={m.teamA} size={64} />
        <span class="tag">{m.teamA.tag}</span>
        <span class="n a">{s.scoreA}</span><span class="d">–</span><span class="n b">{s.scoreB}</span>
        <span class="tag">{m.teamB.tag}</span>
        <TeamLogo team={m.teamB} size={64} />
      </div>
    </div>
  {/if}
</Stage>

<style>
  .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .brand { width: 200px; height: 200px; object-fit: contain; margin-bottom: 18px; animation: rise .6s ease-out both; }
  h1 { font-size: 84px; font-weight: 900; letter-spacing: -1.5px; margin-top: 8px; animation: rise .6s .1s ease-out both; }
  .sub { font-size: 22px; color: var(--muted); margin-top: 6px; animation: rise .6s .2s ease-out both; }
  .score { display: flex; align-items: center; gap: 18px; margin-top: 52px; padding: 18px 34px; background: var(--panel);
           border: 1px solid var(--line); border-radius: 16px; animation: rise .6s .3s ease-out both; }
  .tag { font-size: 28px; font-weight: 800; }
  .n { font-size: 44px; font-weight: 900; }
  .n.a { color: var(--a); } .n.b { color: var(--b); }
  .d { font-size: 36px; color: var(--dim); }
</style>

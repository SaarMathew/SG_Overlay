<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import { orient } from '../lib/orient.ts';
  import Stage from '../lib/Stage.svelte';
  import SceneFrame from '../lib/SceneFrame.svelte';
  import FsTeam from '../lib/FsTeam.svelte';
  import { fmtTime } from '../../../shared/calc.ts';

  const { state: raw } = connect(['match', 'series', 'ui', 'ingame']);
  const app = $derived(orient(raw));
  const m = $derived(app.match);
  const s = $derived(app.series);
  const clock = $derived(app.ingame ? fmtTime(app.ingame.gameTime) : null);
</script>

<Stage match={m}>
  <SceneFrame kicker={m?.leagueLine ?? ''} badge={m && s ? `BO${m.format} · SPIEL ${s.gameNumber}` : ''}>
    {#if m && s}
      <div class="mid">
        <div class="sc-kicker">Pause</div>
        <div class="txt">{app.ui?.pauseText ?? 'Pause'}</div>
        <div class="sub">Wir sind gleich zurück{clock ? ` · Spielzeit ${clock}` : ''}</div>
      </div>
      <div class="score">
        <div class="t l"><FsTeam team={m.teamA} size={64} /><span>{m.teamA.tag}</span></div>
        <div class="n">{s.scoreA} : {s.scoreB}</div>
        <div class="t r"><FsTeam team={m.teamB} size={64} /><span>{m.teamB.tag}</span></div>
      </div>
    {/if}
  </SceneFrame>
</Stage>

<style>
  .mid { position: absolute; left: 0; right: 0; top: 300px; display: flex; flex-direction: column; align-items: center; gap: 18px; animation: rise .6s ease-out both; }
  .txt { font: 800 168px/0.95 var(--font-num); text-transform: uppercase; text-align: center; max-width: 1600px; text-wrap: balance; }
  .sub { font: 600 26px var(--font); color: var(--scene-soft); }
  .score { position: absolute; left: 560px; width: 800px; top: 860px; height: 96px; display: grid; grid-template-columns: 1fr 140px 1fr; background: var(--scene-panel);
           clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px); animation: rise .6s .2s ease-out both; }
  .t { display: flex; align-items: center; gap: 16px; font: 800 34px var(--font-num); }
  .t.l { padding-left: 28px; border-left: 8px solid var(--a); }
  .t.r { flex-direction: row-reverse; padding-right: 28px; border-right: 8px solid var(--b); }
  .n { display: flex; align-items: center; justify-content: center; font: 800 44px var(--font-num); white-space: pre; }
</style>

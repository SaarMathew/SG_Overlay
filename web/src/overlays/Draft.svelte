<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import { orient } from '../lib/orient.ts';
  import Stage from '../lib/Stage.svelte';
  import SceneFrame from '../lib/SceneFrame.svelte';
  import FsTeam from '../lib/FsTeam.svelte';
  import { draftStreamUrl } from '../../../shared/draft.ts';

  // Pick & ban scene: our branded background and centre block, with drafter.lol's official
  // transparent stream view (picks left/right, bans bottom, Fearless bottom centre) on top.
  const { state: raw } = connect(['match', 'series', 'ui']);
  const app = $derived(orient(raw));
  const m = $derived(app.match);
  const s = $derived(app.series);
  const url = $derived(m && s && m.draftUrl ? draftStreamUrl(m.draftUrl, s.gameNumber) : null);
</script>

<Stage match={m}>
  <SceneFrame kicker={m?.leagueLine ?? ''} badge={m && s ? `BO${m.format} · SPIEL ${s.gameNumber}` : ''}>
    {#if m && s}
      <div class="centre">
        <div class="sc-kicker">Spiel {s.gameNumber}</div>
        <div class="title">PICK &amp; BAN</div>
        <div class="score">
          <div class="t l"><FsTeam team={m.teamA} size={64} /><span>{m.teamA.tag}</span></div>
          <div class="n">{s.scoreA} : {s.scoreB}</div>
          <div class="t r"><FsTeam team={m.teamB} size={64} /><span>{m.teamB.tag}</span></div>
        </div>
        {#if !url}<div class="waiting">Draft startet gleich</div>{/if}
      </div>
      {#if url}
        {#key url}
          <iframe class="drafter" src={url} title="Pick and ban" scrolling="no"></iframe>
        {/key}
      {/if}
    {/if}
  </SceneFrame>
</Stage>

<style>
  /* free area of the drafter.lol stream view at 1920x1080: x 500-1420, y 160-790 */
  .centre { position: absolute; left: 520px; right: 520px; top: 250px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; animation: rise .6s ease-out both; }
  .sc-kicker { font-size: 28px; }
  .title { font: 800 96px/1 var(--font-num); letter-spacing: .02em; }
  .score { margin-top: 36px; width: 800px; height: 96px; display: grid; grid-template-columns: 1fr 140px 1fr; background: var(--scene-panel); text-align: left;
           clip-path: polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px); }
  .t { display: flex; align-items: center; gap: 16px; font: 800 34px var(--font-num); }
  .t.l { padding-left: 28px; border-left: 8px solid var(--a); }
  .t.r { flex-direction: row-reverse; padding-right: 28px; border-right: 8px solid var(--b); }
  .n { display: flex; align-items: center; justify-content: center; font: 800 44px var(--font-num); white-space: pre; }
  .waiting { margin-top: 40px; font: 700 24px var(--font); letter-spacing: .2em; text-transform: uppercase; color: var(--muted); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .4; } }
  .drafter { position: absolute; inset: 0; width: 1920px; height: 1080px; border: 0; background: transparent; }
</style>

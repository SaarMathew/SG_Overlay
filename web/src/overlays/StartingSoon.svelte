<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import { orient } from '../lib/orient.ts';
  import Stage from '../lib/Stage.svelte';
  import SceneFrame from '../lib/SceneFrame.svelte';
  import FsTeam from '../lib/FsTeam.svelte';

  const { state: raw } = connect(['match', 'series', 'ui']);
  const app = $derived(orient(raw));
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const countdown = $derived.by(() => {
    const target = app.match?.countdownTarget;
    if (!target) return null;
    const left = Math.max(0, Math.round((target - now) / 1000));
    return left ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'LIVE';
  });
  const m = $derived(app.match);
  const s = $derived(app.series);
  // the left team is blue side unless it plays chaos (team A chaos, or team B on the left with A on order)
  const leftBlue = $derived(!(raw.match && (raw.match.sideA === 'CHAOS') !== !!raw.ui?.aRight));
</script>

<Stage match={m}>
  <SceneFrame kicker={m?.leagueLine ?? ''} badge={m && s ? `BO${m.format} · SPIEL ${s.gameNumber}` : ''}>
    {#if m}
      <div class="top">
        <div class="sc-kicker">Gleich geht's los</div>
        {#if countdown}<div class="cd">{countdown}</div>{/if}
      </div>
      <div class="row">
        <div class="team l">
          <i style:background="var(--a)"></i>
          <FsTeam team={m.teamA} size={150} />
          <div class="tx"><div class="nm">{m.teamA.name}</div><div class="sd">{leftBlue ? 'BLAUE SEITE' : 'ROTE SEITE'}</div></div>
        </div>
        <div class="vs"><div class="v">VS</div>{#if s}<div class="se">SERIE {s.scoreA} : {s.scoreB}</div>{/if}</div>
        <div class="team r">
          <i style:background="var(--b)"></i>
          <FsTeam team={m.teamB} size={150} />
          <div class="tx"><div class="nm">{m.teamB.name}</div><div class="sd">{leftBlue ? 'ROTE SEITE' : 'BLAUE SEITE'}</div></div>
        </div>
      </div>
      {#if m.caster || m.socials.length}
        <div class="foot"><span>{#if m.caster}Caster <b>{m.caster}</b>{/if}</span><span>{m.socials.join('  ·  ')}</span></div>
      {/if}
    {/if}
  </SceneFrame>
</Stage>

<style>
  .top { position: absolute; left: 0; right: 0; top: 170px; display: flex; flex-direction: column; align-items: center; animation: rise .6s ease-out both; }
  .cd { font: 800 300px/0.95 var(--font-num); letter-spacing: -.01em; }
  .row { position: absolute; left: 160px; right: 160px; top: 690px; height: 220px; display: grid; grid-template-columns: 1fr 200px 1fr; animation: rise .6s .2s ease-out both; }
  .team { position: relative; display: flex; align-items: center; gap: 32px; padding: 0 40px; background: var(--scene-panel); min-width: 0; }
  .team.l { clip-path: polygon(0 0, 100% 0, calc(100% - 28px) 100%, 0 100%); }
  .team.r { flex-direction: row-reverse; clip-path: polygon(28px 0, 100% 0, 100% 100%, 0 100%); }
  .team i { position: absolute; top: 0; bottom: 0; width: 10px; }
  .team.l i { left: 0; } .team.r i { right: 0; }
  .tx { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .r .tx { align-items: flex-end; text-align: right; }
  .nm { font: 800 64px/1 var(--font-num); text-transform: uppercase; }
  .sd { font: 600 20px var(--font); letter-spacing: .16em; color: var(--muted); }
  .vs { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .v { font: 800 64px/1 var(--font-num); color: var(--accent); }
  .se { font: 700 24px var(--font-num); letter-spacing: .1em; }
  .foot { position: absolute; left: 160px; right: 160px; bottom: 56px; display: flex; justify-content: space-between; font: 600 20px var(--font); color: var(--muted); }
  .foot b { color: var(--text); }
</style>

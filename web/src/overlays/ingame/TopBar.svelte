<script lang="ts">
  import type { IngameState, MatchConfig, SeriesState, TeamLive } from '../../../../shared/types.ts';
  import { fmtGold, fmtTime } from '../../../../shared/calc.ts';
  import TeamLogo from '../../lib/TeamLogo.svelte';

  let { ingame, match, series, clock }: { ingame: IngameState; match: MatchConfig; series: SeriesState; clock: number } = $props();

  const wins = $derived(match.format === 2 ? 2 : Math.ceil(match.format / 2));
  const diff = $derived(ingame.a.gold - ingame.b.gold);
</script>

{#snippet objectives(t: TeamLive, side: 'l' | 'r')}
  <div class="objs {side}">
    <div class="drakes">
      {#each [0, 1, 2, 3] as i}<div class="drake {t.dragons[i] ?? 'empty'}"></div>{/each}
    </div>
    {#if t.elders}<div class="obj" title="Elder"><span class="elder"></span>{t.elders}</div>{/if}
    <div class="obj" title="Void Grubs"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" /></svg>{t.grubs}</div>
    <div class="obj" title="Baron"><svg viewBox="0 0 16 16"><path d="M8 1l2.5 5 5 .7-3.7 3.4.9 5L8 12.7 3.3 15l.9-5L.5 6.7l5-.7z" /></svg>{t.barons}</div>
  </div>
{/snippet}

<!-- Must fully cover Riot's score bar (x 397–1537, y 0–100 incl. clock box): opaque, 1164 x 104 -->
<div class="topbar">
  <div class="bar">
    <div class="side l">
      <TeamLogo team={match.teamA} size={54} />
      <div><div class="tag">{match.teamA.tag}</div><div class="name">{match.teamA.name}</div></div>
      <div class="stats">
        <div class="stat"><div class="v">{fmtGold(ingame.a.gold)}</div><div class="k">Gold</div></div>
        <div class="stat"><div class="v">{ingame.a.towers}</div><div class="k">Towers</div></div>
        <div class="kills">{ingame.a.kills}</div>
      </div>
    </div>
    <div class="center">
      <div class="clock" class:paused={ingame.paused}>{fmtTime(clock)}</div>
      <div class="series">
        {#each Array(wins) as _, i}<div class="dot" class:a={i < series.scoreA}></div>{/each}
        <div class="sep"></div>
        {#each Array(wins) as _, i}<div class="dot" class:b={i < series.scoreB}></div>{/each}
      </div>
      <div class="game-no">{ingame.paused ? 'PAUSED' : `GAME ${series.gameNumber} · BO${match.format}`}</div>
    </div>
    <div class="side r">
      <TeamLogo team={match.teamB} size={54} />
      <div class="tr"><div class="tag">{match.teamB.tag}</div><div class="name">{match.teamB.name}</div></div>
      <div class="stats">
        <div class="stat"><div class="v">{fmtGold(ingame.b.gold)}</div><div class="k">Gold</div></div>
        <div class="stat"><div class="v">{ingame.b.towers}</div><div class="k">Towers</div></div>
        <div class="kills">{ingame.b.kills}</div>
      </div>
    </div>
  </div>
  <div class="sub">
    {@render objectives(ingame.a, 'l')}
    <div class="golddiff" class:a={diff > 0} class:b={diff < 0}>{fmtGold(diff, true)}<span>{ingame.goldSource === 'ocr' ? 'GOLD' : 'ITEM GOLD'}</span></div>
    {@render objectives(ingame.b, 'r')}
  </div>
</div>

<style>
  .topbar { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 1164px; }
  .bar { display: grid; grid-template-columns: 1fr 120px 1fr; height: 72px; background: var(--cover);
         border-radius: 0 0 var(--radius) var(--radius); overflow: hidden; border: 1px solid var(--line); border-top: none; }
  .side { display: flex; align-items: center; gap: 14px; padding: 0 18px; }
  .side.l { border-left: 4px solid var(--a); }
  .side.r { border-right: 4px solid var(--b); flex-direction: row-reverse; }
  .tr { text-align: right; }
  .tag { font-size: 22px; font-weight: 800; letter-spacing: .5px; line-height: 1.05; }
  .name { font-size: 13px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .stats { margin-left: auto; display: flex; gap: 18px; align-items: center; }
  .r .stats { margin-left: 0; margin-right: auto; flex-direction: row-reverse; }
  .stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stat .v { font-size: 17px; font-weight: 700; }
  .stat .k { font-size: 10px; color: var(--dim); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .kills { font-size: 36px; font-weight: 800; min-width: 48px; text-align: center; }
  .center { display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--cover-2);
            border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .clock { font-size: 26px; font-weight: 700; letter-spacing: .5px; }
  .clock.paused { color: var(--muted); }
  .series { display: flex; gap: 5px; margin-top: 5px; align-items: center; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.15); }
  .dot.a { background: var(--a); } .dot.b { background: var(--b); }
  .sep { width: 10px; }
  .game-no { font-size: 9px; color: var(--dim); font-weight: 600; letter-spacing: 1.2px; margin-top: 3px; }

  .sub { display: grid; grid-template-columns: 1fr 120px 1fr; height: 32px; margin: 0 40px; background: var(--cover);
         border-radius: 0 0 8px 8px; border: 1px solid var(--line); border-top: none; }
  .objs { display: flex; align-items: center; gap: 12px; padding: 0 14px; font-size: 13px; font-weight: 600; color: var(--muted); }
  .objs.r { flex-direction: row-reverse; }
  .drakes { display: flex; gap: 4px; }
  .r .drakes { flex-direction: row-reverse; }
  .drake { width: 12px; height: 12px; transform: rotate(45deg); border-radius: 2px; }
  .drake.empty { border: 1px solid rgba(255,255,255,.2); }
  .drake.infernal { background: var(--drag-infernal); } .drake.ocean { background: var(--drag-ocean); }
  .drake.mountain { background: var(--drag-mountain); } .drake.cloud { background: var(--drag-cloud); }
  .drake.hextech { background: var(--drag-hextech); } .drake.chemtech { background: var(--drag-chemtech); }
  .obj { display: flex; align-items: center; gap: 5px; }
  .obj svg { width: 14px; height: 14px; fill: currentColor; opacity: .8; }
  .elder { width: 11px; height: 11px; transform: rotate(45deg); background: var(--drag-elder); border-radius: 2px; display: block; }
  .golddiff { display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--muted); }
  .golddiff.a { color: var(--a); } .golddiff.b { color: var(--b); }
  .golddiff span { font-size: 9px; color: var(--dim); margin-left: 5px; font-weight: 600; letter-spacing: .5px; }
</style>

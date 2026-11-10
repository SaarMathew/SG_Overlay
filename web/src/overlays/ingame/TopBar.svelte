<script lang="ts">
  import type { IngameState, MatchConfig, SeriesState, TeamConfig, TeamLive } from '../../../../shared/types.ts';
  import { fmtGold, fmtTime } from '../../../../shared/calc.ts';
  import TeamLogo from '../../lib/TeamLogo.svelte';

  let { ingame, match, series, clock }: { ingame: IngameState; match: MatchConfig; series: SeriesState; clock: number } = $props();

  const wins = $derived(match.format === 2 ? 2 : Math.ceil(match.format / 2));
  const diff = $derived(ingame.a.gold - ingame.b.gold);
  const hasSoul = (t: TeamLive) => t.dragons.length >= 4;
</script>

{#snippet side(t: TeamLive, team: TeamConfig, score: number, k: 'l' | 'r')}
  <div class="side {k}" style:--c="var(--{k === 'l' ? 'a' : 'b'})">
    <div class="line"></div>
    <TeamLogo {team} size={52} />
    <div class="id">
      <div class="tag">{team.tag}</div>
      <div class="pips">{#each Array(wins) as _, i}<i class:on={i < score}></i>{/each}</div>
    </div>
    <div class="grow"></div>
    <div class="st"><i class="coin"></i><span>{fmtGold(t.gold)}</span></div>
    <div class="st"><img class="tower" src="/assets/objectives/tower.png" alt="" /><span>{t.towers}</span></div>
    <div class="kills">{t.kills}</div>
  </div>
{/snippet}

{#snippet objs(t: TeamLive, k: 'l' | 'r')}
  <div class="objs {k}">
    <div class="drakes">
      {#each t.dragons as d}<img src="/assets/objectives/{d}.png" alt={d} />{/each}
    </div>
    {#if hasSoul(t)}<div class="soul {ingame.soul ?? ''}">SEELE</div>{/if}
    <div class="grow"></div>
    {#if t.elders}<div class="o"><img src="/assets/objectives/elder.png" alt="" /><span>{t.elders}</span></div>{/if}
    <div class="o"><img src="/assets/objectives/grub.png" alt="" /><span>{t.grubs}</span></div>
    <div class="o"><img src="/assets/objectives/baron.png" alt="" /><span>{t.barons}</span></div>
  </div>
{/snippet}

<!-- Must fully cover Riot's score bar (x 395–1540, y 0–95): opaque -->
<div class="topbar">
  <div class="edge"></div>
  <div class="bar">
    {@render side(ingame.a, match.teamA, series.scoreA, 'l')}
    <div class="center">
      <div class="clock" class:paused={ingame.paused}>{fmtTime(clock)}</div>
      <div class="game">{ingame.paused ? 'PAUSIERT' : `SPIEL ${series.gameNumber} · BO${match.format}`}</div>
    </div>
    {@render side(ingame.b, match.teamB, series.scoreB, 'r')}
  </div>
  <div class="subback"></div>
  <div class="hair"></div>
  <div class="sub">
    {@render objs(ingame.a, 'l')}
    <div class="diff" class:a={diff > 0} class:b={diff < 0}>
      {#if diff > 0}<i class="arr l"></i>{/if}
      <span>{fmtGold(Math.abs(diff), true)}</span>
      {#if diff < 0}<i class="arr r"></i>{/if}
      {#if ingame.goldSource !== 'ocr'}<em>ITEM</em>{/if}
    </div>
    {@render objs(ingame.b, 'r')}
  </div>
</div>

<style>
  .topbar { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 1170px; }
  .edge { position: absolute; left: -3px; top: 0; width: 1176px; height: 67px;
          background: linear-gradient(90deg, var(--a), rgba(255,255,255,.2) 22%, rgba(255,255,255,.2) 78%, var(--b));
          clip-path: polygon(0 0, 100% 0, calc(100% - 23px) 100%, 23px 100%); }
  .subback { position: absolute; left: 212px; top: 64px; width: 746px; height: 41px; background: rgba(255,255,255,.16);
             clip-path: polygon(0 0, 100% 0, calc(100% - 17px) 100%, 17px 100%); }
  .hair { position: absolute; left: 265px; top: 64px; width: 640px; height: 1px; background: rgba(255,255,255,.08); }
  .bar { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 132px minmax(0, 1fr); height: 64px; background: var(--panel);
         clip-path: polygon(0 0, 100% 0, calc(100% - 22px) 100%, 22px 100%); }
  .side { position: relative; display: flex; align-items: center; gap: 18px; }
  .side.l { padding-left: 40px; }
  .side.r { padding-right: 40px; flex-direction: row-reverse; }
  .side .line { position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--c); }
  .grow { flex: 1; }
  .id { display: flex; flex-direction: column; gap: 4px; }
  .r .id { align-items: flex-end; }
  .tag { font: 800 28px/1 var(--font-num); letter-spacing: .02em; }
  .pips { display: flex; gap: 4px; }
  .pips i { width: 16px; height: 5px; background: rgba(255,255,255,.18); }
  .pips i.on { background: var(--c); }
  .st { display: flex; align-items: center; gap: 8px; font: 700 24px var(--font-num); }
  .r .st { flex-direction: row-reverse; }
  .coin { width: 14px; height: 14px; border-radius: 50%; background: #f2c14e; }
  .tower { width: 22px; height: 22px; object-fit: contain; }
  .kills { width: 76px; height: 64px; display: grid; place-items: center; background: var(--c); color: #fff; font: 800 44px var(--font-num); }
  .center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: var(--bg); }
  .clock { font: 800 32px/1 var(--font-num); }
  .clock.paused { color: var(--muted); }
  .game { font: 700 13px var(--font); letter-spacing: .1em; color: var(--muted); white-space: nowrap; }

  .sub { position: relative; z-index: 1; width: 740px; height: 38px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 132px minmax(0, 1fr);
         background: rgba(18, 11, 32, .94); clip-path: polygon(0 0, 100% 0, calc(100% - 16px) 100%, 16px 100%); }
  .objs { display: flex; align-items: center; gap: 12px; padding-left: 28px; }
  .objs.r { flex-direction: row-reverse; padding-left: 0; padding-right: 28px; }
  .drakes { display: flex; gap: 6px; }
  .drakes img { width: 22px; height: 22px; display: block; }
  .soul { font: 700 13px var(--font); letter-spacing: .14em; color: #ff8a5c; }
  .soul.infernal { color: var(--drag-infernal); } .soul.ocean { color: var(--drag-ocean); } .soul.mountain { color: var(--drag-mountain); }
  .soul.cloud { color: var(--drag-cloud); } .soul.hextech { color: var(--drag-hextech); } .soul.chemtech { color: var(--drag-chemtech); }
  .o { display: flex; align-items: center; gap: 5px; font: 700 19px var(--font-num); }
  .objs.r .o { flex-direction: row-reverse; }
  .o img { width: 22px; height: 22px; display: block; }
  .diff { display: flex; align-items: center; justify-content: center; gap: 6px; font: 800 22px var(--font-num); color: var(--muted); }
  .diff.a { color: var(--a); } .diff.b { color: var(--b); }
  .diff em { font: 700 13px var(--font); font-style: normal; color: var(--muted); letter-spacing: .08em; }
  .arr { width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; }
  .arr.l { border-right: 8px solid currentColor; } .arr.r { border-left: 8px solid currentColor; }
</style>

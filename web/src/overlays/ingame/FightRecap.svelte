<script lang="ts">
  import type { Fight, FightObjective, IngameState, MatchConfig, TeamKey } from '../../../../shared/types.ts';
  import { fmtTime } from '../../../../shared/calc.ts';
  import { champIcon } from '../../lib/dd.ts';

  let { fight, ingame: _ingame, match, v, shown }: { fight: Fight; ingame: IngameState; match: MatchConfig; v: string; shown: boolean } = $props();

  const KIND: Record<FightObjective['kind'], string> = {
    dragon: 'DRACHE', elder: 'ELDER', baron: 'BARON', herald: 'HERALD', grubs: 'GRUBS', atakhan: 'ATAKHAN', tower: 'TURM', inhib: 'INHIB',
  };
  const MULTI = ['', '', 'DOUBLE', 'TRIPLE', 'QUADRA', 'PENTA'];
  const tag = (k: TeamKey) => (k === 'A' ? match.teamA.tag : match.teamB.tag);
  const col = (k: TeamKey) => (k === 'A' ? 'var(--a)' : 'var(--b)');

  const MAX = 5;
  const kills = $derived(fight.kills.length > MAX ? fight.kills.slice(0, MAX - 1) : fight.kills);
  const more = $derived(fight.kills.length > MAX ? fight.kills.length - (MAX - 1) : 0);

  const badge = (k: Fight['kills'][number]) => {
    const m = fight.multikills.find(m => m.champ === k.killer.champ && Math.abs(m.t - k.t) <= 1.5);
    return m ? MULTI[Math.min(m.streak, 5)] : k.shutdown ? 'SHUTDOWN' : '';
  };

  const assists = (t: TeamKey) => fight.kills.reduce((n, k) => n + (k.killer.team === t ? k.assisters.length : 0), 0);
  const kdaA = $derived(`${fight.killsA}/${fight.killsB}/${assists('A')}`);
  const kdaB = $derived(`${fight.killsB}/${fight.killsA}/${assists('B')}`);

  const swing = $derived(fight.goldSwing);
  const swingTeam = $derived<TeamKey | null>(swing === null || swing === 0 ? null : swing > 0 ? 'A' : 'B');
  const swingText = $derived(swing === null ? '–' : `+${(Math.abs(swing) / 1000).toFixed(1)}k`);
  const after = $derived(fight.objectives[0] ?? null);
  const afterText = $derived.by(() => {
    if (!after) return '';
    const n = fight.objectives.filter(o => o.kind === after.kind && o.team === after.team).length;
    return (n > 1 ? `${n} ` : '') + KIND[after.kind];
  });
</script>

<div class="recap">
  <div class="inner" class:hidden={!shown}>
    <div class="head">
      <div class="col">
        <div class="kick">TEAMFIGHT</div>
        <div class="time">{fmtTime(fight.start)} – {fmtTime(fight.end)}</div>
      </div>
      <div class="score">
        <span style:color="var(--a)">{fight.killsA}</span><span class="colon">:</span><span style:color="var(--b)">{fight.killsB}</span>
      </div>
      <div class="col right">
        <div class="kick dimmed">GOLD-SWING · DANACH</div>
        <div class="time">
          <span style:color={swingTeam ? col(swingTeam) : 'var(--muted)'}>{swingText}{swingTeam ? ` ${tag(swingTeam)}` : ''}</span>{#if after} · <span style:color={col(after.team)}>{afterText}</span>{/if}
        </div>
      </div>
    </div>
    <div class="tiles">
      {#each kills as k, i (i)}
        {@const b = badge(k)}
        <div class="tile" style:border-top-color={col(k.killer.team)} style:--c={col(k.killer.team)}>
          <div class="pair">
            <img src={champIcon(v, k.killer.champ)} alt="" />
            <i class="arrow"></i>
            <img class="victim" src={champIcon(v, k.victim.champ)} alt="" />
          </div>
          <div class="foot"><span class="t">{fmtTime(k.t)}</span>{#if b}<span class="mk">{b}</span>{/if}</div>
        </div>
      {/each}
      {#if more}<div class="tile more"><span>+{more}</span></div>{/if}
    </div>
    <div class="totals">
      <div>{tag('A')} im Fight <b>{kdaA}</b></div>
      <div><b>{kdaB}</b> {tag('B')} im Fight</div>
    </div>
  </div>
</div>

<style>
  /* ingame bottom: sits over the scoreboard panel, content rises 120 ms after the scoreboard sinks */
  .recap { position: absolute; left: 500px; top: 816px; width: 920px; height: 264px; overflow: hidden; pointer-events: none;
           clip-path: polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%, 0 18px); }
  .inner { position: absolute; left: 26px; right: 26px; top: 14px; bottom: 0; display: flex; flex-direction: column; background: var(--cover);
           transform: none; transition: transform .36s cubic-bezier(.2,.8,.2,1) .12s; }
  .inner.hidden { transform: translateY(280px); transition-delay: 0s; }
  .head { display: grid; grid-template-columns: 1fr 200px 1fr; align-items: center; height: 78px; }
  .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .col.right { align-items: flex-end; }
  .kick { font: 700 13px var(--font); letter-spacing: .22em; color: var(--accent); }
  .kick.dimmed { color: var(--muted); }
  .time { font: 800 24px var(--font-num); white-space: nowrap; }
  .score { display: flex; align-items: center; justify-content: center; gap: 14px; font: 800 54px/1 var(--font-num); }
  .colon { color: var(--muted); font-size: 36px; }
  .tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--bg); border-top: 4px solid var(--c); min-width: 0; }
  .pair { display: flex; align-items: center; justify-content: space-between; }
  .pair img { width: 44px; height: 44px; border-radius: 4px; display: block; }
  .pair img.victim { filter: grayscale(1) brightness(.6); }
  .arrow { width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-left: 10px solid var(--c); }
  .foot { display: flex; align-items: center; justify-content: space-between; height: 18px; }
  .t { font: 700 15px var(--font-num); color: var(--soft); }
  .mk { font: 800 13px var(--font-num); letter-spacing: .06em; color: var(--c); }
  .tile.more { align-items: center; justify-content: center; border-top-color: var(--muted); font: 800 32px var(--font-num); color: var(--muted); }
  .totals { display: flex; justify-content: space-between; margin-top: 12px; font: 700 16px var(--font); letter-spacing: .08em; }
  .totals b { font: 800 20px var(--font-num); }
</style>

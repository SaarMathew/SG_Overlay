<script lang="ts">
  import type { Fight, FightObjective, IngameState, MatchConfig, PlayerLive } from '../../../../shared/types.ts';
  import { fmtTime } from '../../../../shared/calc.ts';
  import { champIcon } from '../../lib/dd.ts';

  let { fight, ingame, match, v, shown }: { fight: Fight; ingame: IngameState; match: MatchConfig; v: string; shown: boolean } = $props();

  const KIND: Record<FightObjective['kind'], string> = {
    dragon: 'Dragon', elder: 'Elder', baron: 'Baron', herald: 'Herald', grubs: 'Grub', atakhan: 'Atakhan', tower: 'Tower', inhib: 'Inhibitor',
  };
  const MULTI_SHORT = ['', '', 'DOUBLE', 'TRIPLE', 'QUADRA', 'PENTA'];
  const tag = (k: 'A' | 'B') => (k === 'A' ? match.teamA.tag : match.teamB.tag);

  type Stat = { k: number; d: number; a: number; killed: string[]; mark: string };
  function stat(p: PlayerLive, team: 'A' | 'B'): Stat {
    const s: Stat = { k: 0, d: 0, a: 0, killed: [], mark: '' };
    for (const x of fight.kills) {
      if (x.killer.team === team && x.killer.champ === p.champion) {
        s.k++; s.killed.push(x.victim.champ);
        const m = fight.multikills.find(m => m.champ === p.champion && Math.abs(m.t - x.t) <= 1.5);
        if (m) s.mark = MULTI_SHORT[Math.min(m.streak, 5)];
        else if (x.shutdown && !s.mark) s.mark = 'SHUTDOWN';
      }
      if (x.victim.team === team && x.victim.champ === p.champion) s.d++;
      if (x.killer.team === team && x.assisters.includes(p.champion)) s.a++;
    }
    return s;
  }
  const statsA = $derived(ingame.a.players.map(p => stat(p, 'A')));
  const statsB = $derived(ingame.b.players.map(p => stat(p, 'B')));

  const objs = $derived(fight.objectives.reduce<(FightObjective & { n: number })[]>((out, o) => {
    const l = out.at(-1);
    if (l && l.kind === o.kind && l.team === o.team) l.n++; else out.push({ ...o, n: 1 });
    return out;
  }, []));
  const objLabel = (o: FightObjective & { n: number }) => {
    const name = o.kind === 'dragon' && o.dragonType ? o.dragonType[0].toUpperCase() + o.dragonType.slice(1) : KIND[o.kind];
    return o.n > 1 ? `${o.n} ${name}s` : name;
  };
  const swing = $derived(fight.goldSwing);
  const swingSide = $derived(swing === null || swing === 0 ? null : swing > 0 ? 'a' : 'b');
</script>

{#snippet half(p: PlayerLive, s: Stat, team: 'A' | 'B', side: 'l' | 'r')}
  {@const involved = s.k + s.d + s.a > 0}
  <div class="half {side}" class:out={!involved}>
    <div class="champ" class:died={s.d > 0}>{#if p.champion}<img src={champIcon(v, p.champion)} alt="" />{/if}</div>
    <div class="who"><div class="n">{p.name}</div><div class="k">{s.k} / {s.d} / {s.a}</div></div>
    {#if s.mark}<span class="mk {team.toLowerCase()}">{s.mark}</span>{/if}
    <div class="killed">{#each s.killed as c}<img src={champIcon(v, c)} alt="" />{/each}</div>
  </div>
{/snippet}

<div class="recap" class:hidden={!shown}>
  <div class="row">
    <div class="col">{#each ingame.a.players as p, i (i)}{@render half(p, statsA[i], 'A', 'l')}{/each}</div>
    <div class="mid">
      <div class="head">Teamfight</div>
      <div class="time">{fmtTime(fight.start)}–{fmtTime(fight.end)}</div>
      <div class="score">
        <span class="sn a" class:lose={fight.winner === 'B'}>{fight.killsA}</span>
        <span class="dash">–</span>
        <span class="sn b" class:lose={fight.winner === 'A'}>{fight.killsB}</span>
      </div>
      <div class="tags"><span>{tag('A')}</span><span>{tag('B')}</span></div>
      {#if swing !== null && swingSide}
        <div class="gold {swingSide}">+{Math.abs(Math.round(swing)).toLocaleString('en-US')} · <b>{tag(swingSide === 'a' ? 'A' : 'B')}</b></div>
      {/if}
      {#if objs.length}
        <div class="then">
          {#each objs as o}<span class="obj {o.team.toLowerCase()}">→ {objLabel(o)}</span>{/each}
        </div>
      {/if}
    </div>
    <div class="col">{#each ingame.b.players as p, i (i)}{@render half(p, statsB[i], 'B', 'r')}{/each}</div>
  </div>
</div>

<style>
  .recap { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); width: 1010px; box-sizing: border-box;
           background: var(--cover); border: 1px solid var(--line); border-bottom: none;
           border-radius: var(--radius) var(--radius) 0 0; padding: 9px 0;
           transition: transform .3s cubic-bezier(.2,.8,.2,1), opacity .3s; }
  .recap.hidden { transform: translate(-50%, 100%); opacity: 0; pointer-events: none; }
  .row { display: grid; grid-template-columns: 1fr 190px 1fr; align-items: stretch; }
  .col { display: flex; flex-direction: column; }
  .half { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 44px; position: relative; }
  .half.r { flex-direction: row-reverse; }
  .half::before { content: ""; position: absolute; top: 9px; bottom: 9px; width: 3px; border-radius: 2px; }
  .half.l::before { left: 0; background: var(--a); } .half.r::before { right: 0; background: var(--b); }
  .half.out { opacity: .35; }
  .champ { width: 32px; height: 32px; flex: none; }
  .champ img { width: 100%; height: 100%; border-radius: 6px; display: block; }
  .champ.died img { filter: grayscale(1) brightness(.7); }
  .who { width: 118px; flex: none; }
  .r .who { text-align: right; }
  .n { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .k { font-size: 12px; color: var(--muted); font-weight: 600; }
  .mk { font-size: 10px; font-weight: 800; letter-spacing: 1px; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--c); color: var(--c); flex: none; }
  .mk.a { --c: var(--a); } .mk.b { --c: var(--b); }
  .killed { display: flex; gap: 3px; margin-left: auto; }
  .r .killed { margin-left: 0; margin-right: auto; flex-direction: row-reverse; }
  .killed img { width: 26px; height: 26px; border-radius: 4px; display: block; }
  .mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
         background: var(--cover-2); border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .head { font-size: 11px; font-weight: 800; color: var(--muted); letter-spacing: 2px; text-transform: uppercase; }
  .time { font-size: 12px; font-weight: 600; color: var(--dim); font-feature-settings: "tnum" 1; }
  .score { display: flex; align-items: baseline; gap: 10px; margin-top: 4px; }
  .sn { font-size: 46px; font-weight: 900; line-height: 1; font-feature-settings: "tnum" 1; }
  .sn.a { color: var(--a); } .sn.b { color: var(--b); }
  .sn.lose { opacity: .4; }
  .dash { font-size: 24px; color: var(--dim); }
  .tags { display: flex; justify-content: space-between; width: 120px; font-size: 10px; font-weight: 700; letter-spacing: 1.4px; color: var(--dim); }
  .gold { margin-top: 8px; font-size: 18px; font-weight: 800; }
  .gold.a { color: var(--a); } .gold.b { color: var(--b); }
  .gold b { font-size: 12px; letter-spacing: 1px; }
  .then { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 8px; margin-top: 6px; font-size: 13px; font-weight: 700; }
  .obj.a { color: var(--a); } .obj.b { color: var(--b); }
</style>

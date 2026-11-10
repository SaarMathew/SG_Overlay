<script lang="ts">
  import type { IngameState, PlayerLive } from '../../../../shared/types.ts';
  import { ROLES } from '../../../../shared/types.ts';
  import { fmtGold, killParticipation, playerGold } from '../../../../shared/calc.ts';
  import { champIcon } from '../../lib/dd.ts';

  let { ingame, idx, v }: { ingame: IngameState; idx: number; v: string } = $props();

  const pa = $derived(ingame.a.players[idx]);
  const pb = $derived(ingame.b.players[idx]);
  const kpA = $derived(killParticipation(pa, ingame.a.kills));
  const kpB = $derived(killParticipation(pb, ingame.b.kills));

  type Row = { label: string; l: string | number; r: string | number; x: number; y: number };
  const row = (label: string, a: number, b: number, la?: string, lb?: string): Row => {
    const m = Math.max(a, b, 0.01);
    return { label, l: la ?? a, r: lb ?? b, x: Math.round((a / m) * 100), y: Math.round((b / m) * 100) };
  };
  const rows = $derived<Row[]>([
    row('LEVEL', pa.level, pb.level),
    row('K/D/A', pa.kills + pa.assists, pb.kills + pb.assists, `${pa.kills}/${pa.deaths}/${pa.assists}`, `${pb.kills}/${pb.deaths}/${pb.assists}`),
    row('CS', pa.cs, pb.cs),
    row('GOLD', playerGold(pa), playerGold(pb), fmtGold(playerGold(pa)), fmtGold(playerGold(pb))),
    row('WARDS', pa.ward, pb.ward),
    row('KP %', kpA, kpB),
  ]);
</script>

{#snippet who(p: PlayerLive, side: 'l' | 'r')}
  <div class="who {side}">
    {#if p.champion}<img src={champIcon(v, p.champion)} alt="" style:box-shadow="0 0 0 3px var(--{side === 'l' ? 'a' : 'b'})" />{/if}
    <div class="nm"><div class="pn">{p.name}</div><div class="pc">{p.championName}</div></div>
  </div>
{/snippet}

<div class="h2h">
  <div class="top"><span class="t">LANE-VERGLEICH</span><span class="role">{ROLES[idx]}</span></div>
  <div class="duel">
    {@render who(pa, 'l')}
    <div class="vs">VS</div>
    {@render who(pb, 'r')}
  </div>
  <div class="rows">
    {#each rows as r (r.label)}
      <div class="rw">
        <div class="val">{r.l}</div>
        <div class="bar l"><i style:width="{r.x}%"></i></div>
        <div class="lab">{r.label}</div>
        <div class="bar"><i style:width="{r.y}%"></i></div>
        <div class="val rr">{r.r}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .h2h { position: absolute; left: 24px; top: 716px; width: 540px; height: 340px; display: flex; flex-direction: column; background: var(--cover);
         clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%); animation: slide .4s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes slide { from { opacity: 0; transform: translateX(-600px); } to { opacity: 1; transform: none; } }
  .top { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 18px; background: var(--bg); }
  .t { font: 700 14px var(--font); letter-spacing: .2em; color: var(--soft); }
  .role { font: 800 20px var(--font-num); letter-spacing: .1em; color: var(--accent); }
  .duel { display: grid; grid-template-columns: minmax(0, 1fr) 50px minmax(0, 1fr); align-items: center; height: 92px; padding: 0 18px; }
  .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .who.r { flex-direction: row-reverse; text-align: right; }
  .who img { width: 64px; height: 64px; border-radius: 4px; flex: none; display: block; }
  .nm { min-width: 0; display: flex; flex-direction: column; }
  .who.r .nm { align-items: flex-end; }
  .pn { font: 800 26px/1 var(--font-num); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .pc { font: 600 14px var(--font); color: var(--muted); white-space: nowrap; }
  .vs { text-align: center; font: 800 22px var(--font-num); color: var(--muted); }
  .rows { display: flex; flex-direction: column; gap: 6px; padding: 0 18px; }
  .rw { display: grid; grid-template-columns: 64px 1fr 84px 1fr 64px; align-items: center; gap: 8px; height: 28px; }
  .val { font: 800 21px var(--font-num); white-space: nowrap; }
  .val.rr { text-align: right; }
  .bar { display: flex; height: 8px; background: rgba(255,255,255,.07); }
  .bar.l { justify-content: flex-end; }
  .bar i { display: block; background: var(--b); transition: width .4s; }
  .bar.l i { background: var(--a); }
  .lab { text-align: center; font: 700 13px var(--font); letter-spacing: .16em; color: var(--muted); }
</style>

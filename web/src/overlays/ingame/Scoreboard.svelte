<script lang="ts">
  import type { IngameState, PlayerLive } from '../../../../shared/types.ts';
  import { ROLES } from '../../../../shared/types.ts';
  import { laneDiffs, laneShares } from '../../../../shared/calc.ts';
  import { champIcon, itemIcon } from '../../lib/dd.ts';

  let { ingame, v, focus, away = false }: { ingame: IngameState; v: string; focus: number; away?: boolean } = $props();

  const shares = $derived(laneShares(laneDiffs(ingame.a, ingame.b)));
  const de = (n: number) => Math.abs(Math.round(n)).toLocaleString('de-DE');
  const diffText = (d: number) => (d === 0 ? '±0' : `+${de(d)}`);
</script>

{#snippet half(p: PlayerLive, side: 'l' | 'r')}
  <div class="half {side}">
    <div class="champ" class:dead={p.dead}>
      {#if p.champion}<img src={champIcon(v, p.champion)} alt="" />{/if}
      <span class="lv">{p.level}</span>
      {#if p.dead}<span class="rs">{p.respawn}</span>{/if}
    </div>
    <div class="who">
      <div class="n">{p.name}</div>
      <div class="k">{p.kills}/{p.deaths}/{p.assists}</div>
    </div>
    <div class="cs">{p.cs}</div>
    <div class="items">
      {#each p.items as id}<div class="slot">{#if id}<img src={itemIcon(v, id)} alt="" />{/if}</div>{/each}
      <div class="slot trinket">{#if p.trinket}<img src={itemIcon(v, p.trinket)} alt="" />{/if}</div>
    </div>
  </div>
{/snippet}

<!-- Must fully cover the Riot spectator scoreboard (x 600-1330, y 845-1080): opaque, 750 x 234 -->
<div class="scoreboard">
  <div class="rows" class:away>
    {#each ROLES as role, i (role)}
      {@const sh = shares[i]}
      <div class="row" class:focus={focus === i}>
        {@render half(ingame.a.players[i], 'l')}
        <div class="mid">
          <div class="gd" class:a={sh.diff > 0} class:b={sh.diff < 0}>{diffText(sh.diff)}</div>
          <div class="share"><i style:width="{(50 + Math.sign(sh.diff) * sh.fill * 50).toFixed(1)}%"></i></div>
          <div class="role">{role}</div>
        </div>
        {@render half(ingame.b.players[i], 'r')}
      </div>
    {/each}
  </div>
</div>

<style>
  
  .scoreboard { position: absolute; left: 585px; top: 846px; width: 750px; height: 234px; overflow: hidden; background: var(--cover);
                clip-path: polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%, 0 18px); }
  .rows { position: absolute; left: 18px; right: 18px; top: 10px; display: flex; flex-direction: column; gap: 3px;
          transition: transform .36s cubic-bezier(.5, 0, .2, 1); }
  .rows.away { transform: translateY(240px); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr); height: 41px; }
  .row.focus .mid { outline: 2px solid var(--accent); outline-offset: -2px; }
  .half { display: grid; gap: 8px; align-items: center; }
  .half.l { grid-template-columns: 40px minmax(0, 1fr) 34px 148px; }
  .half.r { grid-template-columns: 148px 34px minmax(0, 1fr) 40px; }
  .half.r .champ { order: 4; } .half.r .who { order: 3; } .half.r .cs { order: 2; } .half.r .items { order: 1; }
  .champ { position: relative; width: 40px; height: 40px; }
  .champ img { width: 40px; height: 40px; display: block; border-radius: 4px; }
  .champ.dead img { filter: grayscale(1) brightness(.6); }
  .lv { position: absolute; bottom: -3px; right: -4px; min-width: 18px; height: 16px; padding: 0 2px; background: var(--bg);
        display: grid; place-items: center; font: 700 13px var(--font-num); }
  .r .lv { right: auto; left: -4px; }
  .rs { position: absolute; inset: 0; display: grid; place-items: center; font: 800 22px var(--font-num); background: rgba(11, 7, 20, .55); }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .r .who { align-items: flex-end; }
  .n { font: 600 13px/1.1 var(--font); color: #c9bedc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .k { font: 800 19px/1.05 var(--font-num); }
  .cs { font: 700 17px var(--font-num); color: var(--soft); text-align: right; }
  .r .cs { text-align: left; }
  .items { display: flex; gap: 1px; }
  .r .items { flex-direction: row-reverse; }
  .slot { width: 20px; height: 20px; background: var(--bg); overflow: hidden; flex: none; }
  .slot img { width: 20px; height: 20px; display: block; }
  .slot.trinket { border-radius: 50%; margin-left: 2px; }
  .r .slot.trinket { margin-left: 0; margin-right: 2px; }
  .mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: var(--bg); margin: 0 6px; }
  .gd { font: 800 16px/1 var(--font-num); color: var(--muted); }
  .gd.a { color: var(--a); } .gd.b { color: var(--b); }
  .share { display: flex; width: 60px; height: 4px; background: var(--b); }
  .share i { display: block; height: 100%; background: var(--a); transition: width .6s ease; }
  .role { font: 700 13px var(--font); letter-spacing: .18em; color: var(--muted); line-height: 1; }
</style>

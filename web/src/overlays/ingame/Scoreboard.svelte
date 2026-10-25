<script lang="ts">
  import type { IngameState, PlayerLive } from '../../../../shared/types.ts';
  import { ROLES } from '../../../../shared/types.ts';
  import { fmtGold, laneDiffs, laneShares } from '../../../../shared/calc.ts';
  import { champIcon, itemIcon, spellIcon } from '../../lib/dd.ts';

  let { ingame, v, focus }: { ingame: IngameState; v: string; focus: number } = $props();

  const shares = $derived(laneShares(laneDiffs(ingame.a, ingame.b)));
  const pct = (p: number | null) => (p === null ? '' : `${p < 0 ? '−' : ''}${Math.abs(p)}%`);
</script>

{#snippet half(p: PlayerLive, side: 'l' | 'r')}
  <div class="half {side}" class:dead={p.dead}>
    <div class="champ">
      {#if p.champion}<img src={champIcon(v, p.champion)} alt="" />{/if}
      <span class="lv">{p.level}</span>
    </div>
    <div class="spells">{#each p.spells as s}<img src={spellIcon(v, s)} alt="" />{/each}</div>
    <div class="who"><div class="n">{p.name}</div><div class="k">{p.kills} / {p.deaths} / {p.assists}</div></div>
    <div class="cs">{p.cs}<small>CS</small></div>
    <div class="items">
      {#each p.items as id}{#if id}<img src={itemIcon(v, id)} alt="" />{:else}<div class="e"></div>{/if}{/each}
      {#if p.trinket}<img class="trinket" src={itemIcon(v, p.trinket)} alt="" />{:else}<div class="e trinket"></div>{/if}
    </div>
    {#if p.dead}<div class="respawn">{p.respawn}</div>{/if}
  </div>
{/snippet}

<!-- Must fully cover Riot's spectator scoreboard (x 600–1330, y 848–1080): opaque, 1010 x 239 -->
<div class="scoreboard">
  {#each ROLES as role, i (role)}
    {@const sh = shares[i]}
    <div class="row" class:focus={focus === i}>
      {@render half(ingame.a.players[i], 'l')}
      <div class="mid">
        <div class="role">{role}{#if sh.percent !== null}<b> · {pct(sh.percent)}</b>{/if}</div>
        <div class="gd" class:a={sh.diff > 0} class:b={sh.diff < 0}>{fmtGold(sh.diff, true)}</div>
        <!-- lead-share funnel: narrow at the centre, grows toward the team holding the lane lead -->
        <div class="funnel">
          {#if sh.diff !== 0}<i class={sh.diff > 0 ? 'a' : 'b'} style:width="{(sh.fill * 50).toFixed(1)}%"></i>{/if}
        </div>
      </div>
      {@render half(ingame.b.players[i], 'r')}
    </div>
  {/each}
</div>

<style>
  .scoreboard { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); width: 1010px;
                background: var(--cover); border: 1px solid var(--line); border-bottom: none;
                border-radius: var(--radius) var(--radius) 0 0; padding: 9px 0; }
  .row { display: grid; grid-template-columns: 1fr 78px 1fr; height: 44px; align-items: center; transition: background .3s; }
  .row.focus { background: rgba(155,77,255,.12); }
  .half { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 100%; position: relative; }
  .half.r { flex-direction: row-reverse; }
  .half::before { content: ""; position: absolute; top: 9px; bottom: 9px; width: 3px; border-radius: 2px; }
  .half.l::before { left: 0; background: var(--a); } .half.r::before { right: 0; background: var(--b); }
  .champ { width: 32px; height: 32px; position: relative; flex: none; }
  .champ img { width: 100%; height: 100%; border-radius: 6px; display: block; }
  .lv { position: absolute; bottom: -3px; right: -4px; font-size: 10px; font-weight: 700; background: #000; border-radius: 4px; padding: 0 3px; line-height: 13px; }
  .r .lv { right: auto; left: -4px; }
  .spells { display: flex; flex-direction: column; gap: 2px; flex: none; }
  .spells img { width: 15px; height: 15px; border-radius: 3px; display: block; }
  .who { width: 118px; flex: none; }
  .r .who { text-align: right; }
  .n { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .k { font-size: 12px; color: var(--muted); font-weight: 600; }
  .cs { width: 40px; flex: none; text-align: center; font-size: 14px; font-weight: 700; }
  .cs small { display: block; font-size: 9px; color: var(--dim); letter-spacing: 1px; font-weight: 600; }
  .items { display: flex; gap: 3px; margin-left: auto; }
  .r .items { margin-left: 0; margin-right: auto; flex-direction: row-reverse; }
  .items img, .items .e { width: 26px; height: 26px; border-radius: 4px; display: block; }
  .items .e { background: rgba(255,255,255,.06); }
  .items .trinket { margin-left: 4px; border-radius: 50%; }
  .r .items .trinket { margin-left: 0; margin-right: 4px; }
  .dead > :not(.respawn) { opacity: .35; filter: grayscale(1); }
  .respawn { position: absolute; top: 50%; transform: translateY(-50%); font-size: 13px; font-weight: 800; color: #fff;
             background: rgba(229,72,77,.9); border-radius: 4px; padding: 1px 6px; }
  .l .respawn { left: 20px; } .r .respawn { right: 20px; }
  .mid { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;
         background: var(--cover-2); border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .role { font-size: 9px; font-weight: 700; color: var(--dim); letter-spacing: 1.4px; white-space: nowrap; }
  .role b { color: var(--muted); }
  .gd { font-size: 13px; font-weight: 800; line-height: 15px; color: var(--muted); }
  .gd.a { color: var(--a); } .gd.b { color: var(--b); }
  .funnel { position: relative; width: 68px; height: 7px; margin-top: 2px; }
  .funnel::after { content: ""; position: absolute; left: 50%; top: -1px; bottom: -1px; width: 1px; background: rgba(255,255,255,.25); }
  .funnel i { position: absolute; top: 0; bottom: 0; display: block; transition: width .6s ease; }
  .funnel i.a { right: 50%; background: var(--a); clip-path: polygon(0 0, 100% 40%, 100% 60%, 0 100%); }
  .funnel i.b { left: 50%; background: var(--b); clip-path: polygon(0 40%, 100% 0, 100% 100%, 0 60%); }
</style>

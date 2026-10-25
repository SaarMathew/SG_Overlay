<script lang="ts">
  import type { IngameState, PlayerLive } from '../../../../shared/types.ts';
  import { ROLES } from '../../../../shared/types.ts';
  import { fmtGold, fmtTime, killParticipation, playerGold } from '../../../../shared/calc.ts';
  import { champIcon, itemIcon } from '../../lib/dd.ts';

  let { ingame, idx, v }: { ingame: IngameState; idx: number; v: string } = $props();

  const pa = $derived(ingame.a.players[idx]);
  const pb = $derived(ingame.b.players[idx]);
  const mins = $derived(Math.max(1, ingame.gameTime / 60));
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
  const LANE: Record<string, string> = { TOP: 'Top lane', JGL: 'Jungle', MID: 'Mid lane', BOT: 'Bot lane', SUP: 'Support' };
</script>

{#snippet player(p: PlayerLive, side: 'a' | 'b', kills: number)}
  <div class="pl {side}">
    <div class="champ">{#if p.champion}<img src={champIcon(v, p.champion)} alt="" />{/if}<span class="lv">{p.level}</span></div>
    <div>
      <div class="pname">{p.name}</div>
      <div class="pchamp">{p.championName}</div>
      <div class="items">
        {#each p.items as id}{#if id}<img src={itemIcon(v, id)} alt="" />{:else}<div class="e"></div>{/if}{/each}
      </div>
    </div>
    <div class="pstats">
      <div class="kda">{p.kills} / {p.deaths} / {p.assists}</div>
      <div class="cs">{p.cs} CS · {(p.cs / mins).toFixed(1)}/min</div>
      <div class="cs">KP {killParticipation(p, kills)}%</div>
    </div>
  </div>
{/snippet}

{#snippet diff(label: string, d: number, text: string)}
  <span>{label} <b class:a={d > 0} class:b={d < 0}>{text}</b></span>
{/snippet}

<div class="h2h">
  <div class="head"><span><b>{LANE[ROLES[idx]]}</b> · Head to head</span><span>{fmtTime(ingame.gameTime)}</span></div>
  {@render player(pa, 'a', ingame.a.kills)}
  <div class="diff">
    {@render diff('CS', pa.cs - pb.cs, signed(pa.cs - pb.cs))}
    {@render diff(ingame.goldSource === 'ocr' ? 'Gold' : 'Item gold', playerGold(pa) - playerGold(pb), fmtGold(playerGold(pa) - playerGold(pb), true))}
    {@render diff('Level', pa.level - pb.level, signed(pa.level - pb.level))}
  </div>
  {@render player(pb, 'b', ingame.b.kills)}
</div>

<style>
  .h2h { position: absolute; left: 16px; bottom: 28px; width: 420px; background: var(--panel); border: 1px solid var(--line);
         border-radius: var(--radius); overflow: hidden; animation: slide .4s ease-out both; }
  @keyframes slide { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: none; } }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: var(--panel-2);
          border-bottom: 1px solid var(--line); font-size: 11px; font-weight: 700; letter-spacing: 1.4px; color: var(--muted); text-transform: uppercase; }
  .head b { color: #fff; }
  .pl { display: grid; grid-template-columns: 52px 1fr auto; gap: 12px; align-items: center; padding: 10px 14px; position: relative; }
  .pl::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 2px 2px 0; }
  .pl.a::before { background: var(--a); } .pl.b::before { background: var(--b); }
  .champ { width: 52px; height: 52px; position: relative; }
  .champ img { width: 100%; height: 100%; border-radius: 8px; display: block; }
  .lv { position: absolute; right: -5px; bottom: -5px; background: #000; border: 1px solid var(--line); font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 6px; }
  .pname { font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
  .pchamp { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .items { display: flex; gap: 3px; margin-top: 6px; }
  .items img, .items .e { width: 24px; height: 24px; border-radius: 4px; }
  .items .e { background: rgba(255,255,255,.06); }
  .pstats { text-align: right; }
  .kda { font-size: 17px; font-weight: 700; }
  .cs { font-size: 12px; color: var(--muted); margin-top: 3px; white-space: nowrap; }
  .diff { display: flex; justify-content: space-around; padding: 7px 14px; background: rgba(155,77,255,.10);
          border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); font-size: 12px; color: var(--muted); font-weight: 600; }
  .diff b { font-weight: 700; color: var(--muted); }
  .diff b.a { color: var(--a); } .diff b.b { color: var(--b); }
</style>

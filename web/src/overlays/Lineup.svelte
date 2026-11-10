<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import { orient } from '../lib/orient.ts';
  import Stage from '../lib/Stage.svelte';
  import SceneFrame from '../lib/SceneFrame.svelte';
  import { champIcon, champLoading, spellIcon } from '../lib/dd.ts';
  import { fearlessLocked } from '../../../shared/defaults.ts';
  import type { DraftPick, LineupPick } from '../../../shared/types.ts';

  const { state: raw } = connect(['match', 'series', 'lineup', 'draft', 'status', 'ui']);
  const app = $derived(orient(raw));
  const m = $derived(app.match);
  const s = $derived(app.series);
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const locked = $derived(s ? fearlessLocked(s) : []);
  // The client only blind-picks what the drafter.lol draft decided, so drafted champions can show before the lock-in.
  const withDraft = (p: LineupPick, dp: DraftPick | null | undefined): LineupPick =>
    p.locked || !dp ? p : { ...p, champion: dp.champion, championName: dp.championName, locked: true };
  const manual = $derived(s ? s.fearlessExtra.filter(c => !s.games.some(g => [...g.champsA, ...g.champsB].includes(c))) : []);
  // champions each team has already played (still locked), plus manually locked ones
  const played = (side: 'A' | 'B') => {
    if (!s) return [];
    const out = new Set<string>();
    for (const g of s.games) for (const c of side === 'A' ? g.champsA : g.champsB) if (locked.includes(c)) out.add(c);
    for (const c of manual) if (locked.includes(c)) out.add(c);
    return [...out];
  };
  const fa = $derived(played('A'));
  const fb = $derived(played('B'));
  const showFearless = $derived(locked.length > 0);
</script>

{#snippet card(p: LineupPick, i: number, side: 'a' | 'b')}
  <div class="card {side}" style:animation-delay="{0.1 + i * 0.08}s">
    <div class="bar"></div>
    {#if p.locked && p.champion}
      {#key p.champion}<img class="art" src={champLoading(p.champion)} alt="" />{/key}
    {:else}
      <div class="art empty"><span>PICKING</span></div>
    {/if}
    <div class="info">
      <div class="role">{p.role}</div>
      <div class="pn">{p.player || '—'}</div>
      <div class="cn">
        <span>{p.championName ?? ''}</span>
        {#if p.spells}<span class="sp">{#each p.spells as sp}<img src={spellIcon(v, sp)} alt="" />{/each}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

{#snippet fl(tag: string, list: string[], side: 'a' | 'b')}
  <div class="fl {side}">
    <div class="fh">FEARLESS · {tag} HAT BEREITS GESPIELT</div>
    <div class="ic">
      {#each list as c}<div class="u"><img src={champIcon(v, c)} alt="" /><i></i></div>{/each}
    </div>
  </div>
{/snippet}

<Stage match={m}>
  <SceneFrame kicker={m?.leagueLine ?? ''} badge={m && s ? `BO${m.format} · SPIEL ${s.gameNumber}` : ''}>
    {#if m && s && app.lineup}
      <div class="title"><div class="t">LINEUP</div><div class="st">nach dem Champ Select · Spiel {s.gameNumber}</div></div>
      <div class="picks">
        <div class="side">{#each app.lineup.a as p, i (p.role)}{@render card(withDraft(p, app.draft?.a?.picks[i]), i, 'a')}{/each}</div>
        <div class="vs">VS</div>
        <div class="side">{#each [...app.lineup.b].reverse() as p (p.role)}{@render card(withDraft(p, app.draft?.b?.picks[app.lineup.b.indexOf(p)]), app.lineup.b.indexOf(p), 'b')}{/each}</div>
      </div>
      {#if showFearless}
        <div class="fear">
          {@render fl(m.teamA.tag, fa, 'a')}
          {@render fl(m.teamB.tag, fb, 'b')}
        </div>
      {/if}
    {/if}
  </SceneFrame>
</Stage>

<style>
  .title { position: absolute; left: 64px; right: 64px; top: 112px; display: flex; align-items: baseline; gap: 24px; }
  .t { font: 800 60px/1 var(--font-num); }
  .st { font: 600 24px var(--font); color: var(--muted); }
  .picks { position: absolute; left: 64px; right: 64px; top: 200px; height: 560px; display: grid; grid-template-columns: 1fr 112px 1fr; }
  .side { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
  .vs { display: grid; place-items: center; font: 800 56px var(--font-num); color: var(--accent); }
  .card { display: flex; flex-direction: column; background: var(--scene-panel); overflow: hidden; animation: rise .5s ease-out both;
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%); }
  .card.b { text-align: right; clip-path: polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px)); }
  .bar { height: 6px; background: var(--a); flex: none; }
  .card.b .bar { background: var(--b); }
  .art { width: 100%; height: 390px; object-fit: cover; object-position: center 15%; display: block; background: #1d1433; flex: none; animation: fade .6s ease-out both; }
  .art.empty { display: grid; place-items: center; }
  .art.empty span { font: 800 16px var(--font); letter-spacing: .3em; color: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
  .info { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .role { font: 700 14px var(--font); letter-spacing: .2em; color: var(--muted); }
  .pn { font: 800 30px/1.05 var(--font-num); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cn { display: flex; justify-content: space-between; align-items: center; gap: 6px; font: 600 18px var(--font); color: var(--scene-soft); min-height: 24px; }
  .card.b .cn { flex-direction: row-reverse; }
  .sp { display: flex; gap: 3px; }
  .sp img { width: 20px; height: 20px; border-radius: 4px; }

  .fear { position: absolute; left: 64px; right: 64px; top: 800px; height: 200px; display: grid; grid-template-columns: 1fr 1fr; gap: 112px; animation: fade .8s .9s both; }
  .fl { display: flex; flex-direction: column; gap: 14px; padding: 22px 26px; background: var(--panel); min-width: 0; }
  .fl.a { border-left: 8px solid var(--a); }
  .fl.b { border-right: 8px solid var(--b); align-items: flex-end; }
  .fh { font: 700 18px var(--font); letter-spacing: .2em; color: var(--scene-soft); }
  .ic { display: flex; gap: 12px; flex-wrap: wrap; }
  .fl.b .ic { justify-content: flex-end; }
  .u { position: relative; width: 64px; height: 64px; }
  .u img { width: 64px; height: 64px; display: block; filter: grayscale(1) brightness(.7); border-radius: 4px; }
  .u i { position: absolute; left: -4px; right: -4px; top: 30px; height: 4px; background: var(--accent); transform: rotate(-45deg); }
</style>

<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TeamLogo from '../lib/TeamLogo.svelte';
  import { champIcon, champLoading, spellIcon } from '../lib/dd.ts';
  import { fearlessLocked } from '../../../shared/defaults.ts';
  import { fmtTime } from '../../../shared/calc.ts';
  import type { DraftPick, LineupPick } from '../../../shared/types.ts';

  const { state: app } = connect(['match', 'series', 'lineup', 'draft', 'status']);
  const m = $derived(app.match);
  const s = $derived(app.series);
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const locked = $derived(s ? fearlessLocked(s) : []);
  // The client only blind-picks what the drafter.lol draft decided, so drafted champions can show before the lock-in.
  const withDraft = (p: LineupPick, dp: DraftPick | null | undefined): LineupPick =>
    p.locked || !dp ? p : { ...p, champion: dp.champion, championName: dp.championName, locked: true };
  const manual = $derived(s ? s.fearlessExtra.filter(c => !s.games.some(g => [...g.champsA, ...g.champsB].includes(c))) : []);
</script>

{#snippet card(p: LineupPick, i: number, side: 'a' | 'b')}
  <div class="card {side}" class:picking={!p.locked} style:animation-delay="{0.1 + i * 0.08}s">
    {#if p.locked && p.champion}
      {#key p.champion}<img class="art" src={champLoading(p.champion)} alt="" />{/key}
    {:else}
      <div class="art empty"><span>PICKING</span></div>
    {/if}
    <div class="role">{p.role}</div>
    <div class="info">
      <div class="pn">{p.player || '—'}</div>
      <div class="cn">
        <span>{p.championName ?? ''}</span>
        {#if p.spells}<span class="sp">{#each p.spells as sp}<img src={spellIcon(v, sp)} alt="" />{/each}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

<Stage match={m}>
  <div class="scene-bg"></div>
  {#if m && s && app.lineup}
    <div class="head">
      <div class="ht">
        <TeamLogo team={m.teamA} size={76} />
        <div><div class="tag">{m.teamA.tag}</div><div class="name">{m.teamA.name}</div></div>
      </div>
      <div class="hc">
        <div class="eyebrow">Game {s.gameNumber} · <b>Lineups</b></div>
        <div class="score"><span class="sa">{s.scoreA}</span><span class="d">–</span><span class="sb">{s.scoreB}</span></div>
      </div>
      <div class="ht r">
        <TeamLogo team={m.teamB} size={76} />
        <div><div class="tag">{m.teamB.tag}</div><div class="name">{m.teamB.name}</div></div>
      </div>
    </div>

    <div class="picks">
      <div class="side">{#each app.lineup.a as p, i (p.role)}{@render card(withDraft(p, app.draft?.a?.picks[i]), i, 'a')}{/each}</div>
      <div class="vs">VS</div>
      <div class="side">{#each app.lineup.b as p, i (p.role)}{@render card(withDraft(p, app.draft?.b?.picks[i]), i, 'b')}{/each}</div>
    </div>

    {#if locked.length}
      <div class="fearless" class:compact={s.games.length + (manual.length ? 1 : 0) > 2}>
        <div class="fl-head">
          <div class="eyebrow"><b>Fearless</b> · Locked for both teams</div>
          <div class="note">{locked.length} champions already played this series</div>
        </div>
        {#each s.games as g (g.number)}
          <div class="fl-game">
            <div class="gl">GAME {g.number}<small>{g.winner ? `${g.winner === 'A' ? m.teamA.tag : m.teamB.tag} win · ` : ''}{fmtTime(g.durationSec)}</small></div>
            <div class="fl-team">
              <div class="lbl a">{m.teamA.tag}</div>
              {#each g.champsA.filter(c => locked.includes(c)) as c}<div class="used"><img src={champIcon(v, c)} alt="" /></div>{/each}
            </div>
            <div class="fl-team r">
              {#each g.champsB.filter(c => locked.includes(c)) as c}<div class="used"><img src={champIcon(v, c)} alt="" /></div>{/each}
              <div class="lbl b">{m.teamB.tag}</div>
            </div>
          </div>
        {/each}
        {#if manual.length}
          <div class="fl-game">
            <div class="gl">OTHER</div>
            <div class="fl-team">{#each manual as c}<div class="used"><img src={champIcon(v, c)} alt="" /></div>{/each}</div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</Stage>

<style>
  .head { position: absolute; top: 70px; left: 42px; right: 42px; height: 100px; display: grid; grid-template-columns: 1fr 360px 1fr; align-items: center; }
  .ht { display: flex; align-items: center; gap: 18px; }
  .ht.r { flex-direction: row-reverse; text-align: right; }
  .tag { font-size: 36px; font-weight: 800; line-height: 1; }
  .name { font-size: 16px; color: var(--muted); margin-top: 4px; }
  .hc { text-align: center; }
  .score { font-size: 52px; font-weight: 900; letter-spacing: 2px; line-height: 1; margin-top: 8px; }
  .sa { color: var(--a); } .sb { color: var(--b); } .d { color: var(--dim); margin: 0 10px; }

  .picks { position: absolute; top: 236px; left: 42px; right: 42px; display: flex; justify-content: space-between; }
  .side { display: flex; gap: 12px; }
  .vs { align-self: center; text-align: center; font-size: 30px; font-weight: 900; color: var(--dim); width: 100px; }
  .card { width: 160px; border-radius: 12px; overflow: hidden; background: var(--cover); border: 1px solid var(--line);
          position: relative; animation: rise .5s ease-out both; }
  .art { width: 160px; height: 291px; display: block; object-fit: cover; animation: fade .6s ease-out both; }
  .art.empty { background: linear-gradient(180deg, #1e1430, #100a1c); display: grid; place-items: center; }
  .art.empty span { font-size: 13px; font-weight: 800; letter-spacing: 3px; color: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
  .role { position: absolute; top: 10px; left: 10px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; background: rgba(0,0,0,.65); padding: 3px 7px; border-radius: 5px; }
  .info { padding: 10px 12px 12px; border-top: 3px solid var(--a); }
  .card.b .info { border-top-color: var(--b); }
  .pn { font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cn { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 13px; color: var(--muted); min-height: 20px; }
  .sp { display: flex; gap: 3px; }
  .sp img { width: 20px; height: 20px; border-radius: 4px; }

  .fearless { position: absolute; left: 42px; right: 42px; top: 720px; background: var(--panel); border: 1px solid var(--line);
              border-radius: 16px; padding: 22px 32px; animation: fade .8s .9s both; }
  .fl-head { display: flex; justify-content: space-between; align-items: baseline; }
  .fl-head .eyebrow :global(b) { color: var(--sg-glow); }
  .note { font-size: 14px; color: var(--muted); }
  .fl-game { display: grid; grid-template-columns: 110px 1fr 1fr; align-items: center; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
  .gl { font-size: 15px; font-weight: 800; letter-spacing: 2px; color: var(--muted); }
  .gl small { display: block; font-size: 12px; font-weight: 600; letter-spacing: 1px; color: var(--dim); margin-top: 4px; }
  .fl-team { display: flex; gap: 12px; align-items: center; }
  .fl-team.r { justify-content: flex-end; }
  .lbl { font-size: 14px; font-weight: 800; width: 44px; }
  .lbl.a { color: var(--a); } .lbl.b { color: var(--b); text-align: right; }
  .used img { width: 64px; height: 64px; border-radius: 10px; display: block; filter: grayscale(.85) brightness(.75); }
  /* Bo5: up to four finished games must still fit below the cards */
  .compact { top: 700px; padding: 16px 28px; }
  .compact .fl-game { margin-top: 8px; padding-top: 8px; }
  .compact .used img { width: 44px; height: 44px; border-radius: 8px; }
</style>

<script lang="ts">
  import { ROLES, type SceneKey, type TeamKey } from '../../../shared/types.ts';
  import { fmtGold, fmtTime } from '../../../shared/calc.ts';
  import { keys, type Action, type App } from './types.ts';

  let { app, action, hotkeys, gotoTab }: {
    app: App; action: Action; hotkeys: Record<string, string>; gotoTab: (t: 'live' | 'match' | 'series' | 'setup') => void;
  } = $props();

  const SCENES: { key: SceneKey; label: string; desc: string; hk?: string }[] = [
    { key: 'startingSoon', label: 'Starting Soon', desc: 'Countdown, matchup' },
    { key: 'draft', label: 'Draft', desc: 'drafter.lol view' },
    { key: 'lineup', label: 'Lineup', desc: 'Picks + Fearless', },
    { key: 'ingame', label: 'Ingame', desc: 'Game + overlay' },
    { key: 'postgame', label: 'Post-Game', desc: 'Stats + gold graph' },
    { key: 'pause', label: 'Pause', desc: 'Technical pause', hk: 'scene:pause' },
  ];
  const LANE_LABEL: Record<string, string> = { TOP: 'Top', JGL: 'Jungle', MID: 'Mid', BOT: 'Bot', SUP: 'Support' };

  const m = $derived(app.match);
  const g = $derived(app.ingame);
  const pg = $derived(app.postgame);
  const ui = $derived(app.ui);
  const teamName = (k: TeamKey) => (k === 'A' ? m?.teamA.name : m?.teamB.name) ?? k;

  // smooth clock between the 1 s updates
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 250); return () => clearInterval(t); });
  const clock = $derived(g?.active ? (g.paused ? g.gameTime : g.gameTime + Math.min(2, Math.max(0, (now - g.receivedAt) / 1000))) : 0);
  const countdownLeft = $derived(m?.countdownTarget ? Math.max(0, Math.round((m.countdownTarget - now) / 1000)) : null);
  const startCountdown = (min: number) => action('match:update', { countdownTarget: Date.now() + min * 60_000 });
  let customMin = $state(10);

  let pauseText = $state('');
  $effect(() => { if (ui && !pauseText) pauseText = ui.pauseText; });

  const locked = $derived(app.lineup ? app.lineup.a.filter(p => p.locked).length + app.lineup.b.filter(p => p.locked).length : 0);
</script>

{#snippet hk(name: string | undefined)}
  {#if name && hotkeys[name]}<span class="hk">{#each keys(hotkeys[name]) as k}<kbd>{k}</kbd>{/each}</span>{/if}
{/snippet}

<div class="live">
  <!-- ===== left: what goes on air ===== -->
  <div class="col">
    <section class="card">
      <div class="card-title">On air <span class="hint">click to switch the OBS scene</span></div>
      <div class="scenes">
        {#each SCENES as s (s.key)}
          {@const on = ui?.scene === s.key}
          <button class="scene" class:on onclick={() => action('ui:scene', { scene: s.key })}>
            {#if on}<span class="tally">ON AIR</span>{/if}
            <span class="sname">{s.label}</span>
            <span class="sdesc">{s.desc}</span>
            {@render hk(s.hk)}
          </button>
        {/each}
      </div>
      <label class="switch auto">
        <input type="checkbox" checked={ui?.autoScenes} onchange={() => action('ui:autoScenes')} />
        <span class="track"></span>
        <span>
          <b>Automatic switching</b>
          <span class="muted"> · Lineup at champ select, Ingame at game start, Post-Game at the end</span>
        </span>
        {@render hk('scenes:auto')}
      </label>
    </section>

    <section class="card">
      <div class="card-title">Head to head <span class="hint">{g?.active ? 'press again to hide' : 'available during the game'}</span></div>
      <div class="lanes">
        {#each ROLES as r, i (r)}
          <button class="lane" class:on={ui?.h2hLane === r} disabled={!g?.active} onclick={() => action('ui:h2h', { lane: r })}>
            <span class="lname">{LANE_LABEL[r]}</span>
            {#if g?.active}
              <span class="lchamps">{g.a.players[i]?.championName || '–'} <span class="muted">vs</span> {g.b.players[i]?.championName || '–'}</span>
            {/if}
            {@render hk(`h2h:${r}`)}
          </button>
        {/each}
        <button class="lane hide" disabled={!ui?.h2hLane} onclick={() => action('ui:h2h', { lane: null })}>
          <span class="lname">Hide</span>{@render hk('h2h:off')}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">Post-game page</div>
      <div class="row">
        <div class="seg">
          <button class:on={ui?.postgamePage === 1} onclick={() => action('ui:postgamePage', { page: 1 })}>Overview + gold graph</button>
          <button class:on={ui?.postgamePage === 2} onclick={() => action('ui:postgamePage', { page: 2 })}>Lane head to head</button>
        </div>
        {@render hk('postgame:page')}
      </div>
    </section>
  </div>

  <!-- ===== right: what is happening now ===== -->
  <div class="col">
    <section class="card now" class:attention={pg?.active && !pg.winner}>
      <div class="card-title">Now</div>
      {#if pg?.active && !g?.active}
        <div class="state">Game over <span class="muted">· {fmtTime(pg.durationSec)}</span></div>
        {#if !pg.winner}
          <p class="ask">Who won? The post-game shows “Game over” until you confirm.</p>
        {:else}
          <p class="muted">Confirmed: <b class="win">{teamName(pg.winner)}</b> won. Series {app.series?.scoreA}–{app.series?.scoreB}. Wrong? Click the other team.</p>
        {/if}
        <div class="winners">
          {#each ['A', 'B'] as const as k}
            <button class="winner" class:on={pg.winner === k} class:suggest={!pg.winner && pg.winnerGuess === k}
              onclick={() => action('series:confirmWinner', { winner: k })}>
              <span>{teamName(k)}</span>
              <small>{pg.winner === k ? 'winner ✓' : !pg.winner && pg.winnerGuess === k ? 'suggested · confirm' : pg.winner ? 'change to this team' : 'confirm'}</small>
            </button>
          {/each}
        </div>
      {:else if g?.active}
        <div class="state">{g.paused ? 'Paused' : 'In game'} <span class="clock">{fmtTime(clock)}</span></div>
        <div class="score">
          <div><b>{m?.teamA.tag}</b><span class="k">{g.a.kills}</span></div>
          <div class="vs">kills</div>
          <div><span class="k">{g.b.kills}</span><b>{m?.teamB.tag}</b></div>
        </div>
        <div class="facts">
          <span>Gold {fmtGold(g.a.gold)} – {fmtGold(g.b.gold)} <b class:pos={g.a.gold > g.b.gold} class:neg={g.a.gold < g.b.gold}>({fmtGold(g.a.gold - g.b.gold, true)})</b></span>
          <span class="pill {g.goldSource === 'ocr' ? 'ok' : 'warn'}">{g.goldSource === 'ocr' ? 'Gold via OCR' : 'Item gold (OCR off)'}</span>
          <span>Towers {g.a.towers}–{g.b.towers}</span>
        </div>
      {:else if app.lineup?.active}
        <div class="state">Champ select <span class="muted">· {locked}/10 locked</span></div>
        <p class="muted">The lineup overlay fills in as players lock in.</p>
      {:else}
        <div class="state">Waiting <span class="muted">· series {app.series?.scoreA ?? 0}–{app.series?.scoreB ?? 0}, next game {app.series?.gameNumber ?? 1}</span></div>
        <p class="muted">
          {#if app.status?.lcu === 'down'}League client not found – start it with the observer account.
          {:else}Everything switches automatically once champ select starts.{/if}
        </p>
        {#if m && !m.rosterB.length}
          <button class="ghost link" onclick={() => gotoTab('match')}>Opponent roster missing → Match tab</button>
        {/if}
      {/if}
    </section>

    <section class="card">
      <div class="card-title">Starting soon countdown
        <span class="hint">{countdownLeft === null ? 'hidden' : countdownLeft > 0 ? `${String(Math.floor(countdownLeft / 60)).padStart(2, '0')}:${String(countdownLeft % 60).padStart(2, '0')} left` : 'shows “Live soon”'}</span>
      </div>
      <div class="row wrap">
        {#each [5, 10, 15] as min}<button onclick={() => startCountdown(min)}>{min} min</button>{/each}
        <span class="sep"></span>
        <input type="number" min="1" max="180" bind:value={customMin} style="width:72px" />
        <button onclick={() => startCountdown(customMin)}>Start</button>
        <button class="ghost" disabled={countdownLeft === null} onclick={() => action('match:update', { countdownTarget: null })}>Hide</button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">Pause screen</div>
      <div class="row">
        <input style="flex:1" bind:value={pauseText} placeholder="Technical pause"
          onchange={() => action('ui:pauseText', { text: pauseText })} />
        <button class="primary" onclick={() => { action('ui:pauseText', { text: pauseText }); action('ui:scene', { scene: 'pause' }); }}>Show pause</button>
      </div>
    </section>
  </div>
</div>

<style>
  .live { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  @media (max-width: 1100px) {
    .live { grid-template-columns: 1fr; }
    .col:last-child { order: -1; }   /* "Now" (e.g. confirm winner) must stay visible on a half-width window */
  }
  .col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }

  .scenes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .scene { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
           min-height: 86px; padding: 14px 16px !important; border-radius: 12px !important; border-width: 2px !important; }
  .scene .sname { font-size: 17px; font-weight: 800; }
  .scene .sdesc { font-size: 12px; color: var(--dim); font-weight: 500; }
  .scene.on { border-color: var(--onair) !important; background: rgba(255,59,69,.10) !important; box-shadow: 0 0 0 1px var(--onair) inset; }
  .tally { position: absolute; top: 10px; right: 10px; font-size: 10px; font-weight: 900; letter-spacing: 1.2px; color: #fff;
           background: var(--onair); padding: 3px 7px; border-radius: 5px; }
  .hk { display: inline-flex; gap: 3px; margin-top: auto; }
  .scene .hk { margin-top: 6px; }
  .auto { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
  .auto .hk { margin-left: auto; margin-top: 0; }

  .lanes { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  @media (max-width: 1300px) { .lanes { grid-template-columns: repeat(3, 1fr); } }
  .lane { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; min-height: 78px; padding: 12px !important; border-radius: 12px !important; }
  .lane .lname { font-size: 15px; font-weight: 800; }
  .lane .lchamps { font-size: 11px; color: var(--muted); font-weight: 500; line-height: 1.3; }
  .lane.on { background: var(--sg) !important; border-color: var(--sg) !important; }
  .lane.on .lchamps, .lane.on .muted { color: rgba(255,255,255,.85); }
  .lane .hk { margin-top: auto; }

  .now.attention { border-color: var(--warn); box-shadow: 0 0 0 1px var(--warn) inset; }
  .state { font-size: 22px; font-weight: 800; display: flex; align-items: baseline; gap: 8px; }
  .clock { margin-left: auto; font-size: 30px; font-weight: 800; font-feature-settings: "tnum" 1; }
  .ask { color: var(--warn); font-weight: 600; margin: 8px 0 12px; }
  .win { color: var(--ok); }
  .winners { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .winner { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 16px !important; font-size: 17px !important; border-radius: 12px !important; border-width: 2px !important; }
  .winner small { font-size: 11px; color: var(--dim); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
  .winner.suggest { border-color: var(--warn) !important; }
  .winner.suggest small { color: var(--warn); }
  .winner.on { border-color: var(--ok) !important; background: rgba(61,220,132,.1) !important; }
  .winner.on small { color: var(--ok); }
  .score { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: 14px 0 10px; }
  .score > div:first-child { display: flex; gap: 12px; align-items: baseline; }
  .score > div:last-child { display: flex; gap: 12px; align-items: baseline; justify-content: flex-end; }
  .score b { font-size: 16px; color: var(--muted); }
  .score .k { font-size: 34px; font-weight: 900; }
  .score .vs { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 1.5px; }
  .facts { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; color: var(--muted); }
  .facts .pos { color: var(--sg); } .facts .neg { color: var(--opp); }
  .link { padding: 6px 0 !important; color: var(--sg) !important; border: none !important; }
  .sep { width: 8px; }
  p { margin-top: 6px; line-height: 1.45; }
</style>

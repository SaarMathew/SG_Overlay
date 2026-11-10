<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import { orient } from '../lib/orient.ts';
  import Stage from '../lib/Stage.svelte';
  import TopBar from './ingame/TopBar.svelte';
  import Scoreboard from './ingame/Scoreboard.svelte';
  import HeadToHead from './ingame/HeadToHead.svelte';
  import FightRecap from './ingame/FightRecap.svelte';
  import { fmtTime } from '../../../shared/calc.ts';
  import type { Fight, ObjectiveTimer, Popup } from '../../../shared/types.ts';
  import { ROLES } from '../../../shared/types.ts';

  const { state: raw } = connect(['match', 'series', 'ingame', 'status', 'ui']);
  const app = $derived(orient(raw));

  // Interpolate the game clock between the 1 Hz polls so timers tick smoothly.
  let now = $state(Date.now());
  $effect(() => {
    let raf = 0;
    const loop = () => { now = Date.now(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
  const g = $derived(app.ingame);
  const clock = $derived(g ? (g.paused ? g.gameTime : g.gameTime + Math.min(2, Math.max(0, (now - g.receivedAt) / 1000))) : 0);
  const popup = $derived(g?.popups.find(p => p.from <= now && p.until > now) ?? null);
  // keep the last popup's content while the box closes towards the centre
  let lastPop = $state<Popup | null>(null);
  $effect(() => { if (popup) lastPop = popup; });
  const pop = $derived(popup ?? lastPop ?? EMPTY_POP);
  const recap = $derived.by(() => {
    const r = app.ui?.fightRecap;
    return r && r.until > now ? g?.fights?.find(f => f.id === r.id) ?? null : null;
  });
  let lastRecap = $state<Fight | null>(null);
  $effect(() => { if (recap) lastRecap = recap; });
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const lane = $derived(app.ui?.h2hLane ?? null);
  const laneIdx = $derived(lane ? ROLES.indexOf(lane) : -1);
  const debugBg = new URLSearchParams(location.search).has('bg');

  const EMPTY_POP: Popup = { id: 0, kind: 'tower', team: null, title: '', text: '', from: 0, until: 0 };
  const TIMER_LABEL: Record<ObjectiveTimer['kind'], string> = {
    dragon: 'DRACHE', elder: 'ÄLTESTER DRACHE', baron: 'BARON', atakhan: 'ATAKHAN', herald: 'HERALD', grubs: 'GRUBS',
    baronBuff: 'BARON-BUFF', elderBuff: 'ELDER-BUFF',
  };
  function timerIcon(kind: ObjectiveTimer['kind'], dt?: string): string {
    if (kind === 'dragon') return dt ? `/assets/objectives/${dt}.png` : '';   // type not known yet: neutral glyph
    if (kind === 'elder' || kind === 'elderBuff') return '/assets/objectives/elder.png';
    if (kind === 'baron' || kind === 'baronBuff') return '/assets/objectives/baron.png';
    if (kind === 'herald') return '/assets/objectives/herald.png';
    return '/assets/objectives/grub.png';
  }
  function popIcon(p: Popup): string {
    switch (p.kind) {
      case 'dragon': return p.dragonType ? `/assets/objectives/${p.dragonType}.png` : '';
      case 'elder': return '/assets/objectives/elder.png';
      case 'baron': return '/assets/objectives/baron.png';
      case 'herald': return '/assets/objectives/herald.png';
      case 'grubs': return '/assets/objectives/grub.png';
      case 'inhib': return '/assets/objectives/inhib.png';
      default: return '/assets/objectives/tower.png';
    }
  }
  const popTeam = (p: Popup) => (p.team === 'A' ? app.match?.teamA.name : p.team === 'B' ? app.match?.teamB.name : '')?.toUpperCase() ?? '';
  function popTitle(p: Popup): string {
    const stolen = /steal|stolen/i.test(p.text) || /stolen/i.test(p.title);
    switch (p.kind) {
      case 'dragon': return /soul/i.test(p.title) ? 'DRACHENSEELE' : stolen ? 'DRACHE GESTOHLEN' : 'DRACHE';
      case 'elder': return stolen ? 'ÄLTESTER DRACHE GESTOHLEN' : 'ÄLTESTER DRACHE';
      case 'baron': return stolen ? 'BARON GESTOHLEN' : 'BARON NASHOR';
      case 'herald': return stolen ? 'HERALD GESTOHLEN' : 'RIFT-HERALD';
      case 'grubs': return 'VOID-GRUBS';
      case 'atakhan': return 'ATAKHAN';
      case 'inhib': return 'INHIBITOR';
      case 'tower': return 'TURM';
      default: return p.title.toUpperCase();   // ace, first blood, multikills
    }
  }
</script>

<Stage match={app.match}>
  {#if debugBg}<div class="debug-bg"></div>{/if}
  {#if g?.active && app.match && app.series}
    <TopBar ingame={g} match={app.match} series={app.series} {clock} />

    {#if g.timers.length || g.inhibTimers.length}
      <div class="timers">
        {#each g.timers as t (t.id)}
          {@const left = t.at - clock}
          {@const buff = t.kind.endsWith('Buff')}
          {@const tm = t.team === 'A' ? app.match.teamA.tag : t.team === 'B' ? app.match.teamB.tag : ''}
          <div class="timer" class:up={left <= 0 && !buff} style:--line={t.team ? `var(--${t.team.toLowerCase()})` : 'rgba(255,255,255,.14)'}>
            {#if timerIcon(t.kind, t.dragonType)}<img src={timerIcon(t.kind, t.dragonType)} alt="" />{:else}<i class="drake"></i>{/if}
            <span class="lbl">{TIMER_LABEL[t.kind]}{tm && buff ? ` ${tm}` : ''}</span>
            <span class="t">{left <= 0 ? 'UP' : fmtTime(left)}</span>
          </div>
        {/each}
        {#each g.inhibTimers as i}
          <div class="timer" style:--line="var(--{i.team.toLowerCase()})">
            <img src="/assets/objectives/inhib.png" alt="" />
            <span class="lbl">INHIB {i.team === 'A' ? app.match.teamA.tag : app.match.teamB.tag}{i.lane ? ` ${i.lane}` : ''}</span>
            <span class="t">{fmtTime(Math.max(0, i.at - clock))}</span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="popup" class:open={!!popup} style:--c={pop.team ? `var(--${pop.team.toLowerCase()})` : 'var(--accent)'}>
      <div class="accent"></div>
      <div class="icon">{#if popIcon(pop)}<img src={popIcon(pop)} alt="" />{:else}<i class="drake"></i>{/if}</div>
      <div class="body">
        <div class="kicker"><i></i>{popTeam(pop)}</div>
        <div class="title">{popTitle(pop)}</div>
        <div class="sub">{pop.text}{pop.detail ? ` · ${pop.detail}` : ''}</div>
      </div>
    </div>

    {#if laneIdx >= 0}
      {#key lane}<HeadToHead ingame={g} idx={laneIdx} {v} />{/key}
    {/if}

    <Scoreboard ingame={g} {v} focus={laneIdx} away={!!recap} />
    {#if lastRecap}<FightRecap fight={recap ?? lastRecap} ingame={g} match={app.match} {v} shown={!!recap} />{/if}
  {/if}
</Stage>

<style>
  .debug-bg { position: absolute; inset: 0; background: #111 url(/assets/spectator-midgame.webp) 0 0 / 1920px 1080px no-repeat; }

  .timers { position: absolute; top: 112px; left: 0; right: 0; display: flex; justify-content: center; gap: 10px; }
  .timer { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; white-space: nowrap;
           background: rgba(18, 11, 32, .94); border-bottom: 3px solid var(--line); animation: fade .3s; }
  .timer img { width: 20px; height: 20px; display: block; }
  /* dragon of unknown element (before the rift changes): neutral diamond instead of guessing a type */
  .drake { display: block; width: 14px; height: 14px; margin: 3px; background: var(--soft); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
  .icon .drake { width: 44px; height: 44px; margin: 8px; }
  .timer .lbl { font: 700 13px var(--font); letter-spacing: .14em; color: var(--soft); }
  .timer .t { font: 800 20px var(--font-num); min-width: 40px; }
  .timer.up .t { color: #7dffa8; }

  .popup { position: absolute; top: 168px; left: 50%; margin-left: -310px; width: 620px; height: 104px; display: flex; align-items: stretch;
           background: var(--panel); clip-path: polygon(50% 0, 50% 0, 50% 100%, 50% 100%); opacity: 0;
           transition: clip-path .32s cubic-bezier(.2, .8, .2, 1), opacity .2s; }
  .popup.open { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); opacity: 1; }
  .accent { width: 10px; background: var(--c); flex: none; }
  .icon { width: 104px; display: grid; place-items: center; background: var(--bg); flex: none; }
  .icon img { width: 60px; height: 60px; display: block; }
  .body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 24px; min-width: 0; }
  .kicker { display: flex; align-items: center; gap: 8px; font: 700 15px var(--font); letter-spacing: .18em; }
  .kicker i { width: 10px; height: 10px; background: var(--c); }
  .title { font: 800 46px/1 var(--font-num); letter-spacing: .01em; white-space: nowrap; }
  .sub { font: 600 17px var(--font); color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TopBar from './ingame/TopBar.svelte';
  import Scoreboard from './ingame/Scoreboard.svelte';
  import HeadToHead from './ingame/HeadToHead.svelte';
  import { fmtTime } from '../../../shared/calc.ts';
  import { ROLES } from '../../../shared/types.ts';

  const { state: app } = connect(['match', 'series', 'ingame', 'ui', 'status']);

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
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const lane = $derived(app.ui?.h2hLane ?? null);
  const laneIdx = $derived(lane ? ROLES.indexOf(lane) : -1);
  const debugBg = new URLSearchParams(location.search).has('bg');

  const POPUP_ICON: Record<string, string> = {
    dragon: '◆', elder: '◆', baron: 'B', herald: 'H', grubs: 'G', atakhan: 'A', inhib: 'I', ace: '✦', multikill: '✦', firstblood: '✦', tower: 'T',
  };
</script>

<Stage match={app.match}>
  {#if debugBg}<div class="debug-bg"></div>{/if}
  {#if g?.active && app.match && app.series}
    <TopBar ingame={g} match={app.match} series={app.series} {clock} />

    {#if g.timers.length}
      <div class="timers">
        {#each g.timers as t (t.id)}
          {@const left = t.at - clock}
          <div class="timer" class:up={left <= 0 && !t.kind.endsWith('Buff')} class:buff={t.kind.endsWith('Buff')}>
            <i class="dot {t.kind} {t.dragonType ?? ''}" style:background={t.team ? `var(--${t.team.toLowerCase()})` : null}></i>
            <span class="lbl">{t.label}{t.team ? ` · ${t.team === 'A' ? app.match.teamA.tag : app.match.teamB.tag}` : ''}</span>
            <span class="t">{left <= 0 ? 'UP' : fmtTime(left)}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if popup}
      {#key popup.id}
        <div class="popup" style:--c={popup.team ? `var(--${popup.team.toLowerCase()})` : 'var(--dim)'}>
          <div class="accent"></div>
          <div class="body">
            <div class="icon {popup.dragonType ?? ''}">{POPUP_ICON[popup.kind] ?? '•'}</div>
            <div>
              <div class="title">{popup.title}</div>
              <div class="main">{popup.text}</div>
            </div>
            {#if popup.detail}<div class="meta">{popup.detail}</div>{/if}
          </div>
        </div>
      {/key}
    {/if}

    {#if laneIdx >= 0}
      {#key lane}<HeadToHead ingame={g} idx={laneIdx} {v} />{/key}
    {/if}

    <Scoreboard ingame={g} {v} focus={laneIdx} />
  {/if}
</Stage>

<style>
  .debug-bg { position: absolute; inset: 0; background: #111 url(/assets/spectator-midgame.webp) 0 0 / 1920px 1080px no-repeat; }

  .timers { position: absolute; top: 116px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; }
  .timer { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px 0 10px; white-space: nowrap;
           background: var(--panel); border: 1px solid var(--line); border-radius: 15px; font-size: 13px; font-weight: 600; animation: fade .3s; }
  .timer .t { font-weight: 700; color: #fff; min-width: 34px; }
  .timer .lbl { color: var(--muted); }
  .timer.up { border-color: rgba(255,255,255,.35); }
  .timer.up .t { color: #7dffa8; }
  .dot { width: 10px; height: 10px; transform: rotate(45deg); border-radius: 2px; display: block; background: #b07cff; }
  .dot.infernal { background: var(--drag-infernal); } .dot.ocean { background: var(--drag-ocean); }
  .dot.mountain { background: var(--drag-mountain); } .dot.cloud { background: var(--drag-cloud); }
  .dot.hextech { background: var(--drag-hextech); } .dot.chemtech { background: var(--drag-chemtech); }
  .dot.elder { background: var(--drag-elder); } .dot.dragon { background: #e8a33d; }
  .dot.grubs, .dot.herald, .dot.atakhan { border-radius: 50%; transform: none; background: #b07cff; }

  .popup { position: absolute; top: 162px; left: 50%; transform: translateX(-50%); width: 560px;
           background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden;
           display: flex; animation: pop .35s ease-out both; }
  .accent { width: 5px; background: var(--c); }
  .body { padding: 12px 16px; display: flex; align-items: center; gap: 14px; flex: 1; }
  .icon { width: 44px; height: 44px; border-radius: 8px; background: linear-gradient(135deg, #6c3bd1, #2a1650);
          display: grid; place-items: center; font-weight: 800; font-size: 18px; flex: none; }
  .icon.infernal { background: var(--drag-infernal); } .icon.ocean { background: var(--drag-ocean); }
  .icon.mountain { background: var(--drag-mountain); } .icon.cloud { background: var(--drag-cloud); color: #222; }
  .icon.hextech { background: var(--drag-hextech); color: #123; } .icon.chemtech { background: var(--drag-chemtech); color: #222; }
  .icon.elder { background: var(--drag-elder); color: #222; }
  .title { font-size: 11px; color: var(--muted); font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; }
  .main { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .meta { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--c); text-transform: uppercase; letter-spacing: 1px; }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>

<script lang="ts">
  import { ROLES, type LogEntry } from '../../../shared/types.ts';
  import { fmtTime } from '../../../shared/calc.ts';
  import { connect } from '../lib/state.svelte.ts';

  const { state: app, action } = connect(['ingame', 'ui', 'status', 'match']);

  const pb = $derived(app.ingame?.active ? app.status?.playback ?? null : null);
  const ui = $derived(app.ui);
  const behind = $derived(pb ? Math.max(0, pb.length - pb.time) : 0);
  const isLive = $derived(behind < 3);
  const fightOn = $derived(!!ui?.fightRecap && ui.fightRecap.until > Date.now());

  // The Live Client API only knows events up to the furthest point the replay has been played, so markers
  // appear as the replay progresses (unlike Riot's own bar, which knows the whole game). Raw A/B, no orient().
  const colorOf = (t: 'A' | 'B' | null) => (t === 'A' ? app.match?.teamA.color : t === 'B' ? app.match?.teamB.color : null) || '#aaa';
  const ICON: Partial<Record<LogEntry['kind'], string>> = { grubs: 'grub', herald: 'herald', baron: 'baron', tower: 'tower', inhib: 'inhib', elder: 'elder' };
  const iconOf = (l: LogEntry) => (l.kind === 'dragon' ? l.dragonType ?? 'cloud' : ICON[l.kind] ?? null);
  const STRONG = new Set<LogEntry['kind']>(['multikill', 'ace', 'firstblood']);
  const MAX_LINES = 4;
  const fmt = (t: number) => fmtTime(t);

  interface Group { pos: number; items: LogEntry[]; main: LogEntry }
  const groups = $derived.by((): Group[] => {
    const len = pb?.length ?? 0;
    const log = app.ingame?.active ? app.ingame.log ?? [] : [];
    if (!len) return [];
    const out: Group[] = [];
    for (const l of log) {
      if (l.t > len) continue;
      const pos = l.t / len;
      const last = out.at(-1);
      if (last && pos - last.pos < 0.01) {
        last.items.push(l);
        // the most notable entry represents the group: objective icon > strong tick > kill
        const rank = (x: LogEntry) => (iconOf(x) ? 2 : STRONG.has(x.kind) ? 1 : 0);
        if (rank(l) > rank(last.main)) last.main = l;
      } else out.push({ pos, items: [l], main: l });
    }
    return out;
  });
  const bands = $derived(pb?.length ? (app.ingame?.fights ?? []).map(f => ({ l: f.start / pb.length * 100, w: Math.max(0.3, (f.end - f.start) / pb.length * 100), f })) : []);

  const tip = (g: Group) => {
    const lines = g.items.slice(0, MAX_LINES).map(l => `${fmt(l.t)} · ${l.text}`);
    if (g.items.length > MAX_LINES) lines.push(`+${g.items.length - MAX_LINES} weitere`);
    return lines;
  };
  const fightTip = (f: { start: number; end: number; killsA: number; killsB: number; winner: 'A' | 'B' | null }) => {
    const m = app.match;
    const w = f.winner ? (m?.[f.winner === 'A' ? 'teamA' : 'teamB'].tag ?? f.winner) : 'Gleichstand';
    return [`${fmt(f.start)}–${fmt(f.end)} · Teamfight ${f.killsA}:${f.killsB} ${f.winner ? w : ''}`.trim()];
  };
  let hover = $state<{ x: number; lines: string[] } | null>(null);
  const show = (pos: number, lines: string[]) => { hover = { x: pos * 100, lines }; };
  // dev only: ?hover=N opens the tooltip of the N-th marker group (screenshots)
  const devHover = Number(new URLSearchParams(location.search).get('hover') ?? 0);
  $effect(() => { if (devHover > 0 && groups[devHover - 1]) show(groups[devHover - 1].pos, tip(groups[devHover - 1])); });

  let dragging = $state(false);
  let dragTime = $state(0);
  const shown = $derived(dragging && pb ? dragTime : pb?.time ?? 0);

  const timeAt = (e: PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (pb?.length ?? 0);
  };
  const down = (e: PointerEvent) => {
    if (!pb) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragging = true;
    dragTime = timeAt(e, el);
  };
  const move = (e: PointerEvent) => { if (dragging) dragTime = timeAt(e, e.currentTarget as HTMLElement); };
  const up = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    action('replay:jump', { time: timeAt(e, e.currentTarget as HTMLElement) });
  };
</script>

<div class="op">
  <div class="top">
    {#if pb}
      <span class="t">{fmtTime(shown)}</span>
      <div class="bar" role="slider" tabindex="-1" aria-label="Replay" aria-valuenow={shown}
        onpointerdown={down} onpointermove={move} onpointerup={up}>
        {#each bands as b (b.f.id)}
          <span class="fight" style:left="{b.l}%" style:width="{b.w}%"
            role="presentation" onpointerenter={() => show((b.l + b.w / 2) / 100, fightTip(b.f))} onpointerleave={() => (hover = null)}></span>
        {/each}
        <span class="fill" style:width="{pb.length ? (shown / pb.length) * 100 : 0}%"></span>
        {#each groups as g (g.items[0].t + ':' + g.items[0].kind)}
          {@const ic = iconOf(g.main)}
          <button class="mk" class:ico={!!ic} class:strong={!ic && STRONG.has(g.main.kind)} style:left="{g.pos * 100}%" style:--c={colorOf(g.main.team)}
            aria-label={tip(g)[0]} onpointerdown={e => e.stopPropagation()} onpointerup={e => e.stopPropagation()}
            onpointerenter={() => show(g.pos, tip(g))} onpointerleave={() => (hover = null)}
            onclick={() => action('replay:jump', { time: Math.max(0, g.items[0].t - 5) })}>
            {#if ic}<img src="/assets/objectives/{ic}.png" alt="" />{/if}
          </button>
        {/each}
        <span class="live"></span>
        {#if hover}
          <div class="tip" style:left="{Math.min(88, Math.max(12, hover.x))}%">{#each hover.lines as l}<div>{l}</div>{/each}</div>
        {/if}
      </div>
      <span class="t dim">{fmtTime(pb.length)}</span>
      <span class="behind" class:isl={isLive}>{isLive ? '● LIVE' : `−${fmtTime(behind)} behind live`}</span>
    {:else}
      <span class="none">Kein Replay aktiv</span>
    {/if}
    <button class="x" title="Schließen" onclick={() => window.close()}>×</button>
  </div>
  <div class="btns">
    <div class="grp">
      <button disabled={!pb} onclick={() => action('replay:seek', { delta: -30 })}>−30 s</button>
      <button disabled={!pb} onclick={() => action('replay:seek', { delta: -10 })}>−10 s</button>
      <button class="play" disabled={!pb} onclick={() => action('replay:pause')}>{pb?.paused ? '▶ Play' : '❚❚ Pause'}</button>
      <button disabled={!pb} onclick={() => action('replay:seek', { delta: 10 })}>+10 s</button>
      <button class="liveb" disabled={!pb} onclick={() => action('replay:live')}>● Live</button>
    </div>
    <div class="grp">
      {#each [0.5, 1, 2, 4] as sp}
        <button class:on={pb?.speed === sp} disabled={!pb} onclick={() => action('replay:speed', { speed: sp })}>{sp}×</button>
      {/each}
    </div>
    <div class="grp">
      {#each ROLES as r}
        <button class:on={ui?.h2hLane === r} onclick={() => action('ui:h2h', { lane: r })}>{r}</button>
      {/each}
      <button onclick={() => action('ui:h2h', { lane: null })}>off</button>
    </div>
    <div class="grp">
      <button class:on={fightOn} onclick={() => action(fightOn ? 'fight:hide' : 'fight:show')}>Fight</button>
      <button onclick={() => action('match:swapSides')}>⇄ Seiten</button>
      <button onclick={() => action('ui:scene', { scene: 'pause' })}>Pause-Szene</button>
      <button onclick={() => action('ui:scene', { scene: 'ingame' })}>Ingame</button>
    </div>
  </div>
</div>

<style>
  :global(html), :global(body) { background: #0b0714 !important; height: 100%; user-select: none; cursor: default; }
  .op { height: 100%; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: #140d22; border: 1px solid #2d2048; }
  .top { display: flex; align-items: flex-end; gap: 10px; height: 44px; }
  /* markers stand in a lane ABOVE the bar like Riot's replay bar – on the coloured fill they were hard to see */
  .t { font-family: var(--font-num); font-weight: 700; font-size: 17px; min-width: 52px; text-align: right; }
  .t.dim { color: var(--dim); text-align: left; }
  .bar { flex: 1; height: 14px; background: #261a40; border: 1px solid #2d2048; position: relative; cursor: pointer; touch-action: none; }
  .fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, var(--sg), var(--sg-glow)); pointer-events: none; }
  .fight { position: absolute; top: 0; bottom: 0; background: rgba(255,255,255,.13); }
  .mk { position: absolute; top: -19px; height: 15px; width: 7px; margin-left: -3.5px; padding: 0; border: 0; background: transparent; z-index: 2; }
  .mk::before { content: ''; position: absolute; left: 2px; top: 0; bottom: 0; width: 3px; background: var(--c); box-shadow: 0 0 0 1px rgba(0,0,0,.8); }
  .mk.strong { top: -23px; height: 19px; }
  .mk.strong::after { content: ''; position: absolute; left: 0; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
  .mk.ico { top: -20px; height: 16px; width: 16px; margin-left: -8px; background: transparent; }
  .mk.ico::before { display: none; }
  .mk.ico img { position: absolute; left: 0; top: 0; width: 16px; height: 16px; object-fit: contain; filter: drop-shadow(0 0 1px var(--c)) drop-shadow(0 0 2px var(--c)); }
  .mk:hover:not(:disabled) { background: transparent; }
  .mk:hover { z-index: 5; }
  .tip { position: absolute; top: calc(100% + 8px); transform: translateX(-50%); background: #0b0714; border: 1px solid #4a3578; padding: 5px 8px; font-size: 12px; font-weight: 600; white-space: nowrap; pointer-events: none; z-index: 10; line-height: 1.5; }
  .live { position: absolute; right: -1px; top: -4px; bottom: -4px; width: 3px; background: #ff3b45; pointer-events: none; }
  .behind { font-size: 12px; font-weight: 700; color: var(--muted); min-width: 130px; }
  .behind.isl { color: #ff5c61; }
  .none { flex: 1; color: var(--muted); font-weight: 600; }
  .btns { display: flex; gap: 8px; flex-wrap: nowrap; }
  .grp { display: flex; gap: 2px; }
  button { background: #261a40; border: 1px solid #2d2048; color: var(--text); font: inherit; font-weight: 700; font-size: 12px; padding: 7px 7px; cursor: pointer; white-space: nowrap; }
  button:hover:not(:disabled) { background: #33245a; }
  button:disabled { opacity: .4; cursor: default; }
  button.on { background: var(--sg); border-color: var(--sg); }
  button.play { min-width: 74px; }
  button.liveb { color: #ff8c91; }
  button.x { padding: 2px 9px; font-size: 16px; line-height: 1; background: transparent; }
</style>

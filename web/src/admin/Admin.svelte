<script lang="ts">
  import './admin.css';
  import { connect } from '../lib/state.svelte.ts';
  import type { Health } from '../../../shared/types.ts';
  import LiveTab from './LiveTab.svelte';
  import MatchTab from './MatchTab.svelte';
  import SeriesTab from './SeriesTab.svelte';
  import SetupTab from './SetupTab.svelte';

  const { state: app, action } = connect(['match', 'series', 'draft', 'lineup', 'ingame', 'postgame', 'ui', 'status']);

  // Live first: during the broadcast only what is needed now; setup lives in its own tabs
  type Tab = 'live' | 'match' | 'series' | 'setup';
  const TABS: [Tab, string][] = [['live', 'Live'], ['match', 'Match'], ['series', 'Series'], ['setup', 'Setup']];
  const stored = (() => { try { return localStorage.getItem('sg-admin-tab'); } catch { return null; } })();
  let tab = $state<Tab>(TABS.some(([t]) => t === stored) ? (stored as Tab) : 'live');
  $effect(() => { try { localStorage.setItem('sg-admin-tab', tab); } catch { /* private mode */ } });

  // hotkey labels shown on the live buttons
  let hotkeys = $state<Record<string, string>>({});
  $effect(() => { fetch('/api/settings').then(r => r.json()).then(s => (hotkeys = s.hotkeys ?? {})).catch(() => {}); });

  const HEALTH: [string, (s: NonNullable<typeof app.status>) => Health][] = [
    ['Client', s => s.lcu], ['Live API', s => s.live], ['Replay API', s => s.replayApi], ['OBS', s => s.obs], ['Gold OCR', s => s.ocr],
  ];
  const cls = (h: Health) => (h === 'ok' ? 'ok' : h === 'warn' ? 'warn' : h === 'down' ? 'danger' : '');
  const phase = $derived.by(() => {
    if (app.ingame?.active) return app.ingame.paused ? 'Game paused' : 'Game running';
    if (app.postgame?.active) return app.postgame.winner ? 'Post-game' : 'Post-game · confirm winner';
    if (app.lineup?.active) return 'Champ select';
    return 'Idle';
  });
</script>

<div class="admin">
  <header class="top">
    <div class="brand">
      <img src="/assets/saargaming-logo.png" alt="" />
      <div>
        <div class="name">SG Overlay</div>
        <div class="mode">{app.status?.mode === 'live' ? 'Live' : app.status?.mode ?? ''} · {phase}</div>
      </div>
    </div>
    <nav>
      {#each TABS as [t, label]}
        <button class:on={tab === t} onclick={() => (tab = t)}>{label}</button>
      {/each}
    </nav>
    <div class="health">
      {#if !app.connected}
        <span class="pill danger">● Backend offline</span>
      {:else if app.status}
        {#each HEALTH as [label, get]}
          {#if get(app.status) !== 'off'}<span class="pill {cls(get(app.status))}" title={label}>● {label}</span>{/if}
        {/each}
        {#if app.status.recording}<span class="pill danger rec">● REC</span>{/if}
      {/if}
    </div>
  </header>

  {#if app.status?.message || app.error}
    <div class="banners">
      {#if app.status?.message}<div class="banner warn">{app.status.message}</div>{/if}
      {#if app.error}<div class="banner danger">{app.error}</div>{/if}
    </div>
  {/if}

  <main>
    {#if tab === 'live'}
      <LiveTab {app} {action} {hotkeys} gotoTab={(t: Tab) => (tab = t)} />
    {:else if tab === 'match'}
      <MatchTab {app} {action} />
    {:else if tab === 'series'}
      <SeriesTab {app} {action} />
    {:else}
      <SetupTab {app} {action} />
    {/if}
  </main>
</div>

<style>
  .top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 24px; padding: 10px 24px;
         background: rgba(11, 7, 20, .92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 40px; height: 40px; object-fit: contain; }
  .name { font-size: 16px; font-weight: 800; }
  .mode { font-size: 12px; color: var(--muted); }
  nav { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 4px; }
  nav button { background: transparent !important; border: none !important; padding: 8px 18px !important; border-radius: 9px !important; color: var(--muted) !important; }
  nav button.on { background: var(--sg) !important; color: #fff !important; }
  .health { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .rec { animation: blink 1.6s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: .45; } }
  .banners { max-width: 1440px; margin: 14px auto 0; padding: 0 24px; display: flex; flex-direction: column; gap: 8px; }
  .banner { padding: 10px 14px; border-radius: 10px; font-weight: 600; }
  .banner.warn { background: rgba(255,201,77,.1); color: var(--warn); border: 1px solid rgba(255,201,77,.25); }
  .banner.danger { background: rgba(255,92,97,.1); color: var(--danger); border: 1px solid rgba(255,92,97,.3); }
  main { max-width: 1440px; margin: 0 auto; padding: 18px 24px 40px; }
</style>

<script lang="ts">
  import Section from './Section.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import OcrPanel from './OcrPanel.svelte';
  import type { Action, App } from './types.ts';

  let { app, action }: { app: App; action: Action } = $props();

  const base = `${location.protocol}//${location.host}`;
  const OVERLAYS = ['starting-soon', 'draft', 'lineup', 'ingame', 'postgame', 'pause'];
  let copied = $state('');
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); copied = url; setTimeout(() => (copied = ''), 1500); } catch { /* not allowed */ }
  };
</script>

<div class="setup">
  <div class="col">
    <SettingsPanel />
  </div>
  <div class="col">
    <Section title="Game & recording">
      <div class="tools">
        <div class="tool">
          <div><b>Replay API</b><p class="muted">Needed to hide Riot's replay bar, timers and camera panel. Close the League client first.</p></div>
          <button onclick={() => action('gamecfg:enableReplayApi')}>Enable in game.cfg</button>
        </div>
        <div class="tool">
          <div><b>Hide Riot HUD elements</b><p class="muted">Happens automatically after game start; use this if something is still visible.</p></div>
          <button onclick={() => action('hud:apply')}>Apply now</button>
        </div>
        <div class="tool">
          <div><b>Recording</b><p class="muted">Saves all game data for later analysis (data/recordings).</p></div>
          <button class:primary={!app.status?.recording} class:danger={app.status?.recording} onclick={() => action('recorder:toggle')}>
            {app.status?.recording ? 'Stop recording' : 'Start recording'}
          </button>
        </div>
      </div>
    </Section>

    <Section title="OBS browser sources" hint="1920 × 1080 each · click to copy">
      <div class="urls">
        {#each OVERLAYS as o}
          {@const url = `${base}/overlay/${o}/`}
          <button class="url" onclick={() => copy(url)}><span>{o}</span><code>{url}</code>{#if copied === url}<em>copied</em>{/if}</button>
        {/each}
      </div>
    </Section>

    <OcrPanel />

  </div>
</div>

<style>
  .setup { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  @media (max-width: 1100px) { .setup { grid-template-columns: 1fr; } }
  .col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .tools { display: flex; flex-direction: column; gap: 12px; }
  .tool { display: flex; align-items: center; gap: 16px; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .tool:last-child { border-bottom: none; padding-bottom: 0; }
  .tool p { margin-top: 2px; font-size: 13px; }
  .tool button { flex: none; }
  .urls { display: flex; flex-direction: column; gap: 6px; }
  .url { display: flex; align-items: center; gap: 12px; text-align: left; background: var(--surface-2) !important; }
  .url span { width: 110px; font-weight: 700; }
  .url code { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .url em { margin-left: auto; color: var(--ok); font-style: normal; font-size: 12px; }
  p { margin-top: 8px; }
</style>

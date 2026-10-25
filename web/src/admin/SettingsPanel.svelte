<script lang="ts">
  import Section from './Section.svelte';

  // Mirrors server/config.ts Settings (only the fields edited here are typed)
  interface Settings {
    leagueDir: string;
    obs: { url: string; password: string; gameCaptureSource: string };
    sceneNames: Record<string, string>;
    hotkeys: Record<string, string>;
    applyReplayRender: boolean;
    [k: string]: unknown;
  }
  let s = $state<Settings | null>(null);
  let saved = $state(false);
  let dirty = $state(false);
  let showPw = $state(false);

  $effect(() => {
    fetch('/api/settings').then(r => r.json()).then(j => (s = j));
  });

  async function save() {
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify($state.snapshot(s)) });
    saved = true;
    dirty = false;
    setTimeout(() => (saved = false), 2000);
  }
  const touch = () => (dirty = true);

  const SCENE_LABEL: Record<string, string> = {
    startingSoon: 'Starting Soon', draft: 'Draft', lineup: 'Lineup', ingame: 'Ingame', postgame: 'Post-Game', pause: 'Pause',
  };
  const HOTKEY_LABEL: Record<string, string> = {
    'h2h:TOP': 'Head to head · Top', 'h2h:JGL': 'Head to head · Jungle', 'h2h:MID': 'Head to head · Mid',
    'h2h:BOT': 'Head to head · Bot', 'h2h:SUP': 'Head to head · Support', 'h2h:off': 'Hide head to head',
    'postgame:page': 'Post-game page', 'scenes:auto': 'Automatic switching on/off', 'scene:pause': 'Pause scene',
    'replay:back10': 'Playback · 10 s back', 'replay:fwd10': 'Playback · 10 s forward', 'replay:pause': 'Playback · pause / play',
    'replay:live': 'Playback · back to live', 'replay:bar': 'Show / hide Riot replay bar',
  };
</script>

{#if s}
  <Section title="OBS connection" hint="OBS → Tools → WebSocket Server Settings">
    <div class="form">
      <label class="field"><span>Address</span><input bind:value={s.obs.url} oninput={touch} /></label>
      <label class="field"><span>Password</span>
        <div class="row">
          {#if showPw}<input style="flex:1" bind:value={s.obs.password} oninput={touch} />{:else}<input style="flex:1" type="password" bind:value={s.obs.password} oninput={touch} />{/if}
          <button class="ghost" onclick={() => (showPw = !showPw)}>{showPw ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      <label class="field"><span>Game capture source name</span><input bind:value={s.obs.gameCaptureSource} oninput={touch} /></label>
    </div>
  </Section>

  <Section title="OBS scene names" hint="must match the scene names in OBS exactly">
    <div class="pairs">
      {#each Object.keys(s.sceneNames) as k}
        <label class="pair"><span>{SCENE_LABEL[k] ?? k}</span><input bind:value={s.sceneNames[k]} oninput={touch} /></label>
      {/each}
    </div>
  </Section>

  <Section title="League of Legends">
    <div class="form">
      <label class="field"><span>Install folder (contains lockfile and Config\game.cfg)</span><input bind:value={s.leagueDir} oninput={touch} /></label>
      <label class="switch"><input type="checkbox" bind:checked={s.applyReplayRender} onchange={touch} /><span class="track"></span>Hide Riot HUD elements automatically at game start</label>
    </div>
  </Section>

  <Section title="Global hotkeys" hint="work while the game has focus · restart to apply">
    <div class="pairs">
      {#each Object.keys(s.hotkeys) as k}
        <label class="pair"><span>{HOTKEY_LABEL[k] ?? k}</span><input bind:value={s.hotkeys[k]} oninput={touch} /></label>
      {/each}
    </div>
  </Section>

  <div class="savebar" class:show={dirty || saved}>
    {#if saved}<span class="ok">Settings saved</span>{:else}<span class="warn">Unsaved settings</span>{/if}
    <button class="primary" disabled={!dirty} onclick={save}>Save settings</button>
  </div>
{/if}

<style>
  .form { display: flex; flex-direction: column; gap: 12px; }
  .pairs { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .pair { display: grid; grid-template-columns: 200px 1fr; align-items: center; gap: 10px; }
  .pair span { color: var(--muted); font-size: 13px; }
  .savebar { display: none; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px;
             background: var(--surface-3); border: 1px solid var(--sg); border-radius: 12px; position: sticky; bottom: 16px; }
  .savebar.show { display: flex; }
  .ok { color: var(--ok); font-weight: 700; }
  .warn { color: var(--warn); font-weight: 700; }
</style>

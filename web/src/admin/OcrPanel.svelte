<script lang="ts">
  import Section from './Section.svelte';

  interface Row { side: 'order' | 'chaos'; row: number; text: string; value: [number, number] | null; png: string }
  let rows = $state<Row[]>([]);
  let frameId = $state(0);
  let templates = $state('');
  let error = $state('');
  let labels = $state<Record<string, string>>({});

  async function refresh() {
    error = '';
    const res = await fetch('/api/ocr/preview');
    const json = await res.json();
    if (!res.ok) { error = json.error; rows = []; return; }
    rows = json.rows;
    frameId = json.frameId;
    templates = json.templates;
    labels = {};
  }

  async function learn(r: Row) {
    const key = `${r.side}${r.row}`;
    // learns from exactly the crop shown here (frameId), not from a newer frame
    const res = await fetch('/api/ocr/learn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frameId, side: r.side, row: r.row, label: labels[key] ?? '' }),
    });
    if (!res.ok) error = (await res.json()).error;
    else await refresh();
  }

  async function reset() {
    if (!confirm('Forget glyphs learned on this PC? The built-in ones stay.')) return;
    await fetch('/api/ocr/reset', { method: 'POST' });
    await refresh();
  }
</script>

<Section title="Gold OCR check" hint="needs OBS + a spectated game">
  <p class="muted">
    The digits are built in. Open Riot's scoreboard in the spectated game and press Refresh: green rows are read correctly.
    Only if a row stays red, type exactly what that crop shows (e.g. <code>215(716)</code>) and press Learn.
  </p>
  <div class="row">
    <button onclick={refresh}>Refresh crops</button>
    <button onclick={reset}>Reset learned glyphs</button>
    <span class="muted">Known glyphs: {templates || '–'}</span>
  </div>
  {#if error}<div class="err">{error}</div>{/if}
  {#each rows as r (r.side + r.row)}
    <div class="row crop">
      <span class="side">{r.side === 'order' ? 'Blue' : 'Red'} {r.row + 1}</span>
      <img src="data:image/png;base64,{r.png}" alt="" />
      <span class="read" class:ok={r.value}>{r.text || '—'}</span>
      {#if !r.value}
        <input placeholder="label" bind:value={labels[r.side + r.row]} style="width:110px" />
        <button onclick={() => learn(r)}>Learn</button>
      {/if}
    </div>
  {/each}
</Section>

<style>
  .row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
  .muted { color: var(--dim); font-size: 13px; }
  .err { color: #ff8f93; margin: 6px 0; }
  .side { width: 52px; font-size: 12px; color: var(--muted); }
  .crop img { height: 24px; image-rendering: pixelated; background: #000; border-radius: 3px; }
  .read { width: 100px; font-family: monospace; color: #ff8f93; }
  .read.ok { color: #7dffa8; }
  code { background: #1e1430; padding: 1px 4px; border-radius: 4px; }
</style>

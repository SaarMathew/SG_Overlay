<script lang="ts">
  import type { Snippet } from 'svelte';
  // Shared full-screen frame: background with left/right team-colour glows, diagonal lines and the header bar.
  // Uses --a (left) / --b (right) set by <Stage>. Content goes in as children (absolutely positioned, 1920x1080).
  let { kicker = '', badge = '', children }: { kicker?: string; badge?: string; children?: Snippet } = $props();
</script>

<div class="bg"></div>
<div class="glow l"></div>
<div class="glow r"></div>
<div class="lines"></div>
{@render children?.()}
<div class="bar">
  <img src="/assets/saargaming-logo.png" alt="" />
  <div class="brand"><div class="t">SAARGAMING E.V.</div><div class="s">BROADCAST</div></div>
  <div class="fill"></div>
  {#if kicker}<div class="league">{kicker}</div>{/if}
  {#if badge}<div class="badge">{badge}</div>{/if}
</div>

<style>
  .bg, .glow, .lines { position: absolute; inset: 0; }
  .bg { background: #0b0714; }
  .glow.l { background: radial-gradient(900px 700px at 0% 100%, color-mix(in srgb, var(--a) 19%, transparent), transparent 70%); }
  .glow.r { background: radial-gradient(900px 700px at 100% 100%, color-mix(in srgb, var(--b) 19%, transparent), transparent 70%); }
  .lines { background: repeating-linear-gradient(115deg, rgba(255,255,255,.025) 0 2px, transparent 2px 26px); }
  .bar { position: absolute; left: 0; right: 0; top: 0; height: 80px; display: flex; align-items: center; gap: 18px; padding: 0 64px;
         background: #0b0714; border-bottom: 2px solid rgba(255,255,255,.08); }
  .bar img { width: 60px; height: 60px; object-fit: contain; }
  .brand { display: flex; flex-direction: column; gap: 2px; }
  .t { font: 800 24px var(--font-num); letter-spacing: .08em; }
  .s { font: 600 13px var(--font); letter-spacing: .2em; color: var(--muted); }
  .fill { flex: 1; }
  .league { font: 600 20px var(--font-num); letter-spacing: .14em; color: var(--scene-soft); text-transform: uppercase; }
  .badge { font: 700 20px var(--font-num); letter-spacing: .1em; padding: 8px 16px; background: var(--accent); color: #fff;
           clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%); text-transform: uppercase; }
</style>

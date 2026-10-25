<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TeamLogo from '../lib/TeamLogo.svelte';
  import { draftStreamUrl } from '../../../shared/draft.ts';

  // Pick & ban scene: our branded background and centre block, with drafter.lol's official
  // transparent stream view (picks left/right, bans bottom, Fearless bottom centre) on top.
  const { state: app } = connect(['match', 'series']);
  const m = $derived(app.match);
  const s = $derived(app.series);
  const url = $derived(m && s && m.draftUrl ? draftStreamUrl(m.draftUrl, s.gameNumber) : null);
</script>

<Stage match={m}>
  <div class="scene-bg"></div>
  {#if m && s}
    <div class="centre">
      <div class="eyebrow">{m.leagueLine}</div>
      <div class="title">Game {s.gameNumber} · <span>Pick &amp; Ban</span></div>
      <div class="score">
        <TeamLogo team={m.teamA} size={96} />
        <span class="tag">{m.teamA.tag}</span>
        <span class="n a">{s.scoreA}</span><span class="d">–</span><span class="n b">{s.scoreB}</span>
        <span class="tag">{m.teamB.tag}</span>
        <TeamLogo team={m.teamB} size={96} />
      </div>
      <div class="fmt">Best of {m.format}{m.caster ? ` · Caster ${m.caster}` : ''}</div>
      {#if !url}<div class="waiting">Draft starting soon</div>{/if}
    </div>
    {#if url}
      {#key url}
        <iframe class="drafter" src={url} title="Pick and ban" scrolling="no"></iframe>
      {/key}
    {/if}
  {/if}
</Stage>

<style>
  /* free area of the drafter.lol stream view at 1920x1080: x 500-1420, y 160-790 */
  .centre { position: absolute; left: 520px; right: 520px; top: 230px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .eyebrow { animation: rise .6s ease-out both; }
  .title { font-size: 46px; font-weight: 900; letter-spacing: -.5px; margin-top: 10px; animation: rise .6s .1s ease-out both; }
  .title span { background: linear-gradient(90deg, var(--sg), var(--sg-glow)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .score { display: flex; align-items: center; gap: 18px; margin-top: 40px; padding: 20px 32px; background: var(--panel);
           border: 1px solid var(--line); border-radius: 18px; animation: rise .6s .2s ease-out both; }
  .tag { font-size: 30px; font-weight: 800; }
  .n { font-size: 56px; font-weight: 900; font-feature-settings: "tnum" 1; }
  .n.a { color: var(--a); } .n.b { color: var(--b); }
  .d { font-size: 40px; color: var(--dim); }
  .fmt { margin-top: 18px; font-size: 15px; font-weight: 600; letter-spacing: 1px; color: var(--muted); animation: fade .8s .4s both; }
  .waiting { margin-top: 60px; font-size: 22px; font-weight: 700; color: var(--muted); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .4; } }
  .drafter { position: absolute; inset: 0; width: 1920px; height: 1080px; border: 0; background: transparent; }
</style>

<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TeamLogo from '../lib/TeamLogo.svelte';

  const { state: app } = connect(['match', 'series']);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const countdown = $derived.by(() => {
    const target = app.match?.countdownTarget;
    if (!target) return null;
    const left = Math.max(0, Math.round((target - now) / 1000));
    return left ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Live soon';
  });
  const m = $derived(app.match);
</script>

<Stage match={m}>
  <div class="scene-bg"></div>
  {#if m}
    <div class="wrap">
      <img class="brand" src="/assets/saargaming-logo.png" alt="SaarGaming" />
      <div class="eyebrow league">{m.leagueLine}</div>
      <h1>Starting <span>Soon</span></h1>
      {#if countdown}<div class="countdown">{countdown}</div>{/if}

      <div class="matchup">
        <div class="team l">
          <TeamLogo team={m.teamA} size={84} />
          <div><div class="tag">{m.teamA.tag}</div><div class="name">{m.teamA.name}</div></div>
        </div>
        <div class="vs"><div class="v">VS</div><div class="fmt">BEST OF {m.format}</div></div>
        <div class="team r">
          <TeamLogo team={m.teamB} size={84} />
          <div><div class="tag">{m.teamB.tag}</div><div class="name">{m.teamB.name}</div></div>
        </div>
      </div>
    </div>
    <div class="footer">
      <span>{#if m.caster}Caster <b>{m.caster}</b>{/if}</span>
      <span>{#each m.socials as s, i}{#if i}<span class="dotsep"></span>{/if}{s}{/each}</span>
    </div>
  {/if}
</Stage>

<style>
  .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .brand { width: 260px; height: 260px; object-fit: contain; animation: rise .6s ease-out both; filter: drop-shadow(0 10px 40px rgba(155,77,255,.35)); }
  .league { margin-top: 18px; animation: rise .6s .1s ease-out both; }
  h1 { font-size: 96px; font-weight: 900; letter-spacing: -2px; margin-top: 6px; animation: rise .6s .2s ease-out both; }
  h1 span { background: linear-gradient(90deg, var(--sg), var(--sg-glow)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .countdown { font-size: 64px; font-weight: 800; letter-spacing: 2px; margin-top: 4px; animation: rise .6s .3s ease-out both; }
  .matchup { display: flex; align-items: center; gap: 36px; margin-top: 56px; padding: 22px 40px;
             background: var(--panel); border: 1px solid var(--line); border-radius: 16px; animation: rise .6s .4s ease-out both; }
  .team { display: flex; align-items: center; gap: 18px; width: 380px; }
  .team.l { border-left: 4px solid var(--a); padding-left: 18px; }
  .team.r { flex-direction: row-reverse; text-align: right; border-right: 4px solid var(--b); padding-right: 18px; }
  .tag { font-size: 34px; font-weight: 800; }
  .name { font-size: 16px; color: var(--muted); font-weight: 500; margin-top: 2px; }
  .vs { text-align: center; width: 120px; }
  .vs .v { font-size: 28px; font-weight: 900; color: var(--dim); }
  .vs .fmt { font-size: 12px; font-weight: 700; letter-spacing: 2px; color: var(--muted); margin-top: 4px; }
  .footer { position: absolute; left: 60px; right: 60px; bottom: 44px; display: flex; justify-content: space-between;
            font-size: 16px; color: var(--muted); animation: fade 1s .6s both; }
  .footer b { color: var(--text); font-weight: 700; }
  .dotsep { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--dim); margin: 0 12px; vertical-align: middle; }
</style>

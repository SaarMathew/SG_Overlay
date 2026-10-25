<script lang="ts">
  import { champIcon } from '../lib/dd.ts';
  import { fearlessLocked } from '../../../shared/defaults.ts';
  import { fmtTime } from '../../../shared/calc.ts';
  import type { TeamKey } from '../../../shared/types.ts';
  import type { Action, App } from './types.ts';

  let { app, action }: { app: App; action: Action } = $props();

  const s = $derived(app.series);
  const m = $derived(app.match);
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const locked = $derived(s ? fearlessLocked(s) : []);
  const teamName = (k: TeamKey) => (k === 'A' ? m?.teamA.name : m?.teamB.name) ?? k;
  const set = (patch: Record<string, number>) => action('series:update', patch);

  // champion search for manual Fearless locks (names from Data Dragon)
  let champs = $state<{ id: string; name: string }[]>([]);
  $effect(() => {
    fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`).then(r => r.json())
      .then(j => (champs = Object.values(j.data as Record<string, { id: string; name: string }>).map(c => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  });
  const nameOf = (id: string) => champs.find(c => c.id === id)?.name ?? id;
  let query = $state('');
  const lockManually = () => {
    const q = query.trim().toLowerCase();
    const c = champs.find(x => x.name.toLowerCase() === q || x.id.toLowerCase() === q);
    if (c) { action('fearless:add', { champion: c.id }); query = ''; }
  };
</script>

{#if s && m}
  <div class="series">
    <section class="card">
      <div class="card-title">Series score <span class="hint">Best of {m.format} · counts up automatically when you confirm a winner</span></div>
      <div class="scoreboard">
        {#each [['A', 'scoreA'], ['B', 'scoreB']] as const as [k, field]}
          <div class="team" style:--tc={k === 'A' ? m.teamA.color : m.teamB.color}>
            <div class="tname">{teamName(k)}</div>
            <div class="stepper">
              <button disabled={s[field] <= 0} onclick={() => set({ [field]: s[field] - 1 })}>−</button>
              <span>{s[field]}</span>
              <button onclick={() => set({ [field]: s[field] + 1 })}>+</button>
            </div>
          </div>
        {/each}
        <div class="team next">
          <div class="tname">Next game</div>
          <div class="stepper">
            <button disabled={s.gameNumber <= 1} onclick={() => set({ gameNumber: s.gameNumber - 1 })}>−</button>
            <span>{s.gameNumber}</span>
            <button onclick={() => set({ gameNumber: s.gameNumber + 1 })}>+</button>
          </div>
        </div>
      </div>
      {#if s.games.length}
        <div class="games">
          {#each s.games as g (g.number)}
            <div class="game">
              <b>Game {g.number}</b>
              <span class="muted">{fmtTime(g.durationSec)}</span>
              <span class="w">{g.winner ? `${teamName(g.winner)} won` : 'no winner'}</span>
              <span class="icons">{#each [...g.champsA, ...g.champsB] as c}<img src={champIcon(v, c)} alt={c} title={c} />{/each}</span>
            </div>
          {/each}
        </div>
      {/if}
      <div class="row end">
        <button class="danger" onclick={() => confirm('Start a new series? Score, games and the Fearless list are reset.') && action('series:reset')}>New series</button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">Fearless – locked for both teams <span class="hint">filled from finished games · click a champion to unlock</span></div>
      <div class="champs">
        {#each locked as c (c)}
          <button class="champ" title="Unlock {c}" onclick={() => action('fearless:remove', { champion: c })}><img src={champIcon(v, c)} alt={c} /><span>{nameOf(c)}</span></button>
        {/each}
        {#if !locked.length}<span class="muted">Nothing locked yet – champions of each finished game are added when you confirm its winner.</span>{/if}
      </div>
      <div class="row add">
        <input list="champ-list" placeholder="Lock a champion manually…" bind:value={query} onkeydown={e => e.key === 'Enter' && lockManually()} />
        <datalist id="champ-list">{#each champs as c (c.id)}<option value={c.name}></option>{/each}</datalist>
        <button onclick={lockManually}>Lock</button>
      </div>
    </section>
  </div>
{/if}

<style>
  .series { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  @media (max-width: 1100px) { .series { grid-template-columns: 1fr; } }
  .scoreboard { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .team { background: var(--surface-2); border: 1px solid var(--border); border-top: 4px solid var(--tc, var(--border)); border-radius: 12px; padding: 14px; text-align: center; }
  .team.next { --tc: var(--border); }
  .tname { font-weight: 700; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stepper { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 10px; }
  .stepper span { font-size: 36px; font-weight: 900; min-width: 40px; font-feature-settings: "tnum" 1; }
  .stepper button { width: 38px; height: 38px; padding: 0 !important; font-size: 20px !important; border-radius: 50% !important; }
  .games { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
  .game { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--surface-2); border-radius: 10px; }
  .game .w { color: var(--ok); font-weight: 600; }
  .icons { margin-left: auto; display: flex; gap: 2px; }
  .icons img { width: 22px; height: 22px; border-radius: 4px; }
  .end { justify-content: flex-end; margin-top: 16px; }
  .champs { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
  .champ { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px !important; background: var(--surface-2) !important; }
  .champ img { width: 48px; height: 48px; border-radius: 8px; filter: grayscale(.5); }
  .champ span { font-size: 11px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .champ:hover { border-color: var(--danger) !important; }
  .champ:hover img { filter: none; }
  .add { margin-top: 14px; }
  .add input { flex: 1; }
</style>

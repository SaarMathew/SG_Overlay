<script lang="ts">
  import { ROLES, type MatchConfig } from '../../../shared/types.ts';
  import type { Action, App } from './types.ts';

  let { app, action }: { app: App; action: Action } = $props();

  // local copy, saved explicitly (a save bar appears while there are unsaved changes)
  let form = $state<MatchConfig | null>(null);
  let dirty = $state(false);
  const fullRoster = (list: MatchConfig['rosterA']) =>
    ROLES.map(role => list.find(r => r.role === role) ?? { riotId: '', displayName: '', role });
  $effect(() => {
    if (!app.match || dirty) return;
    const copy = structuredClone($state.snapshot(app.match)) as MatchConfig;
    copy.rosterA = fullRoster(copy.rosterA);
    copy.rosterB = fullRoster(copy.rosterB);
    form = copy;
  });
  const touch = () => (dirty = true);
  const save = () => {
    if (!form) return;
    const out = $state.snapshot(form) as MatchConfig;
    out.rosterA = out.rosterA.filter(r => r.riotId.trim());
    out.rosterB = out.rosterB.filter(r => r.riotId.trim());
    action('match:update', out);
    dirty = false;
  };
  const discard = () => (dirty = false);
  const serverAction = (name: string) => { dirty = false; action(name); };

  async function upload(team: 'teamA' | 'teamB', e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !form) return;
    const fd = new FormData();
    fd.append('file', file);
    const json = await (await fetch('/api/logo', { method: 'POST', body: fd })).json();
    if (json.url) { form[team].logo = json.url; touch(); } else alert(json.error);
    input.value = '';
  }
  const ROLE_LABEL: Record<string, string> = { TOP: 'Top', JGL: 'Jungle', MID: 'Mid', BOT: 'Bot', SUP: 'Support' };
</script>

{#if form}
  <div class="match">
    <section class="card general">
      <div class="card-title">Match</div>
      <div class="grid4">
        <label class="field wide"><span>League line (Starting Soon / Pause)</span><input bind:value={form.leagueLine} oninput={touch} /></label>
        <label class="field"><span>Format</span>
          <select bind:value={form.format} onchange={touch}>{#each [1, 2, 3, 5] as f}<option value={f}>Best of {f}</option>{/each}</select>
        </label>
        <label class="field"><span>Caster</span><input bind:value={form.caster} oninput={touch} /></label>
        <label class="field wide"><span>Socials (comma separated)</span>
          <input value={form.socials.join(', ')} oninput={e => { form!.socials = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); touch(); }} />
        </label>
        <label class="field"><span>Team A side in game</span>
          <select bind:value={form.sideA} onchange={touch}>
            <option value="auto">Automatic (from rosters)</option><option value="ORDER">Blue</option><option value="CHAOS">Red</option>
          </select>
        </label>
      </div>
    </section>

    <div class="teams">
      {#each ['teamA', 'teamB'] as const as t}
        {@const roster = t === 'teamA' ? form.rosterA : form.rosterB}
        <section class="card team" style:--tc={form[t].color}>
          <div class="card-title">{t === 'teamA' ? 'Team A · left' : 'Team B · right'}
            {#if t === 'teamA'}
              <label class="switch small hint"><input type="checkbox" bind:checked={form.sgFixed} onchange={touch} /><span class="track"></span>SaarGaming</label>
            {/if}
          </div>
          <div class="ident">
            <label class="logo" title="Upload logo (PNG/SVG/WebP)">
              {#if form[t].logo}<img src={form[t].logo} alt="" />{:else}<span>{form[t].tag || '?'}</span>{/if}
              <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" onchange={e => upload(t, e)} />
              <em>Change</em>
            </label>
            <div class="names">
              <input class="tname" placeholder="Team name" bind:value={form[t].name} oninput={touch} disabled={t === 'teamA' && form.sgFixed} />
              <div class="row">
                <input class="tag" placeholder="Tag" bind:value={form[t].tag} oninput={touch} disabled={t === 'teamA' && form.sgFixed} />
                <label class="color"><input type="color" bind:value={form[t].color} oninput={touch} /><span>Team colour</span></label>
                {#if form[t].logo && !(t === 'teamA' && form.sgFixed)}
                  <button class="ghost" onclick={() => { form![t].logo = null; touch(); }}>Remove logo</button>
                {/if}
              </div>
            </div>
          </div>
          <table>
            <thead><tr><th>Role</th><th>Riot ID</th><th>Shown as</th></tr></thead>
            <tbody>
              {#each roster as r (r.role)}
                <tr>
                  <td class="role">{ROLE_LABEL[r.role]}</td>
                  <td><input placeholder="Name#TAG" bind:value={r.riotId} oninput={touch} /></td>
                  <td><input placeholder={r.riotId.split('#')[0] || 'optional'} bind:value={r.displayName} oninput={touch} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    </div>

    <section class="card">
      <div class="card-title">Rosters from the game</div>
      <div class="row wrap">
        <button onclick={() => serverAction('match:rostersFromGame')}>Fill both rosters from the running / last game</button>
        <button onclick={() => serverAction('match:swapRosters')}>Swap rosters A ↔ B</button>
        <span class="muted">Riot IDs and roles come from the game; shown names you entered are kept.</span>
      </div>
    </section>
  </div>

  {#if dirty}
    <div class="savebar">
      <span>Unsaved changes</span>
      <button class="ghost" onclick={discard}>Discard</button>
      <button class="primary" onclick={save}>Save match setup</button>
    </div>
  {/if}
{/if}

<style>
  .match { display: flex; flex-direction: column; gap: 18px; padding-bottom: 70px; }
  .grid4 { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 14px; }
  .grid4 .wide { grid-column: span 1; }
  @media (max-width: 1000px) { .grid4 { grid-template-columns: 1fr; } }
  .teams { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 1100px) { .teams { grid-template-columns: 1fr; } }
  .team { border-top: 4px solid var(--tc); }
  .card-title .switch { margin-left: auto; gap: 8px; text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--muted); }
  .switch.small .track { width: 36px; height: 20px; }
  .switch.small .track::after { width: 14px; height: 14px; }
  :global(.admin .switch.small input:checked + .track::after) { transform: translateX(16px); }
  .ident { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
  .logo { position: relative; width: 84px; height: 84px; flex: none; border-radius: 14px; background: var(--surface-2); border: 1px dashed var(--border);
          display: grid; place-items: center; cursor: pointer; overflow: hidden; }
  .logo img { width: 100%; height: 100%; object-fit: contain; }
  .logo span { font-weight: 800; color: var(--muted); }
  .logo input { display: none; }
  .logo em { position: absolute; inset: auto 0 0 0; font-style: normal; font-size: 10px; text-align: center; background: rgba(0,0,0,.6); padding: 2px; opacity: 0; transition: opacity .15s; }
  .logo:hover em { opacity: 1; }
  .names { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .tname { font-size: 17px; font-weight: 700; }
  .tag { width: 90px; }
  .color { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
  .color input { width: 34px; height: 30px; padding: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--dim); padding: 0 6px 6px; }
  td { padding: 3px 6px; }
  td input { width: 100%; }
  td.role { width: 70px; font-weight: 700; color: var(--muted); }
  .savebar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; z-index: 20;
             background: var(--surface-3); border: 1px solid var(--sg); border-radius: 12px; padding: 10px 12px 10px 18px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
  .savebar span { font-weight: 700; color: var(--warn); margin-right: 8px; }
</style>

<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TeamLogo from '../lib/TeamLogo.svelte';
  import { champIcon, champSplash } from '../lib/dd.ts';
  import { ROLES, type DraftTeam, type RosterEntry } from '../../../shared/types.ts';

  const { state: app } = connect(['match', 'series', 'draft', 'status']);
  const m = $derived(app.match);
  const s = $derived(app.series);
  const d = $derived(app.draft);
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const ROLE_LABEL = { TOP: 'Top', JGL: 'Jungle', MID: 'Mid', BOT: 'Bot', SUP: 'Support' } as const;

  const player = (roster: RosterEntry[], i: number) => {
    const r = roster.find(x => x.role === ROLES[i]);
    return r ? r.displayName || r.riotId.split('#')[0] : '';
  };
</script>

{#snippet column(t: DraftTeam | null, roster: RosterEntry[], side: 'a' | 'b')}
  <div class="col {side}">
    {#each ROLES as role, i (role)}
      {@const p = t?.picks[i] ?? null}
      <div class="pick" class:empty={!p}>
        {#if p}
          {#key p.champion}<img class="splash" src={champSplash(p.champion)} alt="" />{/key}
        {/if}
        <div class="shade"></div>
        <div class="txt">
          <div class="role">{ROLE_LABEL[role]}</div>
          <div class="pn">{player(roster, i)}</div>
          <div class="cn">{p ? p.championName : '…'}</div>
        </div>
      </div>
    {/each}
    <div class="bans">
      {#each t?.bans ?? [null, null, null, null, null] as b, i}
        <div class="ban" class:gap={i === 3}>
          {#if b}<img src={champIcon(v, b)} alt="" />{/if}
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<Stage match={m}>
  <div class="scene-bg"></div>
  {#if m && s && d}
    <div class="head">
      <div class="ht">
        <TeamLogo team={m.teamA} size={76} />
        <div><div class="tag">{m.teamA.tag}</div><div class="name">{m.teamA.name}{d.a ? ` · ${d.a.side === 'blue' ? 'Blue' : 'Red'} side` : ''}</div></div>
      </div>
      <div class="hc">
        <div class="eyebrow">Game {d.game} · <b>Draft</b></div>
        <div class="score"><span class="sa">{s.scoreA}</span><span class="dash">–</span><span class="sb">{s.scoreB}</span></div>
      </div>
      <div class="ht r">
        <TeamLogo team={m.teamB} size={76} />
        <div><div class="tag">{m.teamB.tag}</div><div class="name">{d.b ? `${d.b.side === 'blue' ? 'Blue' : 'Red'} side · ` : ''}{m.teamB.name}</div></div>
      </div>
    </div>

    {@render column(d.a, m.rosterA, 'a')}
    {@render column(d.b, m.rosterB, 'b')}

    <div class="center">
      <div class="vs">VS</div>
      {#if d.status !== 'ok' || d.message}
        <div class="status">{d.status === 'off' ? 'Waiting for draft link' : d.message || 'Loading draft…'}</div>
      {/if}
      {#if d.fearless.length}
        <div class="fearless">
          <div class="eyebrow fl"><b>Fearless</b> · locked</div>
          {#each d.fearless as row, gi}
            <div class="fl-row">
              <div class="gl">GAME {gi + 1}</div>
              <div class="icons">
                {#each row.a as c}<img class="a" src={champIcon(v, c)} alt="" />{/each}
              </div>
              <div class="icons">
                {#each row.b as c}<img class="b" src={champIcon(v, c)} alt="" />{/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</Stage>

<style>
  .head { position: absolute; top: 46px; left: 42px; right: 42px; height: 100px; display: grid; grid-template-columns: 1fr 360px 1fr; align-items: center; }
  .ht { display: flex; align-items: center; gap: 18px; }
  .ht.r { flex-direction: row-reverse; text-align: right; }
  .tag { font-size: 36px; font-weight: 800; line-height: 1; }
  .name { font-size: 16px; color: var(--muted); margin-top: 4px; }
  .hc { text-align: center; }
  .score { font-size: 52px; font-weight: 900; letter-spacing: 2px; line-height: 1; margin-top: 8px; }
  .sa { color: var(--a); } .sb { color: var(--b); } .dash { color: var(--dim); margin: 0 10px; }

  .col { position: absolute; top: 176px; width: 600px; display: flex; flex-direction: column; gap: 12px; }
  .col.a { left: 42px; } .col.b { right: 42px; }
  .pick { position: relative; height: 124px; border-radius: 12px; overflow: hidden; background: var(--cover); border: 1px solid var(--line); }
  .col.a .pick { border-left: 4px solid var(--a); } .col.b .pick { border-right: 4px solid var(--b); }
  .splash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; animation: reveal .6s ease-out both; }
  @keyframes reveal { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: none; } }
  .shade { position: absolute; inset: 0; }
  .col.a .shade { background: linear-gradient(90deg, rgba(11,7,20,.92) 0%, rgba(11,7,20,.55) 40%, rgba(11,7,20,0) 75%); }
  .col.b .shade { background: linear-gradient(270deg, rgba(11,7,20,.92) 0%, rgba(11,7,20,.55) 40%, rgba(11,7,20,0) 75%); }
  .pick.empty { background: linear-gradient(90deg, #1e1430, #100a1c); }
  .txt { position: absolute; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 22px; }
  .col.b .txt { right: 0; text-align: right; }
  .role { font-size: 11px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: var(--muted); }
  .pn { font-size: 24px; font-weight: 800; margin-top: 2px; }
  .cn { font-size: 15px; color: var(--muted); font-weight: 600; margin-top: 2px; }
  .empty .cn { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }

  .bans { display: flex; gap: 10px; margin-top: 6px; }
  .col.b .bans { flex-direction: row-reverse; }
  .ban { width: 76px; height: 76px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid var(--line); overflow: hidden; position: relative; }
  .ban.gap { margin-left: 18px; }
  .col.b .ban.gap { margin-left: 0; margin-right: 18px; }
  .ban img { width: 100%; height: 100%; display: block; filter: grayscale(1) brightness(.7); animation: fade .4s ease-out both; }
  .ban:has(img)::after { content: ""; position: absolute; left: -10%; right: -10%; top: 50%; height: 2px; background: rgba(229,72,77,.85); transform: rotate(-45deg); }

  .center { position: absolute; top: 176px; left: 680px; right: 680px; display: flex; flex-direction: column; align-items: center; }
  .vs { font-size: 34px; font-weight: 900; color: var(--dim); margin-top: 8px; }
  .status { margin-top: 18px; font-size: 15px; color: var(--muted); text-align: center; animation: pulse 1.6s ease-in-out infinite; }
  .fearless { margin-top: 28px; width: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
  .fl { font-size: 12px; text-align: center; margin-bottom: 6px; }
  .fl :global(b) { color: var(--sg-glow); }
  .fl-row { padding-top: 10px; margin-top: 10px; border-top: 1px solid var(--line); }
  .gl { font-size: 11px; font-weight: 800; letter-spacing: 1.6px; color: var(--muted); text-align: center; margin-bottom: 8px; }
  .icons { display: flex; justify-content: center; gap: 6px; margin-top: 6px; }
  .icons img { width: 46px; height: 46px; border-radius: 8px; filter: grayscale(.85) brightness(.75); }
  .icons img.a { box-shadow: inset 0 0 0 2px var(--a); } .icons img.b { box-shadow: inset 0 0 0 2px var(--b); }
</style>

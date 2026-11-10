<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import { orient } from '../lib/orient.ts';
  import Stage from '../lib/Stage.svelte';
  import SceneFrame from '../lib/SceneFrame.svelte';
  import { champIcon, itemIcon } from '../lib/dd.ts';
  import { fmtTime, killParticipation, playerGold } from '../../../shared/calc.ts';
  import { ROLES, type PlayerLive, type TeamKey } from '../../../shared/types.ts';

  const { state: raw } = connect(['match', 'series', 'postgame', 'status', 'ui']);
  const app = $derived(orient(raw));
  const m = $derived(app.match);
  const s = $derived(app.series);
  const pg = $derived(app.postgame);
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const page = $derived(app.ui?.postgamePage ?? 1);

  // only a confirmed winner is shown on stream; until then the header stays neutral ("Spiel vorbei")
  const winner = $derived<TeamKey | null>(pg?.winner ?? null);
  const wTeam = $derived(winner && m ? (winner === 'A' ? m.teamA : m.teamB) : null);
  const gameNo = $derived(pg?.winner && s ? (s.games.at(-1)?.number ?? s.gameNumber) : (s?.gameNumber ?? 1));

  const K = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
  const kdaStr = (p: PlayerLive) => `${p.kills}/${p.deaths}/${p.assists}`;
  const col = (x: number, y: number) => (x >= y ? '#ffffff' : '#9a8fb0');

  const stats = $derived.by(() => {
    if (!pg?.a || !pg.b) return [];
    const a = pg.a, b = pg.b;
    const row = (label: string, x: number, y: number, f: (n: number) => string = String) => ({ label, l: f(x), r: f(y), lc: col(x, y), rc: col(y, x) });
    return [
      row('KILLS', a.kills, b.kills),
      row('GOLD', a.gold, b.gold, K),
      row('TÜRME', a.towers, b.towers),
      row('INHIBITOREN', a.inhibs, b.inhibs),
      row('DRACHEN', a.dragons.length + a.elders, b.dragons.length + b.elders),
      row('BARONE', a.barons, b.barons),
      row('GRUBS', a.grubs, b.grubs),
    ];
  });

  // gold difference bars: up = left team ahead (A is always the left team after orient)
  const bars = $derived.by(() => {
    if (!pg) return null;
    const hist = pg.goldHistory;
    const n = hist.length;
    const max = Math.max(3000, ...hist.map(p => Math.abs(p.diff)));
    const evs = pg.events.map(e => ({ ...e, i: Math.min(Math.max(n - 1, 0), Math.round(e.t / 60)) }));
    return { hist, n, max, evs };
  });
</script>

<Stage match={m}>
  <SceneFrame kicker={m?.leagueLine ?? ''} badge={`BO${m?.format ?? 3} · SPIEL ${gameNo}`}>
  {#if m && s && pg?.a && pg.b}
    {@const a = pg.a}
    {@const b = pg.b}
    <div class="head">
      {#if wTeam}
        <div class="tag" style:background={winner === 'A' ? 'var(--a)' : 'var(--b)'}>SIEG</div>
        <div class="name">{wTeam.name}</div>
      {:else}
        <div class="tag" style:background="var(--accent)">SPIEL VORBEI</div>
      {/if}
      <div class="grow"></div>
      <div class="dur">
        <div class="k">SPIELDAUER · SERIE</div>
        <div class="vv">{fmtTime(pg.durationSec)} · {m.teamA.tag} {s.scoreA} : {s.scoreB} {m.teamB.tag}</div>
      </div>
    </div>

    {#if page === 1}
      <div class="page">
        <div class="tstats">
          <div class="th">
            <div class="l" style:border-color="var(--a)">{m.teamA.tag}</div>
            <div class="r" style:border-color="var(--b)">{m.teamB.tag}</div>
          </div>
          {#each stats as st}
            <div class="tr"><div class="n" style:color={st.lc}>{st.l}</div><div class="lb">{st.label}</div><div class="n r" style:color={st.rc}>{st.r}</div></div>
          {/each}
        </div>

        <div class="ptable">
          <div class="pr hd"><div></div><div></div><div>SPIELER</div><div>ROLLE</div><div>K / D / A</div><div class="r">CS</div><div class="r">GOLD</div><div class="r">WARDS</div><div class="r">KP</div><div>ITEMS</div></div>
          {#each [a, b] as team, ti}
            {#each ROLES as role, i (role)}
              {@const p = team.players[i]}
              <div class="pr" class:sep={ti === 1 && i === 0}>
                <div class="bar" style:background={ti === 0 ? 'var(--a)' : 'var(--b)'}></div>
                <div>{#if p.champion}<img class="ch" src={champIcon(v, p.champion)} alt="" />{/if}</div>
                <div class="pn">{p.name}</div>
                <div class="role">{role}</div>
                <div class="kda">{kdaStr(p)}</div>
                <div class="r num">{p.cs}</div>
                <div class="r num">{K(playerGold(p))}</div>
                <div class="r num">{p.ward}</div>
                <div class="r num">{killParticipation(p, team.kills)}%</div>
                <div class="its">{#each p.items as id}<div class="it">{#if id}<img src={itemIcon(v, id)} alt="" />{/if}</div>{/each}</div>
              </div>
            {/each}
          {/each}
        </div>

        {#if bars}
          <div class="graph">
            <div class="gh">
              <div class="gt">GOLD-DIFFERENZ PRO MINUTE</div>
              <div class="grow"></div>
              <div class="lg"><i style:background="var(--a)"></i>{m.teamA.tag} vorn</div>
              <div class="lg"><i style:background="var(--b)"></i>{m.teamB.tag} vorn</div>
            </div>
            <div class="plot">
              <div class="zero"></div>
              <div class="bars">
                {#each bars.hist as pt, i}
                  {@const h = Math.max(2, Math.round((Math.abs(pt.diff) / bars.max) * 84))}
                  <div class="bc">
                    <div class="bb" style:top="{pt.diff >= 0 ? 107 - h : 109}px" style:height="{h}px" style:background={pt.diff >= 0 ? 'var(--a)' : 'var(--b)'}></div>
                    {#if i % 5 === 0}<div class="bl">{i}'</div>{/if}
                  </div>
                {/each}
              </div>
              {#each bars.evs as e, k}
                {@const same = bars.evs.filter((o, j) => j < k && o.team === e.team && o.i === e.i).length}
                <img class="mk" src="/assets/objectives/{e.kind === 'dragon' ? (e.dragonType ?? 'elder') : e.kind === 'elder' ? 'elder' : 'baron'}.png" alt=""
                  style:left="{((e.i + 0.5) / Math.max(1, bars.n)) * 100}%"
                  style:top="{e.team === 'A' ? same * 22 : 196 - same * 22}px" />
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="page">
        <div class="lanes">
          {#each ROLES as role, i (role)}
            {@const pa = a.players[i]}
            {@const pb = b.players[i]}
            {@const g15 = pg.gold15 ? { l: pg.gold15.a[i], r: pg.gold15.b[i] } : null}
            {@const gd = g15 ? g15.l - g15.r : 0}
            <div class="lane">
              <div class="side l" style:border-color="var(--a)">
                {#if pa.champion}<img class="lc" src={champIcon(v, pa.champion)} alt="" />{/if}
                <div class="who"><div class="ln">{pa.name}</div><div class="cn">{pa.championName}</div></div>
                <div class="nums">
                  <div><span>K/D/A</span><b>{kdaStr(pa)}</b></div>
                  <div><span>CS</span><b>{pa.cs}</b></div>
                  <div><span>GOLD</span><b>{K(playerGold(pa))}</b></div>
                </div>
              </div>
              <div class="mid">
                <div class="mt">{role} · GOLD @ 15</div>
                {#if g15}
                  <div class="md" style:color={gd >= 0 ? 'var(--a)' : 'var(--b)'}>{gd === 0 ? '±0' : (gd > 0 ? '+' : '−') + Math.abs(gd).toLocaleString('de-DE')}</div>
                  <div class="mbar"><div style:width="{(g15.l / Math.max(1, g15.l + g15.r)) * 100}%" style:background="var(--a)"></div><div style:flex="1" style:background="var(--b)"></div></div>
                  <div class="mv"><div>{g15.l.toLocaleString('de-DE')}</div><div>{g15.r.toLocaleString('de-DE')}</div></div>
                {:else}
                  <div class="md" style:color="var(--dim)">–</div>
                {/if}
              </div>
              <div class="side r" style:border-color="var(--b)">
                {#if pb.champion}<img class="lc" src={champIcon(v, pb.champion)} alt="" />{/if}
                <div class="who"><div class="ln">{pb.name}</div><div class="cn">{pb.championName}</div></div>
                <div class="nums">
                  <div><span>K/D/A</span><b>{kdaStr(pb)}</b></div>
                  <div><span>CS</span><b>{pb.cs}</b></div>
                  <div><span>GOLD</span><b>{K(playerGold(pb))}</b></div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
  </SceneFrame>
</Stage>

<style>
  .grow { flex: 1; }

  .page { position: absolute; inset: 0; animation: fade .5s ease-out both; }
  .head { position: absolute; left: 64px; right: 64px; top: 108px; height: 84px; display: flex; align-items: center; gap: 24px; }
  .tag { font: 800 40px/1 var(--font-num); letter-spacing: .06em; padding: 12px 26px; color: #fff; clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%); }
  .name { font: 800 72px/1 var(--font-num); text-transform: uppercase; }
  .dur { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .dur .k { font: 700 15px var(--font); letter-spacing: .2em; color: var(--muted); }
  .dur .vv { font: 800 40px/1 var(--font-num); }

  .tstats { position: absolute; left: 64px; top: 216px; width: 468px; height: 500px; background: var(--panel); display: flex; flex-direction: column; }
  .th { display: grid; grid-template-columns: 1fr 1fr; height: 64px; }
  .th > div { display: flex; align-items: center; padding: 0 20px; font: 800 30px var(--font-num); border-top: 6px solid; }
  .th .r { justify-content: flex-end; }
  .tr { display: grid; grid-template-columns: 110px 1fr 110px; align-items: center; height: 60px; padding: 0 20px; border-top: 2px solid rgba(255,255,255,.06); }
  .tr .n { font: 800 32px var(--font-num); }
  .tr .n.r { text-align: right; }
  .tr .lb { text-align: center; font: 700 15px var(--font); letter-spacing: .18em; color: var(--muted); }

  .ptable { position: absolute; left: 556px; right: 64px; top: 216px; height: 500px; background: var(--panel); display: flex; flex-direction: column; }
  .pr { display: grid; grid-template-columns: 6px 44px minmax(0,1fr) 100px 110px 70px 80px 70px 70px 170px; gap: 12px; align-items: center; height: 44px; padding: 0 16px 0 0; border-top: 2px solid rgba(255,255,255,.05); }
  .pr.hd { height: 40px; border: 0; font: 700 13px var(--font); letter-spacing: .16em; color: var(--muted); }
  .pr.sep { border-top: 4px solid var(--bg); }
  .pr .r { text-align: right; }
  .pr .bar { height: 44px; }
  .ch { width: 36px; height: 36px; border-radius: 4px; display: block; }
  .pn { font: 700 20px var(--font-num); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .role { font: 600 15px var(--font); color: var(--muted); }
  .kda { font: 700 21px var(--font-num); }
  .num { font: 600 20px var(--font-num); }
  .its { display: flex; gap: 2px; }
  .it { width: 22px; height: 22px; background: var(--bg); border-radius: 2px; overflow: hidden; }
  .it img { width: 22px; height: 22px; display: block; }

  .graph { position: absolute; left: 64px; right: 64px; top: 740px; height: 300px; background: var(--panel); padding: 18px 24px; display: flex; flex-direction: column; gap: 12px; }
  .gh { display: flex; align-items: center; gap: 24px; }
  .gt { font: 700 16px var(--font); letter-spacing: .2em; color: var(--soft); }
  .lg { display: flex; align-items: center; gap: 8px; font: 700 16px var(--font); }
  .lg i { width: 14px; height: 14px; display: block; }
  .plot { position: relative; flex: 1; }
  .zero { position: absolute; left: 0; right: 0; top: 107px; height: 2px; background: rgba(255,255,255,.2); }
  .bars { position: absolute; inset: 0; display: flex; gap: 4px; }
  .bc { position: relative; flex: 1; }
  .bb { position: absolute; left: 0; right: 0; }
  .bl { position: absolute; left: 0; bottom: -4px; font: 600 13px var(--font-num); color: var(--muted); }
  .mk { position: absolute; width: 22px; height: 22px; margin-left: -11px; object-fit: contain; }

  .lanes { position: absolute; left: 64px; right: 64px; top: 216px; display: flex; flex-direction: column; gap: 14px; }
  .lane { display: grid; grid-template-columns: minmax(0,1fr) 300px minmax(0,1fr); height: 150px; background: var(--panel); }
  .side { display: flex; align-items: center; gap: 24px; padding: 0 24px; }
  .side.l { border-left: 8px solid; }
  .side.r { flex-direction: row-reverse; border-right: 8px solid; text-align: right; }
  .lc { width: 104px; height: 104px; border-radius: 6px; display: block; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .side.r .who { align-items: flex-end; }
  .ln { font: 800 40px/1 var(--font-num); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .cn { font: 600 18px var(--font); color: var(--muted); }
  .nums { display: flex; gap: 28px; }
  .side.r .nums { flex-direction: row-reverse; }
  .nums div { display: flex; flex-direction: column; align-items: flex-end; }
  .side.r .nums div { align-items: flex-start; }
  .nums span { font: 700 13px var(--font); letter-spacing: .18em; color: var(--muted); }
  .nums b { font: 800 34px var(--font-num); }
  .mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: var(--bg); }
  .mt { font: 700 15px var(--font); letter-spacing: .24em; color: var(--muted); }
  .md { font: 800 46px/1 var(--font-num); }
  .mbar { display: flex; width: 220px; height: 8px; }
  .mv { display: flex; justify-content: space-between; width: 220px; font: 600 16px var(--font-num); color: var(--soft); }
</style>

<script lang="ts">
  import { connect } from '../lib/state.svelte.ts';
  import Stage from '../lib/Stage.svelte';
  import TeamLogo from '../lib/TeamLogo.svelte';
  import { champIcon, itemIcon } from '../lib/dd.ts';
  import { fmtGold, fmtTime, killParticipation, playerGold } from '../../../shared/calc.ts';
  import { ROLES, type PlayerLive, type TeamKey, type TeamLive } from '../../../shared/types.ts';

  const { state: app } = connect(['match', 'series', 'postgame', 'ui', 'status']);
  const m = $derived(app.match);
  const s = $derived(app.series);
  const pg = $derived(app.postgame);
  const v = $derived(app.status?.ddVersion || '15.1.1');
  const page = $derived(app.ui?.postgamePage ?? 1);

  // only a confirmed winner is shown on stream; until then the header stays neutral ("Game over")
  const winner = $derived<TeamKey | null>(pg?.winner ?? null);
  const gameNo = $derived(pg?.winner && s ? (s.games.at(-1)?.number ?? s.gameNumber) : (s?.gameNumber ?? 1));
  const needed = $derived(m ? (m.format === 2 ? 99 : Math.ceil(m.format / 2)) : 99);
  const seriesWinner = $derived(s && m ? (s.scoreA >= needed ? m.teamA.name : s.scoreB >= needed ? m.teamB.name : null) : null);

  // ---- gold difference chart ----
  const W = 1786, H = 300, L = 44, B = 22, T = 8;
  const chart = $derived.by(() => {
    if (!pg) return null;
    const hist = pg.goldHistory;
    const dur = Math.max(60, pg.durationSec);
    const maxAbs = Math.max(5000, ...hist.map(p => Math.abs(p.diff)));
    const max = Math.ceil((maxAbs * 1.15) / 5000) * 5000;
    const x = (t: number) => L + (t / dur) * (W - L - 8);
    const y = (d: number) => T + ((max - d) / (2 * max)) * (H - T - B);
    const pts = hist.map(p => `${x(p.t)},${y(p.diff)}`).join(' ');
    const last = hist.at(-1);
    const grid = [];
    for (let d = -max; d <= max; d += max >= 20000 ? 10000 : 5000) grid.push(d);
    const ticks = [];
    for (let t = 0; t <= dur; t += 300) ticks.push(t);
    return { x, y, pts, area: hist.length ? `${x(hist[0].t)},${y(0)} ${pts} ${x(last!.t)},${y(0)}` : '', last, grid, ticks, max };
  });

  const kda = (p: PlayerLive) => (p.kills + p.assists) / Math.max(1, p.deaths);
  const DRAKE_COLOR: Record<string, string> = {
    infernal: 'var(--drag-infernal)', ocean: 'var(--drag-ocean)', mountain: 'var(--drag-mountain)', cloud: 'var(--drag-cloud)',
    hextech: 'var(--drag-hextech)', chemtech: 'var(--drag-chemtech)', elder: 'var(--drag-elder)',
  };
</script>

{#snippet teamStat(label: string, a: string | number, b: string | number)}
  <div class="ts"><div class="va">{a}</div><div class="k">{label}</div><div class="vb">{b}</div></div>
{/snippet}

{#snippet prow(p: PlayerLive, side: 'l' | 'r', team: TeamLive)}
  <div class="ph {side}">
    <div class="ch">{#if p.champion}<img src={champIcon(v, p.champion)} alt="" />{/if}</div>
    <div class="nm">{p.name}<small>{p.championName}</small></div>
    <div class="v">{p.kills} / {p.deaths} / {p.assists}</div>
    <div class="v">{p.cs}</div>
    <div class="v">{fmtGold(playerGold(p))}</div>
    <div class="v mut">{killParticipation(p, team.kills)}%</div>
    <div class="v mut">{p.ward}</div>
    <div class="its">{#each p.items as id}{#if id}<img src={itemIcon(v, id)} alt="" />{:else}<div class="e"></div>{/if}{/each}</div>
  </div>
{/snippet}

{#snippet cmp(label: string, a: number, b: number, fmt: (n: number) => string)}
  {@const tot = Math.abs(a) + Math.abs(b) || 1}
  {@const d = (a - b) / tot}
  <div class="c">
    <div class="lbl">{label}</div>
    <div class="vals"><span class:w={a >= b}>{fmt(a)}</span><span class:w={b > a}>{fmt(b)}</span></div>
    <div class="bar">{#if d}<i class={d > 0 ? 'a' : 'b'} style:width="{Math.min(Math.abs(d) * 100, 50)}%"></i>{/if}</div>
  </div>
{/snippet}

<Stage match={m}>
  <div class="scene-bg"></div>
  {#if m && s && pg?.a && pg.b}
    {@const a = pg.a}
    {@const b = pg.b}
    <div class="head">
      <div class="ht" class:win={winner === 'A'} class:loss={winner === 'B'}>
        <TeamLogo team={m.teamA} size={86} />
        <div><div class="res">{winner === 'A' ? 'VICTORY' : winner === 'B' ? 'DEFEAT' : m.teamA.tag}</div><div class="tn">{m.teamA.name}</div></div>
      </div>
      <div class="hc">
        <div class="eyebrow">Game {gameNo} · <b>{fmtTime(pg.durationSec)}</b></div>
        <div class="score"><span class="sa">{s.scoreA}</span><span class="d">–</span><span class="sb">{s.scoreB}</span></div>
        {#if !winner}<div class="series over">Game over</div>{:else if seriesWinner}<div class="series">{seriesWinner} win the series</div>{/if}
      </div>
      <div class="ht r" class:win={winner === 'B'} class:loss={winner === 'A'}>
        <TeamLogo team={m.teamB} size={86} />
        <div><div class="res">{winner === 'B' ? 'VICTORY' : winner === 'A' ? 'DEFEAT' : m.teamB.tag}</div><div class="tn">{m.teamB.name}</div></div>
      </div>
    </div>

    {#if page === 1}
      <div class="page">
        <div class="strip">
          {@render teamStat('KILLS', a.kills, b.kills)}
          {@render teamStat('GOLD', fmtGold(a.gold), fmtGold(b.gold))}
          {@render teamStat('TOWERS', a.towers, b.towers)}
          <div class="ts">
            <div class="va drk">{#each a.dragons as d}<i style:background={DRAKE_COLOR[d]}></i>{/each}{#if !a.dragons.length}0{/if}</div>
            <div class="k">DRAGONS</div>
            <div class="vb drk r">{#each b.dragons as d}<i style:background={DRAKE_COLOR[d]}></i>{/each}{#if !b.dragons.length}0{/if}</div>
          </div>
          {@render teamStat('GRUBS', a.grubs, b.grubs)}
          {@render teamStat('BARONS', a.barons, b.barons)}
        </div>

        <div class="table">
          <div class="colhead">
            <div class="h"><span></span><span>PLAYER</span><span>KDA</span><span>CS</span><span>GOLD</span><span>KP</span><span>VIS</span><span>ITEMS</span></div>
            <div></div>
            <div class="h r"><span></span><span>PLAYER</span><span>KDA</span><span>CS</span><span>GOLD</span><span>KP</span><span>VIS</span><span>ITEMS</span></div>
          </div>
          {#each ROLES as role, i (role)}
            <div class="prow">{@render prow(a.players[i], 'l', a)}<div class="prole">{role}</div>{@render prow(b.players[i], 'r', b)}</div>
          {/each}
        </div>

        {#if chart}
          <div class="graph">
            <div class="gh">
              <div class="eyebrow">Gold difference</div>
              <div class="legend"><span><i style:background="var(--a)"></i>{m.teamA.name} ahead</span><span><i style:background="var(--b)"></i>{m.teamB.name} ahead</span><span>◆ Dragon · ★ Baron</span></div>
            </div>
            <svg width={W} height={H}>
              <defs>
                <clipPath id="up"><rect x="0" y="0" width={W} height={chart.y(0)} /></clipPath>
                <clipPath id="dn"><rect x="0" y={chart.y(0)} width={W} height={H} /></clipPath>
              </defs>
              {#each chart.grid as d}
                <line x1={L} x2={W} y1={chart.y(d)} y2={chart.y(d)} stroke="rgba(255,255,255,{d ? 0.06 : 0.25})" />
                <text x={L - 8} y={chart.y(d) + 4} text-anchor="end">{fmtGold(d, d !== 0)}</text>
              {/each}
              {#each chart.ticks as t}<text x={chart.x(t)} y={H - 4} text-anchor="middle">{fmtTime(t)}</text>{/each}
              {#if chart.area}
                <polygon points={chart.area} fill="color-mix(in srgb, var(--a) 28%, transparent)" clip-path="url(#up)" />
                <polygon points={chart.area} fill="color-mix(in srgb, var(--b) 28%, transparent)" clip-path="url(#dn)" />
                <polyline points={chart.pts} fill="none" stroke="var(--a)" stroke-width="2.5" clip-path="url(#up)" />
                <polyline points={chart.pts} fill="none" stroke="var(--b)" stroke-width="2.5" clip-path="url(#dn)" />
              {/if}
              {#each pg.events as e}
                {@const cx = chart.x(e.t)}
                {@const cy = e.team === 'A' ? chart.y(chart.max) + 10 : chart.y(-chart.max) - 10}
                <line x1={cx} x2={cx} y1={chart.y(chart.max) + 18} y2={chart.y(-chart.max) - 18} stroke="rgba(255,255,255,.07)" stroke-dasharray="3 4" />
                {#if e.kind === 'baron' || e.kind === 'atakhan'}
                  <text x={cx} y={cy + 5} text-anchor="middle" class="star">★</text>
                {:else}
                  <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="1.5" fill={DRAKE_COLOR[e.dragonType ?? 'elder']} transform="rotate(45 {cx} {cy})" />
                {/if}
              {/each}
              {#if chart.last}
                <circle cx={chart.x(chart.last.t)} cy={chart.y(chart.last.diff)} r="4.5" fill={chart.last.diff >= 0 ? 'var(--a)' : 'var(--b)'} />
                <text x={chart.x(chart.last.t) - 12} y={chart.y(chart.last.diff) + (chart.last.diff >= 0 ? 22 : -12)} text-anchor="end" class="end">{fmtGold(chart.last.diff, true)}</text>
              {/if}
            </svg>
          </div>
        {/if}
      </div>
    {:else}
      <div class="page">
        <div class="eyebrow p2title">Lane <b>head to head</b></div>
        <div class="lanes">
          {#each ROLES as role, i (role)}
            {@const pa = a.players[i]}
            {@const pb = b.players[i]}
            <div class="lane">
              <div class="lp l">
                {#if pa.champion}<img src={champIcon(v, pa.champion)} alt="" />{/if}
                <div><div class="lr">{role}</div><div class="nm">{pa.name}<small>{pa.championName} · {pa.kills} / {pa.deaths} / {pa.assists}</small></div></div>
              </div>
              <div class="cmp">
                {#if pg.gold15}{@render cmp('GOLD @15', pg.gold15.a[i], pg.gold15.b[i], n => fmtGold(n))}{/if}
                {@render cmp('GOLD', playerGold(pa), playerGold(pb), n => fmtGold(n))}
                {@render cmp('CS', pa.cs, pb.cs, n => String(n))}
                {@render cmp('KDA', kda(pa), kda(pb), n => n.toFixed(1))}
                {@render cmp('VISION', pa.ward, pb.ward, n => String(n))}
              </div>
              <div class="lp r">
                {#if pb.champion}<img src={champIcon(v, pb.champion)} alt="" />{/if}
                <div><div class="lr">{role}</div><div class="nm">{pb.name}<small>{pb.championName} · {pb.kills} / {pb.deaths} / {pb.assists}</small></div></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <div class="pager"><i class:on={page === 1}></i><i class:on={page === 2}></i></div>
  {/if}
</Stage>

<style>
  .page { position: absolute; inset: 0; animation: fade .5s ease-out both; }
  .head { position: absolute; top: 36px; left: 42px; right: 42px; height: 110px; display: grid; grid-template-columns: 1fr 380px 1fr; align-items: center; z-index: 1; }
  .ht { display: flex; align-items: center; gap: 20px; }
  .ht.r { flex-direction: row-reverse; text-align: right; }
  .res { font-size: 46px; font-weight: 900; letter-spacing: 1px; line-height: 1; }
  .tn { font-size: 17px; color: var(--muted); margin-top: 6px; font-weight: 500; }
  .win .res { background: linear-gradient(90deg, var(--sg), var(--sg-glow)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .ht.r.win .res { background: none; color: var(--b); -webkit-background-clip: initial; background-clip: initial; }
  .loss .res { color: var(--dim); }
  .hc { text-align: center; }
  .score { font-size: 48px; font-weight: 900; letter-spacing: 2px; line-height: 1; margin: 8px 0 6px; }
  .sa { color: var(--a); } .sb { color: var(--b); } .d { color: var(--dim); margin: 0 10px; }
  .series { font-size: 13px; font-weight: 800; letter-spacing: 2px; color: var(--sg-glow); text-transform: uppercase; }
  .series.over { color: var(--muted); }

  .strip { position: absolute; top: 172px; left: 42px; right: 42px; height: 70px; display: flex; justify-content: center; gap: 12px; }
  .ts { width: 240px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
        display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 16px; }
  .va, .vb { font-size: 24px; font-weight: 800; }
  .va { color: var(--a); } .vb { text-align: right; opacity: .85; }
  .k { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: var(--dim); text-align: center; padding: 0 8px; }
  .drk { display: flex; gap: 4px; font-size: 18px; }
  .drk.r { justify-content: flex-end; }
  .drk i { width: 11px; height: 11px; transform: rotate(45deg); border-radius: 2px; display: block; }

  .table { position: absolute; top: 266px; left: 42px; right: 42px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 8px 0; }
  .colhead, .prow { display: grid; grid-template-columns: 1fr 70px 1fr; }
  .colhead { height: 26px; align-items: center; }
  .h, .ph { display: grid; grid-template-columns: 56px 150px 90px 54px 64px 54px 50px 1fr; gap: 10px; padding: 0 18px; align-items: center; }
  .h { font-size: 10px; font-weight: 700; letter-spacing: 1.4px; color: var(--dim); }
  .h.r, .ph.r { direction: rtl; }
  .ph > * { direction: ltr; }
  .prow { height: 68px; align-items: center; border-top: 1px solid var(--line); }
  .ph.l { border-left: 3px solid var(--a); } .ph.r { border-right: 3px solid var(--b); }
  .ch img { width: 52px; height: 52px; border-radius: 8px; display: block; }
  .nm { font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm small { display: block; font-size: 12px; color: var(--muted); font-weight: 500; margin-top: 2px; }
  .v { font-size: 16px; font-weight: 700; }
  .v.mut { color: var(--muted); font-weight: 600; }
  .ph.r .nm, .ph.r .v { text-align: right; }
  .its { display: flex; gap: 3px; }
  .its img, .its .e { width: 30px; height: 30px; border-radius: 5px; display: block; }
  .its .e { background: rgba(255,255,255,.06); }
  .prole { text-align: center; font-size: 10px; font-weight: 800; letter-spacing: 1.4px; color: var(--dim); }

  .graph { position: absolute; left: 42px; right: 42px; top: 672px; bottom: 36px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 24px 10px; }
  .gh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .legend { font-size: 13px; color: var(--muted); display: flex; gap: 18px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  svg { display: block; }
  svg text { font-family: Inter, sans-serif; font-size: 11px; fill: var(--dim); font-weight: 600; }
  svg text.star { font-size: 15px; fill: #b07cff; }
  svg text.end { font-size: 14px; font-weight: 800; fill: #fff; }

  .p2title { position: absolute; top: 166px; left: 0; right: 0; text-align: center; }
  .lanes { position: absolute; top: 200px; left: 42px; right: 42px; bottom: 40px; display: flex; flex-direction: column; gap: 12px; }
  .lane { flex: 1; display: grid; grid-template-columns: 360px 1fr 360px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 0 22px; }
  .lp { display: flex; align-items: center; gap: 16px; }
  .lp.l { border-left: 4px solid var(--a); padding-left: 16px; }
  .lp.r { flex-direction: row-reverse; text-align: right; border-right: 4px solid var(--b); padding-right: 16px; }
  .lp img { width: 72px; height: 72px; border-radius: 10px; }
  .lp .nm { font-size: 22px; font-weight: 800; }
  .lp .nm small { font-size: 14px; margin-top: 3px; }
  .lr { font-size: 11px; font-weight: 800; letter-spacing: 1.6px; color: var(--dim); margin-bottom: 4px; }
  .cmp { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 22px; padding: 0 24px; }
  .c .lbl { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 1.6px; color: var(--dim); margin-bottom: 8px; }
  .vals { display: flex; justify-content: space-between; font-size: 24px; font-weight: 800; color: var(--dim); }
  .vals .w { color: var(--text); }
  .bar { position: relative; height: 8px; margin-top: 8px; background: rgba(255,255,255,.06); border-radius: 3px; overflow: hidden; }
  .bar::after { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.3); }
  .bar i { position: absolute; top: 0; bottom: 0; display: block; }
  .bar i.a { right: 50%; background: var(--a); } .bar i.b { left: 50%; background: var(--b); }

  .pager { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; }
  .pager i { width: 22px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.15); display: block; }
  .pager i.on { background: var(--sg); }
</style>

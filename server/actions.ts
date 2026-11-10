import type { MatchConfig, Role, SceneKey, SeriesState, TeamKey } from '../shared/types.ts';
import { ROLES } from '../shared/types.ts';
import { SG_TEAM, defaultSeries } from '../shared/defaults.ts';
import type { Store } from './state/store.ts';
import type { SceneController } from './scenes.ts';
import type { ManualObjective } from './ingest/pipeline.ts';
import { log } from './log.ts';

export interface ActionContext {
  store: Store;
  scenes: SceneController;
  applyHud: () => Promise<boolean>;
  enableReplayApi: () => void;
  openOperator: () => void;
  recorder: { toggle: () => boolean };
  objective: (team: TeamKey, kind: ManualObjective, dragon?: string) => void;
  playback: {
    seek: (delta: number) => Promise<boolean>;
    jump: (time: number) => Promise<boolean>;
    live: () => Promise<boolean>;
    togglePause: () => Promise<boolean>;
    set: (p: { speed?: number; paused?: boolean }) => Promise<boolean>;
  };
}

const FIGHT_RECAP_MS = 12_000;

const notAvailable = (ok: boolean) => {
  if (!ok) throw new Error('Replay API not reachable – is a game being spectated and the Replay API enabled (Setup tab)?');
};

type Handler = (ctx: ActionContext, payload: any) => unknown;

/** Every change from the admin panel, hotkeys or Stream Deck goes through one of these. */
export const ACTIONS: Record<string, Handler> = {
  'match:update': ({ store }, p: Partial<MatchConfig>) => store.update('match', m => {
    Object.assign(m, p);
    if (m.sgFixed) m.teamA = { ...m.teamA, name: SG_TEAM.name, tag: SG_TEAM.tag, logo: m.teamA.logo ?? SG_TEAM.logo };
  }),

  /** Fills both rosters (Riot ID + role) from the running game, or the last finished one. Keeps display names. */
  'match:rostersFromGame': ({ store }) => {
    const g = store.get('ingame');
    const pg = store.get('postgame');
    const [a, b] = g.active ? [g.a, g.b] : [pg.a, pg.b];
    if (!a || !b || !a.players.some(p => p.riotId)) throw new Error('No game data yet – start or spectate a game first');
    store.update('match', m => {
      // Keep each team with the players it already knows: if the old rosters match the other game side
      // better (e.g. the side was detected wrong), fill them crosswise instead of A = game team A.
      const known = (roster: typeof m.rosterA, t: NonNullable<typeof a>) =>
        t.players.filter(p => roster.some(r => r.riotId.split('#')[0].toLowerCase() === p.riotId.split('#')[0].toLowerCase())).length;
      const [x, y] = known(m.rosterA, b!) + known(m.rosterB, a!) > known(m.rosterA, a!) + known(m.rosterB, b!) ? [b!, a!] : [a!, b!];
      const fill = (players: typeof x.players, old: typeof m.rosterA) => players.filter(p => p.riotId).map(p => ({
        riotId: p.riotId,
        displayName: old.find(r => r.riotId.split('#')[0].toLowerCase() === p.riotId.split('#')[0].toLowerCase())?.displayName ?? '',
        role: p.role,
      }));
      m.rosterA = fill(x.players, m.rosterA);
      m.rosterB = fill(y.players, m.rosterB);
    });
  },

  'match:swapRosters': ({ store }) => store.update('match', m => { [m.rosterA, m.rosterB] = [m.rosterB, m.rosterA]; }),

  /**
   * Emergency fix when the side detection is wrong: team A moves to the other game side. Overlays swap left/right
   * and the game data follows (the pipeline re-evaluates the side every poll). `auto` returns to detection.
   */
  'match:swapSides': ({ store }, p?: { auto?: boolean }) => store.update('match', m => {
    m.layout = 'auto';
    if (p?.auto) { m.sideA = 'auto'; return; }
    const now = store.get('ui').aRight ? 'CHAOS' : 'ORDER';
    m.sideA = now === 'CHAOS' ? 'ORDER' : 'CHAOS';
  }),

  'series:update': ({ store }, p: Partial<SeriesState>) => store.update('series', s => { Object.assign(s, p); }),

  'series:reset': ({ store }) => store.set('series', defaultSeries()),

  /** Confirms the winner of the finished game: series score, game record (Fearless), next game number. */
  'series:confirmWinner': ({ store }, p: { winner: TeamKey }) => {
    const pg = store.get('postgame');
    if (!pg.a || !pg.b) return;
    const already = pg.winner;
    store.update('postgame', x => { x.winner = p.winner; });
    store.update('series', s => {
      if (already) {
        // correction of an already confirmed game
        const g = s.games.at(-1);
        if (g && g.winner !== p.winner) {
          if (g.winner === 'A') s.scoreA--; else if (g.winner === 'B') s.scoreB--;
          g.winner = p.winner;
          if (p.winner === 'A') s.scoreA++; else s.scoreB++;
        }
        return;
      }
      if (p.winner === 'A') s.scoreA++; else s.scoreB++;
      s.games.push({
        number: s.gameNumber, winner: p.winner, durationSec: pg.durationSec,
        champsA: pg.a!.players.map(x => x.champion).filter(Boolean),
        champsB: pg.b!.players.map(x => x.champion).filter(Boolean),
      });
      s.gameNumber++;
    });
  },

  'fearless:add': ({ store }, p: { champion: string }) => store.update('series', s => {
    s.fearlessRemoved = s.fearlessRemoved.filter(c => c !== p.champion);
    if (!s.fearlessExtra.includes(p.champion)) s.fearlessExtra.push(p.champion);
  }),

  'fearless:remove': ({ store }, p: { champion: string }) => store.update('series', s => {
    s.fearlessExtra = s.fearlessExtra.filter(c => c !== p.champion);
    if (!s.fearlessRemoved.includes(p.champion)) s.fearlessRemoved.push(p.champion);
  }),

  /** Same lane again hides the head-to-head. */
  'ui:h2h': ({ store }, p: { lane: Role | null }) => store.update('ui', u => {
    u.h2hLane = p.lane && u.h2hLane !== p.lane ? p.lane : null;
  }),

  'ui:postgamePage': ({ store }, p?: { page?: 1 | 2 }) => store.update('ui', u => {
    u.postgamePage = p?.page ?? (u.postgamePage === 1 ? 2 : 1);
  }),

  'ui:autoScenes': ({ store }, p?: { on?: boolean }) => store.update('ui', u => { u.autoScenes = p?.on ?? !u.autoScenes; }),

  'ui:scene': ({ scenes }, p: { scene: SceneKey }) => scenes.manual(p.scene),

  'ui:pauseText': ({ store }, p: { text: string }) => store.update('ui', u => { u.pauseText = p.text; }),

  'operator:open': ({ openOperator }) => openOperator(),

  'hud:apply': ({ applyHud }) => applyHud(),

  // ---- spectator playback (Replay API) ----
  'replay:seek': async ({ playback }, p: { delta: number }) => notAvailable(await playback.seek(p.delta)),
  'replay:jump': async ({ playback }, p: { time: number }) => notAvailable(await playback.jump(p.time)),
  'replay:live': async ({ playback }) => notAvailable(await playback.live()),
  'replay:pause': async ({ playback }) => notAvailable(await playback.togglePause()),
  'replay:speed': async ({ playback }, p: { speed: number }) => notAvailable(await playback.set({ speed: p.speed })),

  /** Riot's replay bar in the game: hidden from the stream by default, can be shown for the operator. */
  'replay:bar': async ({ store, applyHud }, p?: { show?: boolean }) => {
    store.update('ui', u => { u.replayBar = p?.show ?? !u.replayBar; });
    await applyHud();
  },

  'gamecfg:enableReplayApi': ({ enableReplayApi }) => enableReplayApi(),

  /** Manual objective when the spectator feed sends no objective events (dragon: Fire/Water/Earth/Air/Hextech/Chemtech/Elder). */
  'game:objective': ({ objective }, p: { team: TeamKey; kind: ManualObjective; dragon?: string }) => objective(p.team, p.kind, p.dragon),

  /** Fight recap on the overlay: only ever shown by the operator. Default = the most recent fight. */
  'fight:show': ({ store }, p?: { id?: number }) => {
    const fights = store.get('ingame').fights;
    const f = p?.id !== undefined ? fights.find(x => x.id === p.id) : fights.at(-1);
    if (!f) throw new Error('No fight to show yet');
    store.update('ui', u => { u.fightRecap = { id: f.id, until: Date.now() + FIGHT_RECAP_MS }; });
  },

  'fight:hide': ({ store }) => store.update('ui', u => { u.fightRecap = null; }),

  'recorder:toggle': ({ recorder, store }) => {
    const on = recorder.toggle();
    store.update('status', s => { s.recording = on; });
  },
};

export function runAction(ctx: ActionContext, name: string, payload?: unknown): unknown {
  const h = ACTIONS[name];
  if (!h) throw new Error(`unknown action ${name}`);
  log.info('action', name + (payload === undefined ? '' : ` ${JSON.stringify(payload)}`));
  return h(ctx, payload);
}

/** Hotkey binding names ("h2h:TOP", "postgame:page", ...) to actions. */
export function hotkeyAction(ctx: ActionContext, binding: string): void {
  const [kind, arg] = binding.split(':');
  if (kind === 'h2h') runAction(ctx, 'ui:h2h', { lane: (ROLES as readonly string[]).includes(arg) ? arg : null });
  else if (kind === 'fight') {
    // the show hotkey toggles: pressed again while the recap is on air it hides it
    const recap = ctx.store.get('ui').fightRecap;
    const hide = arg === 'hide' || (recap !== null && recap.until > Date.now());
    void Promise.resolve().then(() => runAction(ctx, hide ? 'fight:hide' : 'fight:show')).catch(() => { /* no fight yet */ });
  }
  else if (binding === 'postgame:page') runAction(ctx, 'ui:postgamePage');
  else if (binding === 'scenes:auto') runAction(ctx, 'ui:autoScenes');
  else if (binding === 'operator:open') runAction(ctx, 'operator:open');
  else if (binding === 'sides:swap') runAction(ctx, 'match:swapSides');
  else if (kind === 'scene') runAction(ctx, 'ui:scene', { scene: arg });
  else if (kind === 'replay') {
    const run = (name: string, payload?: unknown) => Promise.resolve(runAction(ctx, name, payload)).catch(() => { /* no game */ });
    if (arg === 'back10') void run('replay:seek', { delta: -10 });
    else if (arg === 'fwd10') void run('replay:seek', { delta: 10 });
    else if (arg === 'pause') void run('replay:pause');
    else if (arg === 'live') void run('replay:live');
    else if (arg === 'bar') void run('replay:bar');
  }
}

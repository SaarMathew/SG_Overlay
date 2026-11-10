import type { AppState, GoldPoint, TeamKey } from '../../../shared/types.ts';

type View<T> = { [K in keyof T]: T[K] | null };
type Conn = { connected: boolean; error: string };

const flip = <T extends TeamKey | null | undefined>(k: T): T => (k === 'A' ? 'B' : k === 'B' ? 'A' : k) as T;
const neg = (h: GoldPoint[]) => h.map(p => ({ ...p, diff: -p.diff }));

/** When team A is drawn on the right (ui.aRight), swap every A/B pair so overlays can keep drawing A on the left. */
export function orient<S extends View<AppState> & Conn>(s: S): S {
  if (!s.ui?.aRight) return s;
  const o: Record<string, unknown> = { ...s };
  const { match, series, draft, lineup, ingame, postgame } = s;
  if (match) o.match = { ...match, teamA: match.teamB, teamB: match.teamA, rosterA: match.rosterB, rosterB: match.rosterA };
  if (series) o.series = {
    ...series, scoreA: series.scoreB, scoreB: series.scoreA,
    games: series.games.map(g => ({ ...g, winner: flip(g.winner), champsA: g.champsB, champsB: g.champsA })),
  };
  if (draft) o.draft = { ...draft, a: draft.b, b: draft.a, fearless: draft.fearless.map(f => ({ a: f.b, b: f.a })) };
  if (lineup) o.lineup = { ...lineup, a: lineup.b, b: lineup.a };
  if (ingame) o.ingame = {
    ...ingame, a: ingame.b, b: ingame.a,
    goldHistory: neg(ingame.goldHistory),
    playerGoldHistory: ingame.playerGoldHistory.map(p => ({ ...p, a: p.b, b: p.a })),
    timers: ingame.timers.map(t => ({ ...t, team: flip(t.team) })),
    inhibTimers: ingame.inhibTimers.map(t => ({ ...t, team: flip(t.team) })),
    popups: ingame.popups.map(p => ({ ...p, team: flip(p.team) })),
    fights: ingame.fights.map(f => ({
      ...f, killsA: f.killsB, killsB: f.killsA, winner: flip(f.winner),
      kills: f.kills.map(k => ({ ...k, killer: { ...k.killer, team: flip(k.killer.team) }, victim: { ...k.victim, team: flip(k.victim.team) } })),
      multikills: f.multikills.map(m => ({ ...m, team: flip(m.team) })),
      objectives: f.objectives.map(o => ({ ...o, team: flip(o.team) })),
      goldSwing: f.goldSwing === null ? null : -f.goldSwing,
    })),
  };
  if (postgame) o.postgame = {
    ...postgame, a: postgame.b, b: postgame.a,
    winner: flip(postgame.winner), winnerGuess: flip(postgame.winnerGuess),
    goldHistory: neg(postgame.goldHistory),
    gold15: postgame.gold15 && { a: postgame.gold15.b, b: postgame.gold15.a },
    events: postgame.events.map(e => ({ ...e, team: flip(e.team) })),
  };
  return o as S;
}

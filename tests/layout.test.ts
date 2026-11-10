import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/state/store.ts';
import { decideARight, wireLayout } from '../server/layout.ts';
import { orient } from '../web/src/lib/orient.ts';
import { defaultState, emptyTeam } from '../shared/defaults.ts';

describe('decideARight', () => {
  it('follows layout override and game side', () => {
    const s = defaultState();
    expect(decideARight(s)).toBe(false);
    s.ingame.a = emptyTeam('CHAOS');
    expect(decideARight(s)).toBe(true);
    s.match.sideA = 'ORDER';
    expect(decideARight(s)).toBe(false);
    s.match.layout = 'aRight';
    expect(decideARight(s)).toBe(true);
    s.match.layout = 'aLeft'; s.match.sideA = 'CHAOS';
    expect(decideARight(s)).toBe(false);
  });
  it('uses postgame side when active', () => {
    const s = defaultState();
    s.postgame.active = true; s.postgame.a = emptyTeam('CHAOS');
    expect(decideARight(s)).toBe(true);
  });
  it('store wiring updates ui.aRight', () => {
    const store = new Store(path.join(os.tmpdir(), `sg-layout-${Math.random()}.json`));
    wireLayout(store);
    expect(store.get('ui').aRight).toBe(false);
    store.update('ingame', g => { g.a.side = 'CHAOS'; });
    expect(store.get('ui').aRight).toBe(true);
    store.update('match', m => { m.layout = 'aLeft'; });
    expect(store.get('ui').aRight).toBe(false);
  });
  it('old persisted match gets default layout', () => {
    expect(defaultState().match.layout).toBe('auto');
  });
});

describe('orient', () => {
  const base = () => {
    const d = defaultState();
    return {
      ...d, connected: true, error: '',
      match: { ...d.match, teamA: { ...d.match.teamA, tag: 'A' }, teamB: { ...d.match.teamB, tag: 'B' } },
      series: { ...d.series, scoreA: 2, scoreB: 1, games: [{ number: 1, winner: 'A' as const, durationSec: 1, champsA: ['x'], champsB: ['y'] }, { number: 2, winner: null, durationSec: 1, champsA: [], champsB: [] }] },
      ingame: { ...d.ingame, goldHistory: [{ t: 60, diff: 500 }], timers: [{ id: '1', label: '', kind: 'baron' as const, team: 'A' as const, at: 1 }], inhibTimers: [{ team: 'A' as const, lane: 'Mid', at: 9 }, { team: 'B' as const, lane: 'Top', at: 9 }] },
      postgame: { ...d.postgame, winner: 'B' as const, winnerGuess: null, gold15: { a: [1], b: [2] } },
    };
  };
  it('returns input unchanged when not aRight', () => {
    const s = base();
    expect(orient(s)).toBe(s);
  });
  it('swaps fights (teams, kill counts, winner, gold swing) when aRight', () => {
    const s = base(); s.ui = { ...s.ui, aRight: true };
    const p = (team: 'A' | 'B') => ({ champ: 'Ahri', team });
    s.ingame = { ...s.ingame, fights: [{
      id: 1, start: 1, end: 9, killsA: 3, killsB: 1, winner: 'A', goldSwing: 900,
      kills: [{ t: 1, killer: p('A'), victim: p('B'), assisters: [] }],
      multikills: [{ t: 2, champ: 'Ahri', team: 'A', streak: 3 }],
      objectives: [{ t: 5, kind: 'baron', team: 'B' }],
    }] };
    const [f] = orient(s).ingame.fights;
    expect([f.killsA, f.killsB, f.winner, f.goldSwing]).toEqual([1, 3, 'B', -900]);
    expect([f.kills[0].killer.team, f.kills[0].victim.team, f.multikills[0].team, f.objectives[0].team]).toEqual(['B', 'A', 'B', 'A']);
    expect(s.ingame.fights[0].killsA).toBe(3);
  });
  it('swaps the team of log entries when aRight', () => {
    const s = base(); s.ui = { ...s.ui, aRight: true };
    s.ingame = { ...s.ingame, log: [{ t: 1, kind: 'kill', team: 'A', text: 'x' }, { t: 2, kind: 'ace', team: null, text: 'y' }] };
    expect(orient(s).ingame.log.map(l => l.team)).toEqual(['B', null]);
    expect(s.ingame.log[0].team).toBe('A');
  });
  it('swaps everything when aRight', () => {
    const s = base(); s.ui = { ...s.ui, aRight: true };
    const o = orient(s);
    expect(o.match.teamA.tag).toBe('B');
    expect(o.series.scoreA).toBe(1);
    expect(o.series.games.map(g => g.winner)).toEqual(['B', null]);
    expect(o.series.games[0].champsA).toEqual(['y']);
    expect(o.ingame.a.side).toBe('CHAOS');
    expect(o.ingame.goldHistory[0].diff).toBe(-500);
    expect(o.ingame.timers[0].team).toBe('B');
    expect(o.ingame.inhibTimers.map(i => i.team)).toEqual(['B', 'A']);
    expect(o.postgame.winner).toBe('A');
    expect(o.postgame.winnerGuess).toBeNull();
    expect(o.postgame.gold15).toEqual({ a: [2], b: [1] });
    expect(o.connected).toBe(true);
    expect(s.series.scoreA).toBe(2);
  });
});

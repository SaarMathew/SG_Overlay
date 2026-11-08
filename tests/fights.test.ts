import { describe, expect, it } from 'vitest';
import { FightTracker } from '../server/ingest/fights.ts';
import type { FightKill, TeamKey } from '../shared/types.ts';

const kill = (t: number, team: TeamKey): FightKill => ({
  t, killer: { champ: team === 'A' ? 'Ahri' : 'Syndra', team }, victim: { champ: 'Jinx', team: team === 'A' ? 'B' : 'A' }, assisters: [],
});

describe('FightTracker', () => {
  it('ignores single kills and chains kills within the gap, however long the fight', () => {
    const f = new FightTracker();
    f.kill(kill(100, 'A'));                                          // lone pick
    for (let t = 200; t <= 260; t += 10) f.kill(kill(t, 'A'));       // 60 s fight, kills 10 s apart
    f.kill(kill(280, 'B')); f.kill(kill(290, 'B'));                  // 20 s gap: separate fight
    const fights = f.build(300);
    expect(fights.map(x => [x.start, x.end, x.kills.length])).toEqual([[200, 260, 7], [280, 290, 2]]);
    expect(fights[0].winner).toBe('A');
    expect(fights[1]).toMatchObject({ killsA: 0, killsB: 2, winner: 'B' });
  });

  it('even trade has no winner, multikills and objectives use their windows', () => {
    const f = new FightTracker();
    f.kill(kill(500, 'A')); f.kill(kill(505, 'B'));
    f.multikill({ t: 505, champ: 'Syndra', team: 'B', streak: 3 });
    f.multikill({ t: 900, champ: 'Ahri', team: 'A', streak: 3 });
    f.objective({ t: 499, kind: 'tower', team: 'A' });                              // before the fight
    f.objective({ t: 520, kind: 'dragon', team: 'B', dragonType: 'ocean' });
    f.objective({ t: 535, kind: 'baron', team: 'B' });                              // exactly 30 s after
    f.objective({ t: 536, kind: 'herald', team: 'A' });                             // too late
    const [x] = f.build(600);
    expect(x.winner).toBeNull();
    expect(x.multikills).toHaveLength(1);
    expect(x.objectives.map(o => o.kind)).toEqual(['dragon', 'baron']);
  });

  it('gold swing = (A-B) shortly after minus just before; null without samples', () => {
    const f = new FightTracker();
    f.kill(kill(500, 'A')); f.kill(kill(510, 'A'));
    expect(f.build(512)[0].goldSwing).toBeNull();
    f.sample(490, 10_000, 10_000);
    f.sample(499, 10_100, 10_000);   // before: +100
    f.sample(515, 11_500, 10_100);   // still too early for "after"
    expect(f.build(515)[0].goldSwing).toBe(1300);   // latest available while ongoing
    f.sample(521, 12_000, 10_150);   // after: +1850
    expect(f.build(521)[0].goldSwing).toBe(1750);
    for (let t = 530; t < 900; t += 10) f.sample(t, 20_000, 10_000);   // ring buffer forgets old samples
    expect(f.build(900)[0].goldSwing).toBe(1750);
  });

  it('keeps the last 10 fights and resets', () => {
    const f = new FightTracker();
    for (let i = 0; i < 12; i++) { f.kill(kill(i * 100, 'A')); f.kill(kill(i * 100 + 5, 'A')); }
    const fights = f.build(2000);
    expect(fights).toHaveLength(10);
    expect(fights[0].start).toBe(200);
    f.reset();
    expect(f.build(0)).toEqual([]);
  });
});

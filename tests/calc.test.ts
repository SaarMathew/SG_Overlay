import { describe, expect, it } from 'vitest';
import { fmtGold, laneShares } from '../shared/calc.ts';
import { computeTimers } from '../server/ingest/timers.ts';
import { GoldTracker } from '../server/ingest/gold.ts';
import { assignRoles, decideSideA } from '../server/ingest/teams.ts';
import { defaultMatch } from '../shared/defaults.ts';
import type { ObjectiveRules } from '../server/config.ts';

const rules: ObjectiveRules = {
  dragonFirst: 300, dragonRespawn: 300, elderRespawn: 360, grubsFirst: 480, heraldFirst: 960,
  baronFirst: 1500, baronRespawn: 360, baronBuff: 180, elderBuff: 150, atakhanFirst: null, showBeforeSec: 240,
};

describe('laneShares (scoreboard funnel)', () => {
  it('shares add up to 100 % and lanes against the lead are negative', () => {
    const s = laneShares([1700, -600, 1100, 0, 400]);
    expect(s.map(x => x.percent)).toEqual([65, -23, 42, null, 15]);
    expect(s[0].fill).toBeCloseTo(0.654, 2);
    expect(s[3].fill).toBe(0);
  });
  it('hides percentages below the minimum lead and scales to the biggest lane', () => {
    const s = laneShares([300, -200, 0, 100, -100]);
    expect(s.every(x => x.percent === null)).toBe(true);
    expect(s[0].fill).toBe(1);
    expect(s[1].fill).toBeCloseTo(0.667, 2);
  });
  it('caps the funnel at full length', () => {
    expect(laneShares([3000, -2000, 0, 0, 0])[0].fill).toBe(1);
  });
});

describe('fmtGold', () => {
  it('formats with sign and k', () => {
    expect(fmtGold(42100)).toBe('42.1k');
    expect(fmtGold(-680, true)).toBe('−680');
    expect(fmtGold(1700, true)).toBe('+1.7k');
    expect(fmtGold(0, true)).toBe('±0');
  });
});

describe('computeTimers', () => {
  it('first dragon at 5:00, then respawn after the kill', () => {
    expect(computeTimers([], 200, rules).find(t => t.kind === 'dragon')?.at).toBe(300);
    const t = computeTimers([{ t: 330, kind: 'dragon', team: 'A', dragonType: 'infernal' }], 400, rules);
    expect(t.find(x => x.kind === 'dragon')?.at).toBe(630);
  });
  it('switches to elder after a soul and shows the rift type from the third dragon', () => {
    const kills = [330, 650, 960, 1270].map(t => ({ t, kind: 'dragon' as const, team: 'A' as const, dragonType: 'ocean' as const }));
    expect(computeTimers(kills.slice(0, 3), 1100, rules).find(x => x.kind === 'dragon')?.dragonType).toBe('ocean');
    const elder = computeTimers(kills, 1400, rules).find(x => x.kind === 'elder');
    expect(elder?.at).toBe(1270 + 360);
  });
  it('shows the baron buff for the team that took baron', () => {
    const t = computeTimers([{ t: 1520, kind: 'baron', team: 'B' }], 1650, rules);
    expect(t.find(x => x.kind === 'baronBuff')).toMatchObject({ team: 'B', at: 1700 });
    expect(t.find(x => x.kind === 'baron')?.at).toBe(1880);
  });
  it('hides objectives that are far away', () => {
    expect(computeTimers([], 100, rules).some(x => x.kind === 'baron')).toBe(false);
  });
});

describe('GoldTracker (OCR plausibility)', () => {
  const reading = (total: number) => ({ order: [[100, total] as [number, number], null, null, null, null], chaos: [] });
  it('accepts plausible values and rejects decreases and jumps', () => {
    const g = new GoldTracker();
    expect(g.accept(reading(5000), 0)).toBe(1);
    expect(g.accept(reading(4000), 1000)).toBe(0);    // total gold never goes down
    expect(g.accept(reading(25000), 2000)).toBe(0);   // misread digit
    expect(g.accept(reading(5300), 3000, 10)).toBe(1);
    expect(g.get('ORDER', 0, 12)?.total).toBe(5300);   // two live polls later: still current
    expect(g.get('ORDER', 0, 14)).toBeNull();          // four polls without a reading: stale
  });
});

describe('teams', () => {
  it('assigns roles: roster first, then API position, then remaining slots', () => {
    const roster = [{ riotId: 'Mid#EUW', displayName: '', role: 'MID' as const }];
    const slots = assignRoles(['a', 'mid', 'c', 'd', 'e'], ['', '', 'UTILITY', 'JUNGLE', ''], roster);
    // TOP JGL MID BOT SUP
    expect(slots).toEqual([0, 3, 1, 4, 2]);
  });
  it('decides the side of team A from the rosters', () => {
    const m = { ...defaultMatch(), rosterA: ['x', 'y', 'z'].map(n => ({ riotId: n, displayName: '', role: 'TOP' as const })) };
    expect(decideSideA(m, ['p', 'q'], ['x', 'y'])).toBe('CHAOS');
    expect(decideSideA(m, ['x'], ['q'])).toBe('ORDER');
    expect(decideSideA({ ...m, sideA: 'CHAOS' }, ['x', 'y', 'z'], [])).toBe('CHAOS');
  });
});

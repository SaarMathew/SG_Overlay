// Pure calculations used by backend and overlays.
import type { PlayerLive, TeamLive } from './types.ts';

/** Gold used for comparisons: OCR total if known, else item gold. */
export function playerGold(p: PlayerLive): number {
  return p.goldTotal ?? p.itemGold;
}

export function laneDiffs(a: TeamLive, b: TeamLive): number[] {
  return a.players.map((p, i) => playerGold(p) - playerGold(b.players[i]));
}

export interface LaneShare {
  diff: number;
  /** share of the total lead in percent (signed), null when the total lead is too small to be meaningful */
  percent: number | null;
  /** 0..1 funnel length */
  fill: number;
}

/**
 * Share of each lane in the total lead: lane diff / sum of lane diffs (shares add up to 100 %).
 * Below `minLead` the percentages are hidden and the funnels scale to the biggest lane diff.
 */
export function laneShares(diffs: number[], minLead = 500): LaneShare[] {
  const total = diffs.reduce((s, d) => s + d, 0);
  const stable = Math.abs(total) >= minLead;
  const maxAbs = Math.max(1, ...diffs.map(Math.abs));
  return diffs.map(diff => ({
    diff,
    percent: stable && diff !== 0 ? Math.round((diff / total) * 100) : null,
    fill: diff === 0 ? 0 : stable ? Math.min(Math.abs(diff / total), 1) : Math.abs(diff) / maxAbs,
  }));
}

export function killParticipation(p: PlayerLive, teamKills: number): number {
  return teamKills ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
}

export function fmtGold(g: number, signed = false): string {
  const s = signed ? (g > 0 ? '+' : g < 0 ? '−' : '±') : g < 0 ? '−' : '';
  const v = Math.abs(g);
  return s + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

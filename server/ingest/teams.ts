import type { GameSide, MatchConfig, Role, RosterEntry } from '../../shared/types.ts';
import { ROLES } from '../../shared/types.ts';

/** Riot IDs are compared without tag and case-insensitive. */
export const normName = (s: string | undefined) => (s ?? '').split('#')[0].trim().toLowerCase();

export function findRoster(roster: RosterEntry[], name: string): RosterEntry | undefined {
  const n = normName(name);
  return n ? roster.find(r => normName(r.riotId) === n) : undefined;
}

export function displayName(roster: RosterEntry[], name: string): string {
  const r = findRoster(roster, name);
  return r?.displayName || name.split('#')[0];
}

/** Which in-game side team A plays on: admin override, else whichever side has more of team A's roster. */
export function decideSideA(match: MatchConfig, orderNames: string[], chaosNames: string[]): GameSide {
  if (match.sideA !== 'auto') return match.sideA;
  const hits = (names: string[], roster: RosterEntry[]) => names.filter(n => findRoster(roster, n)).length;
  const aOnOrder = hits(orderNames, match.rosterA) + hits(chaosNames, match.rosterB);
  const aOnChaos = hits(chaosNames, match.rosterA) + hits(orderNames, match.rosterB);
  return aOnChaos > aOnOrder ? 'CHAOS' : 'ORDER';
}

const POSITIONS: Record<string, Role> = {
  TOP: 'TOP', JUNGLE: 'JGL', JGL: 'JGL', MIDDLE: 'MID', MID: 'MID',
  BOTTOM: 'BOT', BOT: 'BOT', ADC: 'BOT', UTILITY: 'SUP', SUPPORT: 'SUP', SUP: 'SUP',
};

/**
 * Orders up to five players by role. Priority: roster role, then the API's position, then the
 * remaining roles in the order the players arrive. Returns indices into `players` per ROLES slot.
 */
export function assignRoles(names: string[], positions: (string | undefined)[], roster: RosterEntry[]): (number | null)[] {
  const slots: (number | null)[] = ROLES.map(() => null);
  const taken = new Set<number>();
  const place = (role: Role | undefined, i: number) => {
    if (!role || taken.has(i)) return;
    const s = ROLES.indexOf(role);
    if (slots[s] === null) { slots[s] = i; taken.add(i); }
  };
  names.forEach((n, i) => place(findRoster(roster, n)?.role, i));
  positions.forEach((p, i) => place(POSITIONS[(p ?? '').toUpperCase()], i));
  names.forEach((_, i) => {
    if (taken.has(i)) return;
    const s = slots.indexOf(null);
    if (s >= 0) { slots[s] = i; taken.add(i); }
  });
  return slots;
}

import type { AppState, GameSide, IngameState, LineupPick, MatchConfig, PlayerLive, Role, SeriesState, TeamLive } from './types.ts';
import { ROLES } from './types.ts';

export const SG_TEAM = { name: 'SaarGaming', tag: 'SG', logo: '/assets/saargaming-logo.png', color: '#9b4dff' };

export function defaultMatch(): MatchConfig {
  return {
    sgFixed: true,
    teamA: { ...SG_TEAM },
    teamB: { name: 'Opponent', tag: 'OPP', logo: null, color: '#e5484d' },
    rosterA: [],
    rosterB: [],
    sideA: 'auto',
    leagueLine: 'Prime League',
    format: 3,
    caster: '',
    socials: [],
    countdownTarget: null,
    draftUrl: '',
  };
}

export function defaultSeries(): SeriesState {
  return { scoreA: 0, scoreB: 0, gameNumber: 1, games: [], fearlessExtra: [], fearlessRemoved: [] };
}

export function emptyPick(role: Role): LineupPick {
  return { role, player: '', champion: null, championName: null, locked: false, spells: null };
}

export function emptyPlayer(role: Role): PlayerLive {
  return {
    role, name: '', riotId: '', champion: '', championName: '', level: 1, items: [0, 0, 0, 0, 0, 0], trinket: 0,
    kills: 0, deaths: 0, assists: 0, cs: 0, ward: 0, spells: ['SummonerFlash', 'SummonerFlash'],
    dead: false, respawn: 0, goldTotal: null, goldCurrent: null, itemGold: 0,
  };
}

export function emptyTeam(side: GameSide): TeamLive {
  return {
    side, players: ROLES.map(emptyPlayer), kills: 0, towers: 0, inhibs: 0, dragons: [], elders: 0,
    grubs: 0, heralds: 0, barons: 0, atakhans: 0, gold: 0,
  };
}

export function emptyIngame(): IngameState {
  return {
    active: false, gameTime: 0, receivedAt: 0, paused: false,
    a: emptyTeam('ORDER'), b: emptyTeam('CHAOS'), goldSource: 'items',
    timers: [], popups: [], goldHistory: [], playerGoldHistory: [],
  };
}

export function defaultState(): AppState {
  return {
    match: defaultMatch(),
    series: defaultSeries(),
    draft: { status: 'off', message: '', game: 1, a: null, b: null, fearless: [], updatedAt: 0 },
    lineup: { active: false, a: ROLES.map(emptyPick), b: ROLES.map(emptyPick) },
    ingame: emptyIngame(),
    postgame: { active: false, durationSec: 0, winnerGuess: null, winner: null, a: null, b: null, goldHistory: [], gold15: null, events: [] },
    ui: { scene: null, autoScenes: true, h2hLane: null, postgamePage: 1, pauseText: 'Technical pause' },
    status: {
      mode: 'live', lcu: 'down', live: 'down', replayApi: 'off', obs: 'down', ocr: 'off',
      recording: false, gameflow: 'None', ddVersion: '', message: '',
    },
  };
}

/** Champions locked by Fearless (both teams): every champion of finished games, plus manual edits. */
export function fearlessLocked(series: SeriesState): string[] {
  const set = new Set<string>();
  for (const g of series.games) for (const c of [...g.champsA, ...g.champsB]) set.add(c);
  for (const c of series.fearlessExtra) set.add(c);
  for (const c of series.fearlessRemoved) set.delete(c);
  return [...set];
}

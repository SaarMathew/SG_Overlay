// Shapes of the raw Riot API payloads we consume (only the fields we use).
import { EventEmitter } from 'node:events';
import type { DragonType } from '../../shared/types.ts';

export interface RawItem { itemID: number; slot: number; count: number }
export interface RawSpell { displayName?: string; rawDisplayName?: string }

export interface RawPlayer {
  championName: string;            // localized display name
  rawChampionName?: string;        // "game_character_displayname_LeeSin"
  isDead: boolean;
  items: RawItem[];
  level: number;
  position?: string;               // TOP JUNGLE MIDDLE BOTTOM UTILITY, often "" in customs
  respawnTimer: number;
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
  scores: { kills: number; deaths: number; assists: number; creepScore: number; wardScore: number };
  summonerSpells: { summonerSpellOne: RawSpell; summonerSpellTwo: RawSpell };
  team: 'ORDER' | 'CHAOS';
}

export interface RawEvent {
  EventID: number;
  EventName: string;
  EventTime: number;
  KillerName?: string;
  VictimName?: string;
  Assisters?: string[];
  DragonType?: string;
  Stolen?: string;
  TurretKilled?: string;
  InhibKilled?: string;
  InhibRespawned?: string;
  InhibRespawningSoon?: string;
  KillStreak?: number;
  Acer?: string;
  AcingTeam?: string;
  Recipient?: string;
  Result?: string;
}

export interface AllGameData {
  allPlayers: RawPlayer[];
  events: { Events: RawEvent[] };
  gameData: { gameTime: number; gameMode?: string; mapTerrain?: string };
}

export interface CsMember {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  spell1Id: number;
  spell2Id: number;
  assignedPosition?: string;
  gameName?: string;
  tagLine?: string;
  summonerId?: number;
}

export interface ChampSelectSession {
  myTeam: CsMember[];
  theirTeam: CsMember[];
  actions?: { actorCellId: number; type: string; completed: boolean; championId: number }[][];
}

/** One team's half of the spectator score bar. Counters are null when unreadable; dragonTypes[i] = type of the i-th dragon icon (null = no icon / unknown type). */
export interface TopbarSide {
  dragons: number | null; barons: number | null; grubs: number | null; towers: number | null;
  dragonTypes: (DragonType | null)[];
}

/** OCR result per scoreboard row: [current, total] or null if unreadable. */
export interface GoldReading {
  order: ([number, number] | null)[]; chaos: ([number, number] | null)[];
  /** objective counters + dragon icons of Riot's score bar (absent when the score bar is not read) */
  topbar?: { order: TopbarSide; chaos: TopbarSide };
  /** exact CS per row (absent in older recordings / when the CS regions are not read) */
  cs?: { order: (number | null)[]; chaos: (number | null)[] };
}

export interface SourceEvents {
  gameflow: [phase: string];
  champselect: [session: ChampSelectSession | null];
  live: [data: AllGameData | null];
  gold: [reading: GoldReading | null];
}

/** All data sources (real, mock or replay) publish here; ingest + recorder subscribe. */
export class SourceBus extends EventEmitter<SourceEvents> {}

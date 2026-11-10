// State shared between backend, overlays and admin panel.
// Team "A" is always shown on the left (SaarGaming by default), team "B" on the right.

export const ROLES = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'] as const;
export type Role = (typeof ROLES)[number];
export type TeamKey = 'A' | 'B';
export type GameSide = 'ORDER' | 'CHAOS';
export type DragonType = 'infernal' | 'ocean' | 'mountain' | 'cloud' | 'hextech' | 'chemtech' | 'elder';

export interface TeamConfig {
  name: string;
  tag: string;
  logo: string | null;   // URL served by the backend, null = placeholder with tag
  color: string;
}

export interface RosterEntry {
  riotId: string;        // game name, tag optional ("Name" or "Name#TAG")
  displayName: string;   // shown in overlays; empty = riot game name
  role: Role;
}

export interface MatchConfig {
  sgFixed: boolean;              // team A locked to SaarGaming
  teamA: TeamConfig;
  teamB: TeamConfig;
  rosterA: RosterEntry[];
  rosterB: RosterEntry[];
  sideA: 'auto' | GameSide;      // which in-game side team A plays on
  layout: 'auto' | 'aLeft' | 'aRight'; // which side of the screen team A is drawn on; auto = blue side left like the game HUD
  leagueLine: string;
  format: 1 | 2 | 3 | 5;
  caster: string;
  socials: string[];
  countdownTarget: number | null; // epoch ms
  draftUrl: string;               // drafter.lol series link from the Prime League, '' = none
}

export interface DraftPick { role: Role; champion: string; championName: string }

export interface DraftTeam {
  name: string;                  // as entered on drafter.lol
  side: 'blue' | 'red';
  picks: (DraftPick | null)[];   // ordered by ROLES, null = not picked yet
  bans: (string | null)[];       // Data Dragon ids in ban order, null = open
}

export interface DraftState {
  status: 'off' | 'loading' | 'ok' | 'error';
  message: string;
  game: number;
  a: DraftTeam | null;
  b: DraftTeam | null;
  /** champions locked by earlier games of the drafter.lol series (Fearless), per row = one earlier game */
  fearless: { a: string[]; b: string[] }[];
  updatedAt: number;
}

export interface GameRecord {
  number: number;
  winner: TeamKey | null;
  durationSec: number;
  champsA: string[];             // Data Dragon ids
  champsB: string[];
}

export interface SeriesState {
  scoreA: number;
  scoreB: number;
  gameNumber: number;
  games: GameRecord[];
  fearlessExtra: string[];       // manually added locked champions
  fearlessRemoved: string[];     // manually unlocked champions
}

export interface LineupPick {
  role: Role;
  player: string;
  champion: string | null;       // Data Dragon id, null = not picked yet
  championName: string | null;
  locked: boolean;
  spells: [string, string] | null; // Data Dragon spell ids, e.g. "SummonerFlash"
}

export interface LineupState {
  active: boolean;
  a: LineupPick[];
  b: LineupPick[];
}

export interface PlayerLive {
  role: Role;
  name: string;
  riotId: string;                // "Name#TAG" as reported by the game (used to fill rosters)
  champion: string;              // Data Dragon id
  championName: string;
  level: number;
  items: number[];               // 6 slots, 0 = empty
  trinket: number;               // 0 = none
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  ward: number;
  spells: [string, string];
  dead: boolean;
  respawn: number;               // seconds
  goldTotal: number | null;      // OCR (total earned)
  goldCurrent: number | null;    // OCR (unspent)
  itemGold: number;              // fallback from Data Dragon prices
}

export interface TeamLive {
  side: GameSide;
  players: PlayerLive[];         // ordered by ROLES
  kills: number;
  towers: number;
  inhibs: number;
  dragons: DragonType[];         // in order taken (elder excluded)
  elders: number;
  grubs: number;
  heralds: number;
  barons: number;
  atakhans: number;
  gold: number;                  // OCR total, or item gold fallback
}

export interface ObjectiveTimer {
  id: string;
  label: string;
  kind: 'dragon' | 'elder' | 'baron' | 'atakhan' | 'herald' | 'grubs' | 'baronBuff' | 'elderBuff';
  dragonType?: DragonType;
  team?: TeamKey;
  at: number;                    // game time (s) when it spawns / expires
}

/** An inhibitor that is down; `at` = game time (s) when it respawns. Team = owner. */
export interface InhibTimer { team: TeamKey; lane: string; at: number }

export interface Popup {
  id: number;
  kind: 'dragon' | 'elder' | 'baron' | 'herald' | 'grubs' | 'atakhan' | 'inhib' | 'ace' | 'multikill' | 'firstblood' | 'tower';
  team: TeamKey | null;
  title: string;
  text: string;
  detail?: string;
  dragonType?: DragonType;
  from: number;                  // epoch ms, popups are queued one after another
  until: number;                 // epoch ms
}

export interface GoldPoint { t: number; diff: number }       // diff = A - B
export interface PlayerGoldPoint { t: number; a: number[]; b: number[] } // per role, total gold

export interface FightPlayer { champ: string; team: TeamKey }
export interface FightKill { t: number; killer: FightPlayer; victim: FightPlayer; assisters: string[]; shutdown?: number }
export interface FightObjective {
  t: number;
  kind: 'dragon' | 'elder' | 'baron' | 'herald' | 'grubs' | 'atakhan' | 'tower' | 'inhib';
  team: TeamKey;
  dragonType?: DragonType;
}
/** A teamfight: >= 2 champion kills, each within a few seconds of the previous one. */
export interface Fight {
  id: number;                    // start time (s), stable while the fight exists
  start: number;
  end: number;
  kills: FightKill[];
  killsA: number;
  killsB: number;
  multikills: { t: number; champ: string; team: TeamKey; streak: number }[];
  objectives: FightObjective[];  // from the first kill until 30 s after the last
  goldSwing: number | null;      // (A - B) after minus before; null without OCR gold
  winner: TeamKey | null;        // more kills; null = even trade
}

export interface IngameState {
  active: boolean;
  gameTime: number;
  receivedAt: number;            // epoch ms of the poll that produced gameTime (overlays interpolate)
  paused: boolean;
  a: TeamLive;
  b: TeamLive;
  goldSource: 'ocr' | 'items';
  timers: ObjectiveTimer[];
  inhibTimers: InhibTimer[];
  soul: DragonType | null;      // element of the dragon soul (map terrain, else 3rd dragon)
  popups: Popup[];
  goldHistory: GoldPoint[];      // one point per minute
  playerGoldHistory: PlayerGoldPoint[];
  fights: Fight[];               // last ~10, newest last
}

export interface PostgameState {
  active: boolean;
  durationSec: number;
  winnerGuess: TeamKey | null;
  winner: TeamKey | null;        // confirmed in admin
  a: TeamLive | null;
  b: TeamLive | null;
  goldHistory: GoldPoint[];
  gold15: { a: number[]; b: number[] } | null;
  events: { t: number; kind: 'dragon' | 'baron' | 'elder' | 'atakhan'; team: TeamKey; dragonType?: DragonType }[];
}

export type SceneKey = 'startingSoon' | 'draft' | 'lineup' | 'ingame' | 'postgame' | 'pause';

export interface UiState {
  scene: SceneKey | null;
  autoScenes: boolean;
  h2hLane: Role | null;
  postgamePage: 1 | 2;
  pauseText: string;
  /** show Riot's replay bar (timeline) in the game instead of hiding it from the stream */
  replayBar: boolean;
  /** computed by the server from match.layout / game side: draw team A on the right (never set by clients) */
  aRight: boolean;
  /** operator-triggered fight recap on the ingame overlay (until = epoch ms) */
  fightRecap: { id: number; until: number } | null;
}

export type Health = 'ok' | 'warn' | 'down' | 'off';

export interface StatusState {
  mode: 'live' | 'mock' | 'replay';
  lcu: Health;
  live: Health;
  replayApi: Health;
  obs: Health;
  ocr: Health;
  recording: boolean;
  /** Replay API playback of the spectated game (null when not available) */
  playback: { time: number; length: number; paused: boolean; speed: number } | null;
  gameflow: string;
  ddVersion: string;
  /** version of the running server (git commit or release version) */
  version: string;
  message: string;
}

export interface AppState {
  match: MatchConfig;
  series: SeriesState;
  draft: DraftState;
  lineup: LineupState;
  ingame: IngameState;
  postgame: PostgameState;
  ui: UiState;
  status: StatusState;
}

export type Topic = keyof AppState;

// ---- WebSocket protocol ----
export type ClientMessage =
  | { type: 'subscribe'; topics: Topic[] }
  | { type: 'action'; name: string; payload?: unknown };

export type ServerMessage =
  | { type: 'state'; topic: Topic; data: AppState[Topic] }
  | { type: 'error'; message: string };

import fs from 'node:fs';
import path from 'node:path';
import type { SceneKey } from '../shared/types.ts';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const WEB_DIST = path.join(ROOT, 'dist', 'web');

export interface OcrRegion { x: number; y: number; w: number; h: number }

export interface Settings {
  port: number;
  leagueDir: string;                       // contains lockfile and Config/game.cfg
  obs: { url: string; password: string; gameCaptureSource: string };
  sceneNames: Record<SceneKey, string>;
  /** Replay API render flags applied when a game starts (Riot HUD elements that must not be on stream). */
  replayRender: Record<string, boolean>;
  applyReplayRender: boolean;
  ocr: {
    enabled: boolean;
    intervalMs: number;
    /** gold text of Riot's spectator scoreboard, one region per row; left column = ORDER, right = CHAOS */
    order: OcrRegion[];
    chaos: OcrRegion[];
    threshold: number;                     // luminance 0..255 above which a pixel counts as text
  };
  hotkeys: Record<string, string>;         // action -> combo, e.g. "h2h:TOP": "Ctrl+Alt+1"
  postgameDelayMs: number;
  browserPath: string;                     // Edge/Chrome for reading drafter.lol, '' = auto-detect
}

const rows = (x: number) => [875, 919, 963, 1007, 1051].map(cy => ({ x, y: cy - 12, w: 150, h: 24 }));

export const DEFAULT_SETTINGS: Settings = {
  port: 3210,
  leagueDir: 'C:\\Riot Games\\League of Legends',
  obs: { url: 'ws://127.0.0.1:4455', password: '', gameCaptureSource: 'Game Capture' },
  sceneNames: {
    startingSoon: 'Starting Soon', draft: 'Draft', lineup: 'Lineup',
    ingame: 'Ingame', postgame: 'Post-Game', pause: 'Pause',
  },
  // To verify on the real client (DESIGN.md open point 4). Score bar + scoreboard stay rendered for OCR.
  replayRender: {
    interfaceReplay: false,
    interfaceTimeline: false,
    interfaceNeutralTimers: false,
    interfaceTarget: false,
    interfaceScore: true,
    interfaceScoreboard: true,
    interfaceFrames: true,
    interfaceMinimap: true,
  },
  applyReplayRender: true,
  ocr: { enabled: true, intervalMs: 2000, order: rows(640), chaos: rows(1150), threshold: 140 },
  hotkeys: {
    'h2h:TOP': 'Ctrl+Alt+1', 'h2h:JGL': 'Ctrl+Alt+2', 'h2h:MID': 'Ctrl+Alt+3', 'h2h:BOT': 'Ctrl+Alt+4', 'h2h:SUP': 'Ctrl+Alt+5',
    'h2h:off': 'Ctrl+Alt+0', 'postgame:page': 'Ctrl+Alt+P', 'scenes:auto': 'Ctrl+Alt+A', 'scene:pause': 'Ctrl+Alt+F9',
  },
  postgameDelayMs: 3000,
  browserPath: '',
};

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(base)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? merge(out[k], v) : v;
  }
  return out as T;
}

/** Keeps only what differs from `base` (plain objects recursively, arrays/values compared as a whole). */
export function diffSettings(value: unknown, base: unknown): unknown {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(value) && isObj(base)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const d = k in base ? diffSettings(v, base[k]) : v;
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(value) === JSON.stringify(base) ? undefined : value;
}

// Version 1 wrote every setting to the file, which froze the defaults of that time (e.g. OCR every 1000 ms).
const V1_DEFAULTS = merge(DEFAULT_SETTINGS, { ocr: { intervalMs: 1000 } });

export function loadSettings(): Settings {
  try {
    let raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as Record<string, unknown>;
    if (raw._v !== 2) raw = (diffSettings(raw, V1_DEFAULTS) ?? {}) as Record<string, unknown>;
    delete raw._v;
    return merge(DEFAULT_SETTINGS, raw);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Only changed settings are written, so improved defaults of later versions still apply. */
export function saveSettings(s: Settings): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const changed = (diffSettings(s, DEFAULT_SETTINGS) ?? {}) as Record<string, unknown>;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ _v: 2, ...changed }, null, 2));
}

/** Objective rules (patch dependent, editable without code changes). */
export interface ObjectiveRules {
  dragonFirst: number; dragonRespawn: number; elderRespawn: number;
  grubsFirst: number; heraldFirst: number;
  baronFirst: number; baronRespawn: number; baronBuff: number; elderBuff: number;
  atakhanFirst: number | null;
  showBeforeSec: number;
}

export function loadObjectiveRules(): ObjectiveRules {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'objectives.json'), 'utf8')) as ObjectiveRules;
}

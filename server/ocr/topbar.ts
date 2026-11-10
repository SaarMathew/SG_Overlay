// Reads Riot's spectator score bar: objective counters (small blue/red digits) and the dragon icons below the bar.
// The live API sends no DragonKill/HordeKill/HeraldKill events while spectating, so this is the only source for them.
import fs from 'node:fs';
import path from 'node:path';
import type { PNG } from 'pngjs';
import { CONFIG_DIR, type IconRow, type OcrRegion, type Settings } from '../config.ts';
import type { DragonType } from '../../shared/types.ts';
import type { TopbarSide } from '../sources/raw.ts';
import { emptyTemplates, loadTemplates, parseCount, recognize, toGray, type Templates } from './matcher.ts';

/** digits of the score bar, trained from real frames (scripts/ocr-topbar-train.ts) */
export const TOPBAR_TEMPLATES_FILE = path.join(CONFIG_DIR, 'ocr-topbar-templates.json');

export function loadTopbarTemplates(file = TOPBAR_TEMPLATES_FILE): Templates {
  try { return loadTemplates(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return emptyTemplates(); }
}

/**
 * Dominant icon colours measured on a real replay (1920x1080), against the video background behind the icon:
 * infernal (208,119,70), mountain (182,146,117), cloud (149,195,210; the pale blue first drake of the reference replay,
 * once misread as ocean). Ocean, hextech, chemtech and elder were not in the reference frames: their colours are the
 * averages of Riot's minimap icons (web/public/assets/objectives), so treat them as unverified.
 */
export const ICON_COLORS: Partial<Record<DragonType, [number, number, number]>> = {
  infernal: [208, 119, 70], mountain: [182, 146, 117], cloud: [149, 195, 210],
  ocean: [122, 184, 172], hextech: [77, 141, 166], chemtech: [130, 179, 63], elder: [159, 147, 188],
};
const ICON_RADIUS = 30;
/** pixels of the icon's colour needed in a slot (real icons give 35-54, an empty slot 0) */
const MIN_ICON_PIXELS = 20;

export function classifyIcon(png: PNG, r: OcrRegion): DragonType | null {
  let best: DragonType | null = null, bestN = MIN_ICON_PIXELS - 1;
  for (const [type, c] of Object.entries(ICON_COLORS) as [DragonType, [number, number, number]][]) {
    let n = 0;
    for (let y = Math.max(0, r.y); y < Math.min(png.height, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(png.width, r.x + r.w); x++) {
        const o = (y * png.width + x) * 4;
        if (Math.hypot(png.data[o] - c[0], png.data[o + 1] - c[1], png.data[o + 2] - c[2]) < ICON_RADIUS) n++;
      }
    }
    if (n > bestN) { bestN = n; best = type; }
  }
  return best;
}

function readSide(png: PNG, counters: Settings['ocr']['topbar']['order'], icons: IconRow, threshold: number, t: Templates): TopbarSide {
  // blue and red digits: the brightest channel is the text (the gold/CS reader weights blue down)
  const count = (r: OcrRegion) => parseCount(recognize(toGray(png.data, png.width, r.x, r.y, r.w, r.h, 1), threshold, t));
  const dragonTypes: (DragonType | null)[] = [];
  for (let k = 0; k < icons.slots; k++) {
    dragonTypes.push(classifyIcon(png, { x: Math.round(icons.x + k * icons.step), y: icons.y, w: icons.w, h: icons.h }));
  }
  return { dragons: count(counters.dragons), barons: count(counters.barons), grubs: count(counters.grubs), towers: count(counters.towers), dragonTypes };
}

export function readTopbar(png: PNG, s: Settings['ocr']['topbar'], t: Templates): { order: TopbarSide; chaos: TopbarSide } {
  return { order: readSide(png, s.order, s.dragonsOrder, s.threshold, t), chaos: readSide(png, s.chaos, s.dragonsChaos, s.threshold, t) };
}

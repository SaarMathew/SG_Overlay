// Check or extend the gold OCR with a full-resolution screenshot of the spectator view:
//   npm run ocr:learn -- <screenshot.png> --test                       prints what every row reads
//   npm run ocr:learn -- <screenshot.png> <order|chaos> <row 0-4> "<label e.g. 215(716)>"
// Default glyphs ship in config/ocr-templates.json (scripts/ocr-train.ts); learned ones go to data/ocr/templates.json.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadSettings } from '../config.ts';
import { learn, loadTemplates, parseGold, recognize, toGray } from './matcher.ts';
import { DEFAULT_TEMPLATES_FILE, TEMPLATES_FILE } from './reader.ts';

const [file, sideArg, rowArg, label] = process.argv.slice(2);
if (!file) {
  console.log('usage: ocr:learn <screenshot.png> --test  |  ocr:learn <screenshot.png> <order|chaos> <row> "<label>"');
  process.exit(1);
}
const settings = loadSettings();
const png = PNG.sync.read(fs.readFileSync(file));
const read = (f: string) => { try { return loadTemplates(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return loadTemplates(null); } };
const learned = read(TEMPLATES_FILE);
const all = read(DEFAULT_TEMPLATES_FILE);
for (const [ch, list] of Object.entries(learned.chars)) all.chars[ch] = [...(all.chars[ch] ?? []), ...list];

if (sideArg === '--test') {
  for (const side of ['order', 'chaos'] as const) {
    settings.ocr[side].forEach((r, i) => {
      const text = recognize(toGray(png.data, png.width, r.x, r.y, r.w, r.h), settings.ocr.threshold, all);
      console.log(`${side} ${i}: "${text}" -> ${JSON.stringify(parseGold(text))}`);
    });
  }
} else {
  const r = settings.ocr[sideArg as 'order' | 'chaos'][Number(rowArg)];
  if (!learn(toGray(png.data, png.width, r.x, r.y, r.w, r.h), settings.ocr.threshold, label, learned)) {
    console.error('glyph count does not match the label - check the region / threshold');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(TEMPLATES_FILE), { recursive: true });
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(learned));
  console.log(`learned "${label}"`);
}

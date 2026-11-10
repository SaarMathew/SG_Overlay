// Trains the score-bar digit templates from real replay frames (raw 1920x1080 game capture, labeled by hand).
//   npx tsx scripts/ocr-topbar-train.ts <frames-dir>             leave-one-frame-out check
//   npx tsx scripts/ocr-topbar-train.ts <frames-dir> --write     write config/ocr-topbar-templates.json
//   npx tsx scripts/ocr-topbar-train.ts <frames-dir> --fixtures  cut the score-bar strips into tests/fixtures/ocr-topbar
// Frames: <dir>/t<game seconds>.png. Digits come from the counters and from the gold text ("71.9k", same font).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { DEFAULT_SETTINGS } from '../server/config.ts';
import { emptyTemplates, learn, parseCount, recognize, toGray, type Templates } from '../server/ocr/matcher.ts';
import { FRAME_LABELS } from '../tests/fixtures/ocr-topbar/labels.ts';

const root = path.resolve(import.meta.dirname, '..');
const [dir, mode] = process.argv.slice(2);
if (!dir) throw new Error('usage: tsx scripts/ocr-topbar-train.ts <frames-dir> [--write|--fixtures]');
const tb = DEFAULT_SETTINGS.ocr.topbar;
const GOLD_ORDER = { x: 802, y: 18, w: 56, h: 20 };
const GOLD_CHAOS = { x: 1107, y: 18, w: 56, h: 20 };

interface Sample { frame: number; label: string; crop: ReturnType<typeof toGray> }
const samples: Sample[] = [];
for (const [t, l] of Object.entries(FRAME_LABELS)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, `t${t}.png`)));
  const g = (r: { x: number; y: number; w: number; h: number }) => toGray(png.data, png.width, r.x, r.y, r.w, r.h, 1);
  for (const side of ['order', 'chaos'] as const) {
    for (const k of ['dragons', 'barons', 'grubs', 'towers'] as const) samples.push({ frame: +t, label: String(l[side][k]), crop: g(tb[side][k]) });
  }
  samples.push({ frame: +t, label: l.goldOrder.replace('.', ''), crop: g(GOLD_ORDER) }, { frame: +t, label: l.goldChaos.replace('.', ''), crop: g(GOLD_CHAOS) });
}

const train = (list: Sample[]): Templates => {
  const t = emptyTemplates();
  for (const s of list) if (!learn(s.crop, tb.threshold, s.label, t, 12)) console.log(`  glyph count mismatch: t${s.frame} "${s.label}"`);
  for (const ch of Object.keys(t.chars)) if (!/\d/.test(ch)) delete t.chars[ch];   // the 'k' of the gold text
  return t;
};
const counters = (list: Sample[]) => list.filter(s => /^\d+$/.test(s.label));

if (mode === '--fixtures') {
  const out = path.join(root, 'tests', 'fixtures', 'ocr-topbar');
  for (const t of Object.keys(FRAME_LABELS)) {
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, `t${t}.png`)));
    const strip = new PNG({ width: 980, height: 90 });
    PNG.bitblt(png, strip, 470, 0, 980, 90, 0, 0);
    fs.writeFileSync(path.join(out, `t${t}.png`), PNG.sync.write(strip));
  }
  console.log('fixtures written');
} else if (mode === '--write') {
  const t = train(samples);
  const ok = counters(samples).filter(s => recognize(s.crop, tb.threshold, t) === s.label).length;
  console.log(`all frames: ${ok}/${counters(samples).length} counters; digits: ${Object.keys(t.chars).sort().join('')}`);
  fs.writeFileSync(path.join(root, 'config', 'ocr-topbar-templates.json'), JSON.stringify(t));
} else {
  let ok = 0, n = 0;
  for (const f of Object.keys(FRAME_LABELS)) {
    const t = train(samples.filter(s => s.frame !== +f));
    for (const s of counters(samples.filter(x => x.frame === +f))) {
      n++;
      const text = recognize(s.crop, tb.threshold, t);
      if (parseCount(text) === Number(s.label)) ok++; else console.log(`  wrong: t${f} read "${text}" expected "${s.label}"`);
    }
  }
  console.log(`leave-one-frame-out: ${ok}/${n} counters correct`);
}

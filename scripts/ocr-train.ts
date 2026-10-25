// Trains the default gold OCR templates from labeled real crops (tests/fixtures/ocr/<n>_<label>.png).
//   npx tsx scripts/ocr-train.ts                 cross-check (train on half, test on the other half)
//   npx tsx scripts/ocr-train.ts --write         train on all, write config/ocr-templates.json
//   npx tsx scripts/ocr-train.ts --scan <dir>    read every crop in a recording's crops folder
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { emptyTemplates, learn, parseGold, recognize, toGray, type Gray, type Templates } from '../server/ocr/matcher.ts';

const THRESHOLD = 140;
const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'ocr');

const gray = (file: string): Gray => {
  const png = PNG.sync.read(fs.readFileSync(file));
  return toGray(png.data, png.width, 0, 0, png.width, png.height);
};
const samples = fs.readdirSync(fixtures).filter(f => f.endsWith('.png')).sort()
  .map(f => ({ file: path.join(fixtures, f), label: f.replace(/^\d+_/, '').replace(/\.png$/, '') }));

const train = (list: typeof samples): Templates => {
  const t = emptyTemplates();
  for (const s of list) if (!learn(gray(s.file), THRESHOLD, s.label, t)) console.log(`  glyph count mismatch: ${s.label}`);
  return t;
};
const test = (t: Templates, list: typeof samples) => {
  let ok = 0;
  for (const s of list) {
    const text = recognize(gray(s.file), THRESHOLD, t);
    const good = text === s.label;
    if (good) ok++; else console.log(`  wrong: "${text}" expected "${s.label}"`);
  }
  return ok;
};

const args = process.argv.slice(2);
if (args[0] === '--scan') {
  const t = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ocr-templates.json'), 'utf8')) as Templates;
  const files = fs.readdirSync(args[1]).filter(f => f.endsWith('.png'));
  let parsed = 0;
  for (const f of files) if (parseGold(recognize(gray(path.join(args[1], f)), THRESHOLD, t))) parsed++;
  console.log(`${parsed}/${files.length} crops parsed`);
} else if (args[0] === '--write') {
  const t = train(samples);
  console.log(`all samples: ${test(t, samples)}/${samples.length} correct; glyphs: ${Object.keys(t.chars).sort().join('')}`);
  fs.writeFileSync(path.join(root, 'config', 'ocr-templates.json'), JSON.stringify(t));
  console.log('written config/ocr-templates.json');
} else {
  const a = samples.filter((_, i) => i % 2 === 0);
  const b = samples.filter((_, i) => i % 2 === 1);
  console.log(`train even / test odd: ${test(train(a), b)}/${b.length}`);
  console.log(`train odd / test even: ${test(train(b), a)}/${a.length}`);
}

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { emptyTemplates, learn, loadTemplates, parseGold, recognize, toGray, type Gray } from '../server/ocr/matcher.ts';

// Tiny 3x5 bitmap font, rendered at 2x into a dark image (stands in for Riot's HUD font)
const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], '(': ['01', '10', '10', '10', '01'], ')': ['10', '01', '01', '01', '10'],
};

function render(text: string, scale = 2): Gray {
  const w = 4 + [...text].reduce((s, c) => s + (FONT[c][0].length + 1) * scale, 0);
  const h = 5 * scale + 6;
  const px = new Uint8Array(w * h).fill(20);
  let x = 2;
  for (const c of text) {
    const g = FONT[c];
    for (let r = 0; r < 5; r++) for (let col = 0; col < g[0].length; col++) {
      if (g[r][col] !== '1') continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) px[(3 + r * scale + dy) * w + x + col * scale + dx] = 230;
    }
    x += (g[0].length + 1) * scale;
  }
  return { w, h, px };
}

describe('gold OCR matcher (synthetic font)', () => {
  it('learns glyphs from labeled crops and reads new numbers', () => {
    const t = emptyTemplates();
    expect(learn(render('215(716)'), 140, '215(716)', t)).toBe(true);
    expect(learn(render('3048(9)'), 140, '3048(9)', t)).toBe(true);
    const text = recognize(render('980(1453)'), 140, t);
    expect(text).toBe('980(1453)');
    expect(parseGold(text)).toEqual([980, 1453]);
  });
  it('refuses a label whose length does not match the glyphs', () => {
    expect(learn(render('12(34)'), 140, '12(345)', emptyTemplates())).toBe(false);
  });
  it('drops old binary template files', () => {
    expect(loadTemplates({ '1': [{ aspect: 0.5, bits: '0101' }] }).chars).toEqual({});
  });
  it('finds the gold pair even with stray glyphs around it', () => {
    expect(parseGold('?1041(3641)?')).toEqual([1041, 3641]);
    expect(parseGold('??(??')).toBeNull();
  });
});

describe('gold OCR on real spectator crops', () => {
  // tests/fixtures/ocr/<n>_<label>.png: crops recorded from a real spectated game, labeled by hand
  const dir = path.resolve(import.meta.dirname, 'fixtures', 'ocr');
  const templates = loadTemplates(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'config', 'ocr-templates.json'), 'utf8')));
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));

  it('reads every labeled crop with the shipped templates', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
    for (const f of files) {
      const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
      const text = recognize(toGray(png.data, png.width, 0, 0, png.width, png.height), 140, templates);
      expect(text, f).toBe(f.replace(/^\d+_/, '').replace(/\.png$/, ''));
    }
  });
});

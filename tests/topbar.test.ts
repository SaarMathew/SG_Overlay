import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../server/config.ts';
import { loadTopbarTemplates, readTopbar } from '../server/ocr/topbar.ts';
import { TopbarTracker } from '../server/ingest/topbar.ts';
import type { GoldReading, TopbarSide } from '../server/sources/raw.ts';
import { FRAME_LABELS } from './fixtures/ocr-topbar/labels.ts';

const dir = path.join(import.meta.dirname, 'fixtures', 'ocr-topbar');
const templates = loadTopbarTemplates();

/** the fixture is the score-bar strip (x 470.., y 0..90) of a raw 1920x1080 frame: put it back where it was */
function frame(t: number): PNG {
  const strip = PNG.sync.read(fs.readFileSync(path.join(dir, `t${t}.png`)));
  const png = new PNG({ width: 1920, height: 1080 });
  PNG.bitblt(strip, png, 0, 0, strip.width, strip.height, 470, 0);
  return png;
}

describe('score bar OCR (real replay frames)', () => {
  for (const [t, l] of Object.entries(FRAME_LABELS)) {
    it(`reads counters and dragon icons at ${t}s`, () => {
      const r = readTopbar(frame(+t), DEFAULT_SETTINGS.ocr.topbar, templates);
      for (const side of ['order', 'chaos'] as const) {
        const { dragons, barons, grubs, towers } = r[side];
        expect({ dragons, barons, grubs, towers }, side).toEqual(l[side]);
      }
      expect(r.order.dragonTypes.filter(Boolean)).toEqual(l.iconsOrder);
      expect(r.chaos.dragonTypes.filter(Boolean)).toEqual(l.iconsChaos);
    });
  }
});

const side = (over: Partial<TopbarSide> = {}): TopbarSide => ({ dragons: 0, barons: 0, grubs: 0, towers: 0, dragonTypes: [], ...over });
const reading = (order: Partial<TopbarSide>, chaos: Partial<TopbarSide> = {}): GoldReading => ({ order: [], chaos: [], topbar: { order: side(order), chaos: side(chaos) } });

describe('topbar tracker', () => {
  it('accepts a new value only after two consecutive identical readings', () => {
    const t = new TopbarTracker();
    t.accept(reading({})); t.accept(reading({}));
    expect(t.accept(reading({ dragons: 1 }))).toEqual([]);
    const ch = t.accept(reading({ dragons: 1, dragonTypes: ['ocean'] }));
    expect(ch).toMatchObject([{ side: 'ORDER', counter: 'dragons', from: 0, to: 1, types: ['ocean'], baseline: false }]);
    expect(t.get('ORDER', 'dragons')).toBe(1);
  });
  it('accepts a dragon at once when the icon count below the bar agrees, but not a lone counter', () => {
    const t = new TopbarTracker();
    t.accept(reading({})); t.accept(reading({}));
    expect(t.accept(reading({ dragons: 2, dragonTypes: ['ocean', null] }))).toEqual([]);   // icons say 1, counter 2
    t.reset();
    t.accept(reading({})); t.accept(reading({}));
    const ch = t.accept(reading({ dragons: 1, dragonTypes: ['ocean', null] }));
    expect(ch).toMatchObject([{ counter: 'dragons', to: 1, baseline: false }]);
  });
  it('ignores a single noisy frame and unreadable counters', () => {
    const t = new TopbarTracker();
    t.accept(reading({})); t.accept(reading({}));
    t.accept(reading({ grubs: 3 })); t.accept(reading({ grubs: null }));
    t.accept(reading({ grubs: 3 }));
    expect(t.get('ORDER', 'grubs')).toBe(0);
    expect(t.accept(reading({ grubs: 3 }))).toHaveLength(1);
  });
  it('never decreases and rejects implausible values', () => {
    const t = new TopbarTracker();
    for (let i = 0; i < 2; i++) t.accept(reading({ dragons: 2, towers: 40 }));
    for (let i = 0; i < 3; i++) t.accept(reading({ dragons: 1, towers: 40 }));
    expect(t.get('ORDER', 'dragons')).toBe(2);
    expect(t.get('ORDER', 'towers')).toBe(0);
  });
  it('flags the first confirmed frame of a game as baseline and starts over on reset', () => {
    const t = new TopbarTracker();
    t.accept(reading({ dragons: 3 }));
    expect(t.accept(reading({ dragons: 3 }))[0].baseline).toBe(true);
    t.reset();
    expect(t.get('ORDER', 'dragons')).toBe(0);
    t.accept(reading({})); t.accept(reading({}));
    t.accept(reading({ dragons: 1 }));
    expect(t.accept(reading({ dragons: 1 }))[0].baseline).toBe(false);
  });
});

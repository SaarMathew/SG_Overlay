import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { CONFIG_DIR, DATA_DIR, type OcrRegion, type Settings } from '../config.ts';
import type { ObsAdapter } from '../adapters/obs.ts';
import type { Store } from '../state/store.ts';
import type { GoldReading, SourceBus } from '../sources/raw.ts';
import { emptyTemplates, learn, loadTemplates, parseGold, recognize, toGray, type Gray, type Templates } from './matcher.ts';
import { log } from '../log.ts';

/** glyphs learned on this PC (added to the shipped defaults) */
export const TEMPLATES_FILE = path.join(DATA_DIR, 'ocr', 'templates.json');
/** shipped defaults, trained from real spectator crops (scripts/ocr-train.ts) */
export const DEFAULT_TEMPLATES_FILE = path.join(CONFIG_DIR, 'ocr-templates.json');

export interface RowPreview { side: 'order' | 'chaos'; row: number; text: string; value: [number, number] | null; png: string }

const readTemplates = (file: string): Templates => {
  try { return loadTemplates(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return emptyTemplates(); }
};

/** Reads player gold from Riot's spectator scoreboard in the OBS game capture, once per interval. */
export class GoldOcr {
  templates: Templates = emptyTemplates();
  private learned: Templates = emptyTemplates();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastFrame: { png: PNG; at: number } | null = null;
  /** frames shown in the admin calibration view, so "Learn" uses exactly the crop the operator read */
  private previewFrames = new Map<number, PNG>();
  private frameSeq = 0;
  private lastCropsAt = 0;
  /** called with every frame's crops (recorder hooks in here) */
  onCrops: ((crops: { name: string; png: Buffer }[]) => void) | null = null;

  constructor(private bus: SourceBus, private store: Store, private obs: ObsAdapter, private settings: () => Settings) {
    this.learned = readTemplates(TEMPLATES_FILE);
    this.rebuild();
  }

  private rebuild(): void {
    const merged = readTemplates(DEFAULT_TEMPLATES_FILE);
    for (const [ch, list] of Object.entries(this.learned.chars)) merged.chars[ch] = [...(merged.chars[ch] ?? []), ...list];
    this.templates = merged;
  }

  /** Forgets glyphs learned on this PC; the shipped defaults remain. */
  resetLearned(): void {
    this.learned = emptyTemplates();
    fs.rmSync(TEMPLATES_FILE, { force: true });
    this.rebuild();
    log.info('ocr', 'learned glyphs reset to defaults');
  }

  start(): void {
    const s = this.settings().ocr;
    if (!s.enabled) return;
    this.timer = setInterval(() => this.tick(), s.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.store.get('ingame').active || !this.obs.isConnected) return;
    this.busy = true;
    try {
      const frame = await this.frame();
      if (!frame) return;
      if (this.onCrops && Date.now() - this.lastCropsAt > 5000) {
        this.lastCropsAt = Date.now();
        const { ocr } = this.settings();
        this.onCrops([
          ...ocr.order.map((r, i) => ({ name: `order${i}`, png: cropPng(frame, r) })),
          ...ocr.chaos.map((r, i) => ({ name: `chaos${i}`, png: cropPng(frame, r) })),
        ]);
      }
      if (!Object.keys(this.templates.chars).length) {
        this.setHealth('warn', 'Gold OCR: no templates learned yet (admin → OCR)');
        return;
      }
      this.bus.emit('gold', this.read(frame));
    } finally {
      this.busy = false;
    }
  }

  private async frame(): Promise<PNG | null> {
    const buf = await this.obs.screenshot();
    if (!buf) return null;
    try {
      const png = PNG.sync.read(buf);
      this.lastFrame = { png, at: Date.now() };
      return png;
    } catch {
      return null;
    }
  }

  private crop(png: PNG, r: OcrRegion): Gray {
    return toGray(png.data, png.width, r.x, r.y, r.w, r.h);
  }

  read(png: PNG): GoldReading {
    const { ocr } = this.settings();
    const side = (regions: OcrRegion[]) => regions.map(r => parseGold(recognize(this.crop(png, r), ocr.threshold, this.templates)));
    return { order: side(ocr.order), chaos: side(ocr.chaos) };
  }

  /** Current crops with recognized text, for the calibration view in the admin panel. */
  async preview(): Promise<{ frameId: number; rows: RowPreview[] } | null> {
    const png = (this.lastFrame && Date.now() - this.lastFrame.at < 1500 ? this.lastFrame.png : null) ?? (await this.frame());
    if (!png) return null;
    const frameId = ++this.frameSeq;
    this.previewFrames.set(frameId, png);
    for (const id of this.previewFrames.keys()) if (id < frameId - 4) this.previewFrames.delete(id);
    const { ocr } = this.settings();
    const rows: RowPreview[] = [];
    for (const [sideName, regions] of [['order', ocr.order], ['chaos', ocr.chaos]] as const) {
      regions.forEach((r, row) => {
        const text = recognize(this.crop(png, r), ocr.threshold, this.templates);
        rows.push({ side: sideName, row, text, value: parseGold(text), png: cropPng(png, r).toString('base64') });
      });
    }
    return { frameId, rows };
  }

  /** Learns glyphs from a crop shown in the calibration view, labeled by the operator (e.g. "215(716)"). */
  learnRow(frameId: number, side: 'order' | 'chaos', row: number, label: string): boolean {
    const png = this.previewFrames.get(frameId);
    const region = this.settings().ocr[side][row];
    if (!png || !region) return false;
    const ok = learn(this.crop(png, region), this.settings().ocr.threshold, label.replace(/\s/g, ''), this.learned);
    if (ok) {
      this.saveTemplates();
      this.rebuild();
    }
    return ok;
  }

  saveTemplates(): void {
    fs.mkdirSync(path.dirname(TEMPLATES_FILE), { recursive: true });
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(this.learned));
    log.info('ocr', `learned glyphs saved (${Object.keys(this.learned.chars).sort().join('')})`);
  }

  private setHealth(h: 'ok' | 'warn', message: string): void {
    const s = this.store.get('status');
    if (s.ocr !== h || s.message !== message) this.store.update('status', st => { st.ocr = h; st.message = message; });
  }
}

export function cropPng(png: PNG, r: OcrRegion): Buffer {
  const out = new PNG({ width: r.w, height: r.h });
  PNG.bitblt(png, out, r.x, r.y, r.w, r.h, 0, 0);
  return PNG.sync.write(out);
}

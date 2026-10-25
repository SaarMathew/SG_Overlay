// Digit recognition for Riot's scoreboard gold text ("215(716)") by template matching.
// The HUD font never changes, so a few learned glyph images per character are enough.
// Glyphs are compared as small grayscale images (the font is anti-aliased, binary bitmaps confuse 3/5/8).

export interface Gray { w: number; h: number; px: Uint8Array }          // luminance 0..255
interface Box { x: number; y: number; w: number; h: number }
export interface Glyph { w: number; h: number; v: number[] }           // NW x NH intensities 0..1
export interface Template { aspect: number; v: number[] }
export interface Templates { version: 2; chars: Record<string, Template[]> }

const NW = 12;
const NH = 16;
const MAX_DIST = 0.16;

export const emptyTemplates = (): Templates => ({ version: 2, chars: {} });

/** Older (binary) template files are not compatible and are dropped. */
export function loadTemplates(raw: unknown): Templates {
  const t = raw as Templates;
  return t && t.version === 2 && t.chars ? t : emptyTemplates();
}

export function toGray(rgba: Uint8Array | Buffer, width: number, x: number, y: number, w: number, h: number): Gray {
  const px = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = ((y + j) * width + (x + i)) * 4;
      // the gold text is light grey/yellow on a dark green/blue background
      px[j * w + i] = Math.max(rgba[o], rgba[o + 1], rgba[o + 2] * 0.6);
    }
  }
  return { w, h, px };
}

/** Splits the text into glyphs at empty columns; returns glyph boxes in reading order. */
export function segment(img: Gray, threshold: number): Box[] {
  const ink = (i: number, j: number) => img.px[j * img.w + i] >= threshold;
  const colHas = (i: number) => { for (let j = 0; j < img.h; j++) if (ink(i, j)) return true; return false; };
  const boxes: Box[] = [];
  let start = -1;
  for (let i = 0; i <= img.w; i++) {
    const has = i < img.w && colHas(i);
    if (has && start < 0) start = i;
    if (!has && start >= 0) {
      let top = img.h, bottom = -1;
      for (let x = start; x < i; x++) for (let j = 0; j < img.h; j++) if (ink(x, j)) { top = Math.min(top, j); bottom = Math.max(bottom, j); }
      boxes.push({ x: start, y: top, w: i - start, h: bottom - top + 1 });
      start = -1;
    }
  }
  // drop specks and stray marks (e.g. the mouse cursor) that are much smaller than the digits
  const tall = Math.max(0, ...boxes.map(b => b.h));
  return boxes.filter(b => b.h >= tall * 0.6);
}

export function normalize(img: Gray, box: Box): Glyph {
  // local contrast: darkest/brightest pixel of the box become 0/1
  let lo = 255, hi = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const p = img.px[y * img.w + x];
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  const range = Math.max(1, hi - lo);
  const v: number[] = [];
  for (let j = 0; j < NH; j++) {
    for (let i = 0; i < NW; i++) {
      // bilinear sample at the cell centre
      const fx = box.x + ((i + 0.5) * box.w) / NW - 0.5;
      const fy = box.y + ((j + 0.5) * box.h) / NH - 0.5;
      const x0 = Math.max(box.x, Math.min(box.x + box.w - 1, Math.floor(fx)));
      const y0 = Math.max(box.y, Math.min(box.y + box.h - 1, Math.floor(fy)));
      const x1 = Math.min(box.x + box.w - 1, x0 + 1);
      const y1 = Math.min(box.y + box.h - 1, y0 + 1);
      const ax = Math.min(1, Math.max(0, fx - x0));
      const ay = Math.min(1, Math.max(0, fy - y0));
      const p = (x: number, y: number) => img.px[y * img.w + x];
      const val = (p(x0, y0) * (1 - ax) + p(x1, y0) * ax) * (1 - ay) + (p(x0, y1) * (1 - ax) + p(x1, y1) * ax) * ay;
      v.push(Math.round(((val - lo) / range) * 100) / 100);
    }
  }
  return { w: box.w, h: box.h, v };
}

function distance(g: Glyph, t: Template): number {
  let d = 0;
  for (let k = 0; k < g.v.length; k++) d += Math.abs(g.v[k] - t.v[k]);
  return d / g.v.length + Math.abs(g.w / g.h - t.aspect) * 0.25;
}

export function recognize(img: Gray, threshold: number, templates: Templates): string {
  let out = '';
  for (const box of segment(img, threshold)) {
    const g = normalize(img, box);
    let best = '?', bestD = Infinity;
    for (const [ch, list] of Object.entries(templates.chars)) {
      for (const t of list) {
        const d = distance(g, t);
        if (d < bestD) { bestD = d; best = ch; }
      }
    }
    out += bestD <= MAX_DIST ? best : '?';
  }
  return out;
}

/** Adds the glyphs of a labeled crop to the templates. Returns false if glyph count and label differ. */
export function learn(img: Gray, threshold: number, label: string, templates: Templates, maxPerChar = 8): boolean {
  const boxes = segment(img, threshold);
  if (boxes.length !== label.length) return false;
  boxes.forEach((box, k) => {
    const g = normalize(img, box);
    const list = (templates.chars[label[k]] ??= []);
    // skip near-duplicates, keep the set small and varied
    if (list.some(t => distance(g, t) < 0.03)) return;
    list.push({ aspect: g.w / g.h, v: g.v });
    if (list.length > maxPerChar) list.shift();
  });
  return true;
}

/** Finds "215(716)" in the recognized text (tolerates stray glyphs around it) -> [current, total]. */
export function parseGold(text: string): [number, number] | null {
  const m = /(\d{1,6})\((\d{1,6})\)/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

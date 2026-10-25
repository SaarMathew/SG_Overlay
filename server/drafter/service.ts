import fs from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import type { DraftState } from '../../shared/types.ts';
import type { Settings } from '../config.ts';
import type { DataDragon } from '../adapters/ddragon.ts';
import type { Store } from '../state/store.ts';
import { draftStreamUrl, parseDraftPage, type RawPage } from './parse.ts';
import { log } from '../log.ts';

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const POLL_MS = 1000;
const RELOAD_MS = 15 * 60_000;

/** Runs in the drafter.lol page: every visible image and short text with its centre position. */
function extract(): RawPage {
  const centre = (e: Element) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; };
  const realSrc = (img: HTMLImageElement) => {
    const s = img.currentSrc || img.src;
    const m = /[?&]url=([^&]+)/.exec(s);
    return m ? decodeURIComponent(m[1]) : s;
  };
  const ROLE_ALTS = ['Top', 'Jungle', 'Mid', 'Bottom', 'Support'];
  // a pick image's card = the nearest ancestor containing exactly one role icon
  const card = (img: HTMLImageElement) => {
    for (let e = img.parentElement; e && e !== document.body; e = e.parentElement) {
      const roles = [...e.querySelectorAll('img')].filter(x => ROLE_ALTS.includes(x.alt));
      if (roles.length === 1) {
        const label = (e.innerText || '').split('\n').map(s => s.trim()).filter(s => s && !ROLE_ALTS.includes(s))[0] ?? null;
        return { role: roles[0].alt, label };
      }
      if (roles.length > 1) break;
    }
    return { role: null, label: null };
  };
  const images = [...document.images]
    .filter(i => i.getBoundingClientRect().width > 0)
    .map(i => ({ alt: i.alt, src: realSrc(i), ...centre(i), ...(i.alt === 'pick' ? card(i) : {}) }));
  const texts = [...document.querySelectorAll('body *')]
    .filter(e => e.children.length === 0 && (e.textContent ?? '').trim() && e.getBoundingClientRect().width > 0)
    .map(e => ({ t: (e.textContent ?? '').trim(), ...centre(e) }))
    .filter(t => t.t.length <= 40)
    .map(({ t, x, y }) => ({ t, x, y }));
  return { width: innerWidth, images, texts };
}

/**
 * Reads the drafter.lol draft (Prime League) in a hidden local Edge/Chrome so the draft scene can be
 * rendered in our own design. Only reads what the public stream view shows; never clicks anything.
 */
export class DrafterService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private url = '';
  private timer: NodeJS.Timeout | null = null;
  private openedAt = 0;
  private busy = false;
  /** set when drafter.lol refused access; stays off until the app restarts */
  private blocked = false;

  constructor(private store: Store, private dd: DataDragon, private settings: () => Settings) {
    store.on('change', topic => {
      if (topic === 'match' || topic === 'series' || topic === 'ingame') void this.sync();
    });
  }

  /** Reads while a link is set and no game is running (the draft is over once the game loads). */
  async sync(): Promise<void> {
    const link = this.store.get('match').draftUrl;
    const game = this.store.get('series').gameNumber;
    const want = link && this.settings().drafterReader && !this.blocked && !this.store.get('ingame').active ? draftStreamUrl(link, game) : null;
    if (this.settings().drafterReader && link && !draftStreamUrl(link, game)) this.setStatus('error', 'Not a drafter.lol draft link (expected https://drafter.lol/draft/…)');
    if ((want ?? '') === this.url) return;
    this.url = want ?? '';
    if (!want) {
      await this.close();
      if (!link) this.store.set('draft', { ...this.store.get('draft'), status: 'off', message: '', a: null, b: null, fearless: [] });
      return;
    }
    await this.open(want);
  }

  private browserPath(): string | null {
    const custom = this.settings().browserPath;
    return [custom, ...BROWSERS].find(p => p && fs.existsSync(p)) ?? null;
  }

  private async open(url: string): Promise<void> {
    this.setStatus('loading', 'Opening draft…');
    try {
      if (!this.browser?.connected) {
        const executablePath = this.browserPath();
        if (!executablePath) throw new Error('No Edge or Chrome found – set "browserPath" in settings');
        this.browser = await puppeteer.launch({
          executablePath, headless: true, defaultViewport: { width: 1920, height: 1080 },
          args: ['--no-first-run', '--mute-audio', '--disable-extensions'],
        });
      }
      if (!this.page) {
        this.page = await this.browser.newPage();
        // tsx/esbuild wraps named functions in __name(); `extract` runs in the page, which lacks that helper
        await this.page.evaluateOnNewDocument('globalThis.__name = globalThis.__name || (f => f)');
      }
      const res = await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      if (res && res.status() >= 400) {
        // drafter.lol answers automated browsers with 418: respect that, no retries, no workarounds
        log.warn('drafter', `drafter.lol refused access (HTTP ${res.status()})`);
        this.setStatus('error', `drafter.lol refuses automated access (HTTP ${res.status()}) – reading disabled`);
        this.blocked = true;
        await this.close();
        return;
      }
      this.openedAt = Date.now();
      log.info('drafter', `reading ${url}`);
      if (!this.timer) this.timer = setInterval(() => void this.poll(), POLL_MS);
      await this.poll();
    } catch (e) {
      log.warn('drafter', (e as Error).message);
      this.setStatus('error', `drafter.lol: ${(e as Error).message}`);
      this.url = '';   // retry on next sync
      setTimeout(() => void this.sync(), 10_000);
    }
  }

  private async poll(): Promise<void> {
    if (this.busy || !this.page || !this.url) return;
    this.busy = true;
    try {
      // the page keeps itself live; a periodic reload guards against a silently dropped connection
      if (Date.now() - this.openedAt > RELOAD_MS) {
        await this.page.reload({ waitUntil: 'networkidle2' });
        this.openedAt = Date.now();
      }
      const raw = await this.page.evaluate(extract);
      const game = this.store.get('series').gameNumber;
      const parsed = parseDraftPage(raw, this.dd, this.store.get('match'), game);
      const found = parsed.a!.picks.some(Boolean) || parsed.b!.picks.some(Boolean) || parsed.a!.bans.some(Boolean);
      const next: DraftState = { ...parsed, status: 'ok', message: found ? '' : 'Draft not started yet', updatedAt: Date.now() };
      const prev = this.store.get('draft');
      const same = JSON.stringify({ ...prev, updatedAt: 0 }) === JSON.stringify({ ...next, updatedAt: 0 });
      if (!same) this.store.set('draft', next);
    } catch (e) {
      this.setStatus('error', `drafter.lol: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private setStatus(status: DraftState['status'], message: string): void {
    const d = this.store.get('draft');
    if (d.status !== status || d.message !== message) this.store.set('draft', { ...d, status, message });
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const b = this.browser;
    this.browser = null;
    this.page = null;
    await b?.close().catch(() => {});
  }
}

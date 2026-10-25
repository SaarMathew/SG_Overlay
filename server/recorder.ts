import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { DATA_DIR } from './config.ts';
import type { SourceBus, SourceEvents } from './sources/raw.ts';
import { log } from './log.ts';

type Ev = keyof SourceEvents;
const EVENTS: Ev[] = ['gameflow', 'champselect', 'live', 'gold'];
export const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');

/** Writes every source event as one JSON line ({t, ev, data}) plus periodic OCR crops. */
export class Recorder {
  private out: fs.WriteStream | null = null;
  private dir = '';
  private start = 0;
  private handlers = new Map<Ev, (...a: unknown[]) => void>();

  constructor(private bus: SourceBus) {}

  get active(): boolean {
    return !!this.out;
  }

  begin(): string {
    if (this.out) return this.dir;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.dir = path.join(RECORDINGS_DIR, stamp);
    fs.mkdirSync(path.join(this.dir, 'crops'), { recursive: true });
    this.out = fs.createWriteStream(path.join(this.dir, 'events.jsonl'));
    this.start = Date.now();
    for (const ev of EVENTS) {
      const h = (data: unknown) => this.out?.write(JSON.stringify({ t: Date.now() - this.start, ev, data }) + '\n');
      this.handlers.set(ev, h as never);
      this.bus.on(ev, h as never);
    }
    log.info('recorder', `recording to ${this.dir}`);
    return this.dir;
  }

  end(): void {
    for (const [ev, h] of this.handlers) this.bus.off(ev, h as never);
    this.handlers.clear();
    this.out?.end();
    this.out = null;
    log.info('recorder', 'stopped');
  }

  saveCrops(crops: { name: string; png: Buffer }[]): void {
    if (!this.out) return;
    const t = Date.now() - this.start;
    for (const c of crops) fs.writeFileSync(path.join(this.dir, 'crops', `${t}_${c.name}.png`), c.png);
  }
}

/** Plays a recording back into the bus with its original timing (scaled by `speed`). */
export async function replay(bus: SourceBus, file: string, speed = 1, fromMs = 0): Promise<void> {
  const resolved = fs.statSync(file).isDirectory() ? path.join(file, 'events.jsonl') : file;
  log.info('replay', `${resolved} at ${speed}x`);
  const rl = readline.createInterface({ input: fs.createReadStream(resolved) });
  const t0 = Date.now();
  for await (const line of rl) {
    if (!line.trim()) continue;
    const { t, ev, data } = JSON.parse(line) as { t: number; ev: Ev; data: never };
    if (t < fromMs) {
      if (ev !== 'live' && ev !== 'gold') bus.emit(ev, data);   // keep phase/champ select state when skipping
      continue;
    }
    const wait = (t - fromMs) / speed - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    bus.emit(ev, data);
  }
  log.info('replay', 'finished');
}

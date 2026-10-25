import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import type { Store } from '../state/store.ts';
import type { ChampSelectSession, SourceBus } from '../sources/raw.ts';
import { localRequest } from './localhttps.ts';
import { log } from '../log.ts';

const EVENTS = {
  gameflow: 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
  champselect: 'OnJsonApiEvent_lol-champ-select_v1_session',
};

/** League Client API: credentials from the lockfile, events over the WAMP websocket. */
export class LcuAdapter {
  private ws: WebSocket | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private bus: SourceBus, private store: Store, private leagueDir: () => string) {}

  start(): void {
    const tick = () => { if (!this.ws) this.connect().catch(() => {}); };
    tick();
    this.timer = setInterval(tick, 3000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.ws?.close();
  }

  private readLockfile(): { port: number; password: string } | null {
    try {
      const [, , port, password] = fs.readFileSync(path.join(this.leagueDir(), 'lockfile'), 'utf8').split(':');
      return { port: Number(port), password };
    } catch {
      return null;
    }
  }

  private async connect(): Promise<void> {
    const lock = this.readLockfile();
    if (!lock) return this.setHealth('down');
    const auth = `riot:${lock.password}`;
    const base = `https://127.0.0.1:${lock.port}`;
    const ws = new WebSocket(`wss://127.0.0.1:${lock.port}`, 'wamp', {
      rejectUnauthorized: false,
      headers: { Authorization: `Basic ${Buffer.from(auth).toString('base64')}` },
    });
    this.ws = ws;
    ws.on('open', async () => {
      log.info('lcu', `connected on port ${lock.port}`);
      this.setHealth('ok');
      for (const ev of Object.values(EVENTS)) ws.send(JSON.stringify([5, ev]));
      try {
        const phase = await localRequest<string>(`${base}/lol-gameflow/v1/gameflow-phase`, { auth });
        if (phase.data) this.bus.emit('gameflow', phase.data);
        const cs = await localRequest<ChampSelectSession>(`${base}/lol-champ-select/v1/session`, { auth });
        this.bus.emit('champselect', cs.status === 200 ? cs.data : null);
      } catch (e) {
        log.warn('lcu', `initial fetch failed: ${(e as Error).message}`);
      }
    });
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString()) as [number, string, { eventType: string; data: unknown }];
        if (msg[0] !== 8) return;
        const payload = msg[2];
        if (msg[1] === EVENTS.gameflow) this.bus.emit('gameflow', String(payload.data));
        if (msg[1] === EVENTS.champselect) {
          this.bus.emit('champselect', payload.eventType === 'Delete' ? null : (payload.data as ChampSelectSession));
        }
      } catch { /* keep-alive or non-JSON frame */ }
    });
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null;
      this.setHealth('down');
    });
    ws.on('error', () => { /* close follows */ });
  }

  private setHealth(h: 'ok' | 'down'): void {
    if (this.store.get('status').lcu !== h) this.store.update('status', s => { s.lcu = h; });
  }
}

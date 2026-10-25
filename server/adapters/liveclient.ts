import type { Store } from '../state/store.ts';
import type { AllGameData, SourceBus } from '../sources/raw.ts';
import { localRequest } from './localhttps.ts';

const BASE = 'https://127.0.0.1:2999';

/** Live Client Data API, polled once per second (works in spectator mode). */
export class LiveClientAdapter {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private bus: SourceBus, private store: Store) {}

  start(intervalMs = 1000): void {
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    let data: AllGameData | null = null;
    try {
      const res = await localRequest<AllGameData>(`${BASE}/liveclientdata/allgamedata`, { timeoutMs: 900 });
      if (res.status === 200 && res.data?.allPlayers) data = res.data;
    } catch { /* no game running */ }
    this.busy = false;
    const health = data ? 'ok' : 'down';
    if (this.store.get('status').live !== health) this.store.update('status', s => { s.live = health; });
    this.bus.emit('live', data);
  }
}

/** Replay API on the same port: hides Riot HUD elements that must not be on stream. */
export async function applyReplayRender(flags: Record<string, boolean>): Promise<boolean> {
  try {
    const res = await localRequest(`${BASE}/replay/render`, { method: 'POST', body: flags, timeoutMs: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

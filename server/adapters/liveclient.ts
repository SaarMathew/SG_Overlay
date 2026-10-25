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

export interface PlaybackState { time: number; length: number; paused: boolean; speed: number }

/**
 * Replay API playback (pause, speed, jump back/forward) – lets the operator control the spectated
 * game from the admin panel and hotkeys while Riot's replay bar stays hidden from the stream.
 */
export class ReplayPlayback {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  last: PlaybackState | null = null;

  constructor(private onChange: (p: PlaybackState | null) => void, private active: () => boolean) {}

  start(intervalMs = 1000): void {
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    if (!this.active()) { if (this.last) this.publish(null); return; }
    this.busy = true;
    try {
      const res = await localRequest<PlaybackState>(`${BASE}/replay/playback`, { timeoutMs: 900 });
      this.publish(res.status === 200 && res.data ? pick(res.data) : null);
    } catch {
      this.publish(null);
    } finally {
      this.busy = false;
    }
  }

  private publish(p: PlaybackState | null): void {
    this.last = p;
    this.onChange(p);
  }

  /** Sends a change (any of time, paused, speed); returns false if the Replay API is not reachable. */
  async set(patch: Partial<Pick<PlaybackState, 'time' | 'paused' | 'speed'>>): Promise<boolean> {
    try {
      const res = await localRequest<PlaybackState>(`${BASE}/replay/playback`, { method: 'POST', body: patch, timeoutMs: 2000 });
      if (res.status === 200 && res.data) this.publish(pick(res.data));
      return res.status === 200;
    } catch {
      return false;
    }
  }

  seek(delta: number): Promise<boolean> {
    if (!this.last) return Promise.resolve(false);
    return this.set({ time: clamp(this.last.time + delta, 0, this.last.length) });
  }

  jump(time: number): Promise<boolean> {
    return this.set({ time: clamp(time, 0, this.last?.length ?? time) });
  }

  /** back to the newest available moment (live, when spectating) */
  live(): Promise<boolean> {
    return this.last ? this.set({ time: this.last.length, paused: false, speed: 1 }) : Promise.resolve(false);
  }

  togglePause(): Promise<boolean> {
    return this.set({ paused: !(this.last?.paused ?? false) });
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pick = (d: PlaybackState): PlaybackState => ({ time: d.time, length: d.length, paused: !!d.paused, speed: d.speed });

/** Replay API on the same port: hides Riot HUD elements that must not be on stream. */
export async function applyReplayRender(flags: Record<string, boolean>): Promise<boolean> {
  try {
    const res = await localRequest(`${BASE}/replay/render`, { method: 'POST', body: flags, timeoutMs: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

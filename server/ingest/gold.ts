import type { GameSide } from '../../shared/types.ts';
import type { GoldReading } from '../sources/raw.ts';

interface Entry { total: number; current: number; at: number; poll: number }

const MAX_GAIN_PER_SEC = 1500;   // more than any real income incl. shutdowns
/** a reading is current if it arrived within the last few live polls (independent of replay speed) */
const FRESH_POLLS = 3;

/**
 * Keeps the last plausible OCR gold value per scoreboard row.
 * Total gold never decreases and cannot grow faster than MAX_GAIN_PER_SEC per second of game time.
 */
export class GoldTracker {
  private rows = new Map<string, Entry>();
  lastValidAt = 0;

  reset(): void {
    this.rows.clear();
    this.lastValidAt = 0;
  }

  /** `now` = game time in ms, `poll` = number of the latest live poll */
  accept(reading: GoldReading, now: number, poll = 0): number {
    let valid = 0;
    const take = (side: GameSide, list: ([number, number] | null)[]) => list.forEach((v, i) => {
      if (!v) return;
      const [current, total] = v;
      const key = `${side}:${i}`;
      const prev = this.rows.get(key);
      if (current > total || total < 0 || total > 200_000) return;
      if (prev) {
        const dt = Math.max(1, (now - prev.at) / 1000);
        if (total < prev.total - 5 || total - prev.total > MAX_GAIN_PER_SEC * dt + 300) return;
      } else if (total > 60_000) {
        return;
      }
      this.rows.set(key, { total, current, at: now, poll });
      valid++;
    });
    take('ORDER', reading.order);
    take('CHAOS', reading.chaos);
    if (valid) this.lastValidAt = now;
    return valid;
  }

  get(side: GameSide, row: number, poll: number): { total: number; current: number } | null {
    const e = this.rows.get(`${side}:${row}`);
    return e && poll - e.poll <= FRESH_POLLS ? e : null;
  }
}

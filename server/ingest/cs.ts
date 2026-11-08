import type { GameSide } from '../../shared/types.ts';
import type { GoldReading } from '../sources/raw.ts';

/** a reading is current if it arrived within the last few live polls (independent of replay speed) */
const FRESH_POLLS = 3;
const MAX_CS = 999;

/**
 * Merges the OCR'd exact CS with the Live Client API value, which is the exact CS rounded down to a multiple of 10.
 * An OCR value is only trusted if it is consistent with the API value (rounded down it equals the API value or is
 * one step off, since OCR and API are sampled at different moments) and never below the last accepted value.
 * Otherwise the last exact value is kept while it still fits the API, else the API value is used.
 */
export class CsTracker {
  private ocr = new Map<string, { value: number; poll: number }>();
  private last = new Map<string, number>();

  reset(): void {
    this.ocr.clear();
    this.last.clear();
  }

  accept(reading: GoldReading, poll: number): void {
    const take = (side: GameSide, list: (number | null)[] | undefined) => (list ?? []).forEach((v, i) => {
      if (v !== null && Number.isInteger(v) && v >= 0 && v <= MAX_CS) this.ocr.set(`${side}:${i}`, { value: v, poll });
    });
    take('ORDER', reading.cs?.order);
    take('CHAOS', reading.cs?.chaos);
  }

  /** Exact CS of one row, `api` = creepScore from the Live Client API. */
  resolve(side: GameSide, row: number, api: number, poll: number): number {
    const key = `${side}:${row}`;
    const prev = this.last.get(key);
    const o = this.ocr.get(key);
    let v = api;
    const fits = (x: number) => Math.abs(Math.floor(x / 10) * 10 - api) <= 10;
    if (o && poll - o.poll <= FRESH_POLLS && fits(o.value) && (prev === undefined || o.value >= prev)) {
      v = Math.max(o.value, api);   // the exact CS cannot be below the API's rounded-down value
    } else if (prev !== undefined && Math.floor(prev / 10) * 10 === api) {
      v = prev;
    }
    this.last.set(key, v);
    return v;
  }
}

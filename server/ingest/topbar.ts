import type { DragonType, GameSide } from '../../shared/types.ts';
import type { GoldReading } from '../sources/raw.ts';

export type TopbarCounter = 'dragons' | 'grubs' | 'barons' | 'towers';
export const TOPBAR_COUNTERS: TopbarCounter[] = ['dragons', 'grubs', 'barons', 'towers'];
/** a counter above this is a misread (void grubs: 6 per game, 11 towers + nexus towers) */
const MAX_COUNT: Record<TopbarCounter, number> = { dragons: 7, grubs: 6, barons: 6, towers: 11 };
/** consecutive identical readings before a new value counts (one noisy frame must not create an objective) */
const CONFIRM_READS = 2;

export interface TopbarChange { side: GameSide; counter: TopbarCounter; from: number; to: number; types: (DragonType | null)[]; baseline: boolean }

interface Entry { value: number; cand: number; reads: number }

/**
 * Keeps the confirmed objective counters of the spectator score bar.
 * A value is accepted after it was read in CONFIRM_READS consecutive frames (or, for dragons, when the icon count
 * below the bar matches it in the same frame), counters only ever increase within a
 * game (a replay seek back restarts the game, see `reset`), and values above the plausible maximum are ignored.
 * The first confirmed frame of a game is a baseline (the app may start mid-game): its changes are flagged.
 */
export class TopbarTracker {
  private rows = new Map<string, Entry>();
  private types = new Map<GameSide, (DragonType | null)[]>();
  private synced = false;

  reset(): void {
    this.rows.clear();
    this.types.clear();
    this.synced = false;
  }

  /** confirmed value (0 until something was confirmed) */
  get(side: GameSide, counter: TopbarCounter): number {
    return this.rows.get(`${side}:${counter}`)?.value ?? 0;
  }

  /** dragon icon types of the latest frame (index = n-th dragon taken) */
  typesOf(side: GameSide): (DragonType | null)[] {
    return this.types.get(side) ?? [];
  }

  /** returns the counters that went up with this reading */
  accept(reading: GoldReading): TopbarChange[] {
    const tb = reading.topbar;
    if (!tb) return [];
    const changes: TopbarChange[] = [];
    let confirmedAny = false;
    for (const side of ['ORDER', 'CHAOS'] as const) {
      const r = side === 'ORDER' ? tb.order : tb.chaos;
      this.types.set(side, r.dragonTypes);
      for (const counter of TOPBAR_COUNTERS) {
        const v = r[counter];
        const key = `${side}:${counter}`;
        if (v === null || v > MAX_COUNT[counter]) {
          const prev = this.rows.get(key);
          if (prev) prev.reads = 0;   // an unreadable frame breaks the run of identical readings
          continue;
        }
        const e = this.rows.get(key) ?? { value: 0, cand: v, reads: 0 };
        e.reads = v === e.cand ? e.reads + 1 : 1;
        e.cand = v;
        this.rows.set(key, e);
        // dragons: the icon row below the bar is a second, independent reading: both agreeing confirms at once
        const iconsAgree = counter === 'dragons' && v > 0 && r.dragonTypes.filter(Boolean).length === v;
        if (e.reads < CONFIRM_READS && !iconsAgree) continue;
        confirmedAny = true;
        if (v > e.value) {
          changes.push({ side, counter, from: e.value, to: v, types: this.types.get(side) ?? [], baseline: !this.synced });
          e.value = v;
        }
      }
    }
    if (confirmedAny) this.synced = true;
    return changes;
  }
}

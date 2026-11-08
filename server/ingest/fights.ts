import type { Fight, FightKill, FightObjective, TeamKey } from '../../shared/types.ts';

/** a fight goes on as long as the next kill comes within this many seconds of the previous one */
export const FIGHT_GAP = 15;
/** objectives count for a fight until this long after its last kill */
export const OBJECTIVE_WINDOW = 30;
/** gold is compared this long after the last kill */
export const GOLD_AFTER = 10;
const GOLD_KEEP = 300;
const MAX_FIGHTS = 10;

interface GoldSample { t: number; a: number; b: number }

/** Collects kills, multikills, objectives and OCR team gold of one game and groups them into fights. */
export class FightTracker {
  private kills: FightKill[] = [];
  private multis: Fight['multikills'] = [];
  private objs: FightObjective[] = [];
  private gold: GoldSample[] = [];
  /** swings are final once the "after" sample exists; the ring buffer forgets old samples */
  private swings = new Map<number, number | null>();

  reset(): void {
    this.kills = []; this.multis = []; this.objs = []; this.gold = []; this.swings.clear();
  }

  kill(k: FightKill): void { this.kills.push(k); }
  multikill(m: Fight['multikills'][number]): void { this.multis.push(m); }
  objective(o: FightObjective): void { this.objs.push(o); }

  /** one sample per poll, only meaningful with OCR gold */
  sample(t: number, a: number, b: number): void {
    const last = this.gold.at(-1);
    if (last && last.t === t) { last.a = a; last.b = b; return; }
    this.gold.push({ t, a, b });
    while (this.gold.length && this.gold[0].t < t - GOLD_KEEP) this.gold.shift();
  }

  build(gameTime: number): Fight[] {
    const kills = [...this.kills].sort((x, y) => x.t - y.t);
    const groups: FightKill[][] = [];
    for (const k of kills) {
      const g = groups.at(-1);
      if (g && k.t - g[g.length - 1].t <= FIGHT_GAP) g.push(k); else groups.push([k]);
    }
    return groups.filter(g => g.length >= 2).slice(-MAX_FIGHTS).map(g => this.fight(g, gameTime));
  }

  private fight(ks: FightKill[], gameTime: number): Fight {
    const start = ks[0].t;
    const end = ks[ks.length - 1].t;
    const killsA = ks.filter(k => k.killer.team === 'A').length;
    const killsB = ks.length - killsA;
    const id = Math.round(start);
    return {
      id, start, end, kills: ks, killsA, killsB,
      multikills: this.multis.filter(m => m.t >= start - 1 && m.t <= end + 1),
      objectives: this.objs.filter(o => o.t >= start && o.t <= end + OBJECTIVE_WINDOW).sort((x, y) => x.t - y.t),
      goldSwing: this.swing(id, start, end, gameTime),
      winner: killsA > killsB ? 'A' : killsB > killsA ? 'B' : null,
    };
  }

  private swing(id: number, start: number, end: number, gameTime: number): number | null {
    if (this.swings.has(id)) return this.swings.get(id)!;
    const before = [...this.gold].reverse().find(s => s.t <= start);
    const settled = this.gold.find(s => s.t >= end + GOLD_AFTER);
    const latest = this.gold.at(-1);
    const after = settled ?? (latest && latest.t > end ? latest : undefined);
    const v = before && after ? (after.a - after.b) - (before.a - before.b) : null;
    if (settled || (gameTime >= end + GOLD_AFTER && v !== null)) this.swings.set(id, v);
    return v;
  }
}

export const otherTeam = (t: TeamKey): TeamKey => (t === 'A' ? 'B' : 'A');

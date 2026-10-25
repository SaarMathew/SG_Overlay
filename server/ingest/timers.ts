import type { DragonType, ObjectiveTimer, TeamKey } from '../../shared/types.ts';
import type { ObjectiveRules } from '../config.ts';

export interface ObjectiveKill {
  t: number;
  kind: 'dragon' | 'elder' | 'baron' | 'herald' | 'grubs' | 'atakhan';
  team: TeamKey | null;
  dragonType?: DragonType;
}

const DRAGON_LABEL: Record<DragonType, string> = {
  infernal: 'Infernal Dragon', ocean: 'Ocean Dragon', mountain: 'Mountain Dragon', cloud: 'Cloud Dragon',
  hextech: 'Hextech Dragon', chemtech: 'Chemtech Dragon', elder: 'Elder Dragon',
};
export const dragonLabel = (t: DragonType | undefined) => (t ? DRAGON_LABEL[t] : 'Dragon');

/**
 * Upcoming objectives and running buffs. `at` is the game time of the spawn (or buff end);
 * a timer with at <= gameTime means the objective is up. Only timers within `showBeforeSec` are returned.
 */
export function computeTimers(kills: ObjectiveKill[], gameTime: number, r: ObjectiveRules): ObjectiveTimer[] {
  const out: ObjectiveTimer[] = [];
  const last = (k: ObjectiveKill['kind']) => kills.filter(x => x.kind === k).at(-1);
  const count = (k: ObjectiveKill['kind'], team?: TeamKey) => kills.filter(x => x.kind === k && (!team || x.team === team)).length;

  // Dragons: soul after 4 dragons of one team, then only Elder.
  const dragons = kills.filter(x => x.kind === 'dragon');
  const soul = count('dragon', 'A') >= 4 || count('dragon', 'B') >= 4;
  const lastDrake = [...dragons, ...kills.filter(x => x.kind === 'elder')].sort((a, b) => a.t - b.t).at(-1);
  if (soul) {
    out.push({ id: 'elder', label: 'Elder Dragon', kind: 'elder', at: (lastDrake?.t ?? gameTime) + r.elderRespawn });
  } else {
    // From the third dragon on the rift element is fixed = type of the third dragon
    const riftType = dragons.length >= 3 ? dragons[2].dragonType : undefined;
    out.push({
      id: 'dragon', label: dragonLabel(riftType), kind: 'dragon', dragonType: riftType,
      at: lastDrake ? lastDrake.t + r.dragonRespawn : r.dragonFirst,
    });
  }

  if (!last('grubs') && gameTime < r.grubsFirst + 60) out.push({ id: 'grubs', label: 'Void Grubs', kind: 'grubs', at: r.grubsFirst });
  if (!last('herald') && gameTime < r.heraldFirst + 60) out.push({ id: 'herald', label: 'Rift Herald', kind: 'herald', at: r.heraldFirst });
  if (r.atakhanFirst !== null && !last('atakhan') && gameTime < r.atakhanFirst + 60) {
    out.push({ id: 'atakhan', label: 'Atakhan', kind: 'atakhan', at: r.atakhanFirst });
  }
  const baron = last('baron');
  out.push({ id: 'baron', label: 'Baron', kind: 'baron', at: baron ? baron.t + r.baronRespawn : r.baronFirst });

  if (baron?.team && gameTime < baron.t + r.baronBuff) {
    out.push({ id: 'baronBuff', label: 'Baron buff', kind: 'baronBuff', team: baron.team, at: baron.t + r.baronBuff });
  }
  const elder = last('elder');
  if (elder?.team && gameTime < elder.t + r.elderBuff) {
    out.push({ id: 'elderBuff', label: 'Elder buff', kind: 'elderBuff', team: elder.team, at: elder.t + r.elderBuff });
  }

  // An objective that is up stays visible until it is taken (its timer then moves on).
  return out.filter(t => t.kind.endsWith('Buff') || t.at - gameTime <= r.showBeforeSec);
}

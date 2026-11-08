import type { AppState } from '../shared/types.ts';
import type { Store } from './state/store.ts';

/** Should team A be drawn on the right side of the screen? */
export function decideARight(s: Pick<AppState, 'match' | 'ingame' | 'postgame'>): boolean {
  const { match, ingame, postgame } = s;
  if (match.layout === 'aLeft') return false;
  if (match.layout === 'aRight') return true;
  const side = match.sideA !== 'auto' ? match.sideA
    : postgame.active && postgame.a ? postgame.a.side : ingame.a.side;
  return side === 'CHAOS';
}

/** Keeps ui.aRight in sync; only match/ingame/postgame trigger it, so updating 'ui' cannot loop. */
export function wireLayout(store: Store): void {
  const sync = () => {
    const v = decideARight(store.state);
    if (store.get('ui').aRight !== v) store.update('ui', u => { u.aRight = v; });
  };
  store.on('change', (t: string) => { if (t === 'match' || t === 'ingame' || t === 'postgame') sync(); });
  sync();
}

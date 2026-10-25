import type { SceneKey } from '../shared/types.ts';
import type { Settings } from './config.ts';
import type { Store } from './state/store.ts';
import type { ObsAdapter } from './adapters/obs.ts';
import { log } from './log.ts';

/**
 * Automatic scene switching. Acts only on transitions (champ select starts, game starts, game ends),
 * so a manual switch in OBS or the admin panel holds until the next phase change.
 */
export class SceneController {
  private prev = { lineup: false, ingame: false, postgame: false };
  private pending: NodeJS.Timeout | null = null;

  constructor(private store: Store, private obs: ObsAdapter, private settings: () => Settings, private onIngameStart: () => void) {
    store.on('change', topic => {
      if (topic === 'lineup' || topic === 'ingame' || topic === 'postgame') this.check();
    });
  }

  private check(): void {
    const now = {
      lineup: this.store.get('lineup').active,
      ingame: this.store.get('ingame').active,
      postgame: this.store.get('postgame').active,
    };
    if (now.lineup && !this.prev.lineup) this.auto('lineup');
    if (now.ingame && !this.prev.ingame) {
      this.auto('ingame');
      this.onIngameStart();
    }
    if (now.postgame && !this.prev.postgame) {
      if (this.pending) clearTimeout(this.pending);
      this.pending = setTimeout(() => this.auto('postgame'), this.settings().postgameDelayMs);
    }
    this.prev = now;
  }

  private auto(key: SceneKey): void {
    if (!this.store.get('ui').autoScenes) return;
    log.info('scenes', `auto switch to ${key}`);
    void this.obs.setScene(key);
  }

  manual(key: SceneKey): void {
    if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    void this.obs.setScene(key);
  }
}

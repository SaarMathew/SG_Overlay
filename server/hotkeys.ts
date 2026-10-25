import { log } from './log.ts';

type Dispatch = (action: string) => void;

interface Combo { ctrl: boolean; alt: boolean; shift: boolean; key: number }

/**
 * Global hotkeys (work while the game or OBS has focus) via uiohook-napi.
 * Optional: if the native module cannot load, hotkeys are disabled and the admin panel buttons remain.
 */
export class Hotkeys {
  private combos = new Map<string, Combo>();
  private started = false;

  constructor(private dispatch: Dispatch) {}

  async start(bindings: Record<string, string>): Promise<boolean> {
    let mod: typeof import('uiohook-napi');
    try {
      mod = await import('uiohook-napi');
    } catch (e) {
      log.warn('hotkeys', `global hotkeys unavailable: ${(e as Error).message}`);
      return false;
    }
    const { uIOhook, UiohookKey } = mod;
    this.combos.clear();
    for (const [action, combo] of Object.entries(bindings)) {
      const parts = combo.split('+').map(s => s.trim());
      const keyName = parts.at(-1)!;
      const key = (UiohookKey as Record<string, number>)[keyName.length === 1 ? keyName.toUpperCase() : keyName];
      if (key === undefined) {
        log.warn('hotkeys', `unknown key "${keyName}" for ${action}`);
        continue;
      }
      const has = (m: string) => parts.slice(0, -1).some(p => p.toLowerCase() === m);
      this.combos.set(action, { ctrl: has('ctrl'), alt: has('alt'), shift: has('shift'), key });
    }
    if (!this.started) {
      const down = new Set<number>();
      uIOhook.on('keyup', e => down.delete(e.keycode));
      uIOhook.on('keydown', e => {
        // Windows repeats keydown while a key is held: only the first press counts (toggles would flicker)
        if (down.has(e.keycode)) return;
        down.add(e.keycode);
        // AltGr reports Ctrl+Alt: on German keyboards AltGr+0 is "}" – typing in a chat must not trigger hotkeys
        if (down.has(UiohookKey.AltRight)) return;
        for (const [action, c] of this.combos) {
          if (e.keycode === c.key && e.ctrlKey === c.ctrl && e.altKey === c.alt && e.shiftKey === c.shift) this.dispatch(action);
        }
      });
      try {
        uIOhook.start();
      } catch (e) {
        // Seen when the app folder path is very long (Windows path limit for the hook module): keep running without
        log.warn('hotkeys', `global hotkeys unavailable (${(e as Error).message}) – move the folder to a short path like C:\\SG-Overlay, or use the admin panel`);
        return false;
      }
      this.started = true;
    }
    log.info('hotkeys', `${this.combos.size} global hotkeys active`);
    return true;
  }
}

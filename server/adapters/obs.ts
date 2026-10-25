import { OBSWebSocket } from 'obs-websocket-js';
import type { SceneKey } from '../../shared/types.ts';
import type { Settings } from '../config.ts';
import type { Store } from '../state/store.ts';
import { log } from '../log.ts';

/** obs-websocket v5: scene switching and screenshots of the game capture (for gold OCR). */
export class ObsAdapter {
  private obs = new OBSWebSocket();
  private connected = false;
  private connecting = false;
  private timer: NodeJS.Timeout | null = null;
  private lastError = '';

  constructor(private store: Store, private settings: () => Settings) {
    this.obs.on('ConnectionClosed', () => {
      if (this.connected) log.warn('obs', 'connection closed');
      this.connected = false;
      this.setHealth('down');
    });
    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      const key = this.sceneKey(sceneName);
      this.store.update('ui', u => { u.scene = key; });
    });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    const tick = () => { if (!this.connected) this.connect(); };
    tick();
    this.timer = setInterval(tick, 5000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.obs.disconnect().catch(() => {});
  }

  async reconnect(): Promise<void> {
    await this.obs.disconnect().catch(() => {});
    this.connected = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    const { url, password } = this.settings().obs;
    try {
      await this.obs.connect(url, password || undefined);
      this.connected = true;
      this.lastError = '';
      this.setHealth('ok');
      log.info('obs', `connected to ${url}`);
      const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
      this.store.update('ui', u => { u.scene = this.sceneKey(currentProgramSceneName); });
      await this.refreshOverlaySources();
    } catch (e) {
      // log each distinct reason once (e.g. 4009 "Authentication failed" = wrong password), not every 5 s
      const reason = `${(e as { code?: number }).code ?? ''} ${(e as Error).message}`.trim();
      if (reason !== this.lastError) {
        this.lastError = reason;
        log.warn('obs', `cannot connect to ${url}: ${reason}`);
        if ((e as { code?: number }).code === 4009) {
          this.store.update('status', s => { s.message = 'OBS rejected the password – copy it from OBS → Tools → WebSocket Server Settings → Show Connect Info'; });
        }
      }
      this.setHealth('down');
    } finally {
      this.connecting = false;
    }
  }

  /**
   * OBS keeps an error page if a browser source loaded before this app was running.
   * After connecting, reload every browser source that points at our overlays.
   */
  private async refreshOverlaySources(): Promise<void> {
    try {
      const port = String(this.settings().port);
      const { inputs } = await this.obs.call('GetInputList', { inputKind: 'browser_source' });
      for (const input of inputs) {
        const name = String(input.inputName);
        const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: name });
        const url = String(inputSettings.url ?? '');
        if (/\/\/(127\.0\.0\.1|localhost):/.test(url) && url.includes(`:${port}/overlay/`)) {
          await this.obs.call('PressInputPropertiesButton', { inputName: name, propertyName: 'refreshnocache' });
          log.info('obs', `reloaded overlay source "${name}"`);
        }
      }
    } catch (e) {
      log.warn('obs', `could not reload overlay sources: ${(e as Error).message}`);
    }
  }

  async setScene(key: SceneKey): Promise<boolean> {
    this.store.update('ui', u => { u.scene = key; });
    if (!this.connected) return false;
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName: this.settings().sceneNames[key] });
      return true;
    } catch (e) {
      log.warn('obs', `scene "${this.settings().sceneNames[key]}" not switched: ${(e as Error).message}`);
      return false;
    }
  }

  /** Full-resolution PNG of the game capture source, or null. */
  async screenshot(): Promise<Buffer | null> {
    if (!this.connected) return null;
    try {
      const res = await this.obs.call('GetSourceScreenshot', {
        sourceName: this.settings().obs.gameCaptureSource, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080,
      });
      return Buffer.from(res.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
    } catch {
      return null;
    }
  }

  private sceneKey(name: string): SceneKey | null {
    const entry = Object.entries(this.settings().sceneNames).find(([, n]) => n === name);
    return (entry?.[0] as SceneKey) ?? null;
  }

  private setHealth(h: 'ok' | 'down'): void {
    if (this.store.get('status').obs !== h) this.store.update('status', s => { s.obs = h; });
  }
}

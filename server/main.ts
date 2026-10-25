import path from 'node:path';
import { parseArgs } from 'node:util';
import { DATA_DIR, loadObjectiveRules, loadSettings, type Settings } from './config.ts';
import { Store } from './state/store.ts';
import { SourceBus } from './sources/raw.ts';
import { DataDragon } from './adapters/ddragon.ts';
import { LcuAdapter } from './adapters/lcu.ts';
import { LiveClientAdapter, applyReplayRender } from './adapters/liveclient.ts';
import { ObsAdapter } from './adapters/obs.ts';
import { enableReplayApi, replayApiConfig } from './adapters/gamecfg.ts';
import { Pipeline } from './ingest/pipeline.ts';
import { SceneController } from './scenes.ts';
import { GoldOcr } from './ocr/reader.ts';
import { Recorder, replay } from './recorder.ts';
import { MockSource } from './sources/mock.ts';
import { Hotkeys } from './hotkeys.ts';
import { DrafterService } from './drafter/service.ts';
import { Hub } from './hub.ts';
import { createHttp } from './http.ts';
import { hotkeyAction, runAction, type ActionContext } from './actions.ts';
import { log } from './log.ts';

const { values: args } = parseArgs({
  options: {
    mock: { type: 'boolean', default: false },
    replay: { type: 'string' },
    speed: { type: 'string' },
    from: { type: 'string' },
    record: { type: 'boolean', default: false },
    'no-obs': { type: 'boolean', default: false },
    'no-hotkeys': { type: 'boolean', default: false },
    port: { type: 'string' },
  },
});

// On stream the overlays must stay up: a failing optional part (hotkeys, OBS, a parser) is logged, not fatal.
process.on('unhandledRejection', e => log.error('main', `unhandled: ${(e as Error)?.stack ?? e}`));
process.on('uncaughtException', e => log.error('main', `uncaught: ${e.stack ?? e}`));

let settings: Settings = loadSettings();
if (args.port) settings.port = Number(args.port);
const getSettings = () => settings;

const store = new Store(path.join(DATA_DIR, 'state.json'));
const bus = new SourceBus();
const dd = new DataDragon();
await dd.init();

const mode = args.mock ? 'mock' : args.replay ? 'replay' : 'live';
store.update('status', s => {
  const real = mode === 'live';
  Object.assign(s, { mode, ddVersion: dd.version, recording: false, ocr: 'off', lcu: real ? 'down' : 'off', live: real ? 'down' : 'off', obs: 'down', replayApi: 'off', message: '' });
});
// a restart must not resume a finished/running game, nor show a head-to-head left open before the restart
store.update('ingame', g => { g.active = false; });
store.update('ui', u => { u.h2hLane = null; });

new Pipeline(store, bus, dd, loadObjectiveRules());
const obs = new ObsAdapter(store, getSettings);
const recorder = new Recorder(bus);
const ocr = mode === 'live' ? new GoldOcr(bus, store, obs, getSettings) : null;
if (ocr) ocr.onCrops = crops => recorder.saveCrops(crops);

const applyHud = async (quiet = false) => {
  const ok = await applyReplayRender(settings.replayRender);
  store.update('status', s => {
    s.replayApi = ok ? 'ok' : 'down';
    if (ok && /Replay API/.test(s.message)) s.message = '';   // the hint about enabling it is done
  });
  if (!ok && !quiet) log.warn('replay-api', 'render flags not applied (Replay API enabled in game.cfg? game running?)');
  return ok;
};
// The spectator client may reset the HUD while it finishes loading or catches up: apply a few times.
let hudTimers: NodeJS.Timeout[] = [];
const scenes = new SceneController(store, obs, getSettings, () => {
  if (mode !== 'live' || !settings.applyReplayRender) return;
  hudTimers.forEach(clearTimeout);
  hudTimers = [3, 15, 40, 90].map((sec, i, all) => setTimeout(() => {
    if (store.get('ingame').active) void applyHud(i < all.length - 1);
  }, sec * 1000));
});

const ctx: ActionContext = {
  store, scenes, applyHud,
  enableReplayApi: () => {
    enableReplayApi(settings.leagueDir);
    store.update('status', s => { s.replayApi = 'warn'; s.message = 'Replay API enabled in game.cfg – takes effect with the next game start'; });
  },
  recorder: { toggle: () => (recorder.active ? (recorder.end(), false) : (recorder.begin(), true)) },
};
const action = (name: string, payload: unknown) => runAction(ctx, name, payload);

const app = await createHttp({
  store, settings: getSettings, ocr, action,
  setSettings: s => { settings = s; void obs.reconnect(); },
});
await app.listen({ port: settings.port, host: '127.0.0.1' });
new Hub(app.server, store, action);

if (mode === 'live') {
  new LcuAdapter(bus, store, () => settings.leagueDir).start();
  new LiveClientAdapter(bus, store).start();
  ocr!.start();
  const cfg = replayApiConfig(settings.leagueDir);
  store.update('status', s => {
    s.replayApi = cfg === 'enabled' ? 'off' : 'warn';
    s.message = cfg === 'disabled' ? 'Replay API is disabled in game.cfg – enable it in the admin panel'
      : cfg === 'missing' ? `game.cfg not found in ${settings.leagueDir}` : '';
  });
} else if (mode === 'mock') {
  const mock = new MockSource(bus, store, Number(args.speed ?? 20));
  mock.seedMatch();
  void mock.run();
} else {
  void replay(bus, args.replay!, Number(args.speed ?? 1), Number(args.from ?? 0) * 1000);
}
const drafter = new DrafterService(store, dd, getSettings);
void drafter.sync();
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void drafter.close().finally(() => process.exit(0)); });

if (!args['no-obs']) obs.start();
if (args.record) ctx.recorder.toggle() && store.update('status', s => { s.recording = true; });
if (!args['no-hotkeys']) {
  void new Hotkeys(b => hotkeyAction(ctx, b)).start(settings.hotkeys).then(ok => {
    if (!ok) store.update('status', s => { s.message ||= 'Global hotkeys unavailable – move the folder to a short path like C:\\SG-Overlay (or use the admin panel buttons)'; });
  });
}

const base = `http://127.0.0.1:${settings.port}`;
log.info('main', `SG Overlay running (${mode}) – admin: ${base}/admin/`);
log.info('main', `overlays: ${['starting-soon', 'lineup', 'ingame', 'postgame', 'pause'].map(s => `${base}/overlay/${s}/`).join('  ')}`);

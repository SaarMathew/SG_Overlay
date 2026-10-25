// Feeds a recording through the real pipeline (as fast as possible) and prints what the overlays would show.
//   npx tsx scripts/replay-check.ts <recording dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/state/store.ts';
import { SourceBus, type SourceEvents } from '../server/sources/raw.ts';
import { Pipeline } from '../server/ingest/pipeline.ts';
import { DataDragon } from '../server/adapters/ddragon.ts';
import { loadObjectiveRules } from '../server/config.ts';
import { fmtGold, fmtTime } from '../shared/calc.ts';

let file = process.argv[2];
if (fs.statSync(file).isDirectory()) file = path.join(file, 'events.jsonl');

const store = new Store(path.join(os.tmpdir(), `sg-replay-${Date.now()}.json`));
const bus = new SourceBus();
const dd = new DataDragon();
await dd.init();
new Pipeline(store, bus, dd, loadObjectiveRules());

let starts = 0;
let ocrPolls = 0;
let polls = 0;
store.on('change', topic => {
  if (topic !== 'ingame') return;
  const g = store.get('ingame');
  if (g.active) { polls++; if (g.goldSource === 'ocr') ocrPolls++; }
});
const origLog = console.log;
console.log = (...a: unknown[]) => { if (String(a[0]).includes('game started')) starts++; origLog(...a); };

for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { ev, data } = JSON.parse(line) as { ev: keyof SourceEvents; data: never };
  bus.emit(ev, data);
}
await new Promise(r => setTimeout(r, 50));

const pg = store.get('postgame');
origLog(`\ngame starts detected: ${starts} | polls with OCR gold: ${ocrPolls}/${polls}`);
origLog(`post-game: active=${pg.active} duration=${fmtTime(pg.durationSec)} winner guess=${pg.winnerGuess} gold@15=${pg.gold15 ? 'yes' : 'no'}`);
origLog(`gold A ${pg.a && fmtGold(pg.a.gold)} vs B ${pg.b && fmtGold(pg.b.gold)} | kills ${pg.a?.kills}:${pg.b?.kills} | towers ${pg.a?.towers}:${pg.b?.towers}`);
origLog(`gold graph (${pg.goldHistory.length} points): ${pg.goldHistory.map(h => `${Math.round(h.t / 60)}′ ${fmtGold(h.diff, true)}`).join('  ')}`);
origLog(`objectives on graph: ${pg.events.map(e => `${e.kind}${e.dragonType ? '/' + e.dragonType : ''}@${fmtTime(e.t)} ${e.team}`).join(', ') || '–'}`);
process.exit(0);

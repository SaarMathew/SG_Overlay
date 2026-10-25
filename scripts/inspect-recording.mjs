// Prints the timeline of a recording: gameflow changes, live data gaps and game-time jumps.
//   node scripts/inspect-recording.mjs <recording dir or events.jsonl>
import fs from 'node:fs';
import path from 'node:path';

let file = process.argv[2];
if (fs.statSync(file).isDirectory()) file = path.join(file, 'events.jsonl');
const events = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

let prev = null;
let gold = 0;
for (const e of events) {
  if (e.ev === 'gameflow') { console.log(`${(e.t / 1000).toFixed(0)}s flow ${e.data}`); continue; }
  if (e.ev === 'champselect') continue;
  if (e.ev === 'gold') { gold++; continue; }
  const gt = e.data ? e.data.gameData.gameTime : null;
  if (gt === null) {
    if (prev !== null) console.log(`${(e.t / 1000).toFixed(0)}s live -> null (last game time ${prev.toFixed(1)})`);
    prev = null;
    continue;
  }
  if (prev === null) console.log(`${(e.t / 1000).toFixed(0)}s live starts at game time ${gt.toFixed(1)} (${e.data.events.Events.length} events)`);
  else if (gt < prev - 1 || gt - prev > 5) console.log(`${(e.t / 1000).toFixed(0)}s game time jump ${prev.toFixed(1)} -> ${gt.toFixed(1)}`);
  prev = gt;
}
const last = events.filter(e => e.ev === 'live' && e.data).pop();
console.log(`gold readings: ${gold}; last game time ${prev}`);
if (last) console.log('last events:', last.data.events.Events.slice(-5).map(x => `${x.EventName}@${x.EventTime.toFixed(0)}`).join(' '));

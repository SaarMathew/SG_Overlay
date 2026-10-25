import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store } from '../server/state/store.ts';
import { SourceBus, type AllGameData, type RawEvent, type RawPlayer } from '../server/sources/raw.ts';
import { Pipeline } from '../server/ingest/pipeline.ts';
import { DataDragon } from '../server/adapters/ddragon.ts';
import { ROLES } from '../shared/types.ts';

const rules = {
  dragonFirst: 300, dragonRespawn: 300, elderRespawn: 360, grubsFirst: 480, heraldFirst: 960,
  baronFirst: 1500, baronRespawn: 360, baronBuff: 180, elderBuff: 150, atakhanFirst: 1200, showBeforeSec: 240,
};

const player = (name: string, team: 'ORDER' | 'CHAOS', kills = 0): RawPlayer => ({
  championName: 'Ahri', rawChampionName: 'game_character_displayname_Ahri', isDead: false, items: [], level: 5,
  position: '', respawnTimer: 0, riotIdGameName: name, riotId: `${name}#EUW`,
  scores: { kills, deaths: 0, assists: 0, creepScore: 50, wardScore: 3 },
  summonerSpells: { summonerSpellOne: { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName' }, summonerSpellTwo: {} },
  team,
});

function setup() {
  const store = new Store(path.join(os.tmpdir(), `sg-test-${Math.random()}.json`));
  const bus = new SourceBus();
  new Pipeline(store, bus, new DataDragon(), rules);
  // team A (SG) = sg1..sg5 plays red
  store.update('match', m => { m.rosterA = ROLES.map((role, i) => ({ riotId: `sg${i + 1}`, displayName: '', role })); });
  return { store, bus };
}

const game = (t: number, events: RawEvent[]): AllGameData => ({
  allPlayers: [
    ...[1, 2, 3, 4, 5].map(i => player(`opp${i}`, 'ORDER')),
    ...[1, 2, 3, 4, 5].map(i => player(`sg${i}`, 'CHAOS', i === 3 ? 2 : 0)),
  ],
  events: { Events: events },
  gameData: { gameTime: t },
});

describe('pipeline', () => {
  it('maps team A to its in-game side and attributes objectives and structures', () => {
    const { store, bus } = setup();
    const ev: RawEvent[] = [
      { EventID: 0, EventName: 'GameStart', EventTime: 0 },
      { EventID: 1, EventName: 'DragonKill', EventTime: 330, DragonType: 'Fire', Stolen: 'False', KillerName: 'sg2' },
      { EventID: 2, EventName: 'TurretKilled', EventTime: 600, TurretKilled: 'Turret_T1_R_03_A', KillerName: 'Minion_T200' },
      { EventID: 3, EventName: 'HordeKill', EventTime: 610, KillerName: 'opp2' },
      { EventID: 4, EventName: 'BaronKill', EventTime: 1520, Stolen: 'False', KillerName: 'sg1' },
    ];
    bus.emit('live', game(1530, ev));
    const g = store.get('ingame');
    expect(g.active).toBe(true);
    expect(g.a.side).toBe('CHAOS');
    expect(g.a.kills).toBe(2);
    expect(g.a.dragons).toEqual(['infernal']);
    expect(g.a.towers).toBe(1);            // T1 = blue side turret, destroyed by red = team A
    expect(g.b.grubs).toBe(1);
    expect(g.a.barons).toBe(1);
    expect(g.timers.find(t => t.kind === 'baronBuff')?.team).toBe('A');
    expect(g.goldSource).toBe('items');
  });

  it('does not mistake the end screen for a new game (keeps the gold history)', async () => {
    const { store, bus } = setup();
    for (const t of [60, 120, 180, 240]) bus.emit('live', game(t, []));
    expect(store.get('ingame').goldHistory.length).toBe(4);
    bus.emit('live', game(250, [{ EventID: 0, EventName: 'GameEnd', EventTime: 250, Result: 'Win' }]));
    await new Promise(r => setTimeout(r, 5));
    expect(store.get('postgame').active).toBe(true);
    // the client keeps serving the finished game for a while
    bus.emit('live', game(251, [{ EventID: 0, EventName: 'GameEnd', EventTime: 250, Result: 'Win' }]));
    expect(store.get('ingame').active).toBe(false);
    expect(store.get('postgame').goldHistory.length).toBeGreaterThanOrEqual(4);
    // the next game of the series with the same players starts again near 0:00
    bus.emit('live', game(5, []));
    expect(store.get('ingame').active).toBe(true);
  });

  it('uses OCR gold when all rows are read and freezes the post-game after the game ends', async () => {
    const { store, bus } = setup();
    const rows = (base: number) => [0, 1, 2, 3, 4].map(i => [100, base + i * 10] as [number, number]);
    bus.emit('live', game(899, []));                 // game start resets OCR history
    bus.emit('gold', { order: rows(5000), chaos: rows(6000) });
    bus.emit('live', game(900, []));
    const g = store.get('ingame');
    expect(g.goldSource).toBe('ocr');
    expect(g.a.gold).toBe(30100);
    expect(g.b.gold).toBe(25100);
    for (let i = 0; i < 3; i++) bus.emit('live', null);
    const pg = store.get('postgame');
    expect(pg.active).toBe(true);
    expect(pg.durationSec).toBe(900);
    expect(store.get('ingame').active).toBe(false);
  });
});

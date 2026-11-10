import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store } from '../server/state/store.ts';
import { SourceBus, type AllGameData, type GoldReading, type RawEvent, type RawPlayer, type TopbarSide } from '../server/sources/raw.ts';
import { Pipeline, inhibLane } from '../server/ingest/pipeline.ts';
import { DataDragon } from '../server/adapters/ddragon.ts';
import { ROLES } from '../shared/types.ts';

const rules = {
  dragonFirst: 300, dragonRespawn: 300, elderRespawn: 360, grubsFirst: 480, heraldFirst: 960,
  baronFirst: 1500, baronRespawn: 360, baronBuff: 180, elderBuff: 150, atakhanFirst: 1200, inhibRespawn: 300, showBeforeSec: 240,
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
  const pipeline = new Pipeline(store, bus, new DataDragon(), rules);
  // team A (SG) = sg1..sg5 plays red
  store.update('match', m => { m.rosterA = ROLES.map((role, i) => ({ riotId: `sg${i + 1}`, displayName: '', role })); });
  return { store, bus, pipeline };
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

  describe('replay seeking', () => {
    const tower = (id: number, t: number, name: string): RawEvent => ({ EventID: id, EventName: 'TurretKilled', EventTime: t, TurretKilled: name, KillerName: 'Minion_T200' });
    const ev: RawEvent[] = [
      tower(1, 600, 'Turret_T1_R_03_A'),
      tower(2, 900, 'Turret_T1_C_05_A'),
      tower(3, 2400, 'Turret_T1_C_04_A'),
      { EventID: 4, EventName: 'ChampionKill', EventTime: 2400, KillerName: 'sg1', VictimName: 'opp1', Assisters: [] },
    ];
    const towers = (s: Store) => s.get('ingame').a.towers;

    it('ignores events from the future until the game time reaches them', () => {
      const { store, bus } = setup();
      bus.emit('live', game(1000, ev));
      expect(towers(store)).toBe(2);
      expect(store.get('ingame').fights.length).toBe(0);
      bus.emit('live', game(2398, ev));
      expect(towers(store)).toBe(2);
      bus.emit('live', game(2402, ev));
      expect(towers(store)).toBe(3);
    });

    it('counts a regenerated copy (new EventID, same content) once', () => {
      const { store, bus } = setup();
      const copies = [...ev, tower(11, 600.4, 'Turret_T1_R_03_A'), tower(12, 900.2, 'Turret_T1_C_05_A'), tower(13, 2400.5, 'Turret_T1_C_04_A')];
      bus.emit('live', game(2500, copies));
      expect(towers(store)).toBe(3);
    });

    it('keeps two distinct kills in the same second', () => {
      const { store, bus } = setup();
      bus.emit('live', game(510, [tower(1, 500, 'Turret_T1_R_03_A'), tower(2, 500, 'Turret_T1_C_05_A'), tower(3, 500.3, 'Turret_T1_R_03_A')]));
      expect(towers(store)).toBe(2);
    });

    it('counts the same after a jump back to 0:00 and replaying forward', () => {
      const { store, bus } = setup();
      bus.emit('live', game(2500, ev));
      expect(towers(store)).toBe(3);
      bus.emit('live', game(2, ev));
      expect(towers(store)).toBe(0);
      bus.emit('live', game(700, ev));
      expect(towers(store)).toBe(1);
      bus.emit('live', game(2500, ev));
      expect(towers(store)).toBe(3);
    });

    it('does not double count after a small seek back', () => {
      const { store, bus } = setup();
      bus.emit('live', game(1000, ev));
      bus.emit('live', game(990, ev));
      bus.emit('live', game(1010, ev));
      expect(towers(store)).toBe(2);
      expect(store.get('ingame').popups?.length ?? 0).toBe(0);
    });
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

  it('uses exact OCR CS only when it fits the API value (steps of 10) and never lets it drop', () => {
    const { store, bus } = setup();
    const gold = Array.from({ length: 5 }, () => null);
    const cs = (v: number | null) => ({ order: [v, v, v, v, v], chaos: [v, 87, null, v, v] });
    const sgCs = () => store.get('ingame').a.players.map(p => p.cs);
    bus.emit('live', game(899, []));                 // creepScore is 50 for everyone
    bus.emit('gold', { order: gold, chaos: gold, cs: cs(57) });
    bus.emit('live', game(900, []));
    expect(sgCs()).toEqual([57, 50, 50, 57, 57]);    // 87 does not fit 50 -> API value, row 2 unreadable -> API
    bus.emit('gold', { order: gold, chaos: gold, cs: cs(49) });   // would drop below 57 (and lags: 40 vs 50 is one step)
    bus.emit('live', game(901, []));
    expect(sgCs()).toEqual([57, 50, 50, 57, 57]);
    bus.emit('gold', { order: gold, chaos: gold, cs: cs(61) });   // one step ahead of the API: fine
    bus.emit('live', game(902, []));
    expect(sgCs()).toEqual([61, 50, 50, 61, 61]);
    bus.emit('gold', { order: gold, chaos: gold }); // old recording without CS: falls back to the API value
    bus.emit('live', game(903, []));
    expect(sgCs()).toEqual([61, 50, 50, 61, 61]);   // reading still fresh
    for (let t = 904; t < 908; t++) bus.emit('live', game(t, []));
    expect(sgCs()).toEqual([50, 50, 50, 50, 50]);   // stale, and 61 no longer fits the API value
  });

  describe('dragon attribution', () => {
    const drake = (id: number, killer: string | undefined, type = 'Fire', extra: Partial<RawEvent> = {}): RawEvent =>
      ({ EventID: id, EventName: 'DragonKill', EventTime: 400 + id, DragonType: type, Stolen: 'False', KillerName: killer, ...extra });

    it('maps every current DragonType spelling and keeps the order', () => {
      const { store, bus } = setup();
      const types = ['Fire', 'Water', 'Earth', 'Air'];
      bus.emit('live', game(900, types.map((t, i) => drake(i + 1, 'sg1', t))));
      expect(store.get('ingame').a.dragons).toEqual(['infernal', 'ocean', 'mountain', 'cloud']);
      const s2 = setup();
      s2.bus.emit('live', game(900, [drake(1, 'sg1', 'Hextech'), drake(2, 'opp1', 'Chemtech'), drake(3, 'sg1', 'Elder')]));
      expect(s2.store.get('ingame').a.dragons).toEqual(['hextech']);
      expect(s2.store.get('ingame').b.dragons).toEqual(['chemtech']);
      expect(s2.store.get('ingame').a.elders).toBe(1);
    });

    it('does not mislabel an unknown DragonType', () => {
      const { store, bus } = setup();
      bus.emit('live', game(900, [drake(1, 'sg1', 'Sparkle')]));
      expect(store.get('ingame').a.dragons).toEqual([]);
    });

    it('resolves the killer by champion name, apostrophes, case and tag, and falls back to assisters', () => {
      const { store, bus } = setup();
      const data = game(900, [
        drake(1, 'SG1#EUW'), drake(2, '  Sg2 '),
        drake(3, 'SRU_Minion_Whatever', 'Water', { Assisters: ['opp3'] }),
        drake(4, 'Minion_T100', 'Earth'),
      ]);
      data.allPlayers[5].championName = "Kai'Sa";
      data.allPlayers[5].riotIdGameName = 'Blackroocky';
      data.events!.Events.push(drake(5, 'Kaisa', 'Air'), drake(6, "kai'sa", 'Hextech'));
      bus.emit('live', data);
      const g = store.get('ingame');
      expect(g.a.dragons).toEqual(['infernal', 'infernal', 'cloud', 'hextech']);
      expect(g.b.dragons).toEqual(['ocean']);
    });

    it('counts events that arrive in a later poll or out of order once, also after repeats', () => {
      const { store, bus } = setup();
      bus.emit('live', game(500, [drake(5, 'sg1'), { EventID: 6, EventName: 'MinionsSpawning', EventTime: 10 }]));
      bus.emit('live', game(510, [drake(3, 'sg1', 'Water'), drake(5, 'sg1'), drake(7, 'sg1', 'Earth')]));
      bus.emit('live', game(520, [drake(3, 'sg1', 'Water'), drake(7, 'sg1', 'Earth')]));
      expect(store.get('ingame').a.dragons).toEqual(['infernal', 'ocean', 'mountain'].filter((_, i) => i !== 0 || true).sort((x, y) => 0) && ['infernal', 'ocean', 'mountain']);
    });
  });

  it('credits manual objectives from the admin panel to counters and timers', () => {
    const { store, bus, pipeline } = setup();
    bus.emit('live', game(800, []));          // team A = CHAOS
    pipeline.manualObjective('A', 'dragon', 'Water');
    pipeline.manualObjective('B', 'baron');
    bus.emit('live', game(801, []));
    const g = store.get('ingame');
    expect(g.a.dragons).toEqual(['ocean']);
    expect(g.b.barons).toBe(1);
    expect(g.timers.find(t => t.kind === 'baronBuff')?.team).toBe('B');
    expect(g.popups.length).toBe(2);
  });

  it('tracks downed inhibitors per owner and lane until they respawn', () => {
    const { store, bus } = setup();
    const kill = { EventID: 1, EventName: 'InhibKilled', EventTime: 1600, InhibKilled: 'Barracks_T1_C1', KillerName: 'sg1' };
    bus.emit('live', game(1610, [kill]));
    let g = store.get('ingame');
    expect(g.a.inhibs).toBe(1);   // counts destroyed inhibitors (by the destroying team)
    expect(g.inhibTimers).toEqual([{ team: 'B', lane: 'Mid', at: 1900 }]);
    bus.emit('live', game(1700, [kill, { EventID: 2, EventName: 'InhibKilled', EventTime: 1690, InhibKilled: 'Barracks_T2_L1', KillerName: 'opp1' }]));
    g = store.get('ingame');
    expect(g.inhibTimers.map(i => [i.team, i.lane])).toEqual([['B', 'Mid'], ['A', 'Top']]);
    bus.emit('live', game(1800, [kill, { EventID: 3, EventName: 'InhibRespawned', EventTime: 1795, InhibRespawned: 'Barracks_T1_C1' }]));
    expect(store.get('ingame').inhibTimers.map(i => i.team)).toEqual(['A']);
    bus.emit('live', game(2000, []));
    expect(store.get('ingame').inhibTimers).toEqual([]);
    expect(inhibLane('Barracks_TOrder_Bot')).toBe('Bot');
  });

  it('derives the soul from mapTerrain, else from the third dragon, and announces it at 4 dragons', () => {
    const { store, bus } = setup();
    const drake = (id: number, t: number, type: string) => ({ EventID: id, EventName: 'DragonKill', EventTime: t, DragonType: type, Stolen: 'False', KillerName: 'sg1' });
    const evs = [drake(1, 330, 'Fire'), drake(2, 650, 'Water')];
    bus.emit('live', game(700, evs));
    expect(store.get('ingame').soul).toBeNull();
    evs.push(drake(3, 960, 'Earth'));
    bus.emit('live', game(970, evs));
    expect(store.get('ingame').soul).toBe('mountain');   // fallback: third dragon
    const withTerrain = (t: number, e: RawEvent[]) => { const d = game(t, e); d.gameData.mapTerrain = 'Hextech'; return d; };
    bus.emit('live', withTerrain(980, evs));
    expect(store.get('ingame').soul).toBe('hextech');    // mapTerrain wins
    evs.push(drake(4, 1270, 'Earth'));
    bus.emit('live', withTerrain(1275, evs));
    const p = store.get('ingame').popups.find(x => x.detail);
    expect(p?.text).toContain('claim the Hextech Soul');
    expect(store.get('ingame').a.dragons).toHaveLength(4);
  });

  it('resolves transformed champion forms and maps new-format lane names', () => {
    const { store, bus } = setup();
    const gnar = { ...player('opp1', 'ORDER'), championName: 'Mega Gnar', rawChampionName: 'game_character_displayname_GnarBig' };
    const g = game(100, []);
    g.allPlayers[0] = gnar;
    bus.emit('live', g);
    expect(store.get('ingame').b.players.some(p => p.champion === 'Gnar')).toBe(true);
    expect(inhibLane('Inhib_TOrder_L0_P1_1_0')).toBe('Bot');
    expect(inhibLane('Inhib_TOrder_L1_P1_1_0')).toBe('Mid');
    expect(inhibLane('Turret_TChaos_L2_P3_1_0')).toBe('Top');
  });

  it('re-decides the side when the match setup changes mid-game', () => {
    const { store, bus } = setup();
    const kill = { EventID: 1, EventName: 'DragonKill', EventTime: 330, DragonType: 'Fire', Stolen: 'False', KillerName: 'sg2' };
    bus.emit('live', game(340, [kill]));
    expect(store.get('ingame').a.side).toBe('CHAOS');
    expect(store.get('ingame').a.dragons).toEqual(['infernal']);
    store.update('match', m => { m.sideA = 'ORDER'; });
    bus.emit('live', game(342, [kill]));
    const g = store.get('ingame');
    expect(g.a.side).toBe('ORDER');
    expect(g.b.dragons).toEqual(['infernal']);
    expect(g.a.dragons).toEqual([]);
    expect(g.popups).toEqual([]);   // reprocessed history is stale: no popups
  });

  it('words stolen objectives as "steal"', () => {
    const { store, bus } = setup();
    const ev: RawEvent[] = [{ EventID: 1, EventName: 'BaronKill', EventTime: 1520, Stolen: 'True', KillerName: 'sg1' }];
    bus.emit('live', game(1522, ev));
    expect(store.get('ingame').popups[0].text).toMatch(/steal Baron Nashor/);
  });
});

describe('score bar objectives', () => {
  const bar = (order: Partial<TopbarSide>, chaos: Partial<TopbarSide> = {}): GoldReading => {
    const s = (o: Partial<TopbarSide>): TopbarSide => ({ dragons: 0, barons: 0, grubs: 0, towers: 0, dragonTypes: [], ...o });
    return { order: [], chaos: [], topbar: { order: s(order), chaos: s(chaos) } };
  };
  const feed = (bus: SourceBus, r: GoldReading) => { bus.emit('gold', r); bus.emit('gold', r); };

  it('creates a dragon once (counter, timer, popup) and does not count a later event again', () => {
    const { store, bus } = setup();
    bus.emit('live', game(400, [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }]));
    feed(bus, bar({}, {}));
    feed(bus, bar({}, { dragons: 1, dragonTypes: ['infernal'] }));
    feed(bus, bar({}, { dragons: 1, dragonTypes: ['infernal'] }));
    bus.emit('live', game(500, []));   // the next poll publishes the state
    let g = store.get('ingame');
    expect(g.a.dragons).toEqual(['infernal']);        // team A plays CHAOS in this setup
    expect(g.b.dragons).toEqual([]);
    expect(g.popups.filter(p => p.kind === 'dragon')).toHaveLength(1);
    expect(g.popups[0].text).toContain('Infernal');
    expect(g.timers.find(t => t.kind === 'dragon')?.at).toBe(400 + rules.dragonRespawn);   // respawn counted from the bar reading
    // the real event shows up afterwards: still one dragon
    bus.emit('live', game(505, [{ EventID: 1, EventName: 'DragonKill', EventTime: 399, DragonType: 'Fire', Stolen: 'False', KillerName: 'sg2' }]));
    g = store.get('ingame');
    expect(g.a.dragons).toEqual(['infernal']);
  });

  it('events win: the score bar adds nothing the events already counted', () => {
    const { store, bus } = setup();
    bus.emit('live', game(400, [
      { EventID: 1, EventName: 'DragonKill', EventTime: 330, DragonType: 'Water', Stolen: 'False', KillerName: 'opp1' },
      { EventID: 2, EventName: 'HordeKill', EventTime: 340, KillerName: 'sg1' },
    ]));
    feed(bus, bar({ dragons: 1, dragonTypes: ['ocean'] }, { grubs: 1 }));
    feed(bus, bar({ dragons: 1, dragonTypes: ['ocean'] }, { grubs: 1 }));
    bus.emit('live', game(401, []));
    const g = store.get('ingame');
    expect(g.b.dragons).toEqual(['ocean']);
    expect(g.a.grubs).toBe(1);
  });

  it('counts a baron from the score bar (timer, popup) and not again when the event arrives', () => {
    const { store, bus } = setup();
    bus.emit('live', game(1500, [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }]));
    feed(bus, bar({}, {}));
    feed(bus, bar({}, { barons: 1 }));
    bus.emit('live', game(1501, []));
    let g = store.get('ingame');
    expect(g.a.barons).toBe(1);                         // team A plays CHAOS
    expect(g.popups.filter(p => p.text.includes('Baron'))).toHaveLength(1);
    expect(g.timers.find(t => t.kind === 'baronBuff')?.team).toBe('A');
    bus.emit('live', game(1505, [{ EventID: 1, EventName: 'BaronKill', EventTime: 1499, Stolen: 'False', KillerName: 'sg1' }]));
    g = store.get('ingame');
    expect(g.a.barons).toBe(1);
  });

  it('counts grubs from the score bar and groups them in one popup', () => {
    const { store, bus } = setup();
    bus.emit('live', game(700, [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }]));
    feed(bus, bar({}));
    feed(bus, bar({ grubs: 3 }));
    bus.emit('live', game(701, []));
    const g = store.get('ingame');
    expect(g.b.grubs).toBe(3);
    expect(g.popups.filter(p => p.kind === 'grubs')).toHaveLength(1);
  });

  it('applies counts already on the bar when the app starts mid-game without popups', () => {
    const { store, bus } = setup();
    bus.emit('live', game(1500, [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }]));
    feed(bus, bar({ dragons: 2, dragonTypes: ['ocean', 'mountain'] }));
    bus.emit('live', game(1501, []));
    const g = store.get('ingame');
    expect(g.b.dragons).toEqual(['ocean', 'mountain']);
    expect(g.popups).toHaveLength(0);
  });
});

// Simulated match for development without a League client:
// lobby -> champ select (picks lock one by one) -> game with events and gold -> end -> next game.
import type { Store } from '../state/store.ts';
import type { AllGameData, ChampSelectSession, CsMember, GoldReading, RawEvent, RawPlayer, SourceBus } from './raw.ts';
import type { RosterEntry } from '../../shared/types.ts';
import { ROLES } from '../../shared/types.ts';
import { log } from '../log.ts';

interface MockPlayer {
  name: string; champ: string; champKey: number; spells: [string, number, string, number];
  build: number[]; boots: number; trinket: number; income: number; csRate: number;
}

// [name, champion id, champion key, spell1, spell2, items, boots, trinket, gold/min, cs/min]
const SG: MockPlayer[] = [
  mp('Steinbeißer', 'Aatrox', 266, 'SummonerFlash', 4, 'SummonerTeleport', 12, [6692, 3071, 6333, 3053, 3026], 3047, 3340, 390, 8.4),
  mp('Moosrücken', 'Sejuani', 113, 'SummonerSmite', 11, 'SummonerFlash', 4, [3068, 6665, 3075, 4401, 3143], 3047, 3364, 340, 5.9),
  mp('Saarlicht', 'Ahri', 103, 'SummonerFlash', 4, 'SummonerDot', 14, [6655, 4645, 3089, 3135, 3157], 3020, 3340, 420, 9.0),
  mp('Panzerkralle', 'Jinx', 222, 'SummonerFlash', 4, 'SummonerHeal', 7, [3031, 3094, 3036, 3072, 3026], 3006, 3363, 430, 9.6),
  mp('Schildkröte', 'Nautilus', 111, 'SummonerFlash', 4, 'SummonerExhaust', 3, [3190, 3050, 3109, 3107, 2065], 3117, 3364, 250, 1.2),
];
const OPP: MockPlayer[] = [
  mp('Polarfuchs', 'Renekton', 58, 'SummonerFlash', 4, 'SummonerTeleport', 12, [6610, 3071, 3053, 6333, 3026], 3111, 3340, 370, 8.0),
  mp('Eiswind', 'LeeSin', 64, 'SummonerSmite', 11, 'SummonerFlash', 4, [6692, 3071, 3156, 6333, 3026], 3111, 3364, 330, 5.4),
  mp('Nordstern', 'Syndra', 134, 'SummonerFlash', 4, 'SummonerTeleport', 12, [6655, 4645, 3089, 3135, 3157], 3020, 3340, 390, 8.6),
  mp('Kaltfront', 'Kaisa', 145, 'SummonerFlash', 4, 'SummonerHeal', 7, [3124, 3115, 4645, 3089, 3026], 3006, 3363, 400, 9.2),
  mp('Polarlicht', 'Rakan', 497, 'SummonerFlash', 4, 'SummonerExhaust', 3, [3190, 3107, 3050, 2065, 3109], 3117, 3364, 230, 1.0),
];
// alternative picks for later games (Fearless: nobody may pick a champion twice in a series)
const ALT: [string, number][][] = [
  [['KSante', 897], ['Vi', 254], ['Orianna', 61], ['Ezreal', 81], ['Braum', 201], ['Gnar', 150], ['Maokai', 57], ['Azir', 268], ['Varus', 110], ['Alistar', 12]],
  [['Jax', 24], ['Viego', 234], ['Sylas', 517], ['Xayah', 498], ['Leona', 89], ['Camille', 164], ['Nidalee', 76], ['Taliyah', 163], ['Aphelios', 523], ['Thresh', 412]],
];

function mp(name: string, champ: string, champKey: number, s1: string, k1: number, s2: string, k2: number,
  build: number[], boots: number, trinket: number, income: number, csRate: number): MockPlayer {
  return { name, champ, champKey, spells: [s1, k1, s2, k2], build, boots, trinket, income, csRate };
}

interface PState { k: number; d: number; a: number; deadUntil: number; bonus: number }

export class MockSource {
  private game = 0;
  private stopped = false;

  constructor(private bus: SourceBus, private store: Store, private speed = 20, private duration = 1900) {}

  /** Fills match setup with demo teams if it still has the defaults. */
  seedMatch(): void {
    const m = this.store.get('match');
    if (m.rosterA.length) return;
    const roster = (list: MockPlayer[]): RosterEntry[] => list.map((p, i) => ({ riotId: p.name, displayName: '', role: ROLES[i] }));
    this.store.update('match', mm => {
      mm.teamB = { name: 'Nordlicht Esports', tag: 'NLE', logo: null, color: '#e5484d' };
      mm.rosterA = roster(SG);
      mm.rosterB = roster(OPP);
      mm.leagueLine = 'Prime League · Division 4 · Matchday 5';
      mm.caster = 'Caster';
      mm.countdownTarget = Date.now() + 5 * 60_000;
    });
  }

  async run(): Promise<void> {
    log.info('mock', `simulated games at ${this.speed}x`);
    while (!this.stopped) {
      await this.playOne();
      await sleep(45_000);   // post-game screen, then next game
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private teams(): [MockPlayer[], MockPlayer[]] {
    const alt = ALT[(this.game - 1) % ALT.length];
    if (this.game === 1 || !alt) return [SG, OPP];
    const swap = (list: MockPlayer[], off: number) => list.map((p, i) => ({ ...p, champ: alt[off + i][0], champKey: alt[off + i][1] }));
    return [swap(SG, 0), swap(OPP, 5)];
  }

  private async playOne(): Promise<void> {
    this.game++;
    const [sg, opp] = this.teams();
    this.bus.emit('gameflow', 'Lobby');
    await sleep(2000);

    // ---- champ select: SG is "myTeam", picks lock one after another
    this.bus.emit('gameflow', 'ChampSelect');
    const member = (p: MockPlayer, cell: number, locked: boolean): CsMember => ({
      cellId: cell, championId: locked ? p.champKey : 0, spell1Id: p.spells[1], spell2Id: p.spells[3],
      assignedPosition: '', gameName: p.name, tagLine: 'EUW',
    });
    const order = [0, 5, 6, 1, 2, 7, 8, 3, 4, 9];
    for (let n = 0; n <= 10; n++) {
      const locked = new Set(order.slice(0, n));
      const session: ChampSelectSession = {
        myTeam: sg.map((p, i) => member(p, i, locked.has(i))),
        theirTeam: opp.map((p, i) => member(p, i + 5, locked.has(i + 5))),
      };
      this.bus.emit('champselect', session);
      await sleep(n === 10 ? 5000 : 1300);
    }
    this.bus.emit('champselect', null);
    this.bus.emit('gameflow', 'InProgress');
    for (let i = 0; i < 3; i++) { this.bus.emit('live', null); await sleep(1000); }

    // ---- game: SG plays on CHAOS to exercise side mapping
    const events = this.script();
    const state: PState[] = Array.from({ length: 10 }, () => ({ k: 0, d: 0, a: 0, deadUntil: 0, bonus: 0 }));
    const emitted: RawEvent[] = [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }];
    let next = 0;
    for (let gt = 0; gt <= this.duration && !this.stopped; gt += this.speed) {
      while (next < events.length && events[next].EventTime <= gt) {
        const e = { ...events[next], EventID: emitted.length };
        this.applyEvent(e, state, sg, opp);
        emitted.push(e);
        next++;
      }
      this.bus.emit('live', this.snapshot(gt, sg, opp, state, emitted));
      this.bus.emit('gold', this.gold(gt, sg, opp, state));
      await sleep(1000);
    }
    this.bus.emit('gameflow', 'EndOfGame');
    for (let i = 0; i < 4; i++) { this.bus.emit('live', null); await sleep(1000); }
  }

  /** Deterministic-ish event script, SG (CHAOS) slightly favored. */
  private script(): RawEvent[] {
    let seed = this.game * 7919;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ev: RawEvent[] = [];
    const add = (t: number, e: Omit<RawEvent, 'EventID' | 'EventTime'>) => ev.push({ EventID: 0, EventTime: t, ...e });
    const killer = (sgWins: boolean) => (sgWins ? 'sg' : 'opp');
    // kills every ~40s
    for (let t = 170; t < this.duration - 20; t += 25 + rnd() * 40) add(t, { EventName: 'ChampionKill', KillerName: killer(rnd() < 0.64) });
    add(172, { EventName: 'FirstBlood', Recipient: 'sg' });
    const drakes: [number, string, boolean][] = [[330, 'Earth', false], [650, 'Fire', true], [960, 'Water', true], [1270, 'Fire', true], [1580, 'Fire', true]];
    for (const [t, type, sgWins] of drakes) add(t, { EventName: 'DragonKill', DragonType: type, Stolen: 'False', KillerName: killer(sgWins) });
    for (const t of [500, 520, 545]) add(t, { EventName: 'HordeKill', KillerName: 'sg' });
    for (const t of [700, 715, 730]) add(t, { EventName: 'HordeKill', KillerName: 'opp' });
    add(1000, { EventName: 'HeraldKill', KillerName: 'sg' });
    add(1230, { EventName: 'AtakhanKill', KillerName: 'opp' });
    add(1520, { EventName: 'BaronKill', Stolen: 'False', KillerName: 'sg' });
    // towers: SG destroys ORDER (T1) structures
    const sgTowers = [[620, 'Turret_T1_R_03_A'], [900, 'Turret_T1_C_05_A'], [1100, 'Turret_T1_L_03_A'], [1300, 'Turret_T1_R_02_A'], [1560, 'Turret_T1_C_04_A'],
      [1600, 'Turret_T1_C_03_A'], [1650, 'Turret_T1_L_02_A'], [1840, 'Turret_T1_C_01_A'], [1860, 'Turret_T1_C_02_A']] as const;
    for (const [t, n] of sgTowers) add(t, { EventName: 'TurretKilled', TurretKilled: n, KillerName: 'sg' });
    add(780, { EventName: 'TurretKilled', TurretKilled: 'Turret_T2_L_03_A', KillerName: 'opp' });
    add(1180, { EventName: 'TurretKilled', TurretKilled: 'Turret_T2_C_05_A', KillerName: 'opp' });
    add(1610, { EventName: 'InhibKilled', InhibKilled: 'Barracks_T1_C1', KillerName: 'sg' });
    add(1700, { EventName: 'Ace', Acer: 'sg', AcingTeam: 'CHAOS' });
    add(1702, { EventName: 'Multikill', KillerName: 'sg', KillStreak: 3 });
    add(1830, { EventName: 'InhibKilled', InhibKilled: 'Barracks_T1_L1', KillerName: 'sg' });
    return ev.sort((a, b) => a.EventTime - b.EventTime);
  }

  /** Resolves placeholder killers ("sg"/"opp") to players and updates scores. */
  private applyEvent(e: RawEvent, st: PState[], sg: MockPlayer[], opp: MockPlayer[]): void {
    const pick = (team: 'sg' | 'opp', alive = true) => {
      const base = team === 'sg' ? 0 : 5;
      const cands = [0, 1, 2, 3, 4].map(i => base + i).filter(i => !alive || st[i].deadUntil <= e.EventTime);
      return cands.length ? cands[Math.floor((e.EventTime * 13) % cands.length)] : base + 3;
    };
    const nameOf = (i: number) => (i < 5 ? sg[i] : opp[i - 5]).name;
    if (e.KillerName === 'sg' || e.KillerName === 'opp') {
      const team = e.KillerName;
      const k = e.EventName === 'Multikill' ? 3 : pick(team);
      e.KillerName = nameOf(e.EventName === 'Multikill' ? 3 : k);
      if (e.EventName === 'ChampionKill') {
        const victim = pick(team === 'sg' ? 'opp' : 'sg');
        const base = team === 'sg' ? 0 : 5;
        const helper = base + ((k - base + 1 + Math.floor(e.EventTime) % 4) % 5);
        e.VictimName = nameOf(victim);
        e.Assisters = helper !== k ? [nameOf(helper)] : [];
        st[k].k++; st[k].bonus += 300; st[victim].d++;
        if (helper !== k) { st[helper].a++; st[helper].bonus += 120; }
        st[victim].deadUntil = e.EventTime + 8 + e.EventTime / 60;
      }
    }
    if (e.Recipient === 'sg') e.Recipient = nameOf(2);
    if (e.Acer === 'sg') e.Acer = nameOf(3);
  }

  private totalGold(gt: number, p: MockPlayer, s: PState): number {
    return Math.round(500 + (gt / 60) * p.income + s.bonus + (gt > 90 ? (gt - 90) * 0.4 : 0));
  }

  private snapshot(gt: number, sg: MockPlayer[], opp: MockPlayer[], st: PState[], events: RawEvent[]): AllGameData {
    const player = (p: MockPlayer, i: number, team: 'ORDER' | 'CHAOS'): RawPlayer => {
      const s = st[i];
      const total = this.totalGold(gt, p, s);
      const done = Math.min(5, Math.floor((total - 1300) / 2900));
      const items = [
        ...p.build.slice(0, Math.max(0, done)).map((id, slot) => ({ itemID: id, slot: slot === 0 ? 0 : slot + 1, count: 1 })),
        ...(total > 1300 ? [{ itemID: p.boots, slot: 1, count: 1 }] : []),
        { itemID: p.trinket, slot: 6, count: 1 },
      ];
      return {
        championName: p.champ, rawChampionName: `game_character_displayname_${p.champ}`,
        isDead: s.deadUntil > gt, respawnTimer: Math.max(0, s.deadUntil - gt), items,
        level: Math.min(18, 1 + Math.floor(gt / 95 + s.k * 0.3)), position: '',
        riotId: `${p.name}#EUW`, riotIdGameName: p.name, summonerName: p.name,
        scores: { kills: s.k, deaths: s.d, assists: s.a, creepScore: Math.round((Math.max(0, gt - 65) / 60) * p.csRate), wardScore: (gt / 60) * (i % 5 === 4 ? 2.8 : 0.9) },
        summonerSpells: {
          summonerSpellOne: { rawDisplayName: `GeneratedTip_SummonerSpell_${p.spells[0]}_DisplayName` },
          summonerSpellTwo: { rawDisplayName: `GeneratedTip_SummonerSpell_${p.spells[2]}_DisplayName` },
        },
        team,
      };
    };
    return {
      allPlayers: [...opp.map((p, i) => player(p, i + 5, 'ORDER')), ...sg.map((p, i) => player(p, i, 'CHAOS'))],
      events: { Events: events },
      gameData: { gameTime: gt, gameMode: 'CLASSIC' },
    };
  }

  private gold(gt: number, sg: MockPlayer[], opp: MockPlayer[], st: PState[]): GoldReading {
    const row = (p: MockPlayer, i: number): [number, number] => {
      const total = this.totalGold(gt, p, st[i]);
      return [Math.round((total * 0.37) % 1400), total];
    };
    return { order: opp.map((p, i) => row(p, i + 5)), chaos: sg.map((p, i) => row(p, i)) };
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

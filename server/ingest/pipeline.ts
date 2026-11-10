import type {
  DragonType, GameSide, IngameState, InhibTimer, LineupPick, PlayerLive, Popup, PostgameState, TeamKey, TeamLive,
} from '../../shared/types.ts';
import { ROLES } from '../../shared/types.ts';
import { emptyPick, emptyPlayer } from '../../shared/defaults.ts';
import { playerGold } from '../../shared/calc.ts';
import type { ObjectiveRules } from '../config.ts';
import type { DataDragon } from '../adapters/ddragon.ts';
import type { Store } from '../state/store.ts';
import type { AllGameData, ChampSelectSession, CsMember, GoldReading, RawEvent, RawPlayer, SourceBus } from '../sources/raw.ts';
import { assignRoles, decideSideA, displayName, findRoster, normName } from './teams.ts';
import { computeTimers, dragonLabel, type ObjectiveKill } from './timers.ts';
import { GoldTracker } from './gold.ts';
import { CsTracker } from './cs.ts';
import { TopbarTracker } from './topbar.ts';
import { FightTracker, otherTeam } from './fights.ts';
import { log } from '../log.ts';

/** DragonType -> the name the live API uses in DragonKill events (for score-bar readings fed through handleEvent) */
const RAW_DRAGON: Record<DragonType, string> = {
  infernal: 'Fire', ocean: 'Water', mountain: 'Earth', cloud: 'Air', hextech: 'Hextech', chemtech: 'Chemtech', elder: 'Elder',
};
const DRAGON_TYPES: Record<string, DragonType> = {
  fire: 'infernal', water: 'ocean', earth: 'mountain', air: 'cloud', hextech: 'hextech', chemtech: 'chemtech', elder: 'elder',
};
/** Name key for event attribution: also ignores spaces, apostrophes, "&" etc. ("Kai'Sa" = "Kaisa"). */
const nameKey = (s: string | undefined) => normName(s).replace(/[^\p{L}\p{N}]/gu, '');
const OBJECTIVE_EVENTS = new Set(['DragonKill', 'BaronKill', 'HeraldKill', 'HordeKill', 'VoidGrubKill', 'VoidgrubKill', 'AtakhanKill']);
const GRUB_EVENTS = ['HordeKill', 'VoidGrubKill', 'VoidgrubKill'];
const ATAKHAN_EVENTS = ['AtakhanKill'];
const POPUP_MS = 6000;
const MAX_POPUP_DELAY_MS = 12_000;
const END_AFTER_NULL_POLLS = 3;
/** how long the last OCR gold is carried forward (with estimated income) when the scoreboard is hidden */
const OCR_CARRY_SEC = 180;
const KNOWN_EVENTS = new Set([
  'GameStart', 'MinionsSpawning', 'ChampionKill', 'FirstBlood', 'FirstBrick', 'Multikill', 'Ace', 'GameEnd',
  'DragonKill', 'BaronKill', 'HeraldKill', 'TurretKilled', 'InhibKilled', 'InhibRespawningSoon', 'InhibRespawned',
  'ChampionSpecialKill', ...['HordeKill', 'VoidGrubKill', 'VoidgrubKill', 'AtakhanKill'],
]);

export type ManualObjective = 'dragon' | 'baron' | 'herald' | 'grubs' | 'atakhan';
interface Counters { towers: number; inhibs: number; dragons: DragonType[]; elders: number; grubs: number; heralds: number; barons: number; atakhans: number }
const newCounters = (): Counters => ({ towers: 0, inhibs: 0, dragons: [], elders: 0, grubs: 0, heralds: 0, barons: 0, atakhans: 0 });

/** Turns raw source events (champ select, live client data, OCR gold) into overlay state. */
export class Pipeline {
  private sideA: GameSide = 'ORDER';
  private kills: ObjectiveKill[] = [];
  private inhibDown = new Map<string, InhibTimer>();   // by structure name
  private terrain: DragonType | null = null;
  private counters: Record<TeamKey, Counters> = { A: newCounters(), B: newCounters() };
  private seenEvents = new Set<number>();
  private seenContent = new Map<string, number[]>();
  private quiet = false;   // reprocessing old events after a side change: no popups
  private nullPolls = 0;
  private lastGameTime = -1;
  private lastGameTimeChangeAt = 0;
  private lastMinute = -1;
  private popups: Popup[] = [];
  private popupId = 1;
  private gold = new GoldTracker();
  private cs = new CsTracker();
  /** objective counters read from the score bar: the only source for dragons/grubs/herald while spectating */
  private topbar = new TopbarTracker();
  /** objectives counted from the score bar that a real event may still announce later (that event is then not counted again) */
  private ocrExtra: Record<TeamKey, { dragons: number; grubs: number; barons: number; heralds: number }> = { A: { dragons: 0, grubs: 0, barons: 0, heralds: 0 }, B: { dragons: 0, grubs: 0, barons: 0, heralds: 0 } };
  /** event state was rebuilt: re-apply the score-bar counters without popups */
  private topbarResync = false;
  private fights = new FightTracker();
  private nameTeam = new Map<string, TeamKey>();
  private playerOf = new Map<string, { name: string; champ: string }>();
  private lastSig = '';
  private pollNo = 0;
  private unknownEvents = new Set<string>();
  /** last OCR value per scoreboard row with the stats at that moment, to bridge OCR gaps */
  private ocrLast = new Map<string, { total: number; gt: number; cs: number; k: number; a: number }>();
  /** the game that just ended (player signature + end time), so its end screen does not start a "new" game */
  private ended: { sig: string; gt: number } | null = null;

  constructor(private store: Store, bus: SourceBus, private dd: DataDragon, private rules: ObjectiveRules) {
    bus.on('gameflow', p => this.onGameflow(p));
    bus.on('champselect', s => this.onChampSelect(s));
    bus.on('live', d => this.onLive(d));
    bus.on('gold', g => this.onGold(g));
  }

  // ---------- gameflow / champ select ----------

  private onGameflow(phase: string): void {
    this.store.update('status', s => { s.gameflow = phase; });
    if (['PreEndOfGame', 'EndOfGame', 'WaitingForStats'].includes(phase)) this.endGame();
  }

  private onChampSelect(session: ChampSelectSession | null): void {
    if (!session) {
      if (this.store.get('lineup').active) this.store.update('lineup', l => { l.active = false; });
      return;
    }
    const match = this.store.get('match');
    const hitsA = (list: CsMember[]) => list.filter(m => findRoster(match.rosterA, m.gameName ?? '')).length;
    const swap = hitsA(session.theirTeam) > hitsA(session.myTeam);
    const [aList, bList] = swap ? [session.theirTeam, session.myTeam] : [session.myTeam, session.theirTeam];
    const picks = (list: CsMember[], roster: typeof match.rosterA): LineupPick[] => {
      const names = list.map(m => m.gameName || `Player ${m.cellId + 1}`);
      const slots = assignRoles(names, list.map(m => m.assignedPosition), roster);
      return ROLES.map((role, s) => {
        const i = slots[s];
        if (i === null) return emptyPick(role);
        const m = list[i];
        const champ = m.championId > 0 ? this.dd.champFromKey(m.championId) : null;
        return {
          // champ select may not reveal names (e.g. when spectating): fall back to the roster entry for that role
          role, player: m.gameName ? displayName(roster, names[i]) : rosterName(roster, role),
          champion: champ?.id ?? null, championName: champ?.name ?? null, locked: !!champ,
          spells: champ ? [this.dd.spellFromKey(m.spell1Id), this.dd.spellFromKey(m.spell2Id)] : null,
        };
      });
    };
    const wasActive = this.store.get('lineup').active;
    this.store.set('lineup', { active: true, a: picks(aList, match.rosterA), b: picks(bList, match.rosterB) });
    if (!wasActive) this.store.update('postgame', p => { p.active = false; });
  }

  // ---------- gold ----------

  private onGold(reading: GoldReading | null): void {
    if (!reading) return;
    // plausibility runs on game time (correct for pauses and fast replays), not wall-clock time
    this.cs.accept(reading, this.pollNo);
    this.onTopbar(reading);
    const valid = this.gold.accept(reading, Math.max(0, this.lastGameTime) * 1000, this.pollNo);
    this.store.update('status', s => { s.ocr = valid >= 8 ? 'ok' : valid > 0 ? 'warn' : s.ocr === 'off' ? 'off' : 'warn'; });
  }

  /**
   * Dragons, barons and grubs from the score bar. Events win: only what the events did not count is added, credited at
   * the current game time (timers, soul and popups work as for a real event). Towers are only cross-checked.
   */
  private onTopbar(reading: GoldReading): void {
    if (!reading.topbar || !this.store.get('ingame').active) return;
    const changes = this.topbar.accept(reading);
    const quiet = this.topbarResync || changes.some(c => c.baseline);
    this.topbarResync = false;
    const gt = Math.max(0, this.lastGameTime);
    for (const side of ['ORDER', 'CHAOS'] as const) {
      const team = this.teamOf(side);
      const c = this.counters[team];
      const wasQuiet = this.quiet;
      this.quiet = quiet;
      try {
        for (let i = c.dragons.length + c.elders; i < this.topbar.get(side, 'dragons'); i++) {
          const type = this.topbar.typesOf(side)[i] ?? null;
          this.ocrExtra[team].dragons++;
          this.handleEvent({ EventID: -1, EventName: 'DragonKill', EventTime: gt, DragonType: type ? RAW_DRAGON[type] : undefined, Stolen: 'False' }, gt, Date.now(), team, true);
          log.info('game', `score bar: ${side} dragon ${i + 1} (${type ?? 'unknown type'}) at ${Math.floor(gt)}s`);
        }
        // Riot's counter counts Rift Herald and Baron together (verified on a replay: +1 at the herald ~16:50,
        // +1 at the baron): before the Baron spawns an increase is the herald, afterwards a baron.
        while (c.heralds + c.barons < this.topbar.get(side, 'barons')) {
          const herald = gt < this.rules.baronFirst;
          this.ocrExtra[team][herald ? 'heralds' : 'barons']++;
          this.handleEvent({ EventID: -1, EventName: herald ? 'HeraldKill' : 'BaronKill', EventTime: gt, Stolen: 'False' }, gt, Date.now(), team, true);
          log.info('game', `score bar: ${side} ${herald ? 'herald' : 'baron'} at ${Math.floor(gt)}s`);
        }
        while (c.grubs < this.topbar.get(side, 'grubs')) {
          this.ocrExtra[team].grubs++;
          this.handleEvent({ EventID: -1, EventName: 'HordeKill', EventTime: gt }, gt, Date.now(), team, true);
          log.info('game', `score bar: ${side} grub ${c.grubs} at ${Math.floor(gt)}s`);
        }
      } finally {
        this.quiet = wasQuiet;
      }
    }
    for (const ch of changes) {
      if (ch.counter !== 'towers') continue;
      const have = this.counters[this.teamOf(ch.side)][ch.counter];
      if (have !== ch.to) log.info('game', `score bar ${ch.side} ${ch.counter} ${ch.to}, events counted ${have}`);
    }
  }

  // ---------- live game ----------

  private onLive(data: AllGameData | null): void {
    const ingame = this.store.get('ingame');
    if (!data || !data.allPlayers?.length) {
      this.nullPolls++;
      if (ingame.active && this.nullPolls >= END_AFTER_NULL_POLLS) this.endGame();
      return;
    }
    this.nullPolls = 0;
    const gt = data.gameData.gameTime;
    if (gt < 1) return;
    const sig = signature(data);
    // After the end the client keeps serving the finished game (end screen): that is not a new game.
    // A new game has other players or starts again near 0:00 (same teams in the next game of a series).
    if (!ingame.active && this.ended && this.ended.sig === sig && gt >= this.ended.gt - 30) return;
    if (!ingame.active || gt < this.lastGameTime - 30) this.startGame(data);
    this.lastSig = sig;
    this.processPoll(data, gt);
  }

  private startGame(data: AllGameData): void {
    const match = this.store.get('match');
    const names = (side: GameSide) => data.allPlayers.filter(p => p.team === side).map(pName);
    this.sideA = decideSideA(match, names('ORDER'), names('CHAOS'));
    this.resetEvents();
    this.lastMinute = -1;
    this.gold.reset();
    this.cs.reset();
    this.topbar.reset();
    this.ocrLast.clear();
    // the new game's clock (the old one would mark the first polls as "paused" and skew OCR timing)
    this.lastGameTime = data.gameData.gameTime;
    this.lastGameTimeChangeAt = Date.now();
    log.info('game', `game started, team A plays ${this.sideA}`);
    this.store.update('lineup', l => { l.active = false; });
    this.store.update('postgame', p => { p.active = false; });
    this.store.update('ingame', g => { g.goldHistory = []; g.playerGoldHistory = []; g.fights = []; g.active = true; });
  }

  /** forget everything derived from events (they are reprocessed from the full list on the next poll) */
  private resetEvents(): void {
    this.kills = [];
    this.inhibDown.clear();
    this.terrain = null;
    this.counters = { A: newCounters(), B: newCounters() };
    this.ocrExtra = { A: { dragons: 0, grubs: 0, barons: 0, heralds: 0 }, B: { dragons: 0, grubs: 0, barons: 0, heralds: 0 } };
    this.topbarResync = true;
    this.seenEvents.clear();
    this.seenContent.clear();
    this.popups = [];
    this.fights.reset();
  }

  /**
   * A replay seeked back regenerates events it already served (new EventID, same content, time within a moment).
   * True if an event with the same name and fields happened at about this time already; records it otherwise.
   */
  private isRepeat(e: RawEvent): boolean {
    const { EventID: _id, EventTime: _t, ...fields } = e as RawEvent & Record<string, unknown>;
    const key = JSON.stringify(Object.keys(fields).sort().map(k => {
      const v = (fields as Record<string, unknown>)[k];
      return [k, Array.isArray(v) ? [...v].sort() : v];
    }));
    const times = this.seenContent.get(key);
    if (times?.some(t => Math.abs(t - e.EventTime) <= 1.5)) return true;
    if (times) times.push(e.EventTime); else this.seenContent.set(key, [e.EventTime]);
    return false;
  }

  /** match setup changed mid-game (rosters, side): if team A is now on the other side, swap A/B state */
  private reevaluateSide(data: AllGameData): void {
    const names = (side: GameSide) => data.allPlayers.filter(p => p.team === side).map(pName);
    const side = decideSideA(this.store.get('match'), names('ORDER'), names('CHAOS'));
    if (side === this.sideA) return;
    log.info('game', `team A now plays ${side} (was ${this.sideA}), rebuilding team state`);
    this.sideA = side;
    this.resetEvents();
    this.quiet = true;
    this.store.update('ingame', g => {
      g.goldHistory = g.goldHistory.map(h => ({ ...h, diff: -h.diff }));
      g.playerGoldHistory = g.playerGoldHistory.map(h => ({ ...h, a: h.b, b: h.a }));
      g.fights = [];
    });
  }

  private teamOf(side: GameSide): TeamKey {
    return side === this.sideA ? 'A' : 'B';
  }

  private processPoll(data: AllGameData, gt: number): void {
    this.pollNo++;
    const now = Date.now();
    if (this.pollNo > 1) this.reevaluateSide(data);
    const match = this.store.get('match');

    // Events name players by Riot ID in games, but by champion name in spectator mode
    // (there summonerName = champion name, e.g. KillerName "Ashe"), so map every identifier.
    this.nameTeam.clear();
    this.playerOf.clear();
    const ambiguous = new Set<string>();
    for (const p of data.allPlayers) {
      const t = this.teamOf(p.team);
      const roster = t === 'A' ? match.rosterA : match.rosterB;
      const champ = this.dd.champId(p.rawChampionName, p.championName);
      const who = { name: displayName(roster, pName(p)), champ };
      for (const n of [p.riotIdGameName, p.summonerName, p.riotId, p.championName, champ]) {
        const k = nameKey(n);
        if (!k) continue;
        const other = this.nameTeam.get(k);
        if (other && other !== t) ambiguous.add(k);   // same name on both teams: cannot tell who is meant
        this.nameTeam.set(k, t);
        this.playerOf.set(k, who);
      }
    }
    for (const k of ambiguous) { this.nameTeam.delete(k); this.playerOf.delete(k); }

    this.terrain = terrainSoul(data.gameData.mapTerrain) ?? this.terrain;
    const events = data.events?.Events ?? [];
    // by ID, not "greater than the last": a late or out-of-order event must still be counted exactly once
    for (const e of [...events].sort((x, y) => x.EventID - y.EventID)) {
      if (this.seenEvents.has(e.EventID)) continue;
      // a replay seeked back keeps serving events it already saw: those lie in the future, handle them when reached
      if (e.EventTime > gt + 1) continue;
      this.seenEvents.add(e.EventID);
      if (this.isRepeat(e)) continue;
      this.handleEvent(e, gt, now);
    }
    this.quiet = false;

    const team = (key: TeamKey): TeamLive => {
      const side: GameSide = key === 'A' ? this.sideA : this.sideA === 'ORDER' ? 'CHAOS' : 'ORDER';
      const raw = data.allPlayers.filter(p => p.team === side);
      const roster = key === 'A' ? match.rosterA : match.rosterB;
      const slots = assignRoles(raw.map(pName), raw.map(p => p.position), roster);
      const players = ROLES.map((role, s) => {
        const i = slots[s];
        return i === null ? emptyPlayer(role) : this.player(raw[i], role, side, i, roster, gt);
      });
      const c = this.counters[key];
      const allOcr = players.every(p => p.goldTotal !== null);
      return {
        side, players,
        kills: players.reduce((s, p) => s + p.kills, 0),
        towers: c.towers, inhibs: c.inhibs, dragons: c.dragons, elders: c.elders,
        grubs: c.grubs, heralds: c.heralds, barons: c.barons, atakhans: c.atakhans,
        gold: allOcr ? players.reduce((s, p) => s + (p.goldTotal ?? 0), 0) : players.reduce((s, p) => s + playerGold(p), 0),
      };
    };
    const a = team('A');
    const b = team('B');
    const goldSource = [...a.players, ...b.players].every(p => p.goldTotal !== null) ? 'ocr' : 'items';

    if (goldSource === 'ocr') this.fights.sample(gt, a.gold, b.gold);
    if (gt !== this.lastGameTime) { this.lastGameTime = gt; this.lastGameTimeChangeAt = now; }
    const paused = now - this.lastGameTimeChangeAt > 1800;

    this.popups = this.popups.filter(p => p.until > now);

    this.store.update('ingame', (g): IngameState => {
      const minute = Math.floor(gt / 60);
      if (minute > this.lastMinute) {
        this.lastMinute = minute;
        g.goldHistory.push({ t: minute * 60, diff: a.gold - b.gold });
        g.playerGoldHistory.push({ t: minute * 60, a: a.players.map(playerGold), b: b.players.map(playerGold) });
      }
      return {
        ...g, active: true, gameTime: gt, receivedAt: now, paused, a, b, goldSource,
        timers: computeTimers(this.kills, gt, this.rules, this.terrain),
        inhibTimers: [...this.inhibDown.values()].filter(i => i.at > gt).sort((x, y) => x.at - y.at),
        soul: this.terrain ?? this.kills.filter(k => k.kind === 'dragon')[2]?.dragonType ?? null,
        popups: this.popups,
        fights: this.fights.build(gt),
      };
    });
    if (this.store.get('status').live !== 'ok') this.store.update('status', s => { s.live = 'ok'; });
  }

  private player(p: RawPlayer, role: PlayerLive['role'], side: GameSide, row: number, roster: Parameters<typeof displayName>[0], gt: number): PlayerLive {
    const items = [0, 0, 0, 0, 0, 0];
    let trinket = 0;
    let itemGold = 0;
    for (const it of p.items ?? []) {
      if (it.slot === 6) trinket = it.itemID;
      else if (it.slot >= 0 && it.slot < 6) items[it.slot] = it.itemID;
      itemGold += this.dd.price(it.itemID) * (it.count || 1);
    }
    const spell = (s: { rawDisplayName?: string; displayName?: string }) =>
      s?.rawDisplayName?.match(/(Summoner\w+?)_DisplayName/)?.[1] ?? 'SummonerFlash';
    const champion = this.dd.champId(p.rawChampionName, p.championName);
    const g = this.ocrGold(side, row, gt, p);
    return {
      role, name: displayName(roster, pName(p)), riotId: p.riotId ?? pName(p), champion, championName: this.dd.champName(champion),
      level: p.level, items, trinket,
      kills: p.scores.kills, deaths: p.scores.deaths, assists: p.scores.assists, cs: this.cs.resolve(side, row, p.scores.creepScore, this.pollNo),
      ward: Math.round(p.scores.wardScore), spells: [spell(p.summonerSpells.summonerSpellOne), spell(p.summonerSpells.summonerSpellTwo)],
      dead: p.isDead, respawn: Math.ceil(p.respawnTimer), goldTotal: g?.total ?? null, goldCurrent: g?.current ?? null, itemGold,
    };
  }

  /**
   * OCR gold of one scoreboard row. If the scoreboard was hidden for a moment, the last reading is carried
   * forward with the income estimated from passive gold, CS, kills and assists – instead of dropping to
   * item gold, which made team gold and the graph jump by thousands.
   */
  private ocrGold(side: GameSide, row: number, gt: number, p: RawPlayer): { total: number; current: number | null } | null {
    const key = `${side}:${row}`;
    const s = p.scores;
    const g = this.gold.get(side, row, this.pollNo);
    if (g) {
      this.ocrLast.set(key, { total: g.total, gt, cs: s.creepScore, k: s.kills, a: s.assists });
      return g;
    }
    const last = this.ocrLast.get(key);
    if (!last || gt - last.gt > OCR_CARRY_SEC || gt < last.gt) return null;
    const income = Math.max(0, gt - last.gt) * 2.04 + Math.max(0, s.creepScore - last.cs) * 21
      + Math.max(0, s.kills - last.k) * 300 + Math.max(0, s.assists - last.a) * 150;
    return { total: Math.round(last.total + income), current: null };
  }

  // ---------- events ----------

  /**
   * Operator fallback for when the spectator feed does not report objective events at all:
   * feeds the same counters, timers and popups as a real event, credited to `team` at the current game time.
   */
  manualObjective(team: TeamKey, kind: ManualObjective, dragon?: string): void {
    const g = this.store.get('ingame');
    if (!g.active) throw new Error('No running game');
    const eventName = { dragon: 'DragonKill', baron: 'BaronKill', herald: 'HeraldKill', grubs: 'HordeKill', atakhan: 'AtakhanKill' }[kind];
    const gt = g.gameTime;
    this.handleEvent({ EventID: -1, EventName: eventName, EventTime: gt, DragonType: dragon, Stolen: 'False' }, gt, Date.now(), team);
    log.info('game', `manual ${kind}${dragon ? ` (${dragon})` : ''} for team ${team} at ${Math.floor(gt)}s`);
  }

  private handleEvent(e: RawEvent, gt: number, now: number, forcedTeam?: TeamKey, fromScoreBar = false): void {
    const fresh = !this.quiet && e.EventTime >= gt - 15;   // no popups for history replayed after a restart
    let killerTeam = forcedTeam ?? this.nameTeam.get(nameKey(e.KillerName)) ?? null;
    if (!killerTeam && OBJECTIVE_EVENTS.has(e.EventName)) {
      // killer is no known player (minion, renamed champion, ...): the assisters are on the same team
      killerTeam = (e.Assisters ?? []).map(a => this.nameTeam.get(nameKey(a))).find(Boolean) ?? null;
      if (!killerTeam) log.warn('game', `${e.EventName}: killer "${e.KillerName ?? '?'}" matches no player, objective not credited: ${JSON.stringify(e)}`);
    }
    if (!fromScoreBar && forcedTeam === undefined && killerTeam) {
      // already counted from the score bar before the event arrived
      const extra = this.ocrExtra[killerTeam];
      const key = e.EventName === 'DragonKill' ? 'dragons' : e.EventName === 'BaronKill' ? 'barons' : e.EventName === 'HeraldKill' ? 'heralds' : GRUB_EVENTS.includes(e.EventName) ? 'grubs' : null;
      if (key && extra[key] > 0) { extra[key]--; return; }
    }
    const teamName = (k: TeamKey | null) => (k ? this.store.get('match')[k === 'A' ? 'teamA' : 'teamB'].name : 'Unknown');
    const pop = (p: Omit<Popup, 'id' | 'from' | 'until'>) => fresh && this.popup(p, now);
    const name = e.EventName;

    if (name === 'DragonKill') {
      const type = DRAGON_TYPES[(e.DragonType ?? '').toLowerCase().replace(/[^a-z]/g, '').replace(/dragon$/, '')];
      if (!type && !fromScoreBar) log.warn('game', `DragonKill with unknown DragonType "${e.DragonType ?? ''}": ${JSON.stringify(e)}`);
      const stolen = e.Stolen === 'True';
      const kind = type === 'elder' ? 'elder' : 'dragon';
      this.kills.push({ t: e.EventTime, kind, team: killerTeam, dragonType: type });
      this.fightObj(e.EventTime, kind, killerTeam, type);
      // the score bar always shows a count; an icon of unrecognized type is counted as Cloud (only the type is a guess)
      const counted = type ?? (fromScoreBar ? 'cloud' : undefined);
      if (killerTeam && counted) {
        if (counted === 'elder') this.counters[killerTeam].elders++;
        else this.counters[killerTeam].dragons.push(counted);
      }
      const soul = killerTeam && type !== 'elder' && this.counters[killerTeam].dragons.length === 4;
      const soulType = this.terrain ?? this.kills.filter(k => k.kind === 'dragon')[2]?.dragonType ?? type;
      pop({
        kind, team: killerTeam, dragonType: type, title: soul ? 'Dragon soul' : stolen ? 'Objective stolen' : 'Objective secured',
        text: soul ? `${teamName(killerTeam)} claim the ${dragonLabel(soulType).split(' ')[0]} Soul` : `${teamName(killerTeam)} ${stolen ? 'steal' : 'slay'} the ${dragonLabel(type)}`,
        detail: soul ? `${dragonLabel(soulType).split(' ')[0]} soul` : undefined,
      });
    } else if (name === 'BaronKill') {
      this.kills.push({ t: e.EventTime, kind: 'baron', team: killerTeam });
      this.fightObj(e.EventTime, 'baron', killerTeam);
      if (killerTeam) this.counters[killerTeam].barons++;
      pop({ kind: 'baron', team: killerTeam, title: e.Stolen === 'True' ? 'Objective stolen' : 'Objective secured', text: `${teamName(killerTeam)} ${e.Stolen === 'True' ? 'steal' : 'slay'} Baron Nashor` });
    } else if (name === 'HeraldKill') {
      this.kills.push({ t: e.EventTime, kind: 'herald', team: killerTeam });
      this.fightObj(e.EventTime, 'herald', killerTeam);
      if (killerTeam) this.counters[killerTeam].heralds++;
      const stolen = e.Stolen === 'True';
      pop({ kind: 'herald', team: killerTeam, title: stolen ? 'Objective stolen' : 'Objective secured', text: `${teamName(killerTeam)} ${stolen ? 'steal' : 'take'} the Rift Herald` });
    } else if (GRUB_EVENTS.includes(name)) {
      this.kills.push({ t: e.EventTime, kind: 'grubs', team: killerTeam });
      this.fightObj(e.EventTime, 'grubs', killerTeam);
      if (killerTeam) this.counters[killerTeam].grubs++;
      const last = this.popups.at(-1);
      if (fresh && last?.kind === 'grubs' && last.team === killerTeam && last.until > now) {
        last.text = `${teamName(killerTeam)} take ${killerTeam ? this.counters[killerTeam].grubs : ''} Void Grubs`;
      } else {
        pop({ kind: 'grubs', team: killerTeam, title: 'Objective secured', text: `${teamName(killerTeam)} take a Void Grub` });
      }
    } else if (ATAKHAN_EVENTS.includes(name)) {
      this.kills.push({ t: e.EventTime, kind: 'atakhan', team: killerTeam });
      this.fightObj(e.EventTime, 'atakhan', killerTeam);
      if (killerTeam) this.counters[killerTeam].atakhans++;
      pop({ kind: 'atakhan', team: killerTeam, title: 'Objective secured', text: `${teamName(killerTeam)} slay Atakhan` });
    } else if (name === 'TurretKilled' || name === 'InhibKilled') {
      // Structure names carry the owner, e.g. "Turret_TChaos_L1_P3_2254202041_0" (current patches)
      // or "Turret_T1_L_03_A" / "Barracks_T1_L1" (older): Order/T1 = ORDER, Chaos/T2 = CHAOS
      const struct = e.TurretKilled ?? e.InhibKilled ?? '';
      const owner = structureOwner(struct);
      const team = owner ? this.teamOf(owner === 'ORDER' ? 'CHAOS' : 'ORDER') : killerTeam;
      if (!team) return;
      if (name === 'TurretKilled') {
        this.counters[team].towers++;
        this.fightObj(e.EventTime, 'tower', team);
      } else {
        this.counters[team].inhibs++;
        this.fightObj(e.EventTime, 'inhib', team);
        this.inhibDown.set(struct, { team: otherTeam(team), lane: inhibLane(struct), at: e.EventTime + this.rules.inhibRespawn });
        pop({ kind: 'inhib', team, title: 'Inhibitor destroyed', text: `${teamName(team)} destroy an inhibitor` });
      }
    } else if (name === 'InhibRespawned') {
      this.inhibDown.delete(e.InhibRespawned ?? '');
    } else if (name === 'Ace') {
      const team = e.AcingTeam === 'ORDER' || e.AcingTeam === 'CHAOS' ? this.teamOf(e.AcingTeam) : null;
      pop({ kind: 'ace', team, title: 'Ace', text: `${teamName(team)} wipe out ${teamName(team === 'A' ? 'B' : team === 'B' ? 'A' : null)}` });
    } else if (name === 'ChampionKill') {
      const victim = this.nameTeam.get(nameKey(e.VictimName));
      const kTeam = killerTeam ?? (victim ? otherTeam(victim) : null);   // executed by minion/turret: the other team gets the kill
      if (!kTeam || !this.playerOf.has(nameKey(e.VictimName))) return;
      const champ = (n?: string) => this.playerOf.get(nameKey(n))?.champ ?? '';
      this.fights.kill({
        t: e.EventTime, killer: { champ: champ(e.KillerName), team: kTeam }, victim: { champ: champ(e.VictimName), team: otherTeam(kTeam) },
        assisters: (e.Assisters ?? []).map(champ).filter(Boolean),
      });
    } else if (name === 'Multikill') {
      if (killerTeam && (e.KillStreak ?? 0) >= 2) this.fights.multikill({ t: e.EventTime, champ: this.playerOf.get(nameKey(e.KillerName))?.champ ?? '', team: killerTeam, streak: e.KillStreak! });
      if ((e.KillStreak ?? 0) < 3) return;
      const label = ['', '', '', 'Triple kill', 'Quadra kill', 'Penta kill'][Math.min(e.KillStreak ?? 3, 5)];
      const text = this.who(e.KillerName, killerTeam);
      // a quadra right after the triple of the same player upgrades the popup instead of queueing a second one
      const prev = this.popups.find(p => p.kind === 'multikill' && p.text === text && p.until > now);
      if (fresh && prev) {
        prev.title = label;
        prev.until = Math.max(prev.until, now + POPUP_MS);
      } else {
        pop({ kind: 'multikill', team: killerTeam, title: label, text });
      }
    } else if (name === 'FirstBlood') {
      const t = this.nameTeam.get(nameKey(e.Recipient)) ?? null;
      pop({ kind: 'firstblood', team: t, title: 'First blood', text: this.who(e.Recipient, t) });
    } else if (name === 'GameEnd') {
      // Result is relative to the client's own player; which side it means while spectating is not verified yet
      log.info('game', `GameEnd event, Result=${e.Result ?? '-'}`);
      setTimeout(() => this.endGame(), 0);
    } else if (!KNOWN_EVENTS.has(name) && !this.unknownEvents.has(name)) {
      // e.g. a renamed objective event after a patch: shows up in the log instead of being ignored silently
      this.unknownEvents.add(name);
      log.warn('game', `unhandled event "${name}": ${JSON.stringify(e)}`);
    }
  }

  private fightObj(t: number, kind: Parameters<FightTracker['objective']>[0]['kind'], team: TeamKey | null, dragonType?: DragonType): void {
    if (team) this.fights.objective({ t, kind, team, dragonType });
  }

  private who(raw: string | undefined, _team: TeamKey | null): string {
    const p = this.playerOf.get(nameKey(raw));
    return p ? `${p.name} · ${this.dd.champName(p.champ)}` : raw ?? '?';
  }

  private popup(p: Omit<Popup, 'id' | 'from' | 'until'>, now: number): void {
    const from = Math.max(now, this.popups.at(-1)?.until ?? 0);
    // in a big teamfight events pile up: anything that would appear more than 12 s late is no longer news
    if (from - now > MAX_POPUP_DELAY_MS) return;
    this.popups.push({ ...p, id: this.popupId++, from, until: from + POPUP_MS });
  }

  // ---------- end of game ----------

  endGame(): void {
    const g = this.store.get('ingame');
    if (!g.active) return;
    this.ended = { sig: this.lastSig, gt: g.gameTime };
    const winnerGuess = this.guessWinner(g);
    const hist = [...g.goldHistory];
    if (hist.at(-1)?.t !== Math.floor(g.gameTime)) hist.push({ t: Math.floor(g.gameTime), diff: g.a.gold - g.b.gold });
    const at15 = [...g.playerGoldHistory].reverse().find(p => p.t <= 900);
    const pg: PostgameState = {
      active: true, durationSec: Math.floor(g.gameTime), winnerGuess, winner: null,
      a: structuredClone(g.a), b: structuredClone(g.b), goldHistory: hist,
      gold15: at15 && g.gameTime >= 900 ? { a: at15.a, b: at15.b } : null,
      events: this.kills
        .filter((k): k is ObjectiveKill & { team: TeamKey; kind: 'dragon' | 'baron' | 'elder' | 'atakhan' } =>
          !!k.team && ['dragon', 'baron', 'elder', 'atakhan'].includes(k.kind))
        .map(k => ({ t: k.t, kind: k.kind, team: k.team, dragonType: k.dragonType })),
    };
    log.info('game', `game ended at ${pg.durationSec}s, winner guess ${winnerGuess ?? '?'}`);
    this.store.set('postgame', pg);
    this.store.update('ingame', x => { x.active = false; x.popups = []; });
    this.store.update('ui', u => { u.postgamePage = 1; u.h2hLane = null; });
  }

  private guessWinner(g: IngameState): TeamKey | null {
    const score = (k: TeamKey) => {
      const c = this.counters[k];
      const t = k === 'A' ? g.a : g.b;
      return [c.inhibs, c.towers, t.kills, t.gold];
    };
    const [a, b] = [score('A'), score('B')];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 'A' : 'B';
    return null;
  }
}

/**
 * Lane label from a structure name: "Inhib_TOrder_L1_P1_..." (current: L0 = bot, L1 = mid, L2 = top, verified against
 * the kill feed of a recorded game), "Barracks_T1_L1" / "..._C1" / "..._R1" (older), or top/mid/bot spelled out.
 */
export function inhibLane(struct: string): string {
  const n = struct.match(/_L([012])_P\d/i)?.[1];
  if (n) return ['Bot', 'Mid', 'Top'][+n];
  const w = struct.match(/top|mid|bot/i)?.[0].toLowerCase();
  const l = w ?? { l: 'top', c: 'mid', r: 'bot' }[(struct.match(/_([LCR])\d?(?:_|$)/i)?.[1] ?? '').toLowerCase()];
  return l ? l[0].toUpperCase() + l.slice(1) : '';
}

/** mapTerrain of allgamedata ("Infernal", "Ocean", ...) -> soul element; "Default" = not known yet. */
export function terrainSoul(t: string | undefined): DragonType | null {
  const k = (t ?? '').toLowerCase();
  const m: Record<string, DragonType> = { infernal: 'infernal', ocean: 'ocean', mountain: 'mountain', cloud: 'cloud', hextech: 'hextech', chemtech: 'chemtech' };
  return m[k] ?? null;
}

export function structureOwner(struct: string): GameSide | null {
  if (/_T(1|Order)_/i.test(struct)) return 'ORDER';
  if (/_T(2|Chaos)_/i.test(struct)) return 'CHAOS';
  return null;
}

const pName = (p: RawPlayer) => p.riotIdGameName || p.riotId || p.summonerName || p.championName;
const signature = (d: AllGameData) => d.allPlayers.map(p => `${p.riotId ?? pName(p)}:${p.championName}`).sort().join('|');
const rosterName = (roster: { riotId: string; displayName: string; role: string }[], role: string) => {
  const r = roster.find(x => x.role === role);
  return r ? r.displayName || r.riotId.split('#')[0] : '';
};

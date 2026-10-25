import type {
  DragonType, GameSide, IngameState, LineupPick, PlayerLive, Popup, PostgameState, TeamKey, TeamLive,
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
import { log } from '../log.ts';

const DRAGON_TYPES: Record<string, DragonType> = {
  fire: 'infernal', water: 'ocean', earth: 'mountain', air: 'cloud', hextech: 'hextech', chemtech: 'chemtech', elder: 'elder',
};
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

interface Counters { towers: number; inhibs: number; dragons: DragonType[]; elders: number; grubs: number; heralds: number; barons: number; atakhans: number }
const newCounters = (): Counters => ({ towers: 0, inhibs: 0, dragons: [], elders: 0, grubs: 0, heralds: 0, barons: 0, atakhans: 0 });

/** Turns raw source events (champ select, live client data, OCR gold) into overlay state. */
export class Pipeline {
  private sideA: GameSide = 'ORDER';
  private kills: ObjectiveKill[] = [];
  private counters: Record<TeamKey, Counters> = { A: newCounters(), B: newCounters() };
  private lastEventId = -1;
  private nullPolls = 0;
  private lastGameTime = -1;
  private lastGameTimeChangeAt = 0;
  private lastMinute = -1;
  private popups: Popup[] = [];
  private popupId = 1;
  private gold = new GoldTracker();
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
    const valid = this.gold.accept(reading, Math.max(0, this.lastGameTime) * 1000, this.pollNo);
    this.store.update('status', s => { s.ocr = valid >= 8 ? 'ok' : valid > 0 ? 'warn' : s.ocr === 'off' ? 'off' : 'warn'; });
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
    if (!ingame.active || gt < this.lastGameTime - 5) this.startGame(data);
    this.lastSig = sig;
    this.processPoll(data, gt);
  }

  private startGame(data: AllGameData): void {
    const match = this.store.get('match');
    const names = (side: GameSide) => data.allPlayers.filter(p => p.team === side).map(pName);
    this.sideA = decideSideA(match, names('ORDER'), names('CHAOS'));
    this.kills = [];
    this.counters = { A: newCounters(), B: newCounters() };
    this.lastEventId = -1;
    this.lastMinute = -1;
    this.popups = [];
    this.gold.reset();
    this.ocrLast.clear();
    // the new game's clock (the old one would mark the first polls as "paused" and skew OCR timing)
    this.lastGameTime = data.gameData.gameTime;
    this.lastGameTimeChangeAt = Date.now();
    log.info('game', `game started, team A plays ${this.sideA}`);
    this.store.update('lineup', l => { l.active = false; });
    this.store.update('postgame', p => { p.active = false; });
    this.store.update('ingame', g => { g.goldHistory = []; g.playerGoldHistory = []; g.active = true; });
  }

  private teamOf(side: GameSide): TeamKey {
    return side === this.sideA ? 'A' : 'B';
  }

  private processPoll(data: AllGameData, gt: number): void {
    this.pollNo++;
    const now = Date.now();
    const match = this.store.get('match');

    // Events name players by Riot ID in games, but by champion name in spectator mode
    // (there summonerName = champion name, e.g. KillerName "Ashe"), so map every identifier.
    this.nameTeam.clear();
    this.playerOf.clear();
    for (const p of data.allPlayers) {
      const t = this.teamOf(p.team);
      const roster = t === 'A' ? match.rosterA : match.rosterB;
      const champ = this.dd.champId(p.rawChampionName, p.championName);
      const who = { name: displayName(roster, pName(p)), champ };
      for (const n of [p.riotIdGameName, p.summonerName, p.riotId, p.championName, champ]) {
        if (!n) continue;
        this.nameTeam.set(normName(n), t);
        this.playerOf.set(normName(n), who);
      }
    }

    const events = data.events?.Events ?? [];
    for (const e of events) {
      if (e.EventID <= this.lastEventId) continue;
      this.lastEventId = e.EventID;
      this.handleEvent(e, gt, now);
    }

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
        timers: computeTimers(this.kills, gt, this.rules),
        popups: this.popups,
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
      kills: p.scores.kills, deaths: p.scores.deaths, assists: p.scores.assists, cs: p.scores.creepScore,
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

  private handleEvent(e: RawEvent, gt: number, now: number): void {
    const fresh = e.EventTime >= gt - 15;   // no popups for history replayed after a restart
    const killerTeam = this.nameTeam.get(normName(e.KillerName)) ?? null;
    const teamName = (k: TeamKey | null) => (k ? this.store.get('match')[k === 'A' ? 'teamA' : 'teamB'].name : 'Unknown');
    const pop = (p: Omit<Popup, 'id' | 'from' | 'until'>) => fresh && this.popup(p, now);
    const name = e.EventName;

    if (name === 'DragonKill') {
      const type = DRAGON_TYPES[(e.DragonType ?? '').toLowerCase()] ?? 'infernal';
      const stolen = e.Stolen === 'True';
      const kind = type === 'elder' ? 'elder' : 'dragon';
      this.kills.push({ t: e.EventTime, kind, team: killerTeam, dragonType: type });
      if (killerTeam) {
        if (type === 'elder') this.counters[killerTeam].elders++;
        else this.counters[killerTeam].dragons.push(type);
      }
      const soul = killerTeam && type !== 'elder' && this.counters[killerTeam].dragons.length === 4;
      pop({
        kind, team: killerTeam, dragonType: type, title: soul ? 'Dragon soul' : stolen ? 'Objective stolen' : 'Objective secured',
        text: `${teamName(killerTeam)} slay the ${dragonLabel(type)}`, detail: soul ? `${dragonLabel(type).split(' ')[0]} soul` : undefined,
      });
    } else if (name === 'BaronKill') {
      this.kills.push({ t: e.EventTime, kind: 'baron', team: killerTeam });
      if (killerTeam) this.counters[killerTeam].barons++;
      pop({ kind: 'baron', team: killerTeam, title: e.Stolen === 'True' ? 'Objective stolen' : 'Objective secured', text: `${teamName(killerTeam)} slay Baron Nashor` });
    } else if (name === 'HeraldKill') {
      this.kills.push({ t: e.EventTime, kind: 'herald', team: killerTeam });
      if (killerTeam) this.counters[killerTeam].heralds++;
      pop({ kind: 'herald', team: killerTeam, title: 'Objective secured', text: `${teamName(killerTeam)} take the Rift Herald` });
    } else if (GRUB_EVENTS.includes(name)) {
      this.kills.push({ t: e.EventTime, kind: 'grubs', team: killerTeam });
      if (killerTeam) this.counters[killerTeam].grubs++;
      const last = this.popups.at(-1);
      if (fresh && last?.kind === 'grubs' && last.team === killerTeam && last.until > now) {
        last.text = `${teamName(killerTeam)} take ${killerTeam ? this.counters[killerTeam].grubs : ''} Void Grubs`;
      } else {
        pop({ kind: 'grubs', team: killerTeam, title: 'Objective secured', text: `${teamName(killerTeam)} take a Void Grub` });
      }
    } else if (ATAKHAN_EVENTS.includes(name)) {
      this.kills.push({ t: e.EventTime, kind: 'atakhan', team: killerTeam });
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
      } else {
        this.counters[team].inhibs++;
        pop({ kind: 'inhib', team, title: 'Inhibitor destroyed', text: `${teamName(team)} destroy an inhibitor` });
      }
    } else if (name === 'Ace') {
      const team = e.AcingTeam === 'ORDER' || e.AcingTeam === 'CHAOS' ? this.teamOf(e.AcingTeam) : null;
      pop({ kind: 'ace', team, title: 'Ace', text: `${teamName(team)} wipe out ${teamName(team === 'A' ? 'B' : team === 'B' ? 'A' : null)}` });
    } else if (name === 'Multikill') {
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
      const t = this.nameTeam.get(normName(e.Recipient)) ?? null;
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

  private who(raw: string | undefined, _team: TeamKey | null): string {
    const p = this.playerOf.get(normName(raw));
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

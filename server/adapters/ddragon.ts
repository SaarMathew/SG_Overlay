import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.ts';
import { log } from '../log.ts';

const CDN = 'https://ddragon.leagueoflegends.com';
const FALLBACK_VERSION = '15.1.1';

interface ChampJson { data: Record<string, { id: string; key: string; name: string }> }
interface ItemJson { data: Record<string, { gold: { total: number } }> }
interface SpellJson { data: Record<string, { id: string; key: string }> }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Data Dragon lookups (champion ids, item prices, summoner spells), cached under data/ddragon/<version>. */
export class DataDragon {
  version = FALLBACK_VERSION;
  private champByKey = new Map<number, { id: string; name: string }>();
  private champById = new Map<string, string>();      // id -> display name
  private champByName = new Map<string, string>();    // normalized name/id -> id
  private itemPrice = new Map<number, number>();
  private spellByKey = new Map<number, string>();

  async init(): Promise<void> {
    try {
      const versions = await getJson<string[]>(`${CDN}/api/versions.json`);
      this.version = versions[0];
    } catch {
      const cached = this.cachedVersions();
      if (cached.length) this.version = cached[0];
      log.warn('ddragon', `offline, using version ${this.version}`);
    }
    const [champs, items, spells] = await Promise.all([
      this.load<ChampJson>('champion.json'),
      this.load<ItemJson>('item.json'),
      this.load<SpellJson>('summoner.json'),
    ]);
    for (const c of Object.values(champs?.data ?? {})) {
      this.champByKey.set(Number(c.key), { id: c.id, name: c.name });
      this.champById.set(c.id, c.name);
      this.champByName.set(norm(c.name), c.id);
      this.champByName.set(norm(c.id), c.id);
    }
    for (const [id, it] of Object.entries(items?.data ?? {})) this.itemPrice.set(Number(id), it.gold.total);
    for (const s of Object.values(spells?.data ?? {})) this.spellByKey.set(Number(s.key), s.id);
    log.info('ddragon', `version ${this.version}: ${this.champById.size} champions, ${this.itemPrice.size} items`);
  }

  champFromKey(key: number): { id: string; name: string } | null {
    return this.champByKey.get(key) ?? null;
  }

  /** Accepts a raw champion name ("game_character_displayname_LeeSin"), id or localized name. */
  champId(raw: string | undefined, displayName: string): string {
    const fromRaw = raw?.startsWith('game_character_displayname_') ? raw.slice('game_character_displayname_'.length) : null;
    if (fromRaw && (this.champById.has(fromRaw) || !this.champById.size)) return fromRaw;
    return this.champByName.get(norm(fromRaw ?? '')) ?? this.champByName.get(norm(displayName)) ?? displayName.replace(/[^A-Za-z]/g, '');
  }

  champName(id: string): string {
    return this.champById.get(id) ?? id;
  }

  price(itemId: number): number {
    return this.itemPrice.get(itemId) ?? 0;
  }

  spellFromKey(key: number): string {
    return this.spellByKey.get(key) ?? 'SummonerFlash';
  }

  private cachedVersions(): string[] {
    try {
      return fs.readdirSync(path.join(DATA_DIR, 'ddragon')).sort().reverse();
    } catch {
      return [];
    }
  }

  private async load<T>(file: string): Promise<T | null> {
    const cache = path.join(DATA_DIR, 'ddragon', this.version, file);
    try {
      return JSON.parse(fs.readFileSync(cache, 'utf8')) as T;
    } catch { /* not cached */ }
    try {
      const data = await getJson<T>(`${CDN}/cdn/${this.version}/data/en_US/${file}`);
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, JSON.stringify(data));
      return data;
    } catch (e) {
      log.warn('ddragon', `could not load ${file}: ${(e as Error).message}`);
      return null;
    }
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

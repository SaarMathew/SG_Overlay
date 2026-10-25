// Turns what the drafter.lol stream view shows (images + texts with positions) into draft state.
// Stream view (…/draft/<id>?game=N&stream=true), 1920 wide:
//   picks  <img alt="pick" src=…/game/splashes/<slug>.jpg>   blue left, red right, one per role
//   roles  <img alt="Top|Jungle|Mid|Bottom|Support">         next to each pick
//   bans   <img alt="ban"  src=…/game/champions/<key>.png>   bottom row
//   fearless (earlier games) <img alt="<ChampionId>" src=…/game/champions/<key>.png>, small, centre
import type { DraftPick, DraftState, DraftTeam, MatchConfig, Role, TeamKey } from '../../shared/types.ts';
import { ROLES } from '../../shared/types.ts';

export interface RawImage {
  alt: string; src: string; x: number; y: number; w: number;
  /** pick cards only: role icon and visible texts of the card the image sits in (from the DOM) */
  role?: string | null;
  label?: string | null;
}
export interface RawText { t: string; x: number; y: number }
export interface RawPage { width: number; images: RawImage[]; texts: RawText[] }

export interface ChampLookup {
  champId(raw: string | undefined, displayName: string): string;
  champName(id: string): string;
  champFromKey(key: number): { id: string; name: string } | null;
}

const ROLE_ALT: Record<string, Role> = { Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bottom: 'BOT', Support: 'SUP' };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseDraftPage(page: RawPage, dd: ChampLookup, match: MatchConfig, game: number): Omit<DraftState, 'status' | 'message' | 'updatedAt'> {
  const mid = page.width / 2;
  const side = (x: number) => (x < mid ? 'blue' : 'red') as 'blue' | 'red';
  const champKey = (src: string) => Number(/\/champions\/(\d+)\.png/.exec(src)?.[1] ?? NaN);
  const fromKey = (src: string) => dd.champFromKey(champKey(src))?.id ?? null;

  const roleIcons = page.images.filter(i => ROLE_ALT[i.alt]);
  const knownTexts = new Set(['Top', 'Jungle', 'Mid', 'Bottom', 'Support']);

  const team = (s: 'blue' | 'red'): DraftTeam => {
    const picks: (DraftPick | null)[] = ROLES.map(() => null);
    page.images
      .filter(i => i.alt === 'pick' && side(i.x) === s)
      .sort((a, b) => a.y - b.y)
      .forEach((img, order) => {
        // Role: the role icon inside the same card (DOM). Geometric fallback: the splash is taller than
        // its card, so the card's role icon sits ~100 px above the image centre, not next to it.
        let role: Role | undefined = img.role ? ROLE_ALT[img.role] : undefined;
        if (!role) {
          const icon = roleIcons.filter(r => side(r.x) === s && r.y < img.y).sort((a, b) => b.y - a.y)[0];
          role = icon && img.y - icon.y < 150 ? ROLE_ALT[icon.alt] : ROLES[order];
        }
        const slug = /\/splashes\/([^./]+)\./.exec(img.src)?.[1] ?? '';
        const label = img.label ?? undefined;
        let id = dd.champId(undefined, slug);
        if (norm(id) !== norm(slug) && label) id = dd.champId(undefined, label);
        if (!/[A-Z]/.test(id)) id = id.charAt(0).toUpperCase() + id.slice(1);
        const slot = ROLES.indexOf(role);
        if (slot >= 0 && !picks[slot]) picks[slot] = { role, champion: id, championName: label ?? dd.champName(id) };
      });

    const bans: (string | null)[] = page.images
      .filter(i => i.alt === 'ban' && side(i.x) === s)
      .sort((a, b) => a.x - b.x)
      .map(i => fromKey(i.src));
    while (bans.length < 5) bans.push(null);

    // team name: text in the upper inner area on this side (not a role/champion label)
    const firstPickY = Math.min(...page.images.filter(i => i.alt === 'pick').map(i => i.y), 9999);
    const name = page.texts
      .filter(t => side(t.x) === s && t.y < firstPickY + 60 && !knownTexts.has(t.t) && !/^Game \d/.test(t.t)
        && Math.abs(t.x - mid) < page.width * 0.35 && Math.abs(t.x - mid) > 40)
      .sort((a, b) => a.y - b.y)[0]?.t ?? (s === 'blue' ? 'Blue side' : 'Red side');

    return { name, side: s, picks, bans: bans.slice(0, 5) };
  };

  const blue = team('blue');
  const red = team('red');

  // Fearless: small champion icons (not bans), grouped into rows = earlier games
  const used = page.images.filter(i => i.alt !== 'ban' && i.alt !== 'pick' && /\/champions\/\d+\.png/.test(i.src) && i.w < 80);
  const rows: RawImage[][] = [];
  for (const img of used.sort((a, b) => a.y - b.y)) {
    const row = rows.find(r => Math.abs(r[0].y - img.y) < 12);
    if (row) row.push(img); else rows.push([img]);
  }

  const aIsBlue = teamAIsBlue(match, blue.name, red.name);
  const fearless = rows.map(r => {
    const ids = (s: 'blue' | 'red') => r.filter(i => side(i.x) === s).sort((a, b) => a.x - b.x).map(i => fromKey(i.src) ?? i.alt).filter(Boolean) as string[];
    return aIsBlue ? { a: ids('blue'), b: ids('red') } : { a: ids('red'), b: ids('blue') };
  });

  return { game, a: aIsBlue ? blue : red, b: aIsBlue ? red : blue, fearless };
}

/** Matches drafter.lol team names to our teams; team A is blue unless the names say otherwise. */
export function teamAIsBlue(match: MatchConfig, blueName: string, redName: string): boolean {
  const hit = (draftName: string, k: TeamKey) => {
    const t = k === 'A' ? match.teamA : match.teamB;
    const n = norm(draftName);
    return !!n && [t.name, t.tag].some(x => norm(x).length >= 2 && (n.includes(norm(x)) || norm(x).includes(n)));
  };
  if (hit(blueName, 'A')) return true;
  if (hit(redName, 'A')) return false;
  if (hit(blueName, 'B')) return false;
  return true;
}

/** Normalizes a pasted drafter.lol link: stream view of the requested game. */
export function draftStreamUrl(link: string, game: number): string | null {
  try {
    const u = new URL(link.trim());
    if (!/(^|\.)drafter\.lol$/.test(u.hostname) || !u.pathname.startsWith('/draft/')) return null;
    u.searchParams.set('game', String(game));
    u.searchParams.set('stream', 'true');
    u.searchParams.delete('team');   // never act as a team captain
    return u.toString();
  } catch {
    return null;
  }
}

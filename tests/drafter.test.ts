import { describe, expect, it } from 'vitest';
import { draftStreamUrl, parseDraftPage, type RawPage } from '../server/drafter/parse.ts';
import { defaultMatch } from '../shared/defaults.ts';

// Minimal champion table (id, key, name) for the champions in the fixture
const CHAMPS: [string, number, string][] = [
  ['Ornn', 516, 'Ornn'], ['Syndra', 134, 'Syndra'], ['Yunara', 804, 'Yunara'], ['Maokai', 57, 'Maokai'], ['Nami', 267, 'Nami'],
  ['Ambessa', 799, 'Ambessa'], ['Chogath', 31, "Cho'Gath"], ['Lux', 99, 'Lux'], ['Tristana', 18, 'Tristana'], ['Lulu', 117, 'Lulu'],
  ['Jinx', 222, 'Jinx'], ['Sion', 14, 'Sion'], ['Sivir', 15, 'Sivir'], ['Lucian', 236, 'Lucian'], ['Rumble', 68, 'Rumble'],
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dd = {
  champId: (_raw: string | undefined, name: string) => CHAMPS.find(c => norm(c[0]) === norm(name) || norm(c[2]) === norm(name))?.[0] ?? name,
  champName: (id: string) => CHAMPS.find(c => c[0] === id)?.[2] ?? id,
  champFromKey: (key: number) => { const c = CHAMPS.find(x => x[1] === key); return c ? { id: c[0], name: c[2] } : null; },
};

// Positions as measured on the drafter.lol stream view (1920 wide), game 2 of a series
const ROLES = ['Top', 'Jungle', 'Mid', 'Bottom', 'Support'];
const LABEL: Record<string, string> = { chogath: "Cho'Gath" };
function fixture(bluePicks: (string | null)[], withDom = true): RawPage {
  // real geometry: the splash centre sits ~103 px below its card's role icon (closer to the next card's icon)
  const pick = (slug: string | null, i: number, right: boolean) =>
    slug ? [{
      alt: 'pick', src: `/game/splashes/${slug}.jpg`, x: right ? 1670 : 250, y: 208 + i * 160, w: 573,
      ...(withDom ? { role: ROLES[i], label: LABEL[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1) } : {}),
    }] : [];
  const role = (i: number, right: boolean) => ({ alt: ROLES[i], src: '/roleicons/x.svg', x: right ? 1856 : 42, y: 105 + i * 160, w: 14 });
  return {
    width: 1920,
    images: [
      ...bluePicks.flatMap((s, i) => [role(i, false), ...pick(s, i, false)]),
      ...['ambessa', 'chogath', 'lux', 'tristana', 'lulu'].flatMap((s, i) => [role(i, true), ...pick(s, i, true)]),
      ...[222, 14].map((k, i) => ({ alt: k === 222 ? 'Jinx' : 'Sion', src: `https://drafter.lol/game/champions/${k}.png`, x: 556 + i * 62, y: 843, w: 54 })),
      ...[15].map(k => ({ alt: 'Sivir', src: `https://drafter.lol/game/champions/${k}.png`, x: 1116, y: 843, w: 54 })),
      ...[236, 68].map((k, i) => ({ alt: 'ban', src: `/game/champions/${k}.png`, x: 68 + i * 100, y: 943, w: 94 })),
      { alt: 'ban', src: '/game/champions/14.png', x: 1440, y: 943, w: 94 },
    ],
    texts: [
      { t: 'SaarGaming', x: 470, y: 80 }, { t: 'Salties Legion', x: 1460, y: 80 }, { t: 'Game 1', x: 960, y: 600 },
      ...['Ornn', 'Syndra', 'Yunara', 'Maokai', 'Nami'].map((t, i) => ({ t, x: 60, y: 160 + i * 160 })),
      ...['Ambessa', "Cho'Gath", 'Lux', 'Tristana', 'Lulu'].map((t, i) => ({ t, x: 1860, y: 160 + i * 160 })),
    ],
  };
}

describe('drafter.lol stream view parser', () => {
  const match = { ...defaultMatch(), teamB: { name: 'Salties Legion', tag: 'SAL', logo: null, color: '#e5484d' } };

  it('reads picks by role, bans, team names and Fearless rows', () => {
    const d = parseDraftPage(fixture(['ornn', 'syndra', 'yunara', 'maokai', 'nami']), dd, match, 2);
    expect(d.a?.name).toBe('SaarGaming');
    expect(d.a?.side).toBe('blue');
    expect(d.a?.picks.map(p => p?.champion)).toEqual(['Ornn', 'Syndra', 'Yunara', 'Maokai', 'Nami']);
    expect(d.b?.picks[1]).toMatchObject({ role: 'JGL', champion: 'Chogath', championName: "Cho'Gath" });
    expect(d.a?.bans).toEqual(['Lucian', 'Rumble', null, null, null]);
    expect(d.b?.bans[0]).toBe('Sion');
    expect(d.fearless).toEqual([{ a: ['Jinx', 'Sion'], b: ['Sivir'] }]);
  });

  it('keeps open pick slots empty during the draft', () => {
    const d = parseDraftPage(fixture(['ornn', null, 'yunara', null, null]), dd, match, 2);
    expect(d.a?.picks.map(p => p?.champion ?? null)).toEqual(['Ornn', null, 'Yunara', null, null]);
  });

  it('falls back to geometry when the card structure is unknown', () => {
    const d = parseDraftPage(fixture(['ornn', null, 'yunara', 'maokai', null], false), dd, match, 2);
    expect(d.a?.picks.map(p => p?.champion ?? null)).toEqual(['Ornn', null, 'Yunara', 'Maokai', null]);
  });

  it('puts SaarGaming on the right when it is the red side on drafter.lol', () => {
    const m = { ...match, teamB: { ...match.teamB, name: 'Other' } };
    const page = fixture(['ornn', 'syndra', 'yunara', 'maokai', 'nami']);
    page.texts[0].t = 'Salties Legion';
    page.texts[1].t = 'SaarGaming';
    const d = parseDraftPage(page, dd, m, 2);
    expect(d.a?.side).toBe('red');
    expect(d.a?.picks[0]?.champion).toBe('Ambessa');
  });

  it('builds the stream URL for the current game and never joins as a team', () => {
    expect(draftStreamUrl('https://drafter.lol/draft/o0N-kdyF?game=1&team=blue', 3))
      .toBe('https://drafter.lol/draft/o0N-kdyF?game=3&stream=true');
    expect(draftStreamUrl('https://example.com/draft/x', 1)).toBeNull();
  });
});

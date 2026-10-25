/** Normalizes a pasted drafter.lol link to the transparent stream view of the requested game. */
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

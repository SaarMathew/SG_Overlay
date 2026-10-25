// Data Dragon image URLs (version comes from the backend status topic)
const CDN = 'https://ddragon.leagueoflegends.com/cdn';

export const champIcon = (v: string, id: string) => `${CDN}/${v}/img/champion/${id}.png`;
export const champLoading = (id: string) => `${CDN}/img/champion/loading/${id}_0.jpg`;
export const champSplash = (id: string) => `${CDN}/img/champion/splash/${id}_0.jpg`;
export const itemIcon = (v: string, id: number) => `${CDN}/${v}/img/item/${id}.png`;
export const spellIcon = (v: string, id: string) => `${CDN}/${v}/img/spell/${id}.png`;

// Ground truth of the score bar in frames t<seconds>.png of a real replay (read by eye from the full frames).
// Counters: order bar = dragons, barons, grubs, towers (outside -> centre); chaos bar mirrored.
// Evidence for the mapping: dragons = the number of dragon icons below the bar; grubs = 3 from t600 (grubs spawn 5:00)
// for the team that took them; towers = TurretKilled events (order 2 at t1500 after 1382/1483, 3 at t2100 after 1902;
// chaos 2 at t1200 ... 5 at t2100 after 2078); barons = icon changes shape at 20:00 (spawn), chaos 1 at t2100 and 2
// at t2350 after the Baron stolen at 2340. Herald has no counter on the bar.
export interface FrameLabel {
  order: { dragons: number; barons: number; grubs: number; towers: number };
  chaos: { dragons: number; barons: number; grubs: number; towers: number };
  goldOrder: string; goldChaos: string;
  /** dragon icon types, first taken first */
  iconsOrder: string[]; iconsChaos: string[];
}
const o = (dragons: number, barons: number, grubs: number, towers: number) => ({ dragons, barons, grubs, towers });
export const FRAME_LABELS: Record<number, FrameLabel> = {
  300: { order: o(0, 0, 0, 0), chaos: o(0, 0, 0, 0), goldOrder: '8.2k', goldChaos: '8.0k', iconsOrder: [], iconsChaos: [] },
  540: { order: o(1, 0, 0, 0), chaos: o(0, 0, 0, 0), goldOrder: '15.3k', goldChaos: '13.9k', iconsOrder: ['cloud'], iconsChaos: [] },
  600: { order: o(1, 0, 3, 0), chaos: o(0, 0, 0, 0), goldOrder: '16.6k', goldChaos: '15.7k', iconsOrder: ['cloud'], iconsChaos: [] },
  900: { order: o(2, 0, 3, 0), chaos: o(0, 0, 0, 0), goldOrder: '25.1k', goldChaos: '24.4k', iconsOrder: ['cloud', 'mountain'], iconsChaos: [] },
  1200: { order: o(3, 0, 3, 0), chaos: o(0, 0, 0, 2), goldOrder: '31.9k', goldChaos: '36.2k', iconsOrder: ['cloud', 'mountain', 'infernal'], iconsChaos: [] },
  1500: { order: o(3, 0, 3, 2), chaos: o(1, 0, 0, 3), goldOrder: '42.6k', goldChaos: '45.1k', iconsOrder: ['cloud', 'mountain', 'infernal'], iconsChaos: ['infernal'] },
  1800: { order: o(3, 0, 3, 2), chaos: o(2, 0, 0, 3), goldOrder: '52.9k', goldChaos: '55.0k', iconsOrder: ['cloud', 'mountain', 'infernal'], iconsChaos: ['infernal', 'infernal'] },
  2100: { order: o(3, 0, 3, 3), chaos: o(3, 1, 0, 5), goldOrder: '61.8k', goldChaos: '68.2k', iconsOrder: ['cloud', 'mountain', 'infernal'], iconsChaos: ['infernal', 'infernal', 'infernal'] },
  2350: { order: o(3, 0, 3, 3), chaos: o(3, 2, 0, 7), goldOrder: '71.9k', goldChaos: '77.4k', iconsOrder: ['cloud', 'mountain', 'infernal'], iconsChaos: ['infernal', 'infernal', 'infernal'] },
  2440: { order: o(3, 0, 3, 3), chaos: o(3, 2, 0, 8), goldOrder: '73.8k', goldChaos: '81.3k', iconsOrder: ['cloud', 'mountain', 'infernal'], iconsChaos: ['infernal', 'infernal', 'infernal'] },
};

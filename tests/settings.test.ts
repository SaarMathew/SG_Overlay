import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, diffSettings } from '../server/config.ts';

describe('settings persistence', () => {
  it('stores only changed values', () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    s.obs.password = 'secret';
    s.sceneNames.postgame = 'Postgame';
    expect(diffSettings(s, DEFAULT_SETTINGS)).toEqual({ obs: { password: 'secret' }, sceneNames: { postgame: 'Postgame' } });
  });
  it('stores nothing when everything is default', () => {
    expect(diffSettings(structuredClone(DEFAULT_SETTINGS), DEFAULT_SETTINGS)).toBeUndefined();
  });
  it('treats arrays as a whole (OCR regions)', () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    s.ocr.order[0].x = 650;
    expect(diffSettings(s, DEFAULT_SETTINGS)).toEqual({ ocr: { order: s.ocr.order } });
  });
});

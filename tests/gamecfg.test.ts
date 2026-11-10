import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enableReplayApi, replayApiConfig } from '../server/adapters/gamecfg.ts';

const run = (cfg: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cfg-'));
  fs.mkdirSync(path.join(dir, 'Config'));
  fs.writeFileSync(path.join(dir, 'Config', 'game.cfg'), cfg);
  enableReplayApi(dir);
  return { out: fs.readFileSync(path.join(dir, 'Config', 'game.cfg'), 'utf8'), state: replayApiConfig(dir) };
};

describe('enableReplayApi', () => {
  it('replaces an existing value without touching line breaks', () => {
    expect(run('[General]\r\nEnableReplayApi=0\r\nX=1\r\n')).toEqual({ out: '[General]\r\nEnableReplayApi=1\r\nX=1\r\n', state: 'enabled' });
  });
  it('adds the line under [General]', () => {
    expect(run('[General]\r\nX=1\r\n').out).toBe('[General]\r\nEnableReplayApi=1\r\nX=1\r\n');
    expect(run('[General]\nX=1\n').out).toBe('[General]\nEnableReplayApi=1\nX=1\n');
  });
  it('repairs a file broken by the old version', () => {
    expect(run('\r\n[General]\rEnableReplayApi=1\nX=0\r\n').out).toBe('\r\n[General]\r\nEnableReplayApi=1\nX=0\r\n');
  });
});

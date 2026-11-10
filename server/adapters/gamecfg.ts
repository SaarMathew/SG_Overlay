import fs from 'node:fs';
import path from 'node:path';

/** The Replay API (needed to hide Riot HUD elements) must be enabled in Config/game.cfg. */
export function replayApiConfig(leagueDir: string): 'enabled' | 'disabled' | 'missing' {
  try {
    const cfg = fs.readFileSync(path.join(leagueDir, 'Config', 'game.cfg'), 'utf8');
    return /^\s*EnableReplayApi\s*=\s*1\s*$/m.test(cfg) ? 'enabled' : 'disabled';
  } catch {
    return 'missing';
  }
}

/** Sets EnableReplayApi=1 in the [General] section; keeps a backup next to the file. */
export function enableReplayApi(leagueDir: string): void {
  const file = path.join(leagueDir, 'Config', 'game.cfg');
  // also repairs files broken by an older version that glued the line to "[General]\r"
  const cfg = fs.readFileSync(file, 'utf8').replace(/\[General\]\r(?!\n)/, '[General]\r\n');
  fs.writeFileSync(file + '.sg-backup', cfg);
  const eol = cfg.includes('\r\n') ? '\r\n' : '\n';
  let out: string;
  // [ \t] instead of \s: \s would also swallow the line break (game.cfg uses CRLF, and ^/$ match at a lone \r)
  const line = /^[ \t]*EnableReplayApi[ \t]*=[^\r\n]*/m;
  if (line.test(cfg)) out = cfg.replace(line, 'EnableReplayApi=1');
  else if (/^\[General\][ \t]*\r?$/m.test(cfg)) out = cfg.replace(/^\[General\][ \t]*(?=\r?\n)/m, m => `${m}${eol}EnableReplayApi=1`);
  else out = `[General]${eol}EnableReplayApi=1${eol}${cfg}`;
  fs.writeFileSync(file, out);
}

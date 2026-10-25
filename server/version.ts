import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Version of this checkout: the git commit (plus "+changes" for uncommitted edits), or version.txt in the
 * packaged release (written by scripts/package.mjs), or package.json's version. Server and admin page both
 * show it, so a stale browser page or an old server window after "git pull" is visible at once.
 */
export function appVersion(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `${sha}+changes` : sha;
  } catch { /* no git (packaged release) */ }
  try {
    return fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8').trim();
  } catch { /* not packaged */ }
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version as string;
}

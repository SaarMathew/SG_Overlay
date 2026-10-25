// Builds a portable Windows package: release/SG-Overlay.zip
// Contains the built overlays, the server sources, production dependencies and a copy of node.exe,
// so the observer PC needs nothing installed. Usage: npm run package
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// staging folder is separate from release/ so an unpacked copy that is still running there does not block the build
const out = path.join(root, 'build', 'SG-Overlay');
const zip = path.join(root, 'release', 'SG-Overlay.zip');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('> building overlays');
run('npx vite build');

console.log('> collecting files');
// keep data (logs, recordings, settings) of test runs started from an unpacked copy
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
for (const dir of [out, path.join(root, 'release', 'SG-Overlay')]) {
  const data = path.join(dir, 'data');
  if (fs.existsSync(data)) fs.cpSync(data, path.join(root, 'test-runs', `${stamp}-${path.basename(path.dirname(dir))}`), { recursive: true });
}
// empty the staging folder instead of deleting it: a console window opened there would block the delete
fs.mkdirSync(out, { recursive: true });
for (const entry of fs.readdirSync(out)) fs.rmSync(path.join(out, entry), { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(path.dirname(zip), { recursive: true });
for (const p of ['dist', 'server', 'shared', 'config', 'package.json', 'package-lock.json', 'README.md', 'DESIGN.md']) {
  fs.cpSync(path.join(root, p), path.join(out, p), { recursive: true });
}

console.log('> installing production dependencies');
run('npm ci --omit=dev --no-audit --no-fund', out);

console.log('> bundling node.exe');
fs.mkdirSync(path.join(out, 'node'));
fs.copyFileSync(process.execPath, path.join(out, 'node', 'node.exe'));

fs.writeFileSync(path.join(out, 'start.bat'), [
  '@echo off',
  'rem SaarGaming broadcast overlay - double click to start.',
  'rem Options: start.bat --record   (records the game for later analysis)',
  'cd /d "%~dp0"',
  'rem Unpack to a short path (e.g. C:\\SG-Overlay): very long paths break the global hotkeys (Windows path limit).',
  'start "" http://127.0.0.1:3210/admin/',
  'node\\node.exe node_modules\\tsx\\dist\\cli.mjs server\\main.ts %*',
  'pause',
  '',
].join('\r\n'));
fs.writeFileSync(path.join(out, 'start-with-recording.bat'), '@echo off\r\ncall "%~dp0start.bat" --record\r\n');

console.log('> zipping');
run(`powershell -NoProfile -Command "Compress-Archive -Path '${out}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force"`);
console.log(`done: ${zip} (${(fs.statSync(zip).size / 1e6).toFixed(0)} MB)`);

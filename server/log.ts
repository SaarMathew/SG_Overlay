import fs from 'node:fs';
import path from 'node:path';

const ts = () => new Date().toTimeString().slice(0, 8);

// Also written to data/logs/<date>.log so a test session on another PC can be analysed afterwards
const dir = path.resolve(import.meta.dirname, '..', 'data', 'logs');
let file: fs.WriteStream | null = null;
try {
  fs.mkdirSync(dir, { recursive: true });
  file = fs.createWriteStream(path.join(dir, `${new Date().toISOString().slice(0, 10)}.log`), { flags: 'a' });
} catch { /* console only */ }

const write = (line: string, out: (s: string) => void) => {
  out(line);
  file?.write(line + '\n');
};

export const log = {
  info: (scope: string, msg: string) => write(`${ts()} [${scope}] ${msg}`, console.log),
  warn: (scope: string, msg: string) => write(`${ts()} [${scope}] WARN ${msg}`, console.warn),
  error: (scope: string, msg: string) => write(`${ts()} [${scope}] ERROR ${msg}`, console.error),
};

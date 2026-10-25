import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { AppState, Topic } from '../../shared/types.ts';
import { defaultState } from '../../shared/defaults.ts';

/** Topics written to disk so a restart keeps match setup, series score and Fearless list. */
const PERSISTED: Topic[] = ['match', 'series', 'ui'];

export class Store extends EventEmitter {
  state: AppState = defaultState();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private file: string) {
    super();
    this.load();
  }

  get<T extends Topic>(topic: T): AppState[T] {
    return this.state[topic];
  }

  /** Replace or mutate a topic; listeners get the new value. */
  update<T extends Topic>(topic: T, fn: (draft: AppState[T]) => AppState[T] | void): void {
    const res = fn(this.state[topic]);
    if (res !== undefined) this.state[topic] = res as AppState[T];
    this.emit('change', topic);
    if (PERSISTED.includes(topic)) this.scheduleSave();
  }

  set<T extends Topic>(topic: T, value: AppState[T]): void {
    this.update(topic, () => value);
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<AppState>;
      for (const t of PERSISTED) {
        if (raw[t]) this.state[t] = { ...this.state[t], ...raw[t] } as never;
      }
    } catch {
      // first start: defaults
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const data = Object.fromEntries(PERSISTED.map(t => [t, this.state[t]]));
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(data, null, 2));
      fs.renameSync(this.file + '.tmp', this.file);
    }, 500);
  }
}

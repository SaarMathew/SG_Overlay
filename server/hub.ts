import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Topic } from '../shared/types.ts';
import type { Store } from './state/store.ts';
import { log } from './log.ts';

const THROTTLE_MS = 100;

/**
 * WebSocket hub on /ws. A client subscribes to topics and immediately gets their full state,
 * then every change (throttled per topic). Actions from clients are forwarded to `onAction`.
 */
export class Hub {
  private wss: WebSocketServer;
  private subs = new Map<WebSocket, Set<Topic>>();
  private pending = new Map<Topic, NodeJS.Timeout>();

  constructor(server: Server, private store: Store, private onAction: (name: string, payload: unknown) => unknown) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', ws => this.connection(ws));
    store.on('change', (topic: Topic) => this.schedule(topic));
  }

  private connection(ws: WebSocket): void {
    this.subs.set(ws, new Set());
    ws.on('close', () => this.subs.delete(ws));
    ws.on('message', raw => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }
      if (msg.type === 'subscribe') {
        const set = this.subs.get(ws)!;
        for (const t of msg.topics) {
          set.add(t);
          this.send(ws, { type: 'state', topic: t, data: this.store.get(t) });
        }
      } else if (msg.type === 'action') {
        try {
          void Promise.resolve(this.onAction(msg.name, msg.payload)).catch(e => this.send(ws, { type: 'error', message: String(e) }));
        } catch (e) {
          log.warn('hub', (e as Error).message);
          this.send(ws, { type: 'error', message: (e as Error).message });
        }
      }
    });
  }

  private schedule(topic: Topic): void {
    if (this.pending.has(topic)) return;
    this.pending.set(topic, setTimeout(() => {
      this.pending.delete(topic);
      const msg = JSON.stringify({ type: 'state', topic, data: this.store.get(topic) } satisfies ServerMessage);
      for (const [ws, topics] of this.subs) if (topics.has(topic) && ws.readyState === ws.OPEN) ws.send(msg);
    }, THROTTLE_MS));
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}

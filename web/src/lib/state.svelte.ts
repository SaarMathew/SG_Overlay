import type { AppState, ClientMessage, ServerMessage, Topic } from '../../../shared/types.ts';

type Partial_<T> = { [K in keyof T]: T[K] | null };

/** Reactive app state from the backend; reconnects with backoff and resubscribes after any drop or refresh. */
export function connect(topics: Topic[]) {
  const state = $state<Partial_<AppState> & { connected: boolean; error: string }>({
    match: null, series: null, draft: null, lineup: null, ingame: null, postgame: null, ui: null, status: null,
    connected: false, error: '',
  });
  let ws: WebSocket | null = null;
  let attempt = 0;

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      attempt = 0;
      state.connected = true;
      ws!.send(JSON.stringify({ type: 'subscribe', topics } satisfies ClientMessage));
    };
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === 'state') (state as Record<string, unknown>)[msg.topic] = msg.data;
      else {
        console.warn('[sg]', msg.message);
        state.error = msg.message;
        setTimeout(() => { if (state.error === msg.message) state.error = ''; }, 6000);
      }
    };
    ws.onclose = () => {
      state.connected = false;
      const delay = [1000, 2000, 5000][Math.min(attempt++, 2)];
      setTimeout(open, delay);
    };
  };
  open();

  // Actions are only sent while connected: replaying clicks made during an outage would fire
  // scene switches etc. all at once when the backend comes back.
  const action = (name: string, payload?: unknown) => {
    const msg: ClientMessage = { type: 'action', name, payload };
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else console.warn('[sg] backend offline, action dropped:', name);
  };

  return { state, action };
}

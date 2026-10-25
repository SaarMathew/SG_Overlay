import https from 'node:https';

/** Riot's local APIs use self-signed certificates on 127.0.0.1, so certificate checks are off here only. */
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export function localRequest<T>(
  url: string,
  opts: { method?: string; auth?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve, reject) => {
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = https.request(url, {
      method: opts.method ?? 'GET',
      agent,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(opts.auth ? { Authorization: `Basic ${Buffer.from(opts.auth).toString('base64')}` } : {}),
      },
      timeout: opts.timeoutMs ?? 2000,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data: T | null = null;
        try { data = text ? (JSON.parse(text) as T) : null; } catch { /* not json */ }
        resolve({ status: res.statusCode ?? 0, data });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

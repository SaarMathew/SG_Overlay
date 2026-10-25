import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { DATA_DIR, WEB_DIST, saveSettings, type Settings } from './config.ts';
import type { Store } from './state/store.ts';
import type { GoldOcr } from './ocr/reader.ts';

export interface HttpDeps {
  store: Store;
  settings: () => Settings;
  setSettings: (s: Settings) => void;
  ocr: GoldOcr | null;
  action: (name: string, payload: unknown) => unknown;
}

const LOGO_DIR = path.join(DATA_DIR, 'logos');
const LOGO_TYPES: Record<string, string> = { 'image/png': '.png', 'image/svg+xml': '.svg', 'image/webp': '.webp', 'image/jpeg': '.jpg' };

export async function createHttp(deps: HttpDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  fs.mkdirSync(LOGO_DIR, { recursive: true });

  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: '/', redirect: true, cacheControl: false });
  await app.register(fastifyStatic, { root: LOGO_DIR, prefix: '/data/logos/', decorateReply: false });

  app.get('/', (_req, reply) => reply.redirect('/admin/'));

  // Overlay URLs from DESIGN.md: /overlay/<scene> -> built page
  app.get<{ Params: { scene: string } }>('/overlay/:scene', (req, reply) => reply.redirect(`/overlay/${req.params.scene}/`));

  app.get('/api/state', () => deps.store.state);

  /** Stream Deck / scripts: POST /api/action/ui:h2h {"lane":"TOP"} */
  app.post<{ Params: { name: string }; Body: unknown }>('/api/action/:name', async (req, reply) => {
    try {
      await deps.action(req.params.name, req.body ?? undefined);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/logo', async (req, reply) => {
    const file = await req.file();
    const ext = file && LOGO_TYPES[file.mimetype];
    if (!file || !ext) return reply.code(400).send({ error: 'PNG, SVG, WebP or JPG expected' });
    const name = crypto.randomBytes(6).toString('hex') + ext;
    fs.writeFileSync(path.join(LOGO_DIR, name), await file.toBuffer());
    return { url: `/data/logos/${name}` };
  });

  app.get('/api/settings', () => deps.settings());
  app.put<{ Body: Settings }>('/api/settings', req => {
    saveSettings(req.body);
    deps.setSettings(req.body);
    return { ok: true };
  });

  app.get('/api/ocr/preview', async (_req, reply) => {
    const res = await deps.ocr?.preview();
    if (!res) return reply.code(503).send({ error: 'No OBS screenshot available (OBS connected? game capture source name?)' });
    return { ...res, templates: Object.keys(deps.ocr!.templates.chars).sort().join('') };
  });

  app.post<{ Body: { frameId: number; side: 'order' | 'chaos'; row: number; label: string } }>('/api/ocr/learn', async (req, reply) => {
    const ok = deps.ocr?.learnRow(req.body.frameId, req.body.side, req.body.row, req.body.label);
    if (!ok) return reply.code(400).send({ error: 'Glyph count does not match the label – type exactly what the crop shows' });
    return { ok: true };
  });

  app.post('/api/ocr/reset', () => {
    deps.ocr?.resetLearned();
    return { ok: true };
  });

  return app;
}

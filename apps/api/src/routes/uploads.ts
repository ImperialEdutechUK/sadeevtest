import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { getStorage } from '../providers/storage/index.js';
import { LocalStorageProvider } from '../providers/storage/local.js';

/**
 * Only used when STORAGE_PROVIDER=local: the API itself accepts the PUT and
 * serves downloads via signed links (S3 does this natively in production).
 */
export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  const cfg = loadConfig();
  if (cfg.STORAGE_PROVIDER !== 'local') return;
  const storage = getStorage() as LocalStorageProvider;

  // Inside this encapsulated plugin, every content type is read as raw bytes.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 4 * 1024 * 1024 * 1024 }, (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
    done(null, body);
  });

  const query = z.object({ key: z.string().min(1), exp: z.coerce.number(), sig: z.string().min(1), name: z.string().optional() });

  app.put('/uploads/put', { schema: { hide: true, querystring: query }, bodyLimit: 4 * 1024 * 1024 * 1024 }, async (req) => {
    const { key, exp, sig } = req.query;
    if (!storage.verify(key, 'put', exp, sig)) throw new ForbiddenError('Upload link is invalid or has expired');
    const body = req.body as Buffer | undefined;
    await storage.write(key, Buffer.isBuffer(body) ? body : Buffer.alloc(0), req.headers['content-type'] ?? 'application/octet-stream');
    return { ok: true };
  });

  app.get('/uploads/get', { schema: { hide: true, querystring: query } }, async (req, reply) => {
    const { key, exp, sig, name } = req.query;
    if (!storage.verify(key, 'get', exp, sig)) throw new ForbiddenError('Download link is invalid or has expired');
    const file = storage.pathFor(key);
    try {
      await fs.access(file);
    } catch {
      throw new NotFoundError('File');
    }
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(name ?? path.basename(file))}"`);
    return reply.send(createReadStream(file));
  });
};

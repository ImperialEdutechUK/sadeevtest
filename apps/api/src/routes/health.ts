import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { prisma } from '../db.js';
import { loadConfig } from '../config.js';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', { schema: { tags: ['System'] } }, async (_req, reply) => {
    const cfg = loadConfig();
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
      reply.code(503);
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, version: process.env.npm_package_version ?? '1.0.0', providers: { storage: cfg.STORAGE_PROVIDER, transcription: cfg.TRANSCRIPTION_PROVIDER, llm: cfg.LLM_PROVIDER, email: cfg.EMAIL_PROVIDER } };
  });
};

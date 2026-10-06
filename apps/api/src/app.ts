import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError, jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { AppError } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = loadConfig();
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 10 * 1024 * 1024,
    disableRequestLogging: cfg.NODE_ENV === 'production',
  });

  // Accept an empty body on JSON requests (e.g. POST /submit sent without a payload).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body: string, done: (err: Error | null, body?: unknown) => void) => {
    if (!body || !body.trim()) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      e.statusCode = 400;
      done(e, undefined);
    }
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin (no Origin header), the configured web origin, and localhost dev ports.
      if (!origin || origin === cfg.WEB_ORIGIN || (cfg.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie, { secret: cfg.COOKIE_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', allowList: (req) => req.url.startsWith('/api/health') });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Meeting Review API', description: 'AI-assisted quality review of tutor-learner meetings.', version: '1.0.0' },
      servers: [{ url: cfg.API_PUBLIC_URL }],
      tags: [{ name: 'Auth' }, { name: 'Users' }, { name: 'Criteria' }, { name: 'Meetings' }, { name: 'Dashboard' }, { name: 'KPIs' }, { name: 'Competitions' }, { name: 'Appraisals' }, { name: 'System' }],
    },
    transform: jsonSchemaTransform,
  });
  if (cfg.NODE_ENV !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }

  await app.register(authPlugin);

  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => ({ path: v.instancePath.replace(/^\//, '').replace(/\//g, '.'), message: v.message }));
      return reply.code(400).send({ error: 'VALIDATION', message: issues[0]?.message ? `${issues[0].path ? `${issues[0].path}: ` : ''}${issues[0].message}` : 'Please check the form and try again', issues });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response serialization failed');
      return reply.code(500).send({ error: 'SERIALIZATION', message: 'The server produced an unexpected response' });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message, details: error.details ?? undefined });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: 'REQUEST_ERROR', message: error.message });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` });
  });

  await registerRoutes(app);
  return app;
}

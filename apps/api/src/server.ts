import { execSync } from 'node:child_process';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { buildApp } from './app.js';
import { prisma } from './db.js';
import { startWorkers } from './jobs/handlers.js';
import { stopJobQueue } from './jobs/queue.js';
import { ensurePresetRubrics } from './services/rubrics.service.js';

async function main() {
  const cfg = loadConfig();

  if (cfg.RUN_MIGRATIONS_ON_START) {
    logger.info('applying database migrations');
    execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  }

  await prisma.$connect();
  await ensurePresetRubrics(null);

  const app = await buildApp();
  if (cfg.RUN_WORKER_IN_API && cfg.JOB_QUEUE === 'pgboss') await startWorkers();

  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  logger.info({ port: cfg.PORT, env: cfg.NODE_ENV, storage: cfg.STORAGE_PROVIDER, transcription: cfg.TRANSCRIPTION_PROVIDER, llm: cfg.LLM_PROVIDER, jobs: cfg.JOB_QUEUE }, 'Meeting Review API ready');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await stopJobQueue();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});

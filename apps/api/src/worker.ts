/** Standalone background worker (use when RUN_WORKER_IN_API=false to scale processing separately). */
import { logger } from './logger.js';
import { prisma } from './db.js';
import { startWorkers } from './jobs/handlers.js';
import { stopJobQueue } from './jobs/queue.js';

async function main() {
  await prisma.$connect();
  await startWorkers();
  logger.info('Meeting Review worker ready');
  const shutdown = async () => {
    await stopJobQueue();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});

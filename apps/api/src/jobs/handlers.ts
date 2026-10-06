import type { Job, PgBoss } from 'pg-boss';
import { logger } from '../logger.js';
import { dispatchJob } from './dispatch.js';
import { getBoss, JOBS } from './queue.js';

/** Register the pg-boss workers (containers / VMs). The SQS Lambda consumer lives in src/lambda/worker.ts. */
export async function startWorkers(): Promise<PgBoss> {
  const boss = await getBoss();
  for (const name of Object.values(JOBS)) {
    await boss.work(name, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]: Job<object>[]) => {
      await dispatchJob(name, job.data);
    });
  }
  // Nightly at 02:30 UTC.
  await boss.schedule(JOBS.RETENTION_SWEEP, '30 2 * * *', {}, { tz: 'UTC' }).catch((err: unknown) => logger.warn({ err }, 'could not schedule retention sweep'));
  logger.info('background workers started');
  return boss;
}

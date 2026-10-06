import { PgBoss } from 'pg-boss';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { SqsJobQueue } from './sqs.js';

/**
 * Background jobs. Two transports share one interface:
 *  - pg-boss: a PostgreSQL-backed queue polled by a long-running process (containers, VMs)
 *  - SQS: messages consumed by a Lambda function (the pay-per-request "cents" deployment)
 */
export const JOBS = {
  PROCESS_MEETING: 'meeting.process',
  TRANSCRIBE_POLL: 'meeting.transcribe.poll',
  ANALYSE: 'meeting.analyse',
  APPRAISAL_GENERATE: 'appraisal.generate',
  RETENTION_SWEEP: 'maintenance.retention',
} as const;
export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface ProcessMeetingJob {
  meetingId: string;
  triggeredBy: string | null;
}
export interface TranscribePollJob {
  meetingId: string;
  jobName: string;
  attempts: number;
  triggeredBy: string | null;
}
export interface AnalyseJob {
  meetingId: string;
  triggeredBy: string | null;
}
export interface AppraisalJob {
  appraisalId: string;
  triggeredBy: string | null;
}

export interface EnqueueOptions {
  /** Seconds to wait before the job becomes available. */
  delaySeconds?: number;
  /** De-duplication key (pg-boss singletonKey; informational for SQS). */
  singletonKey?: string;
  retryLimit?: number;
  expireInSeconds?: number;
}

export interface JobQueue {
  readonly name: 'pgboss' | 'sqs';
  enqueue(job: JobName, data: object, opts?: EnqueueOptions): Promise<void>;
  stop(): Promise<void>;
}

/* ---------------- pg-boss driver ---------------- */

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const cfg = loadConfig();
  const instance = new PgBoss({ connectionString: cfg.DATABASE_URL, schema: 'pgboss', max: 4 });
  instance.on('error', (err: unknown) => logger.error({ err }, 'pg-boss error'));
  await instance.start();
  for (const name of Object.values(JOBS)) await instance.createQueue(name).catch(() => undefined);
  boss = instance;
  return instance;
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 10_000 });
  boss = null;
}

class PgBossJobQueue implements JobQueue {
  readonly name = 'pgboss' as const;
  async enqueue(job: JobName, data: object, opts: EnqueueOptions = {}): Promise<void> {
    const b = await getBoss();
    await b.send(job, data, {
      retryLimit: opts.retryLimit ?? 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: opts.expireInSeconds ?? 60 * 60,
      ...(opts.delaySeconds ? { startAfter: opts.delaySeconds } : {}),
      ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}),
    });
  }
  async stop(): Promise<void> {
    await stopBoss();
  }
}

/* ---------------- selection ---------------- */

let queue: JobQueue | null = null;

export function getJobQueue(): JobQueue {
  if (queue) return queue;
  const cfg = loadConfig();
  queue = cfg.JOB_QUEUE === 'sqs' ? new SqsJobQueue({ queueUrl: cfg.SQS_QUEUE_URL, region: cfg.SQS_REGION }) : new PgBossJobQueue();
  return queue;
}

/** Test seam: replace the queue implementation. */
export function setJobQueue(q: JobQueue | null): void {
  queue = q;
}

export async function stopJobQueue(): Promise<void> {
  if (queue) await queue.stop();
  queue = null;
}

/* ---------------- typed helpers used by the services ---------------- */

export const enqueueProcessMeeting = (data: ProcessMeetingJob) => getJobQueue().enqueue(JOBS.PROCESS_MEETING, data, { singletonKey: `process:${data.meetingId}` });
export const enqueueTranscribePoll = (data: TranscribePollJob, delaySeconds: number) => getJobQueue().enqueue(JOBS.TRANSCRIBE_POLL, data, { delaySeconds });
export const enqueueAnalyse = (data: AnalyseJob) => getJobQueue().enqueue(JOBS.ANALYSE, data, { retryLimit: 1, expireInSeconds: 60 * 30 });
export const enqueueAppraisal = (data: AppraisalJob) => getJobQueue().enqueue(JOBS.APPRAISAL_GENERATE, data, { retryLimit: 1 });

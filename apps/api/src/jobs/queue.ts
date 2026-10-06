import { PgBoss } from 'pg-boss';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * Background jobs run on pg-boss (a PostgreSQL-backed queue), so the only
 * infrastructure needed is the database the app already has.
 */
export const JOBS = {
  PROCESS_MEETING: 'meeting.process',
  TRANSCRIBE_POLL: 'meeting.transcribe.poll',
  ANALYSE: 'meeting.analyse',
  APPRAISAL_GENERATE: 'appraisal.generate',
  RETENTION_SWEEP: 'maintenance.retention',
} as const;

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

const DEFAULT_OPTS = { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 * 60 };

export async function enqueueProcessMeeting(data: ProcessMeetingJob) {
  const b = await getBoss();
  return b.send(JOBS.PROCESS_MEETING, data, { ...DEFAULT_OPTS, singletonKey: `process:${data.meetingId}` });
}
export async function enqueueTranscribePoll(data: TranscribePollJob, delaySeconds: number) {
  const b = await getBoss();
  return b.send(JOBS.TRANSCRIBE_POLL, data, { ...DEFAULT_OPTS, startAfter: delaySeconds });
}
export async function enqueueAnalyse(data: AnalyseJob) {
  const b = await getBoss();
  return b.send(JOBS.ANALYSE, data, { ...DEFAULT_OPTS, retryLimit: 1, expireInSeconds: 60 * 30, singletonKey: `analyse:${data.meetingId}:${Date.now()}` });
}
export async function enqueueAppraisal(data: AppraisalJob) {
  const b = await getBoss();
  return b.send(JOBS.APPRAISAL_GENERATE, data, { ...DEFAULT_OPTS, retryLimit: 1 });
}

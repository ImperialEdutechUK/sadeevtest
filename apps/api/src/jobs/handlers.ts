import type { Job, PgBoss } from 'pg-boss';
import { logger } from '../logger.js';
import { runAnalysis } from '../services/analysis.service.js';
import { generateAppraisal } from '../services/appraisals.service.js';
import { runRetentionSweep } from '../services/retention.service.js';
import { failMeeting, pollTranscription, processMeeting } from '../services/pipeline.service.js';
import { getBoss, JOBS, type AnalyseJob, type AppraisalJob, type ProcessMeetingJob, type TranscribePollJob } from './queue.js';

/** Register all background workers. Called by the API process (RUN_WORKER_IN_API=true) or the standalone worker. */
export async function startWorkers(): Promise<PgBoss> {
  const boss = await getBoss();

  await boss.work<ProcessMeetingJob>(JOBS.PROCESS_MEETING, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]: Job<ProcessMeetingJob>[]) => {
    logger.info({ meetingId: job.data.meetingId }, 'processing meeting');
    try {
      await processMeeting(job.data.meetingId, job.data.triggeredBy);
    } catch (err) {
      logger.error({ err, meetingId: job.data.meetingId }, 'processing failed');
      await failMeeting(job.data.meetingId, (err as Error).message);
      throw err;
    }
  });

  await boss.work<TranscribePollJob>(JOBS.TRANSCRIBE_POLL, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]: Job<TranscribePollJob>[]) => {
    try {
      await pollTranscription(job.data);
    } catch (err) {
      logger.error({ err, meetingId: job.data.meetingId }, 'transcription polling failed');
      await failMeeting(job.data.meetingId, `Transcription error: ${(err as Error).message}`);
      throw err;
    }
  });

  await boss.work<AnalyseJob>(JOBS.ANALYSE, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]: Job<AnalyseJob>[]) => {
    logger.info({ meetingId: job.data.meetingId }, 'analysing meeting');
    await runAnalysis(job.data.meetingId, { triggeredBy: job.data.triggeredBy });
  });

  await boss.work<AppraisalJob>(JOBS.APPRAISAL_GENERATE, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]: Job<AppraisalJob>[]) => {
    await generateAppraisal(job.data.appraisalId, job.data.triggeredBy);
  });

  await boss.work(JOBS.RETENTION_SWEEP, { batchSize: 1 }, async () => {
    await runRetentionSweep();
  });
  // Nightly at 02:30 UTC.
  await boss.schedule(JOBS.RETENTION_SWEEP, '30 2 * * *', {}, { tz: 'UTC' }).catch((err: unknown) => logger.warn({ err }, 'could not schedule retention sweep'));

  logger.info('background workers started');
  return boss;
}

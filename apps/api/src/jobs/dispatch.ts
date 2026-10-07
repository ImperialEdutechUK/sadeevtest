import { logger } from '../logger.js';
import { runAnalysis } from '../services/analysis.service.js';
import { generateAppraisal } from '../services/appraisals.service.js';
import { failMeeting, pollTranscription, processMeeting } from '../services/pipeline.service.js';
import { runRetentionSweep } from '../services/retention.service.js';
import { JOBS, type AnalyseJob, type AppraisalJob, type JobName, type ProcessMeetingJob, type TranscribePollJob } from './queue.js';

/**
 * One place that maps a job name to its handler, shared by the pg-boss worker
 * and the SQS Lambda consumer so both transports behave identically.
 */
export async function dispatchJob(job: JobName, data: object): Promise<void> {
  switch (job) {
    case JOBS.PROCESS_MEETING: {
      const d = data as ProcessMeetingJob;
      logger.info({ meetingId: d.meetingId }, 'processing meeting');
      try {
        await processMeeting(d.meetingId, d.triggeredBy);
      } catch (err) {
        logger.error({ err, meetingId: d.meetingId }, 'processing failed');
        await failMeeting(d.meetingId, (err as Error).message);
        throw err;
      }
      return;
    }
    case JOBS.TRANSCRIBE_POLL: {
      const d = data as TranscribePollJob;
      try {
        await pollTranscription(d);
      } catch (err) {
        logger.error({ err, meetingId: d.meetingId }, 'transcription polling failed');
        await failMeeting(d.meetingId, `Transcription error: ${(err as Error).message}`);
        throw err;
      }
      return;
    }
    case JOBS.ANALYSE: {
      const d = data as AnalyseJob;
      logger.info({ meetingId: d.meetingId }, 'analysing meeting');
      await runAnalysis(d.meetingId, { triggeredBy: d.triggeredBy });
      return;
    }
    case JOBS.APPRAISAL_GENERATE: {
      const d = data as AppraisalJob;
      await generateAppraisal(d.appraisalId, d.triggeredBy);
      return;
    }
    case JOBS.RETENTION_SWEEP:
      await runRetentionSweep();
      return;
    default:
      throw new Error(`Unknown job: ${String(job)}`);
  }
}

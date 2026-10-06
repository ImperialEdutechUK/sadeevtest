/**
 * AWS Lambda entry point for background jobs delivered by SQS.
 * One record per invocation is recommended (batch size 1 in Terraform) so a
 * long transcription poll or analysis never blocks unrelated jobs; partial
 * batch failures are reported if a larger batch is configured.
 */
import type { Context, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { dispatchJob } from '../jobs/dispatch.js';
import { parseSqsJobMessage } from '../jobs/sqs.js';
import { logger } from '../logger.js';

export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  context.callbackWaitsForEmptyEventLoop = false;
  const failures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    try {
      const msg = parseSqsJobMessage(record.body);
      logger.info({ job: msg.job, messageId: record.messageId }, 'sqs job received');
      await dispatchJob(msg.job, msg.data);
    } catch (err) {
      logger.error({ err, messageId: record.messageId }, 'sqs job failed');
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
};

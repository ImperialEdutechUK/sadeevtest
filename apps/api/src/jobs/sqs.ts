import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { EnqueueOptions, JobName, JobQueue } from './queue.js';

/** Minimal client surface so tests can inject a fake. */
export interface SqsLike {
  send(command: SendMessageCommand): Promise<unknown>;
}

export interface SqsJobMessage {
  job: JobName;
  data: object;
  enqueuedAt: string;
}

/**
 * SQS transport. Each message carries the job name and payload; a Lambda
 * consumer (src/lambda/worker.ts) dispatches it. Delays use SQS DelaySeconds
 * (max 15 minutes), which covers the transcription polling interval.
 * Retries come from the queue's redrive policy (maxReceiveCount) and the
 * dead-letter queue defined in Terraform.
 */
export class SqsJobQueue implements JobQueue {
  readonly name = 'sqs' as const;
  private client: SqsLike;
  constructor(private opts: { queueUrl: string; region: string }, client?: SqsLike) {
    this.client = client ?? new SQSClient({ region: opts.region });
  }
  async enqueue(job: JobName, data: object, opts: EnqueueOptions = {}): Promise<void> {
    const body: SqsJobMessage = { job, data, enqueuedAt: new Date().toISOString() };
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.opts.queueUrl,
        MessageBody: JSON.stringify(body),
        DelaySeconds: Math.min(900, Math.max(0, Math.round(opts.delaySeconds ?? 0))),
        MessageAttributes: {
          job: { DataType: 'String', StringValue: job },
          ...(opts.singletonKey ? { singletonKey: { DataType: 'String', StringValue: opts.singletonKey } } : {}),
        },
      }),
    );
  }
  async stop(): Promise<void> {
    /* nothing to close */
  }
}

export function parseSqsJobMessage(body: string): SqsJobMessage {
  const parsed = JSON.parse(body) as Partial<SqsJobMessage>;
  if (!parsed || typeof parsed.job !== 'string' || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error('Malformed job message');
  }
  return { job: parsed.job as JobName, data: parsed.data, enqueuedAt: parsed.enqueuedAt ?? new Date(0).toISOString() };
}

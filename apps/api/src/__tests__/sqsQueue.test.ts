import { describe, expect, it } from 'vitest';
import type { SendMessageCommand } from '@aws-sdk/client-sqs';
import { parseSqsJobMessage, SqsJobQueue } from '../jobs/sqs.js';
import { JOBS } from '../jobs/queue.js';

describe('SqsJobQueue', () => {
  it('sends the job name, payload and a bounded delay', async () => {
    const sent: SendMessageCommand[] = [];
    const q = new SqsJobQueue({ queueUrl: 'https://sqs.eu-west-2.amazonaws.com/123/jobs', region: 'eu-west-2' }, { send: async (c: SendMessageCommand) => { sent.push(c); return {}; } });
    await q.enqueue(JOBS.TRANSCRIBE_POLL, { meetingId: 'm1', jobName: 'j', attempts: 0, triggeredBy: null }, { delaySeconds: 5000, singletonKey: 'k' });
    expect(sent).toHaveLength(1);
    const input = sent[0].input;
    expect(input.QueueUrl).toBe('https://sqs.eu-west-2.amazonaws.com/123/jobs');
    expect(input.DelaySeconds).toBe(900);
    expect(input.MessageAttributes?.job?.StringValue).toBe('meeting.transcribe.poll');
    const body = parseSqsJobMessage(input.MessageBody!);
    expect(body.job).toBe('meeting.transcribe.poll');
    expect(body.data).toMatchObject({ meetingId: 'm1' });
  });
  it('rejects malformed messages', () => {
    expect(() => parseSqsJobMessage('{"nope":1}')).toThrow(/Malformed/);
    expect(() => parseSqsJobMessage('not json')).toThrow();
  });
});

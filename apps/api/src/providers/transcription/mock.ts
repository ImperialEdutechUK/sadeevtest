import type { TranscriptionProvider, TranscriptionStartResult, TranscriptionStatus } from './index.js';
import { SAMPLE_ONLINE_TRANSCRIPT_SEGMENTS } from '../../seed/sampleTranscriptOnline.js';

/**
 * Development stand-in for Amazon Transcribe: "transcribes" any recording into
 * a realistic sample online induction conversation after a short delay, so the whole
 * pipeline can be exercised without AWS credentials.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'mock' as const;
  private started = new Map<string, number>();
  async start(input: { meetingId: string }): Promise<TranscriptionStartResult> {
    const jobName = `mock-${input.meetingId}-${Date.now()}`;
    this.started.set(jobName, Date.now());
    return { jobName };
  }
  async check(jobName: string): Promise<TranscriptionStatus> {
    const startedAt = this.started.get(jobName) ?? 0;
    if (Date.now() - startedAt < 5000) return { state: 'IN_PROGRESS' };
    this.started.delete(jobName);
    return {
      state: 'COMPLETED',
      segments: SAMPLE_ONLINE_TRANSCRIPT_SEGMENTS.map((s) => ({ ...s })),
      speakers: [...new Set(SAMPLE_ONLINE_TRANSCRIPT_SEGMENTS.map((s) => s.speaker))],
      language: 'en-GB',
      warnings: ['This transcript was produced by the mock transcription provider (TRANSCRIPTION_PROVIDER=mock).'],
    };
  }
}

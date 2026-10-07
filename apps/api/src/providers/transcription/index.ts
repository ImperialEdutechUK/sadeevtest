import { loadConfig } from '../../config.js';
import type { TranscriptSegment } from '@slc/shared';
import { AwsTranscribeProvider } from './aws.js';
import { MockTranscriptionProvider } from './mock.js';

export interface TranscriptionStartResult {
  jobName: string;
}
export type TranscriptionStatus =
  | { state: 'IN_PROGRESS' }
  | { state: 'FAILED'; reason: string }
  | { state: 'COMPLETED'; segments: TranscriptSegment[]; speakers: string[]; language: string | null; warnings: string[] };

export interface TranscriptionProvider {
  readonly name: 'aws' | 'mock';
  start(input: { meetingId: string; storageKey: string; fileName: string; language?: string }): Promise<TranscriptionStartResult>;
  check(jobName: string): Promise<TranscriptionStatus>;
}

let instance: TranscriptionProvider | null = null;
export function getTranscriptionProvider(): TranscriptionProvider {
  if (instance) return instance;
  const cfg = loadConfig();
  instance = cfg.TRANSCRIPTION_PROVIDER === 'aws' ? new AwsTranscribeProvider(cfg) : new MockTranscriptionProvider();
  return instance;
}

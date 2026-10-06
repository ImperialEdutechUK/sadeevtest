import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
} from '@aws-sdk/client-transcribe';
import type { Config } from '../../config.js';
import { getStorage } from '../storage/index.js';
import { parseAmazonTranscribeJson } from './parsers.js';
import type { TranscriptionProvider, TranscriptionStartResult, TranscriptionStatus } from './index.js';

const MEDIA_FORMATS: Record<string, string> = {
  '.mp4': 'mp4',
  '.m4a': 'mp4',
  '.mp3': 'mp3',
  '.wav': 'wav',
  '.webm': 'webm',
  '.mov': 'mp4',
  '.ogg': 'ogg',
  '.flac': 'flac',
  '.amr': 'amr',
};

/**
 * Amazon Transcribe (batch) with speaker identification.
 * The recording is read straight from the uploads bucket; the JSON output is
 * written back to the same bucket under transcribe-output/ so no media leaves AWS.
 */
export class AwsTranscribeProvider implements TranscriptionProvider {
  readonly name = 'aws' as const;
  private client: TranscribeClient;
  constructor(private cfg: Config) {
    this.client = new TranscribeClient({ region: cfg.TRANSCRIBE_REGION });
  }

  async start(input: { meetingId: string; storageKey: string; fileName: string }): Promise<TranscriptionStartResult> {
    const storage = getStorage();
    const uri = storage.s3Uri(input.storageKey);
    if (!uri) throw new Error('Amazon Transcribe requires S3 storage');
    const ext = input.fileName.slice(input.fileName.lastIndexOf('.')).toLowerCase();
    const jobName = `mr-${input.meetingId}-${Date.now()}`;
    await this.client.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: { MediaFileUri: uri },
        MediaFormat: (MEDIA_FORMATS[ext] ?? undefined) as never,
        LanguageCode: this.cfg.TRANSCRIBE_LANGUAGE as LanguageCode,
        OutputBucketName: this.cfg.S3_BUCKET,
        OutputKey: `transcribe-output/${jobName}.json`,
        Settings: { ShowSpeakerLabels: true, MaxSpeakerLabels: this.cfg.TRANSCRIBE_MAX_SPEAKERS },
      }),
    );
    return { jobName };
  }

  async check(jobName: string): Promise<TranscriptionStatus> {
    const res = await this.client.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
    const job = res.TranscriptionJob;
    const status = job?.TranscriptionJobStatus;
    if (status === 'FAILED') return { state: 'FAILED', reason: job?.FailureReason ?? 'Transcription failed' };
    if (status !== 'COMPLETED') return { state: 'IN_PROGRESS' };
    const raw = await getStorage().read(`transcribe-output/${jobName}.json`);
    const parsed = parseAmazonTranscribeJson(JSON.parse(raw.toString('utf8')));
    return { state: 'COMPLETED', segments: parsed.segments, speakers: parsed.speakers, language: job?.LanguageCode ?? null, warnings: parsed.warnings };
  }
}

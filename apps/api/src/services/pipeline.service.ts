import type { TranscriptSegment } from '@slc/shared';
import { prisma } from '../db.js';
import { asArray } from '../lib/serialize.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';
import { logger } from '../logger.js';
import { extractDocumentText } from '../providers/documents/extract.js';
import { getStorage } from '../providers/storage/index.js';
import { getTranscriptionProvider } from '../providers/transcription/index.js';
import { parseTranscriptFile } from '../providers/transcription/parsers.js';
import { enqueueAnalyse, enqueueTranscribePoll } from '../jobs/queue.js';
import { appendLog, guessSpeakerMap } from './analysis.service.js';
import { getSettings } from './settings.service.js';

/**
 * The processing pipeline for a submitted meeting:
 *   1. transcript  - parse an uploaded transcript, or start Amazon Transcribe on the recording and poll
 *   2. documents   - extract text from the learner booklet / presentation / other documents
 *   3. analysis    - score against the criteria (analysis.service)
 * Each step records progress in meeting.processingLog so the UI can show plain-language status.
 */

async function log(meetingId: string, step: string, state: 'started' | 'done' | 'failed' | 'skipped', detail?: string) {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { processingLog: true } });
  await prisma.meeting.update({ where: { id: meetingId }, data: { processingLog: appendLog(m?.processingLog, step, state, detail) as never } });
}

export async function processMeeting(meetingId: string, triggeredBy: string | null): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, include: { files: true, transcript: true } });
  if (!meeting) throw new NotFoundError('Meeting');
  const files = meeting.files.filter((f) => f.status === 'UPLOADED' || f.status === 'PROCESSED');

  // Step 2 first when cheap: documents (so transcription can run in parallel with nothing waiting on it).
  await extractDocuments(meetingId, files);

  // Step 1: transcript
  const transcriptFile = files.find((f) => f.kind === 'TRANSCRIPT');
  const recording = files.find((f) => f.kind === 'RECORDING');
  const newConversationFile = [transcriptFile, recording].some((f) => f && f.status === 'UPLOADED');
  const hasUsableTranscript = !!meeting.transcript && asArray(meeting.transcript.segments).length > 0;
  if (hasUsableTranscript && !newConversationFile) {
    await log(meetingId, 'transcript', 'skipped', 'Existing transcript reused');
    await enqueueAnalyse({ meetingId, triggeredBy });
    return;
  }
  if (transcriptFile) {
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'TRANSCRIBING' } });
    await log(meetingId, 'transcript', 'started', `Reading ${transcriptFile.fileName}`);
    const buffer = await getStorage().read(transcriptFile.storageKey);
    const parsed = await parseTranscriptFile(transcriptFile.fileName, buffer);
    if (!parsed.segments.length) throw new BadRequestError('No transcript lines could be read from the uploaded file');
    await saveTranscript(meetingId, parsed.segments, 'UPLOADED', null, null);
    await prisma.meetingFile.update({ where: { id: transcriptFile.id }, data: { status: 'PROCESSED' } });
    await log(meetingId, 'transcript', 'done', `${parsed.segments.length} lines, ${parsed.speakers.length} speaker label(s)${parsed.warnings.length ? `. ${parsed.warnings.join(' ')}` : ''}`);
    await enqueueAnalyse({ meetingId, triggeredBy });
    return;
  }
  if (recording) {
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'TRANSCRIBING' } });
    await log(meetingId, 'transcript', 'started', `Transcribing ${recording.fileName}`);
    const provider = getTranscriptionProvider();
    const settings = await getSettings();
    const { jobName } = await provider.start({ meetingId, storageKey: recording.storageKey, fileName: recording.fileName, language: settings.transcriptionLanguage });
    await prisma.transcript.upsert({
      where: { meetingId },
      create: { meetingId, source: provider.name === 'aws' ? 'AWS_TRANSCRIBE' : 'MOCK', segments: [], speakerMap: {}, jobName },
      update: { jobName, segments: [], speakerMap: {}, speakerMapSource: 'auto', source: provider.name === 'aws' ? 'AWS_TRANSCRIBE' : 'MOCK' },
    });
    await enqueueTranscribePoll({ meetingId, jobName, attempts: 0, triggeredBy }, provider.name === 'mock' ? 5 : 30);
    return;
  }
  throw new BadRequestError('Add a recording or a transcript before submitting the meeting');
}

export async function pollTranscription(data: { meetingId: string; jobName: string; attempts: number; triggeredBy: string | null }): Promise<void> {
  const provider = getTranscriptionProvider();
  const status = await provider.check(data.jobName);
  if (status.state === 'IN_PROGRESS') {
    if (data.attempts > 240) throw new Error('Transcription did not finish within the expected time');
    // Poll every 30s for the first 10 minutes, then every 60s (a 1-hour recording usually takes several minutes).
    await enqueueTranscribePoll({ ...data, attempts: data.attempts + 1 }, data.attempts < 20 ? 30 : 60);
    return;
  }
  if (status.state === 'FAILED') {
    await failMeeting(data.meetingId, `Transcription failed: ${status.reason}`);
    return;
  }
  await saveTranscript(data.meetingId, status.segments, provider.name === 'aws' ? 'AWS_TRANSCRIBE' : 'MOCK', status.language, data.jobName);
  const recording = await prisma.meetingFile.findFirst({ where: { meetingId: data.meetingId, kind: 'RECORDING', status: 'UPLOADED' } });
  if (recording) await prisma.meetingFile.update({ where: { id: recording.id }, data: { status: 'PROCESSED' } });
  await log(data.meetingId, 'transcript', 'done', `${status.segments.length} lines, ${status.speakers.length} speaker label(s)${status.warnings.length ? `. ${status.warnings.join(' ')}` : ''}`);
  await enqueueAnalyse({ meetingId: data.meetingId, triggeredBy: data.triggeredBy });
}

async function saveTranscript(meetingId: string, segments: TranscriptSegment[], source: 'UPLOADED' | 'AWS_TRANSCRIBE' | 'MOCK', language: string | null, jobName: string | null) {
  const settings = await getSettings();
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId }, select: { learnerFirstName: true } });
  let cleaned = segments;
  if (settings.redactLearnerNames && meeting.learnerFirstName) {
    const re = new RegExp(`\\b${escapeRegExp(meeting.learnerFirstName)}\\b`, 'gi');
    cleaned = segments.map((s) => ({ ...s, text: s.text.replace(re, '[learner]') }));
  }
  const wordCount = cleaned.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  await prisma.transcript.upsert({
    where: { meetingId },
    create: { meetingId, source, language, segments: cleaned as never, speakerMap: guessSpeakerMap(cleaned) as never, wordCount, jobName },
    update: { source, language, segments: cleaned as never, speakerMap: guessSpeakerMap(cleaned) as never, speakerMapSource: 'auto', wordCount, jobName },
  });
  const duration = cleaned.length ? Math.round(Math.max(...cleaned.map((s) => s.end))) : null;
  await prisma.meeting.update({ where: { id: meetingId }, data: { durationSeconds: duration } });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function extractDocuments(meetingId: string, files: { id: string; kind: string; fileName: string; storageKey: string; status: string; extractedText: string | null }[]) {
  const docs = files.filter((f) => ['LEARNER_BOOKLET', 'PRESENTATION', 'OTHER'].includes(f.kind) && !f.extractedText);
  if (!docs.length) return;
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'EXTRACTING' } });
  await log(meetingId, 'documents', 'started', `Reading ${docs.length} document(s)`);
  for (const f of docs) {
    try {
      const buffer = await getStorage().read(f.storageKey);
      const result = await extractDocumentText(f.fileName, buffer);
      await prisma.meetingFile.update({ where: { id: f.id }, data: { extractedText: result.text, extractedChars: result.text.length, status: 'PROCESSED', error: result.warnings.join(' ') || null } });
    } catch (err) {
      logger.warn({ err, fileId: f.id }, 'document extraction failed');
      await prisma.meetingFile.update({ where: { id: f.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 300) } });
    }
  }
  await log(meetingId, 'documents', 'done');
}

export async function failMeeting(meetingId: string, reason: string) {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!m) return;
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'FAILED', failureReason: reason.slice(0, 500), processingLog: appendLog(m.processingLog, 'pipeline', 'failed', reason.slice(0, 300)) as never } });
  await notify({ userId: m.createdById, type: 'ANALYSIS_FAILED', title: `Could not process: ${m.title}`, body: reason.slice(0, 300), link: `/meetings/${meetingId}` });
}

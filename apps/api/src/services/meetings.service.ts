import {
  ACCEPTED_EXTENSIONS,
  extensionOf,
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  MEETING_STATUS_LABELS,
  MIME_BY_EXTENSION,
  type Comment,
  type CreateMeetingInput,
  type FileKind,
  type MeetingFile,
  type MeetingListItem,
  type MeetingsQuery,
  type Paginated,
  type ProcessingStep,
  type SpeakerMap,
  type Transcript,
  type TranscriptSegment,
} from '@slc/shared';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../plugins/auth.js';
import { hasPermission } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { parseDateInput } from '../lib/dates.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';
import { asArray, asRecord, fullName, iso, isoReq, num } from '../lib/serialize.js';
import { getStorage } from '../providers/storage/index.js';
import { enqueueAnalyse, enqueueProcessMeeting } from '../jobs/queue.js';
import { applySpeakerMap, getCurrentAnalysis } from './analysis.service.js';
import { getDefaultRubricId } from './rubrics.service.js';
import { getSettings } from './settings.service.js';
import { effectiveScore } from './stats.service.js';

const listInclude = {
  tutor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, departmentId: true } },
  rubric: { select: { id: true, name: true } },
  analyses: { where: { isCurrent: true }, take: 1, select: { overallScore: true, moderatedOverallScore: true, grade: true, status: true } },
} satisfies Prisma.MeetingInclude;
type MeetingListRow = Prisma.MeetingGetPayload<{ include: typeof listInclude }>;

export function serializeMeetingListItem(m: MeetingListRow): MeetingListItem {
  const a = m.analyses[0];
  return {
    id: m.id,
    title: m.title,
    meetingType: m.meetingType,
    status: m.status,
    meetingDate: isoReq(m.meetingDate),
    learnerReference: m.learnerReference,
    learnerFirstName: m.learnerFirstName,
    programme: m.programme,
    tutor: { id: m.tutor.id, firstName: m.tutor.firstName, lastName: m.tutor.lastName, avatarUrl: m.tutor.avatarUrl },
    rubric: m.rubric,
    overallScore: a?.status === 'COMPLETE' ? a.overallScore : null,
    moderatedScore: a?.status === 'COMPLETE' ? a.moderatedOverallScore : null,
    grade: a?.status === 'COMPLETE' ? a.grade : null,
    durationSeconds: m.durationSeconds,
    failureReason: m.failureReason,
    createdAt: isoReq(m.createdAt),
    updatedAt: isoReq(m.updatedAt),
  };
}

/** Who can see which meetings. */
export function meetingScope(user: AuthUser): Prisma.MeetingWhereInput {
  if (hasPermission(user, 'meeting:read:any')) return { deletedAt: null };
  return { deletedAt: null, OR: [{ tutorId: user.id }, { createdById: user.id }] };
}

export async function assertCanAccessMeeting(user: AuthUser, meetingId: string) {
  const m = await prisma.meeting.findFirst({ where: { id: meetingId, ...meetingScope(user) }, select: { id: true, tutorId: true, createdById: true, status: true } });
  if (!m) throw new NotFoundError('Meeting');
  return m;
}

export async function listMeetings(user: AuthUser, q: MeetingsQuery): Promise<Paginated<MeetingListItem>> {
  const where: Prisma.MeetingWhereInput = {
    AND: [
      meetingScope(user),
      q.tutorId ? { tutorId: q.tutorId } : {},
      q.departmentId ? { tutor: { departmentId: q.departmentId } } : {},
      q.status ? { status: q.status } : {},
      q.meetingType ? { meetingType: q.meetingType } : {},
      q.from ? { meetingDate: { gte: parseDateInput(q.from) } } : {},
      q.to ? { meetingDate: { lte: parseDateInput(q.to) } } : {},
      q.search
        ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { learnerReference: { contains: q.search, mode: 'insensitive' } }, { programme: { contains: q.search, mode: 'insensitive' } }, { tutor: { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }] } }] }
        : {},
    ],
  };
  const orderBy: Prisma.MeetingOrderByWithRelationInput = q.sort === 'oldest' ? { meetingDate: 'asc' } : { meetingDate: 'desc' };
  const byScore = q.sort === 'highest' || q.sort === 'lowest';
  const [total, rows] = await Promise.all([
    prisma.meeting.count({ where }),
    // Scores live on the current analysis, so score ordering is done in memory over the whole result set.
    prisma.meeting.findMany({ where, include: listInclude, orderBy: [orderBy, { createdAt: 'desc' }], ...(byScore ? {} : { skip: (q.page - 1) * q.pageSize, take: q.pageSize }) }),
  ]);
  let items = rows.map(serializeMeetingListItem);
  if (byScore) {
    const dir = q.sort === 'highest' ? -1 : 1;
    items = items.sort((a, b) => ((a.moderatedScore ?? a.overallScore ?? -1) - (b.moderatedScore ?? b.overallScore ?? -1)) * dir).slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  }
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function createMeeting(user: AuthUser, input: CreateMeetingInput) {
  const tutorId = input.tutorId ?? user.id;
  if (tutorId !== user.id && !hasPermission(user, 'meeting:create:any')) throw new ForbiddenError('You can only upload your own meetings');
  if (tutorId === user.id && !hasPermission(user, 'meeting:create:own') && !hasPermission(user, 'meeting:create:any')) throw new ForbiddenError();
  const settings = await getSettings();
  if (tutorId === user.id && user.role === 'TUTOR' && !settings.allowTutorSelfUpload) throw new ForbiddenError('Tutor self-upload is turned off. Ask your academic admin to upload the meeting.');
  const tutor = await prisma.user.findFirst({ where: { id: tutorId, isActive: true } });
  if (!tutor) throw new BadRequestError('The selected tutor was not found');
  const rubricId = input.rubricId ?? (await getDefaultRubricId(input.meetingType));
  const rubric = await prisma.rubric.findFirst({ where: { id: rubricId, isActive: true } });
  if (!rubric) throw new BadRequestError('The selected criteria set is not available');
  const m = await prisma.meeting.create({
    data: {
      title: input.title.trim(),
      meetingType: input.meetingType,
      tutorId,
      createdById: user.id,
      learnerReference: input.learnerReference.trim(),
      learnerFirstName: input.learnerFirstName?.trim() || null,
      programme: input.programme?.trim() || null,
      meetingDate: parseDateInput(input.meetingDate, 'meeting date'),
      rubricId,
      notes: input.notes?.trim() || null,
    },
    include: listInclude,
  });
  audit({ actorId: user.id, action: 'meeting.created', entityType: 'meeting', entityId: m.id, metadata: { tutorId, rubricId } });
  return serializeMeetingListItem(m);
}

export async function updateMeeting(user: AuthUser, id: string, input: Partial<CreateMeetingInput>) {
  const m = await assertCanAccessMeeting(user, id);
  if (m.tutorId !== user.id && m.createdById !== user.id && !hasPermission(user, 'meeting:delete:any')) throw new ForbiddenError();
  if (input.rubricId) {
    const rubric = await prisma.rubric.findFirst({ where: { id: input.rubricId, isActive: true } });
    if (!rubric) throw new BadRequestError('The selected criteria set is not available');
  }
  const updated = await prisma.meeting.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      meetingType: input.meetingType,
      tutorId: input.tutorId && hasPermission(user, 'meeting:create:any') ? input.tutorId : undefined,
      learnerReference: input.learnerReference?.trim(),
      learnerFirstName: input.learnerFirstName === undefined ? undefined : input.learnerFirstName?.trim() || null,
      programme: input.programme === undefined ? undefined : input.programme?.trim() || null,
      meetingDate: input.meetingDate ? parseDateInput(input.meetingDate, 'meeting date') : undefined,
      rubricId: input.rubricId,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    },
    include: listInclude,
  });
  audit({ actorId: user.id, action: 'meeting.updated', entityType: 'meeting', entityId: id, metadata: { fields: Object.keys(input) } });
  return serializeMeetingListItem(updated);
}

export async function deleteMeeting(user: AuthUser, id: string) {
  const m = await assertCanAccessMeeting(user, id);
  const own = m.tutorId === user.id || m.createdById === user.id;
  if (!(own && hasPermission(user, 'meeting:delete:own')) && !hasPermission(user, 'meeting:delete:any')) throw new ForbiddenError();
  const files = await prisma.meetingFile.findMany({ where: { meetingId: id, status: { not: 'DELETED' } } });
  const storage = getStorage();
  for (const f of files) await storage.delete(f.storageKey).catch(() => undefined);
  await prisma.meeting.delete({ where: { id } });
  audit({ actorId: user.id, action: 'meeting.deleted', entityType: 'meeting', entityId: id, metadata: { files: files.length } });
}

/* ---------------- Detail ---------------- */

export function serializeFile(f: { id: string; kind: FileKind; fileName: string; mimeType: string; sizeBytes: bigint; status: 'PENDING' | 'UPLOADED' | 'PROCESSED' | 'FAILED' | 'DELETED'; extractedChars: number | null; createdAt: Date }): MeetingFile {
  return { id: f.id, kind: f.kind, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: num(f.sizeBytes), status: f.status, extractedChars: f.extractedChars, createdAt: isoReq(f.createdAt) };
}

export function processingSteps(m: { status: string; processingLog: unknown; submittedAt: Date | null; completedAt: Date | null; failureReason: string | null }, files: { kind: string }[]): ProcessingStep[] {
  const log = asArray<{ step: string; state: string; detail?: string; at: string }>(m.processingLog);
  const last = (step: string) => [...log].reverse().find((l) => l.step === step);
  const hasRecording = files.some((f) => f.kind === 'RECORDING');
  const hasDocs = files.some((f) => ['LEARNER_BOOKLET', 'PRESENTATION', 'OTHER'].includes(f.kind));
  const statusOrder = ['DRAFT', 'QUEUED', 'TRANSCRIBING', 'EXTRACTING', 'ANALYSING', 'READY', 'FAILED'];
  const idx = statusOrder.indexOf(m.status);
  const mk = (key: string, label: string, state: ProcessingStep['state'], detail: string | null, at: string | null): ProcessingStep => ({ key, label, state, detail, at });

  const steps: ProcessingStep[] = [];
  steps.push(mk('upload', 'Files uploaded', m.status === 'DRAFT' ? 'active' : 'done', null, iso(m.submittedAt)));
  const d = last('documents');
  steps.push(mk('documents', 'Reading supporting documents', !hasDocs ? 'skipped' : d?.state === 'done' ? 'done' : d?.state === 'failed' ? 'failed' : m.status === 'EXTRACTING' ? 'active' : 'pending', !hasDocs ? 'No documents were added' : d?.detail ?? null, d?.at ?? null));
  const t = last('transcript');
  steps.push(
    mk(
      'transcript',
      hasRecording ? 'Transcribing the recording' : 'Reading the transcript',
      t?.state === 'done' || t?.state === 'skipped' ? 'done' : t?.state === 'failed' ? 'failed' : m.status === 'TRANSCRIBING' ? 'active' : idx > statusOrder.indexOf('TRANSCRIBING') && m.status !== 'FAILED' ? 'done' : 'pending',
      t?.detail ?? (hasRecording && m.status === 'TRANSCRIBING' ? 'This usually takes a few minutes for every 10 minutes of recording.' : null),
      t?.at ?? null,
    ),
  );
  const a = last('analysis');
  steps.push(mk('analysis', 'Reviewing against the criteria', m.status === 'READY' ? 'done' : a?.state === 'failed' || (m.status === 'FAILED' && !t?.state?.includes('failed')) ? 'failed' : m.status === 'ANALYSING' ? 'active' : 'pending', a?.detail ?? (m.status === 'ANALYSING' ? 'Usually 1-3 minutes.' : m.status === 'FAILED' ? m.failureReason : null), a?.at ?? null));
  steps.push(mk('ready', 'Report ready', m.status === 'READY' ? 'done' : 'pending', m.status === 'READY' ? 'Open the report below' : null, iso(m.completedAt)));
  return steps;
}

export async function getMeeting(user: AuthUser, id: string) {
  await assertCanAccessMeeting(user, id);
  const m = await prisma.meeting.findUniqueOrThrow({
    where: { id },
    include: { ...listInclude, files: { where: { status: { not: 'DELETED' } }, orderBy: { createdAt: 'asc' } }, createdBy: { select: { id: true, firstName: true, lastName: true } }, transcript: { select: { id: true, wordCount: true, source: true } } },
  });
  const analysis = await getCurrentAnalysis(id);
  const canModerate = hasPermission(user, 'analysis:moderate');
  const canEdit = m.tutorId === user.id || m.createdById === user.id || hasPermission(user, 'meeting:delete:any');
  return {
    ...serializeMeetingListItem(m),
    notes: m.notes,
    createdBy: m.createdBy,
    submittedAt: iso(m.submittedAt),
    completedAt: iso(m.completedAt),
    statusLabel: MEETING_STATUS_LABELS[m.status],
    files: m.files.map(serializeFile),
    hasTranscript: !!m.transcript && m.transcript.wordCount > 0,
    steps: processingSteps(m, m.files),
    analysis,
    permissions: { canModerate, canEdit, canReanalyse: hasPermission(user, 'meeting:reanalyse') || canEdit, canDelete: canEdit && (hasPermission(user, 'meeting:delete:any') || hasPermission(user, 'meeting:delete:own')) },
  };
}

/* ---------------- Files ---------------- */

export async function presignFile(user: AuthUser, meetingId: string, input: { kind: FileKind; fileName: string; mimeType?: string; sizeBytes: number }) {
  const m = await assertCanAccessMeeting(user, meetingId);
  if (!['DRAFT', 'FAILED', 'READY'].includes(m.status)) throw new BadRequestError('Files cannot be changed while the meeting is being processed');
  const ext = extensionOf(input.fileName);
  if (!ACCEPTED_EXTENSIONS[input.kind].includes(ext)) {
    throw new BadRequestError(`"${ext || 'this file type'}" is not accepted for ${input.kind.toLowerCase().replace('_', ' ')}. Accepted: ${ACCEPTED_EXTENSIONS[input.kind].join(', ')}`);
  }
  const limit = input.kind === 'RECORDING' ? MAX_UPLOAD_BYTES : MAX_DOCUMENT_BYTES;
  if (input.sizeBytes > limit) throw new BadRequestError(`The file is too large (limit ${Math.round(limit / 1024 / 1024)} MB)`);
  const mimeType = input.mimeType || MIME_BY_EXTENSION[ext] || 'application/octet-stream';
  const prefix = input.kind === 'RECORDING' ? 'recordings' : 'documents';
  const storageKey = `${prefix}/${meetingId}/${randomUUID()}${ext}`;
  // Only one file per kind (except OTHER): replace any previous one.
  if (input.kind !== 'OTHER') {
    const previous = await prisma.meetingFile.findMany({ where: { meetingId, kind: input.kind, status: { not: 'DELETED' } } });
    for (const p of previous) {
      await getStorage().delete(p.storageKey).catch(() => undefined);
      await prisma.meetingFile.delete({ where: { id: p.id } });
    }
  }
  const file = await prisma.meetingFile.create({ data: { meetingId, kind: input.kind, fileName: input.fileName, mimeType, sizeBytes: BigInt(input.sizeBytes), storageKey, status: 'PENDING' } });
  const upload = await getStorage().presignUpload(storageKey, mimeType, input.sizeBytes);
  return { fileId: file.id, ...upload };
}

export async function completeFile(user: AuthUser, meetingId: string, fileId: string) {
  await assertCanAccessMeeting(user, meetingId);
  const f = await prisma.meetingFile.findFirst({ where: { id: fileId, meetingId } });
  if (!f) throw new NotFoundError('File');
  const exists = await getStorage().exists(f.storageKey);
  if (!exists) throw new BadRequestError('The upload did not complete. Please try again.');
  const updated = await prisma.meetingFile.update({ where: { id: f.id }, data: { status: 'UPLOADED', extractedText: null, extractedChars: null, error: null } });
  audit({ actorId: user.id, action: 'file.uploaded', entityType: 'meeting', entityId: meetingId, metadata: { kind: f.kind, fileName: f.fileName, sizeBytes: num(f.sizeBytes) } });
  return serializeFile(updated);
}

export async function removeFile(user: AuthUser, meetingId: string, fileId: string) {
  const m = await assertCanAccessMeeting(user, meetingId);
  if (!['DRAFT', 'FAILED', 'READY'].includes(m.status)) throw new BadRequestError('Files cannot be changed while the meeting is being processed');
  const f = await prisma.meetingFile.findFirst({ where: { id: fileId, meetingId } });
  if (!f) throw new NotFoundError('File');
  await getStorage().delete(f.storageKey).catch(() => undefined);
  await prisma.meetingFile.delete({ where: { id: f.id } });
  audit({ actorId: user.id, action: 'file.removed', entityType: 'meeting', entityId: meetingId, metadata: { kind: f.kind, fileName: f.fileName } });
}

export async function downloadUrl(user: AuthUser, meetingId: string, fileId: string) {
  await assertCanAccessMeeting(user, meetingId);
  const f = await prisma.meetingFile.findFirst({ where: { id: fileId, meetingId, status: { not: 'DELETED' } } });
  if (!f) throw new NotFoundError('File');
  const url = await getStorage().presignDownload(f.storageKey, f.fileName, f.mimeType);
  audit({ actorId: user.id, action: 'file.downloaded', entityType: 'meeting', entityId: meetingId, metadata: { fileId, kind: f.kind } });
  return { url, fileName: f.fileName, expiresInSeconds: 900 };
}

/* ---------------- Submit / reanalyse ---------------- */

export async function submitMeeting(user: AuthUser, meetingId: string) {
  const m = await assertCanAccessMeeting(user, meetingId);
  if (!['DRAFT', 'FAILED'].includes(m.status)) throw new BadRequestError('This meeting has already been submitted');
  const files = await prisma.meetingFile.findMany({ where: { meetingId, status: { in: ['UPLOADED', 'PROCESSED'] } } });
  if (!files.some((f) => f.kind === 'RECORDING' || f.kind === 'TRANSCRIPT')) throw new BadRequestError('Add a recording or a transcript of the meeting first');
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'QUEUED', submittedAt: new Date(), failureReason: null } });
  await enqueueProcessMeeting({ meetingId, triggeredBy: user.id });
  audit({ actorId: user.id, action: 'meeting.submitted', entityType: 'meeting', entityId: meetingId });
  return getMeeting(user, meetingId);
}

export async function reanalyseMeeting(user: AuthUser, meetingId: string) {
  const m = await assertCanAccessMeeting(user, meetingId);
  const own = m.tutorId === user.id || m.createdById === user.id;
  if (!own && !hasPermission(user, 'meeting:reanalyse')) throw new ForbiddenError();
  if (!['READY', 'FAILED'].includes(m.status)) throw new BadRequestError('The meeting is still being processed');
  const transcript = await prisma.transcript.findUnique({ where: { meetingId } });
  const hasTranscript = transcript && asArray(transcript.segments).length > 0;
  const newFiles = await prisma.meetingFile.count({ where: { meetingId, status: 'UPLOADED' } });
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'QUEUED', failureReason: null } });
  // New files (a replacement recording, a booklet added later) must be read first; otherwise go straight to the review.
  if (hasTranscript && newFiles === 0) await enqueueAnalyse({ meetingId, triggeredBy: user.id });
  else await enqueueProcessMeeting({ meetingId, triggeredBy: user.id });
  audit({ actorId: user.id, action: 'meeting.reanalysed', entityType: 'meeting', entityId: meetingId });
  return getMeeting(user, meetingId);
}

/* ---------------- Transcript ---------------- */

export async function getTranscript(user: AuthUser, meetingId: string): Promise<Transcript> {
  await assertCanAccessMeeting(user, meetingId);
  const t = await prisma.transcript.findUnique({ where: { meetingId } });
  if (!t) throw new NotFoundError('Transcript');
  const segments = asArray<TranscriptSegment>(t.segments);
  return {
    id: t.id,
    source: t.source,
    language: t.language,
    wordCount: t.wordCount,
    segments,
    speakerMap: (asRecord(t.speakerMap) ?? {}) as SpeakerMap,
    speakerLabels: [...new Set(segments.map((s) => s.speaker))],
    createdAt: isoReq(t.createdAt),
  };
}

export async function updateSpeakers(user: AuthUser, meetingId: string, speakerMap: SpeakerMap, reanalyse: boolean) {
  const m = await assertCanAccessMeeting(user, meetingId);
  const own = m.tutorId === user.id || m.createdById === user.id;
  if (!own && !hasPermission(user, 'meeting:reanalyse')) throw new ForbiddenError();
  const result = await applySpeakerMap(meetingId, speakerMap);
  audit({ actorId: user.id, action: 'transcript.speakers_updated', entityType: 'meeting', entityId: meetingId, metadata: { speakerMap } });
  if (reanalyse) await reanalyseMeeting(user, meetingId);
  return result;
}

/* ---------------- Comments ---------------- */

export async function listComments(user: AuthUser, meetingId: string): Promise<Comment[]> {
  await assertCanAccessMeeting(user, meetingId);
  const rows = await prisma.comment.findMany({ where: { meetingId }, include: { author: true }, orderBy: { createdAt: 'asc' } });
  return rows.map((c) => ({ id: c.id, body: c.body, createdAt: isoReq(c.createdAt), author: { id: c.author.id, firstName: c.author.firstName, lastName: c.author.lastName, avatarUrl: c.author.avatarUrl, role: c.author.role } }));
}

export async function addComment(user: AuthUser, meetingId: string, body: string): Promise<Comment> {
  const m = await assertCanAccessMeeting(user, meetingId);
  const c = await prisma.comment.create({ data: { meetingId, authorId: user.id, body: body.trim() }, include: { author: true, meeting: { select: { title: true, tutorId: true, createdById: true } } } });
  const recipients = new Set([c.meeting.tutorId, c.meeting.createdById]);
  recipients.delete(user.id);
  for (const r of recipients) {
    await notify({ userId: r, type: 'COMMENT_ADDED', title: `New comment on ${c.meeting.title}`, body: `${fullName(c.author)}: ${body.slice(0, 160)}`, link: `/meetings/${meetingId}#comments` });
  }
  audit({ actorId: user.id, action: 'comment.added', entityType: 'meeting', entityId: m.id });
  return { id: c.id, body: c.body, createdAt: isoReq(c.createdAt), author: { id: c.author.id, firstName: c.author.firstName, lastName: c.author.lastName, avatarUrl: c.author.avatarUrl, role: c.author.role } };
}

export { effectiveScore };

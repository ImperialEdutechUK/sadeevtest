import { AppraisalNarrativeSchema, type Appraisal, type AppraisalStats, type GradeBand, DEFAULT_GRADE_BANDS } from '@slc/shared';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../plugins/auth.js';
import { hasPermission } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { endOfDay, parseDateInput, startOfDay } from '../lib/dates.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';
import { asRecord, avg, fullName, iso, isoReq } from '../lib/serialize.js';
import { logger } from '../logger.js';
import { extractJson, getLlmProvider } from '../providers/llm/index.js';
import { buildAppraisalMessages } from '../providers/llm/prompts.js';
import { enqueueAppraisal } from '../jobs/queue.js';
import { getSettings } from './settings.service.js';
import { averageScore, criteriaAverages, gradeCounts, loadAnalyses, trendPoints } from './stats.service.js';

const include = {
  tutor: { include: { department: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AppraisalInclude;
type Row = Prisma.AppraisalGetPayload<{ include: typeof include }>;

function serialize(a: Row): Appraisal {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    tutor: { id: a.tutor.id, firstName: a.tutor.firstName, lastName: a.tutor.lastName, avatarUrl: a.tutor.avatarUrl, jobTitle: a.tutor.jobTitle, departmentName: a.tutor.department?.name ?? null },
    createdBy: a.createdBy,
    periodStart: isoReq(a.periodStart),
    periodEnd: isoReq(a.periodEnd),
    managerNotes: a.managerNotes,
    tutorComment: a.tutorComment,
    stats: (a.stats as AppraisalStats | null) ?? null,
    narrative: a.narrative ? AppraisalNarrativeSchema.parse(a.narrative) : null,
    generatedAt: iso(a.generatedAt),
    model: a.model,
    createdAt: isoReq(a.createdAt),
    updatedAt: isoReq(a.updatedAt),
  };
}

function scope(user: AuthUser): Prisma.AppraisalWhereInput {
  if (hasPermission(user, 'appraisal:read:any')) return {};
  // Tutors see their own appraisals once shared.
  return { tutorId: user.id, status: { in: ['SHARED', 'LOCKED'] } };
}

export async function listAppraisals(user: AuthUser, q: { tutorId?: string }) {
  const rows = await prisma.appraisal.findMany({ where: { AND: [scope(user), q.tutorId ? { tutorId: q.tutorId } : {}] }, include, orderBy: { createdAt: 'desc' } });
  return rows.map(serialize);
}

export async function getAppraisal(user: AuthUser, id: string) {
  const a = await prisma.appraisal.findFirst({ where: { AND: [{ id }, scope(user)] }, include });
  if (!a) throw new NotFoundError('Appraisal');
  return serialize(a);
}

export async function computeAppraisalStats(tutorId: string, periodStart: Date, periodEnd: Date): Promise<AppraisalStats> {
  const tutor = await prisma.user.findUniqueOrThrow({ where: { id: tutorId }, select: { departmentId: true } });
  const [mine, dept, college] = await Promise.all([
    loadAnalyses({ tutorId, from: periodStart, to: periodEnd }),
    tutor.departmentId ? loadAnalyses({ departmentId: tutor.departmentId, from: periodStart, to: periodEnd }) : Promise.resolve([]),
    loadAnalyses({ from: periodStart, to: periodEnd }),
  ]);
  const collegeCriteria = new Map(criteriaAverages(college).map((c) => [c.code, c.average]));
  const bands = (await prisma.rubric.findFirst({ where: { isDefault: true } }))?.gradeBands as GradeBand[] | undefined;
  return {
    meetingCount: mine.length,
    averageScore: averageScore(mine),
    bestScore: mine.length ? Math.max(...mine.map((r) => r.score)) : null,
    lowestScore: mine.length ? Math.min(...mine.map((r) => r.score)) : null,
    averageMandatoryCoverage: avg(mine.map((r) => r.mandatoryCoverage)),
    averageLearnerTalkShare: avg(mine.map((r) => r.learnerTalkShare)),
    departmentAverage: dept.length ? averageScore(dept) : null,
    collegeAverage: averageScore(college),
    trend: trendPoints(mine),
    criteriaAverages: criteriaAverages(mine).map((c) => ({ ...c, collegeAverage: collegeCriteria.get(c.code) ?? null })),
    gradeCounts: gradeCounts(mine, bands?.length ? bands : DEFAULT_GRADE_BANDS),
  };
}

export async function createAppraisal(user: AuthUser, input: { tutorId: string; title: string; periodStart: string; periodEnd: string; managerNotes?: string | null }) {
  const start = startOfDay(parseDateInput(input.periodStart, 'start date'));
  const end = endOfDay(parseDateInput(input.periodEnd, 'end date'));
  if (end < start) throw new BadRequestError('The end date must be after the start date');
  const tutor = await prisma.user.findFirst({ where: { id: input.tutorId, isActive: true } });
  if (!tutor) throw new BadRequestError('Tutor not found');
  const stats = await computeAppraisalStats(input.tutorId, start, end);
  const a = await prisma.appraisal.create({
    data: { title: input.title, tutorId: input.tutorId, createdById: user.id, periodStart: start, periodEnd: end, managerNotes: input.managerNotes ?? null, stats: stats as never },
    include,
  });
  audit({ actorId: user.id, action: 'appraisal.created', entityType: 'appraisal', entityId: a.id, metadata: { tutorId: input.tutorId } });
  return serialize(a);
}

export async function updateAppraisal(user: AuthUser, id: string, input: { title?: string; managerNotes?: string | null; tutorComment?: string | null; status?: Appraisal['status'] }) {
  const a = await prisma.appraisal.findFirst({ where: { AND: [{ id }, scope(user)] }, include });
  if (!a) throw new NotFoundError('Appraisal');
  const isManager = hasPermission(user, 'appraisal:manage');
  const isTutor = a.tutorId === user.id;
  if (!isManager && !isTutor) throw new ForbiddenError();
  if (a.status === 'LOCKED' && !isManager) throw new BadRequestError('This appraisal is locked');
  const data: Prisma.AppraisalUpdateInput = {};
  if (isManager) {
    if (input.title !== undefined) data.title = input.title;
    if (input.managerNotes !== undefined) data.managerNotes = input.managerNotes;
    if (input.status !== undefined) data.status = input.status;
  }
  if (input.tutorComment !== undefined && (isTutor || isManager)) data.tutorComment = input.tutorComment;
  const updated = await prisma.appraisal.update({ where: { id }, data, include });
  if (input.status === 'SHARED' && a.status !== 'SHARED') {
    await notify({ userId: a.tutorId, type: 'APPRAISAL_SHARED', title: `Appraisal shared: ${a.title}`, body: 'Your manager has shared an appraisal summary with you. You can read it and add your own comment.', link: `/appraisals/${id}` });
  }
  audit({ actorId: user.id, action: 'appraisal.updated', entityType: 'appraisal', entityId: id, metadata: { fields: Object.keys(input) } });
  return serialize(updated);
}

export async function requestGeneration(user: AuthUser, id: string) {
  const a = await prisma.appraisal.findUnique({ where: { id } });
  if (!a) throw new NotFoundError('Appraisal');
  if (a.status === 'LOCKED') throw new BadRequestError('This appraisal is locked');
  const stats = await computeAppraisalStats(a.tutorId, a.periodStart, a.periodEnd);
  if (stats.meetingCount === 0) throw new BadRequestError('There are no completed meeting reviews in this period yet');
  await prisma.appraisal.update({ where: { id }, data: { stats: stats as never } });
  await enqueueAppraisal({ appraisalId: id, triggeredBy: user.id });
  return { queued: true };
}

/** Background job: write the narrative from aggregated statistics (not raw transcripts). */
export async function generateAppraisal(id: string, triggeredBy: string | null) {
  const a = await prisma.appraisal.findUnique({ where: { id }, include: { tutor: true } });
  if (!a) return;
  const stats = await computeAppraisalStats(a.tutorId, a.periodStart, a.periodEnd);
  const rows = await loadAnalyses({ tutorId: a.tutorId, from: a.periodStart, to: a.periodEnd });
  const settings = await getSettings();
  const messages = buildAppraisalMessages({
    tutorName: fullName(a.tutor),
    periodLabel: `${a.periodStart.toISOString().slice(0, 10)} to ${a.periodEnd.toISOString().slice(0, 10)}`,
    stats,
    meetingSummaries: rows.map((r) => ({ title: r.title, date: r.meetingDate.toISOString().slice(0, 10), score: r.score, grade: r.grade, strengths: r.strengths.slice(0, 3), improvements: r.improvements.slice(0, 3) })),
    managerNotes: a.managerNotes,
    collegeName: settings.collegeName,
  });
  try {
    const llm = getLlmProvider();
    const reply = await llm.complete(messages, { purpose: 'appraisal', maxTokens: 3000 });
    const narrative = AppraisalNarrativeSchema.parse(extractJson(reply.text));
    await prisma.appraisal.update({ where: { id }, data: { stats: stats as never, narrative: narrative as never, model: reply.model, generatedAt: new Date(), status: a.status === 'DRAFT' ? 'GENERATED' : a.status } });
    if (triggeredBy) await notify({ userId: triggeredBy, type: 'APPRAISAL_SHARED', title: `Appraisal summary ready: ${a.title}`, body: 'The AI-assisted summary has been generated. Review and edit it before sharing with the tutor.', link: `/appraisals/${id}`, email: false });
    audit({ actorId: triggeredBy, action: 'appraisal.generated', entityType: 'appraisal', entityId: id, metadata: { model: reply.model } });
  } catch (err) {
    logger.error({ err, appraisalId: id }, 'appraisal generation failed');
    if (triggeredBy) await notify({ userId: triggeredBy, type: 'ANALYSIS_FAILED', title: `Appraisal summary failed: ${a.title}`, body: (err as Error).message.slice(0, 200), link: `/appraisals/${id}`, email: false });
    throw err;
  }
}

export async function deleteAppraisal(user: AuthUser, id: string) {
  const a = await prisma.appraisal.findUnique({ where: { id } });
  if (!a) throw new NotFoundError('Appraisal');
  if (a.status === 'LOCKED') throw new BadRequestError('Locked appraisals cannot be deleted');
  await prisma.appraisal.delete({ where: { id } });
  audit({ actorId: user.id, action: 'appraisal.deleted', entityType: 'appraisal', entityId: id });
}

export { asRecord };

import { REVIEWABLE_ROLES, type Competition, type CreateCompetitionInput, type Standing } from '@slc/shared';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { endOfDay, parseDateInput, startOfDay } from '../lib/dates.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';
import { fullName, isoReq } from '../lib/serialize.js';
import { groupByTutor, loadAnalyses, metricValue } from './stats.service.js';

const include = { rubric: { select: { name: true } }, department: { select: { name: true } }, participants: { include: { user: { include: { department: true } } } }, createdBy: { select: { firstName: true, lastName: true } } } satisfies Prisma.CompetitionInclude;
type Row = Prisma.CompetitionGetPayload<{ include: typeof include }>;

function statusOf(c: { startDate: Date; endDate: Date }): Competition['status'] {
  const now = new Date();
  if (now < c.startDate) return 'UPCOMING';
  if (now > c.endDate) return 'CLOSED';
  return 'ACTIVE';
}

async function standings(c: Row, viewerId: string): Promise<Standing[]> {
  const participantIds = c.participants.map((p) => p.userId);
  if (!participantIds.length) return [];
  const rows = await loadAnalyses({ tutorIds: participantIds, from: c.startDate, to: c.endDate, rubricId: c.rubricId ?? undefined });
  const byTutor = groupByTutor(rows);
  const list = c.participants.map((p) => {
    const mine = byTutor.get(p.userId) ?? [];
    const value = metricValue(c.metric, mine);
    return {
      rank: null as number | null,
      userId: p.userId,
      name: fullName(p.user),
      avatarUrl: p.user.avatarUrl,
      departmentName: p.user.department?.name ?? null,
      value,
      meetings: mine.length,
      qualifies: mine.length >= c.minMeetings && value !== null,
      isMe: p.userId === viewerId,
    };
  });
  const sorted = list.sort((a, b) => {
    if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
    return (b.value ?? -1) - (a.value ?? -1);
  });
  let rank = 0;
  for (const s of sorted) if (s.qualifies) s.rank = ++rank;
  return sorted;
}

async function serialize(c: Row, viewer: AuthUser, withStandings: boolean): Promise<Competition> {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    metric: c.metric,
    rubricId: c.rubricId,
    rubricName: c.rubric?.name ?? null,
    departmentId: c.departmentId,
    departmentName: c.department?.name ?? null,
    startDate: isoReq(c.startDate),
    endDate: isoReq(c.endDate),
    minMeetings: c.minMeetings,
    prize: c.prize,
    status: statusOf(c),
    participantCount: c.participants.length,
    joined: c.participants.some((p) => p.userId === viewer.id),
    createdBy: fullName(c.createdBy),
    standings: withStandings ? await standings(c, viewer.id) : undefined,
  };
}

export async function listCompetitions(viewer: AuthUser) {
  const rows = await prisma.competition.findMany({ include, orderBy: { startDate: 'desc' } });
  return Promise.all(rows.map((c) => serialize(c, viewer, false)));
}

export async function getCompetition(viewer: AuthUser, id: string) {
  const c = await prisma.competition.findUnique({ where: { id }, include });
  if (!c) throw new NotFoundError('Competition');
  return serialize(c, viewer, true);
}

export async function createCompetition(actor: AuthUser, input: CreateCompetitionInput) {
  const startDate = startOfDay(parseDateInput(input.startDate, 'start date'));
  const endDate = endOfDay(parseDateInput(input.endDate, 'end date'));
  if (endDate < startDate) throw new BadRequestError('The end date must be after the start date');
  const c = await prisma.competition.create({
    data: { name: input.name, description: input.description, metric: input.metric, rubricId: input.rubricId ?? null, departmentId: input.departmentId ?? null, startDate, endDate, minMeetings: input.minMeetings, prize: input.prize ?? null, autoEnrol: input.autoEnrol, createdById: actor.id },
  });
  if (input.autoEnrol) {
    const users = await prisma.user.findMany({ where: { isActive: true, role: { in: REVIEWABLE_ROLES }, ...(input.departmentId ? { departmentId: input.departmentId } : {}) } });
    await prisma.competitionParticipant.createMany({ data: users.map((u) => ({ competitionId: c.id, userId: u.id })), skipDuplicates: true });
    for (const u of users) await notify({ userId: u.id, type: 'COMPETITION_STARTED', title: `You have been entered into "${input.name}"`, body: input.description || 'See the competition page for the rules and standings.', link: `/competitions/${c.id}`, email: false });
  }
  audit({ actorId: actor.id, action: 'competition.created', entityType: 'competition', entityId: c.id, metadata: { name: input.name } });
  return getCompetition(actor, c.id);
}

export async function updateCompetition(actor: AuthUser, id: string, input: Partial<CreateCompetitionInput>) {
  const c = await prisma.competition.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      metric: input.metric,
      rubricId: input.rubricId,
      departmentId: input.departmentId,
      startDate: input.startDate ? startOfDay(parseDateInput(input.startDate)) : undefined,
      endDate: input.endDate ? endOfDay(parseDateInput(input.endDate)) : undefined,
      minMeetings: input.minMeetings,
      prize: input.prize,
    },
  });
  audit({ actorId: actor.id, action: 'competition.updated', entityType: 'competition', entityId: id });
  return getCompetition(actor, c.id);
}

export async function deleteCompetition(actor: AuthUser, id: string) {
  await prisma.competition.delete({ where: { id } });
  audit({ actorId: actor.id, action: 'competition.deleted', entityType: 'competition', entityId: id });
}

export async function joinCompetition(actor: AuthUser, id: string) {
  const c = await prisma.competition.findUnique({ where: { id } });
  if (!c) throw new NotFoundError('Competition');
  if (statusOf(c) === 'CLOSED') throw new BadRequestError('This competition has closed');
  await prisma.competitionParticipant.upsert({ where: { competitionId_userId: { competitionId: id, userId: actor.id } }, create: { competitionId: id, userId: actor.id }, update: {} });
  audit({ actorId: actor.id, action: 'competition.joined', entityType: 'competition', entityId: id });
  return getCompetition(actor, id);
}

export async function leaveCompetition(actor: AuthUser, id: string) {
  await prisma.competitionParticipant.deleteMany({ where: { competitionId: id, userId: actor.id } });
  return getCompetition(actor, id);
}

export async function addParticipants(actor: AuthUser, id: string, userIds: string[]) {
  await prisma.competitionParticipant.createMany({ data: userIds.map((userId) => ({ competitionId: id, userId })), skipDuplicates: true });
  const c = await prisma.competition.findUniqueOrThrow({ where: { id } });
  for (const userId of userIds) await notify({ userId, type: 'COMPETITION_STARTED', title: `You have been entered into "${c.name}"`, body: c.description || 'See the competition page for the rules and standings.', link: `/competitions/${id}`, email: false });
  return getCompetition(actor, id);
}

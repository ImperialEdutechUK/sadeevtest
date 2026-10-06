import { REVIEWABLE_ROLES, type CreateKpiInput, type KpiProgress } from '@slc/shared';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../plugins/auth.js';
import { hasPermission } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { endOfDay, parseDateInput, startOfDay } from '../lib/dates.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { fullName, isoReq, round1 } from '../lib/serialize.js';
import { groupByTutor, loadAnalyses, metricValue } from './stats.service.js';

const include = { department: true, user: true } satisfies Prisma.KpiInclude;
type Row = Prisma.KpiGetPayload<{ include: typeof include }>;

function progressPct(metric: string, comparison: 'AT_LEAST' | 'AT_MOST', target: number, current: number | null): number | null {
  if (current === null) return null;
  if (comparison === 'AT_MOST') return current <= target ? 100 : Math.max(0, round1(100 - ((current - target) / Math.max(target, 1)) * 100));
  return target === 0 ? 100 : Math.min(100, round1((current / target) * 100));
}

async function serializeWithProgress(k: Row, viewer: AuthUser): Promise<KpiProgress> {
  const seeEveryone = hasPermission(viewer, 'people:read');
  const filter = { from: k.periodStart, to: k.periodEnd, ...(k.userId ? { tutorId: k.userId } : k.departmentId ? { departmentId: k.departmentId } : {}) };
  const rows = await loadAnalyses(seeEveryone || k.userId === viewer.id ? filter : { ...filter, tutorId: viewer.id });
  let current: number | null;
  let perTutor: KpiProgress['perTutor'];
  if (k.userId) {
    current = metricValue(k.metric, rows);
  } else {
    // Team KPIs are judged per tutor, then summarised as the share of tutors meeting the target.
    const users = await prisma.user.findMany({ where: { isActive: true, role: { in: REVIEWABLE_ROLES }, ...(k.departmentId ? { departmentId: k.departmentId } : {}), ...(seeEveryone ? {} : { id: viewer.id }) } });
    const byTutor = groupByTutor(rows);
    perTutor = users.map((u) => {
      const mine = byTutor.get(u.id) ?? [];
      const value = metricValue(k.metric, mine);
      const met = value === null ? null : k.comparison === 'AT_LEAST' ? value >= k.target : value <= k.target;
      return { userId: u.id, name: fullName(u), value, met, sampleSize: mine.length };
    });
    current = k.metric === 'MEETINGS_REVIEWED' ? rows.length : metricValue(k.metric, rows);
  }
  const met = current === null ? null : k.comparison === 'AT_LEAST' ? current >= k.target : current <= k.target;
  return {
    id: k.id,
    name: k.name,
    description: k.description,
    metric: k.metric,
    target: k.target,
    comparison: k.comparison,
    periodStart: isoReq(k.periodStart),
    periodEnd: isoReq(k.periodEnd),
    departmentId: k.departmentId,
    departmentName: k.department?.name ?? null,
    userId: k.userId,
    userName: k.user ? fullName(k.user) : null,
    isActive: k.isActive,
    current,
    progressPct: progressPct(k.metric, k.comparison, k.target, current),
    met,
    sampleSize: rows.length,
    perTutor,
  };
}

export async function listKpis(viewer: AuthUser, q: { includeInactive?: boolean }) {
  const where: Prisma.KpiWhereInput = {
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(hasPermission(viewer, 'kpi:read') ? {} : { OR: [{ userId: viewer.id }, { userId: null, departmentId: viewer.departmentId }, { userId: null, departmentId: null }] }),
  };
  const rows = await prisma.kpi.findMany({ where, include, orderBy: [{ periodEnd: 'desc' }, { name: 'asc' }] });
  return Promise.all(rows.map((k) => serializeWithProgress(k, viewer)));
}

export async function getKpi(viewer: AuthUser, id: string) {
  const k = await prisma.kpi.findUnique({ where: { id }, include });
  if (!k) throw new NotFoundError('KPI');
  return serializeWithProgress(k, viewer);
}

export async function createKpi(actor: AuthUser, input: CreateKpiInput) {
  const periodStart = startOfDay(parseDateInput(input.periodStart, 'start date'));
  const periodEnd = endOfDay(parseDateInput(input.periodEnd, 'end date'));
  if (periodEnd < periodStart) throw new BadRequestError('The end date must be after the start date');
  const k = await prisma.kpi.create({
    data: { name: input.name, description: input.description ?? null, metric: input.metric, target: input.target, comparison: input.comparison, periodStart, periodEnd, departmentId: input.departmentId ?? null, userId: input.userId ?? null, createdById: actor.id },
    include,
  });
  audit({ actorId: actor.id, action: 'kpi.created', entityType: 'kpi', entityId: k.id, metadata: { name: input.name, metric: input.metric, target: input.target } });
  return serializeWithProgress(k, actor);
}

export async function updateKpi(actor: AuthUser, id: string, input: Partial<CreateKpiInput> & { isActive?: boolean }) {
  const existing = await prisma.kpi.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('KPI');
  const k = await prisma.kpi.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      metric: input.metric,
      target: input.target,
      comparison: input.comparison,
      periodStart: input.periodStart ? startOfDay(parseDateInput(input.periodStart)) : undefined,
      periodEnd: input.periodEnd ? endOfDay(parseDateInput(input.periodEnd)) : undefined,
      departmentId: input.departmentId,
      userId: input.userId,
      isActive: input.isActive,
    },
    include,
  });
  audit({ actorId: actor.id, action: 'kpi.updated', entityType: 'kpi', entityId: id });
  return serializeWithProgress(k, actor);
}

export async function deleteKpi(actor: AuthUser, id: string) {
  await prisma.kpi.delete({ where: { id } });
  audit({ actorId: actor.id, action: 'kpi.deleted', entityType: 'kpi', entityId: id });
}

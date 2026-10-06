import { DEFAULT_GRADE_BANDS, type DashboardSummary, type GradeBand, type PeopleListItem, type PersonPerformance, REVIEWABLE_ROLES } from '@slc/shared';
import { prisma } from '../db.js';
import type { AuthUser } from '../plugins/auth.js';
import { hasPermission } from '../plugins/auth.js';
import { addDays } from '../lib/dates.js';
import { NotFoundError } from '../lib/errors.js';
import { avg, fullName, iso, isoReq } from '../lib/serialize.js';
import { averageScore, criteriaAverages, delta, groupByTutor, loadAnalyses, metricValue, monthlyTrend, trendPoints, type AnalysisRow } from './stats.service.js';

async function defaultBands(): Promise<GradeBand[]> {
  const r = await prisma.rubric.findFirst({ where: { isDefault: true } });
  const bands = (r?.gradeBands as GradeBand[] | undefined) ?? [];
  return bands.length ? bands : [...DEFAULT_GRADE_BANDS];
}

export async function dashboardSummary(user: AuthUser, q: { from?: string; to?: string; departmentId?: string }): Promise<DashboardSummary> {
  const all = hasPermission(user, 'meeting:read:any');
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : addDays(to, -90);
  const prevFrom = addDays(from, -(to.getTime() - from.getTime()) / 86_400_000);

  const filter = all ? { departmentId: q.departmentId } : { tutorId: user.id };
  const [rows, previous, bands] = await Promise.all([
    loadAnalyses({ ...filter, from, to }),
    loadAnalyses({ ...filter, from: prevFrom, to: from }),
    defaultBands(),
  ]);

  const meetingWhere = { deletedAt: null, meetingDate: { gte: from, lte: to }, ...(all ? (q.departmentId ? { tutor: { departmentId: q.departmentId } } : {}) : { OR: [{ tutorId: user.id }, { createdById: user.id }] }) };
  const [meetings, ready, inProgress, failed, recent] = await Promise.all([
    prisma.meeting.count({ where: meetingWhere }),
    prisma.meeting.count({ where: { ...meetingWhere, status: 'READY' } }),
    prisma.meeting.count({ where: { ...meetingWhere, status: { in: ['QUEUED', 'TRANSCRIBING', 'EXTRACTING', 'ANALYSING'] } } }),
    prisma.meeting.count({ where: { ...meetingWhere, status: 'FAILED' } }),
    prisma.meeting.findMany({
      where: all ? (q.departmentId ? { deletedAt: null, tutor: { departmentId: q.departmentId } } : { deletedAt: null }) : { deletedAt: null, OR: [{ tutorId: user.id }, { createdById: user.id }] },
      include: { tutor: true, analyses: { where: { isCurrent: true }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
  ]);

  const crit = criteriaAverages(rows).filter((c) => c.average !== null);
  const hotspots = [...crit].sort((a, b) => (a.average ?? 0) - (b.average ?? 0)).slice(0, 4).map((c) => ({ code: c.code, title: c.title, categoryName: c.categoryName, average: c.average as number, count: c.count }));
  const strengths = [...crit].sort((a, b) => (b.average ?? 0) - (a.average ?? 0)).slice(0, 3).map((c) => ({ code: c.code, title: c.title, average: c.average as number }));

  const gradeDistribution = bands.map((b) => ({ label: b.label, colour: b.colour, count: rows.filter((r) => r.grade === b.label).length }));

  let departmentLeaderboard: DashboardSummary['departmentLeaderboard'];
  if (all) {
    const departments = await prisma.department.findMany();
    departmentLeaderboard = departments
      .map((d) => {
        const inDept = rows.filter((r) => r.departmentId === d.id);
        return { departmentId: d.id, name: d.name, averageScore: averageScore(inDept), meetings: inDept.length };
      })
      .filter((d) => d.meetings > 0)
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  }

  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const myMeetings = await prisma.meeting.count({ where: { deletedAt: null, OR: [{ tutorId: user.id }, { createdById: user.id }] } });
  const myReports = await prisma.meeting.count({ where: { deletedAt: null, status: 'READY', OR: [{ tutorId: user.id }, { createdById: user.id }] } });

  return {
    scope: all ? 'ALL' : 'ME',
    periodLabel: `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    totals: {
      meetings,
      ready,
      inProgress,
      failed,
      averageScore: averageScore(rows),
      previousAverageScore: averageScore(previous),
      mandatoryCoverage: avg(rows.map((r) => r.mandatoryCoverage)),
      learnerTalkShare: avg(rows.map((r) => r.learnerTalkShare)),
      activeTutors: groupByTutor(rows).size,
    },
    gradeDistribution,
    trend: monthlyTrend(rows, 6),
    criteriaHotspots: hotspots,
    topStrengths: strengths,
    recentMeetings: recent.map((m) => {
      const a = m.analyses[0];
      return { id: m.id, title: m.title, status: m.status, meetingDate: isoReq(m.meetingDate), tutorName: fullName(m.tutor), score: a?.status === 'COMPLETE' ? (a.moderatedOverallScore ?? a.overallScore) : null, grade: a?.status === 'COMPLETE' ? a.grade : null };
    }),
    departmentLeaderboard,
    onboarding: { profileComplete: !!(me.jobTitle && me.departmentId), hasMeeting: myMeetings > 0, hasReport: myReports > 0 },
  };
}

export async function listPeople(user: AuthUser, q: { departmentId?: string; search?: string; from?: string; to?: string }): Promise<PeopleListItem[]> {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : addDays(to, -365);
  const users = await prisma.user.findMany({
    where: {
      role: { in: REVIEWABLE_ROLES },
      isActive: true,
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.search ? { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
    },
    include: { department: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  const rows = await loadAnalyses({ from, to, departmentId: q.departmentId });
  const byTutor = groupByTutor(rows);
  const canSeeAll = hasPermission(user, 'people:read');
  return users
    .filter((u) => canSeeAll || u.id === user.id)
    .map((u) => {
      const mine = byTutor.get(u.id) ?? [];
      const half = Math.floor(mine.length / 2);
      const older = mine.slice(0, half);
      const newer = mine.slice(half);
      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        jobTitle: u.jobTitle,
        avatarUrl: u.avatarUrl,
        departmentName: u.department?.name ?? null,
        departmentId: u.departmentId,
        isActive: u.isActive,
        meetingCount: mine.length,
        averageScore: averageScore(mine),
        lastMeetingAt: mine.length ? isoReq(mine[mine.length - 1].meetingDate) : null,
        trendDelta: mine.length >= 4 ? delta(averageScore(newer), averageScore(older)) : null,
      };
    });
}

export async function personPerformance(user: AuthUser, userId: string, q: { from?: string; to?: string }): Promise<PersonPerformance> {
  if (userId !== user.id && !hasPermission(user, 'people:read')) throw new NotFoundError('Person');
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { department: true } });
  if (!u) throw new NotFoundError('Person');
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : addDays(to, -365);
  const [mine, dept, college] = await Promise.all([
    loadAnalyses({ tutorId: userId, from, to }),
    u.departmentId ? loadAnalyses({ departmentId: u.departmentId, from, to }) : Promise.resolve([] as AnalysisRow[]),
    loadAnalyses({ from, to }),
  ]);
  const collegeCriteria = new Map(criteriaAverages(college).map((c) => [c.code, c.average]));
  const recent = await prisma.meeting.findMany({
    where: { tutorId: userId, deletedAt: null },
    include: { analyses: { where: { isCurrent: true }, take: 1 } },
    orderBy: { meetingDate: 'desc' },
    take: 8,
  });
  const kpis = await prisma.kpi.findMany({ where: { isActive: true, periodEnd: { gte: from }, periodStart: { lte: to }, OR: [{ userId }, { userId: null, departmentId: u.departmentId }, { userId: null, departmentId: null }] } });
  const meetingCount = await prisma.meeting.count({ where: { tutorId: userId, deletedAt: null } });
  return {
    user: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, jobTitle: u.jobTitle, bio: u.bio, avatarUrl: u.avatarUrl, departmentName: u.department?.name ?? null, createdAt: isoReq(u.createdAt) },
    meetingCount,
    readyCount: mine.length,
    averageScore: averageScore(mine),
    departmentAverage: dept.length ? averageScore(dept) : null,
    collegeAverage: averageScore(college),
    mandatoryCoverage: avg(mine.map((r) => r.mandatoryCoverage)),
    learnerTalkShare: avg(mine.map((r) => r.learnerTalkShare)),
    trend: trendPoints(mine),
    criteriaAverages: criteriaAverages(mine).map((c) => ({ ...c, collegeAverage: collegeCriteria.get(c.code) ?? null })),
    recentMeetings: recent.map((m) => {
      const a = m.analyses[0];
      return { id: m.id, title: m.title, meetingDate: isoReq(m.meetingDate), status: m.status, score: a?.status === 'COMPLETE' ? (a.moderatedOverallScore ?? a.overallScore) : null, grade: a?.status === 'COMPLETE' ? a.grade : null };
    }),
    kpis: kpis.map((k) => {
      const inPeriod = mine.filter((r) => r.meetingDate >= k.periodStart && r.meetingDate <= k.periodEnd);
      const current = metricValue(k.metric, inPeriod);
      const met = current === null ? null : k.comparison === 'AT_LEAST' ? current >= k.target : current <= k.target;
      return { id: k.id, name: k.name, metric: k.metric, target: k.target, current, met };
    }),
  };
}

export { iso };

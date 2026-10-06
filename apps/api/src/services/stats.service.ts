import { gradeFor, type GradeBand } from '@slc/shared';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { asArray, asRecord, avg, round1 } from '../lib/serialize.js';

/**
 * Aggregations over completed analyses. Everything here is plain arithmetic
 * on stored scores so dashboards, KPIs, competitions and appraisals all agree.
 */

export interface AnalysisRow {
  meetingId: string;
  title: string;
  meetingDate: Date;
  tutorId: string;
  departmentId: string | null;
  rubricId: string;
  score: number; // effective (moderated if present)
  grade: string | null;
  mandatoryCoverage: number | null;
  learnerTalkShare: number | null;
  criteria: { criterionId: string; code: string; title: string; categoryName: string; score: number | null }[];
  strengths: string[];
  improvements: string[];
}

export interface AnalysisFilter {
  from?: Date;
  to?: Date;
  tutorId?: string;
  tutorIds?: string[];
  departmentId?: string;
  rubricId?: string;
}

export function effectiveScore(a: { overallScore: number | null; moderatedOverallScore: number | null }): number | null {
  return a.moderatedOverallScore ?? a.overallScore;
}

export async function loadAnalyses(filter: AnalysisFilter): Promise<AnalysisRow[]> {
  const where: Prisma.AnalysisWhereInput = {
    status: 'COMPLETE',
    isCurrent: true,
    meeting: {
      deletedAt: null,
      status: 'READY',
      ...(filter.tutorId ? { tutorId: filter.tutorId } : {}),
      ...(filter.tutorIds ? { tutorId: { in: filter.tutorIds } } : {}),
      ...(filter.departmentId ? { tutor: { departmentId: filter.departmentId } } : {}),
      ...(filter.from || filter.to ? { meetingDate: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    },
    ...(filter.rubricId ? { rubricId: filter.rubricId } : {}),
  };
  const rows = await prisma.analysis.findMany({
    where,
    include: {
      meeting: { select: { id: true, title: true, meetingDate: true, tutorId: true, tutor: { select: { departmentId: true } } } },
      criteria: { include: { criterion: { select: { id: true, code: true, title: true, category: { select: { name: true } } } } } },
    },
    orderBy: { meeting: { meetingDate: 'asc' } },
  });
  return rows
    .map((a) => {
      const score = effectiveScore(a);
      if (score === null) return null;
      const metrics = asRecord(a.metrics);
      return {
        meetingId: a.meeting.id,
        title: a.meeting.title,
        meetingDate: a.meeting.meetingDate,
        tutorId: a.meeting.tutorId,
        departmentId: a.meeting.tutor.departmentId,
        rubricId: a.rubricId,
        score,
        grade: a.grade,
        mandatoryCoverage: a.mandatoryCoverage,
        learnerTalkShare: typeof metrics?.learnerTalkShare === 'number' ? (metrics.learnerTalkShare as number) : null,
        criteria: a.criteria.map((c) => ({
          criterionId: c.criterionId,
          code: c.criterion.code.split('~')[0],
          title: c.criterion.title,
          categoryName: c.criterion.category.name,
          score: c.notApplicable ? null : (c.moderatedScore ?? c.score),
        })),
        strengths: asArray<string>(a.strengths),
        improvements: asArray<string>(a.improvements),
      } satisfies AnalysisRow;
    })
    .filter((r): r is AnalysisRow => r !== null);
}

export function averageScore(rows: AnalysisRow[]): number | null {
  return avg(rows.map((r) => r.score));
}

export interface CriterionAverage {
  code: string;
  title: string;
  categoryName: string;
  average: number | null;
  count: number;
}

export function criteriaAverages(rows: AnalysisRow[]): CriterionAverage[] {
  const map = new Map<string, { title: string; categoryName: string; scores: number[] }>();
  for (const r of rows) {
    for (const c of r.criteria) {
      if (c.score === null) continue;
      const entry = map.get(c.code) ?? { title: c.title, categoryName: c.categoryName, scores: [] };
      entry.scores.push(c.score);
      map.set(c.code, entry);
    }
  }
  return [...map.entries()]
    .map(([code, e]) => ({ code, title: e.title, categoryName: e.categoryName, average: avg(e.scores), count: e.scores.length }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function gradeCounts(rows: AnalysisRow[], bands: readonly GradeBand[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of bands) counts[b.label] = 0;
  for (const r of rows) {
    const label = r.grade ?? gradeFor(r.score, bands).label;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

export function trendPoints(rows: AnalysisRow[]) {
  return rows.map((r) => ({ date: r.meetingDate.toISOString(), score: r.score, meetingId: r.meetingId, title: r.title }));
}

export function monthlyTrend(rows: AnalysisRow[], months = 6) {
  const now = new Date();
  const out: { month: string; averageScore: number | null; meetings: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const inMonth = rows.filter((r) => r.meetingDate.toISOString().slice(0, 7) === key);
    out.push({ month: key, averageScore: averageScore(inMonth), meetings: inMonth.length });
  }
  return out;
}

/** Value of a KPI-style metric over a set of analyses. */
export function metricValue(metric: 'AVERAGE_SCORE' | 'MEETINGS_REVIEWED' | 'MANDATORY_COVERAGE' | 'LEARNER_TALK_SHARE', rows: AnalysisRow[]): number | null {
  switch (metric) {
    case 'AVERAGE_SCORE':
      return averageScore(rows);
    case 'MEETINGS_REVIEWED':
      return rows.length;
    case 'MANDATORY_COVERAGE':
      return avg(rows.map((r) => r.mandatoryCoverage));
    case 'LEARNER_TALK_SHARE':
      return avg(rows.map((r) => r.learnerTalkShare));
  }
}

export function groupByTutor(rows: AnalysisRow[]): Map<string, AnalysisRow[]> {
  const map = new Map<string, AnalysisRow[]>();
  for (const r of rows) map.set(r.tutorId, [...(map.get(r.tutorId) ?? []), r]);
  return map;
}

export function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return round1(a - b);
}

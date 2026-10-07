import { z } from 'zod';
import { KPI_METRICS, APPRAISAL_STATUSES, COMPETITION_STATUSES } from '../enums.js';
import { AppraisalNarrativeSchema } from '../analysisOutput.js';

/* ---------- KPIs ---------- */
export const CreateKpiSchema = z.object({
  name: z.string().min(1).max(120),
  metric: z.enum(KPI_METRICS),
  target: z.number().min(0).max(100000),
  comparison: z.enum(['AT_LEAST', 'AT_MOST']).default('AT_LEAST'),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  departmentId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  description: z.string().max(600).nullable().optional(),
});
export type CreateKpiInput = z.infer<typeof CreateKpiSchema>;
export const UpdateKpiSchema = CreateKpiSchema.partial().extend({ isActive: z.boolean().optional() });

export const KpiProgressSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  metric: z.enum(KPI_METRICS),
  target: z.number(),
  comparison: z.enum(['AT_LEAST', 'AT_MOST']),
  periodStart: z.string(),
  periodEnd: z.string(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  isActive: z.boolean(),
  current: z.number().nullable(),
  progressPct: z.number().nullable(),
  met: z.boolean().nullable(),
  sampleSize: z.number(),
  perTutor: z
    .array(z.object({ userId: z.string(), name: z.string(), value: z.number().nullable(), met: z.boolean().nullable(), sampleSize: z.number() }))
    .optional(),
});
export type KpiProgress = z.infer<typeof KpiProgressSchema>;

/* ---------- Competitions ---------- */
export const CreateCompetitionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  metric: z.enum(KPI_METRICS).default('AVERAGE_SCORE'),
  rubricId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  minMeetings: z.number().int().min(1).max(100).default(3),
  prize: z.string().max(300).nullable().optional(),
  autoEnrol: z.boolean().default(false),
});
export type CreateCompetitionInput = z.infer<typeof CreateCompetitionSchema>;
export const UpdateCompetitionSchema = CreateCompetitionSchema.partial();

export const StandingSchema = z.object({
  rank: z.number().int().nullable(),
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  departmentName: z.string().nullable(),
  value: z.number().nullable(),
  meetings: z.number().int(),
  qualifies: z.boolean(),
  isMe: z.boolean(),
});
export const CompetitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  metric: z.enum(KPI_METRICS),
  rubricId: z.string().nullable(),
  rubricName: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  minMeetings: z.number().int(),
  prize: z.string().nullable(),
  status: z.enum(COMPETITION_STATUSES),
  participantCount: z.number().int(),
  joined: z.boolean(),
  createdBy: z.string(),
  standings: z.array(StandingSchema).optional(),
});
export type Competition = z.infer<typeof CompetitionSchema>;
export type Standing = z.infer<typeof StandingSchema>;

/* ---------- Appraisals ---------- */
export const CreateAppraisalSchema = z.object({
  tutorId: z.string().min(1),
  title: z.string().min(1).max(160),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  managerNotes: z.string().max(4000).nullable().optional(),
});
export type CreateAppraisalInput = z.infer<typeof CreateAppraisalSchema>;
export const UpdateAppraisalSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  managerNotes: z.string().max(4000).nullable().optional(),
  tutorComment: z.string().max(4000).nullable().optional(),
  status: z.enum(APPRAISAL_STATUSES).optional(),
});

export const AppraisalStatsSchema = z.object({
  meetingCount: z.number().int(),
  averageScore: z.number().nullable(),
  bestScore: z.number().nullable(),
  lowestScore: z.number().nullable(),
  averageMandatoryCoverage: z.number().nullable(),
  averageLearnerTalkShare: z.number().nullable(),
  departmentAverage: z.number().nullable(),
  collegeAverage: z.number().nullable(),
  trend: z.array(z.object({ date: z.string(), score: z.number(), meetingId: z.string(), title: z.string() })),
  criteriaAverages: z.array(
    z.object({ code: z.string(), title: z.string(), categoryName: z.string(), average: z.number().nullable(), count: z.number().int(), collegeAverage: z.number().nullable() }),
  ),
  gradeCounts: z.record(z.string(), z.number()),
});
export type AppraisalStats = z.infer<typeof AppraisalStatsSchema>;

export const AppraisalSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(APPRAISAL_STATUSES),
  tutor: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable(), jobTitle: z.string().nullable(), departmentName: z.string().nullable() }),
  createdBy: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
  periodStart: z.string(),
  periodEnd: z.string(),
  managerNotes: z.string().nullable(),
  tutorComment: z.string().nullable(),
  stats: AppraisalStatsSchema.nullable(),
  narrative: AppraisalNarrativeSchema.nullable(),
  generatedAt: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Appraisal = z.infer<typeof AppraisalSchema>;

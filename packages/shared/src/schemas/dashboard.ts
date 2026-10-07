import { z } from 'zod';

export const DashboardSummarySchema = z.object({
  scope: z.enum(['ME', 'ALL']),
  periodLabel: z.string(),
  totals: z.object({
    meetings: z.number().int(),
    ready: z.number().int(),
    inProgress: z.number().int(),
    failed: z.number().int(),
    averageScore: z.number().nullable(),
    previousAverageScore: z.number().nullable(),
    mandatoryCoverage: z.number().nullable(),
    learnerTalkShare: z.number().nullable(),
    activeTutors: z.number().int(),
  }),
  gradeDistribution: z.array(z.object({ label: z.string(), colour: z.string(), count: z.number().int() })),
  trend: z.array(z.object({ month: z.string(), averageScore: z.number().nullable(), meetings: z.number().int() })),
  criteriaHotspots: z.array(
    z.object({ code: z.string(), title: z.string(), categoryName: z.string(), average: z.number(), count: z.number().int() }),
  ),
  topStrengths: z.array(z.object({ code: z.string(), title: z.string(), average: z.number() })),
  recentMeetings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      meetingDate: z.string(),
      tutorName: z.string(),
      score: z.number().nullable(),
      grade: z.string().nullable(),
    }),
  ),
  departmentLeaderboard: z
    .array(z.object({ departmentId: z.string().nullable(), name: z.string(), averageScore: z.number().nullable(), meetings: z.number().int() }))
    .optional(),
  onboarding: z.object({
    profileComplete: z.boolean(),
    hasMeeting: z.boolean(),
    hasReport: z.boolean(),
  }),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const PersonPerformanceSchema = z.object({
  user: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    role: z.string(),
    jobTitle: z.string().nullable(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    departmentName: z.string().nullable(),
    createdAt: z.string(),
  }),
  meetingCount: z.number().int(),
  readyCount: z.number().int(),
  averageScore: z.number().nullable(),
  departmentAverage: z.number().nullable(),
  collegeAverage: z.number().nullable(),
  mandatoryCoverage: z.number().nullable(),
  learnerTalkShare: z.number().nullable(),
  trend: z.array(z.object({ date: z.string(), score: z.number(), meetingId: z.string(), title: z.string() })),
  criteriaAverages: z.array(
    z.object({ code: z.string(), title: z.string(), categoryName: z.string(), average: z.number().nullable(), count: z.number().int(), collegeAverage: z.number().nullable() }),
  ),
  recentMeetings: z.array(
    z.object({ id: z.string(), title: z.string(), meetingDate: z.string(), status: z.string(), score: z.number().nullable(), grade: z.string().nullable() }),
  ),
  kpis: z.array(z.object({ id: z.string(), name: z.string(), metric: z.string(), target: z.number(), current: z.number().nullable(), met: z.boolean().nullable() })),
});
export type PersonPerformance = z.infer<typeof PersonPerformanceSchema>;

export const PeopleListItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.string(),
  jobTitle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  departmentName: z.string().nullable(),
  departmentId: z.string().nullable(),
  isActive: z.boolean(),
  meetingCount: z.number().int(),
  averageScore: z.number().nullable(),
  lastMeetingAt: z.string().nullable(),
  trendDelta: z.number().nullable(),
});
export type PeopleListItem = z.infer<typeof PeopleListItemSchema>;

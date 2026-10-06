import { z } from 'zod';
import { CONFIDENCE_LEVELS } from '../enums.js';
import { ActionItemSchema, EvidenceSchema, MaterialCoverageSchema, RiskSchema } from '../analysisOutput.js';
import { GradeBandSchema } from './rubrics.js';

export const CriterionResultSchema = z.object({
  id: z.string(),
  criterionId: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  categoryName: z.string(),
  weight: z.number(),
  isMandatory: z.boolean(),
  descriptors: z.record(z.string(), z.string()),
  frameworkRefs: z.array(z.object({ framework: z.string(), note: z.string(), url: z.string().optional() })),
  score: z.number().nullable(),
  notApplicable: z.boolean(),
  rationale: z.string(),
  evidence: z.array(EvidenceSchema),
  suggestion: z.string().nullable(),
  moderatedScore: z.number().nullable(),
  moderationNote: z.string().nullable(),
  effectiveScore: z.number().nullable(), // moderatedScore ?? score
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const AnalysisSchema = z.object({
  id: z.string(),
  meetingId: z.string(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETE', 'FAILED']),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  promptVersion: z.string().nullable(),
  rubricId: z.string(),
  rubricName: z.string(),
  rubricVersion: z.number(),
  gradeBands: z.array(GradeBandSchema),
  overallScore: z.number().nullable(),
  moderatedOverallScore: z.number().nullable(),
  effectiveOverallScore: z.number().nullable(),
  grade: z.string().nullable(),
  mandatoryCoverage: z.number().nullable(),
  summary: z.string().nullable(),
  learnerExperience: z.string().nullable(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  actionPlan: z.array(ActionItemSchema),
  risks: z.array(RiskSchema),
  materialsCoverage: z.array(MaterialCoverageSchema),
  metrics: z.record(z.string(), z.unknown()).nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable(),
  confidenceReason: z.string().nullable(),
  inputsUsed: z.array(z.string()),
  tokenUsage: z.record(z.string(), z.number()).nullable(),
  scoreBreakdown: z.record(z.string(), z.unknown()).nullable(),
  criteria: z.array(CriterionResultSchema),
  moderation: z
    .object({
      moderatorName: z.string(),
      note: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const ModerateAnalysisSchema = z.object({
  note: z.string().min(5, 'Explain the reason for the change').max(2000),
  criteria: z
    .array(
      z.object({
        criterionResultId: z.string(),
        moderatedScore: z.number().int().min(1).max(5).nullable(),
        moderationNote: z.string().max(600).nullable().optional(),
      }),
    )
    .default([]),
});
export type ModerateAnalysisInput = z.infer<typeof ModerateAnalysisSchema>;

export const CreateCommentSchema = z.object({ body: z.string().min(1).max(3000) });
export const CommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  author: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable(), role: z.string() }),
});
export type Comment = z.infer<typeof CommentSchema>;

export const TranscriptSchema = z.object({
  id: z.string(),
  source: z.string(),
  language: z.string().nullable(),
  wordCount: z.number(),
  segments: z.array(z.object({ start: z.number(), end: z.number(), speaker: z.string(), text: z.string() })),
  speakerMap: z.record(z.string(), z.enum(['TUTOR', 'LEARNER', 'OTHER'])),
  speakerLabels: z.array(z.string()),
  createdAt: z.string(),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

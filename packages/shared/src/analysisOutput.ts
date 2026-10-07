import { z } from 'zod';

/**
 * The exact JSON structure we ask the language model to return.
 * Validated with Zod before anything is saved, so a malformed answer never
 * reaches a report.
 */
export const EvidenceSchema = z.object({
  quote: z.string().min(1).max(600),
  startSeconds: z.number().min(0).nullable().optional(),
  speaker: z.string().max(80).nullable().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const CriterionOutputSchema = z.object({
  criterionCode: z.string().min(1).max(40),
  score: z.number().int().min(1).max(5).nullable(),
  notApplicable: z.boolean().default(false),
  rationale: z.string().min(1).max(1500),
  evidence: z.array(EvidenceSchema).max(6).default([]),
  suggestion: z.string().max(800).nullable().optional(),
});
export type CriterionOutput = z.infer<typeof CriterionOutputSchema>;

export const ActionItemSchema = z.object({
  action: z.string().min(1).max(400),
  why: z.string().max(400).nullable().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
});

export const RiskSchema = z.object({
  type: z.enum(['SAFEGUARDING', 'COMPLIANCE', 'DATA_PROTECTION', 'WELLBEING', 'OTHER']),
  note: z.string().min(1).max(600),
  startSeconds: z.number().min(0).nullable().optional(),
});

export const MaterialCoverageSchema = z.object({
  topic: z.string().min(1).max(200),
  covered: z.boolean(),
  note: z.string().max(400).nullable().optional(),
});

export const AnalysisOutputSchema = z.object({
  speakerRoles: z.record(z.string(), z.enum(['TUTOR', 'LEARNER', 'OTHER'])).default({}),
  summary: z.string().min(1).max(2500),
  strengths: z.array(z.string().min(1).max(400)).min(1).max(6),
  improvements: z.array(z.string().min(1).max(400)).max(6).default([]),
  actionPlan: z.array(ActionItemSchema).max(6).default([]),
  criteria: z.array(CriterionOutputSchema).min(1),
  risks: z.array(RiskSchema).max(10).default([]),
  materialsCoverage: z.array(MaterialCoverageSchema).max(40).default([]),
  learnerExperience: z.string().max(1200).nullable().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  confidenceReason: z.string().min(1).max(600),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

/** Output of the appraisal narrative generation. */
export const AppraisalNarrativeSchema = z.object({
  headline: z.string().min(1).max(300),
  overview: z.string().min(1).max(2500),
  strengths: z.array(z.string().min(1).max(400)).max(8),
  developmentAreas: z.array(z.string().min(1).max(400)).max(8),
  suggestedCpd: z.array(z.string().min(1).max(300)).max(6).default([]),
  evidenceNotes: z.array(z.string().min(1).max(400)).max(8).default([]),
});
export type AppraisalNarrative = z.infer<typeof AppraisalNarrativeSchema>;

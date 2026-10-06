import { describe, expect, it } from 'vitest';
import { AnalysisOutputSchema, AppraisalNarrativeSchema, INDUCTION_PRESET_RUBRIC, computeTranscriptMetrics } from '@slc/shared';
import { MockLlmProvider } from '../providers/llm/mock.js';
import { extractJson } from '../providers/llm/index.js';
import { buildAnalysisMessages, buildAppraisalMessages } from '../providers/llm/prompts.js';
import { SAMPLE_TRANSCRIPT_SEGMENTS } from '../seed/sampleTranscript.js';

const rubric = {
  name: INDUCTION_PRESET_RUBRIC.name,
  meetingTypeLabel: 'Induction meeting',
  categories: INDUCTION_PRESET_RUBRIC.categories.map((c) => ({ name: c.name, description: c.description, criteria: c.criteria.map((k) => ({ code: k.code, title: k.title, description: k.description, weight: k.weight, isMandatory: k.isMandatory, descriptors: k.descriptors })) })),
};

describe('mock reviewer', () => {
  it('returns output that matches the schema and covers every criterion', async () => {
    const { messages } = buildAnalysisMessages({
      rubric,
      segments: SAMPLE_TRANSCRIPT_SEGMENTS,
      metrics: computeTranscriptMetrics(SAMPLE_TRANSCRIPT_SEGMENTS, { spk_0: 'TUTOR', spk_1: 'LEARNER' }),
      meeting: { title: 'Induction', meetingDate: '2026-10-01', programme: null, learnerFirstName: 'Priya', tutorName: 'Daniel Okafor', notes: null },
      learnerProfileText: null,
      presentationText: null,
      otherDocumentsText: null,
      collegeName: 'South London College',
    });
    const reply = await new MockLlmProvider().complete(messages);
    const parsed = AnalysisOutputSchema.parse(extractJson(reply.text));
    const codes = INDUCTION_PRESET_RUBRIC.categories.flatMap((c) => c.criteria.map((k) => k.code));
    expect(parsed.criteria.map((c) => c.criterionCode).sort()).toEqual([...codes].sort());
    expect(parsed.speakerRoles).toEqual({ spk_0: 'TUTOR', spk_1: 'LEARNER' });
    const f2 = parsed.criteria.find((c) => c.criterionCode === 'F2');
    expect(f2?.notApplicable).toBe(true);
    const d1 = parsed.criteria.find((c) => c.criterionCode === 'D1');
    expect(d1?.score).toBeLessThanOrEqual(3); // Prevent is not explained in the sample
    expect(parsed.risks[0]?.type).toBe('WELLBEING');
  }, 15000);

  it('writes an appraisal narrative from statistics', async () => {
    const messages = buildAppraisalMessages({ tutorName: 'Daniel', periodLabel: '2026', stats: { meetingCount: 3, averageScore: 70, collegeAverage: 75, criteriaAverages: [{ title: 'A', average: 4 }, { title: 'B', average: 2 }] }, meetingSummaries: [], managerNotes: null, collegeName: 'SLC' });
    const reply = await new MockLlmProvider().complete(messages);
    const parsed = AppraisalNarrativeSchema.parse(extractJson(reply.text));
    expect(parsed.strengths[0]).toContain('A');
  }, 15000);
});

describe('extractJson', () => {
  it('tolerates code fences and preambles', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('no json here')).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { computeOverallScore, computeTranscriptMetrics, gradeFor, formatTimestamp } from './scoring.js';

describe('computeOverallScore', () => {
  it('weights criteria and converts to a percentage', () => {
    const r = computeOverallScore([
      { criterionId: 'a', weight: 1, isMandatory: true, score: 5, notApplicable: false },
      { criterionId: 'b', weight: 2, isMandatory: true, score: 3, notApplicable: false },
      { criterionId: 'c', weight: 1, isMandatory: false, score: null, notApplicable: true },
    ]);
    // (5*1 + 3*2) / (5*1 + 5*2) = 11/15 = 73.3
    expect(r.overallScore).toBe(73.3);
    expect(r.applicableCount).toBe(2);
    expect(r.mandatoryTotal).toBe(2);
    expect(r.mandatoryCovered).toBe(2);
    expect(r.mandatoryCoverage).toBe(100);
  });
  it('counts a mandatory score below 3 as not covered', () => {
    const r = computeOverallScore([
      { criterionId: 'a', weight: 1, isMandatory: true, score: 2, notApplicable: false },
      { criterionId: 'b', weight: 1, isMandatory: true, score: 4, notApplicable: false },
    ]);
    expect(r.mandatoryCoverage).toBe(50);
  });
  it('returns 0 when nothing is applicable', () => {
    expect(computeOverallScore([]).overallScore).toBe(0);
  });
});

describe('gradeFor', () => {
  it('maps to the default bands', () => {
    expect(gradeFor(90).label).toBe('Excellent');
    expect(gradeFor(70).label).toBe('Good');
    expect(gradeFor(60).label).toBe('Developing');
    expect(gradeFor(10).label).toBe('Needs support');
  });
});

describe('computeTranscriptMetrics', () => {
  it('computes talk share and questions', () => {
    const m = computeTranscriptMetrics(
      [
        { start: 0, end: 10, speaker: 'spk_0', text: 'Hello and welcome. What are you hoping to get from the course?' },
        { start: 10, end: 20, speaker: 'spk_1', text: 'I want to become a nurse. Is that realistic?' },
        { start: 20, end: 40, speaker: 'spk_0', text: 'Yes it is. We will talk about progression later.' },
      ],
      { spk_0: 'TUTOR', spk_1: 'LEARNER' },
    );
    expect(m.tutorQuestions).toBe(1);
    expect(m.tutorOpenQuestions).toBe(1);
    expect(m.learnerQuestions).toBe(1);
    expect(m.turnCount).toBe(3);
    expect(m.tutorTalkShare + m.learnerTalkShare).toBeCloseTo(100, 0);
    expect(m.longestTutorMonologueSeconds).toBe(20);
    expect(m.durationSeconds).toBe(40);
  });
});

describe('formatTimestamp', () => {
  it('formats minutes and hours', () => {
    expect(formatTimestamp(65)).toBe('01:05');
    expect(formatTimestamp(3725)).toBe('1:02:05');
  });
});

import { DEFAULT_GRADE_BANDS, SCORE_SCALE_MAX, type GradeBand } from './constants.js';
import type { SpeakerRole } from './enums.js';

/**
 * Deterministic scoring. The language model produces a score per criterion
 * (with evidence); everything below is plain arithmetic that the UI shows in
 * the "How this score was calculated" panel, so a reviewer can check it by hand.
 */

export interface CriterionForScoring {
  criterionId: string;
  weight: number;
  isMandatory: boolean;
  /** 1..5, or null when the criterion was not applicable to this meeting. */
  score: number | null;
  notApplicable: boolean;
}

export interface ScoreBreakdownRow {
  criterionId: string;
  weight: number;
  score: number | null;
  notApplicable: boolean;
  weightedPoints: number; // score * weight
  maxPoints: number; // scaleMax * weight (0 if not applicable)
}

export interface OverallScoreResult {
  overallScore: number; // 0..100, rounded to 1 dp
  totalWeightedPoints: number;
  totalMaxPoints: number;
  applicableCount: number;
  rows: ScoreBreakdownRow[];
  mandatoryTotal: number;
  mandatoryCovered: number;
  mandatoryCoverage: number; // 0..100
}

export const MANDATORY_COVERED_THRESHOLD = 3; // score >= 3 counts as "covered adequately"

export function computeOverallScore(
  criteria: CriterionForScoring[],
  scaleMax: number = SCORE_SCALE_MAX,
): OverallScoreResult {
  let totalWeightedPoints = 0;
  let totalMaxPoints = 0;
  let applicableCount = 0;
  let mandatoryTotal = 0;
  let mandatoryCovered = 0;

  const rows: ScoreBreakdownRow[] = criteria.map((c) => {
    const applicable = !c.notApplicable && c.score !== null;
    const score = applicable ? clamp(Math.round(c.score as number), 1, scaleMax) : null;
    const weightedPoints = applicable ? (score as number) * c.weight : 0;
    const maxPoints = applicable ? scaleMax * c.weight : 0;
    if (applicable) {
      totalWeightedPoints += weightedPoints;
      totalMaxPoints += maxPoints;
      applicableCount += 1;
    }
    if (c.isMandatory) {
      mandatoryTotal += 1;
      if (applicable && (score as number) >= MANDATORY_COVERED_THRESHOLD) mandatoryCovered += 1;
    }
    return { criterionId: c.criterionId, weight: c.weight, score, notApplicable: !applicable, weightedPoints, maxPoints };
  });

  const overallScore = totalMaxPoints === 0 ? 0 : round1((totalWeightedPoints / totalMaxPoints) * 100);
  const mandatoryCoverage = mandatoryTotal === 0 ? 100 : round1((mandatoryCovered / mandatoryTotal) * 100);
  return {
    overallScore,
    totalWeightedPoints,
    totalMaxPoints,
    applicableCount,
    rows,
    mandatoryTotal,
    mandatoryCovered,
    mandatoryCoverage,
  };
}

export function gradeFor(score: number, bands: readonly GradeBand[] = DEFAULT_GRADE_BANDS): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const band of sorted) if (score >= band.min) return band;
  return sorted[sorted.length - 1];
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Transcript metrics - computed directly from the words, no AI involved */
/* ------------------------------------------------------------------ */

export interface TranscriptSegment {
  start: number; // seconds
  end: number; // seconds
  speaker: string; // raw speaker label e.g. "spk_0" or "Jane Smith"
  text: string;
}

export type SpeakerMap = Record<string, SpeakerRole>;

export interface TranscriptMetrics {
  durationSeconds: number;
  totalWords: number;
  tutorWords: number;
  learnerWords: number;
  tutorTalkShare: number; // % of words spoken by tutor (0..100)
  learnerTalkShare: number;
  tutorQuestions: number;
  learnerQuestions: number;
  tutorOpenQuestions: number;
  longestTutorMonologueSeconds: number;
  wordsPerMinute: number;
  turnCount: number;
  speakerWordCounts: Record<string, number>;
}

const OPEN_QUESTION_STARTERS = [
  'what',
  'how',
  'why',
  'tell me',
  'describe',
  'explain',
  'which',
  'where',
  'when',
  'who',
  'could you tell',
  'can you tell',
  'what about',
];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function computeTranscriptMetrics(
  segments: TranscriptSegment[],
  speakerMap: SpeakerMap,
): TranscriptMetrics {
  const speakerWordCounts: Record<string, number> = {};
  let totalWords = 0;
  let tutorWords = 0;
  let learnerWords = 0;
  let tutorQuestions = 0;
  let learnerQuestions = 0;
  let tutorOpenQuestions = 0;
  let longestTutorMonologueSeconds = 0;
  let currentMonologueStart: number | null = null;
  let currentMonologueEnd = 0;
  let turnCount = 0;
  let lastSpeaker: string | null = null;

  for (const seg of segments) {
    const words = countWords(seg.text);
    totalWords += words;
    speakerWordCounts[seg.speaker] = (speakerWordCounts[seg.speaker] ?? 0) + words;
    const role = speakerMap[seg.speaker] ?? 'OTHER';
    if (seg.speaker !== lastSpeaker) {
      turnCount += 1;
      lastSpeaker = seg.speaker;
    }
    const sentences = splitSentences(seg.text);
    const questions = sentences.filter((s) => s.endsWith('?'));
    if (role === 'TUTOR') {
      tutorWords += words;
      tutorQuestions += questions.length;
      tutorOpenQuestions += questions.filter((q) => {
        const lower = q.toLowerCase();
        return OPEN_QUESTION_STARTERS.some((st) => lower.startsWith(st));
      }).length;
      if (currentMonologueStart === null) currentMonologueStart = seg.start;
      currentMonologueEnd = seg.end;
    } else {
      if (role === 'LEARNER') {
        learnerWords += words;
        learnerQuestions += questions.length;
      }
      if (currentMonologueStart !== null) {
        longestTutorMonologueSeconds = Math.max(
          longestTutorMonologueSeconds,
          currentMonologueEnd - currentMonologueStart,
        );
        currentMonologueStart = null;
      }
    }
  }
  if (currentMonologueStart !== null) {
    longestTutorMonologueSeconds = Math.max(
      longestTutorMonologueSeconds,
      currentMonologueEnd - currentMonologueStart,
    );
  }

  const durationSeconds = segments.length ? Math.max(...segments.map((s) => s.end)) : 0;
  const spoken = tutorWords + learnerWords;
  return {
    durationSeconds: round1(durationSeconds),
    totalWords,
    tutorWords,
    learnerWords,
    tutorTalkShare: spoken ? round1((tutorWords / spoken) * 100) : 0,
    learnerTalkShare: spoken ? round1((learnerWords / spoken) * 100) : 0,
    tutorQuestions,
    learnerQuestions,
    tutorOpenQuestions,
    longestTutorMonologueSeconds: round1(longestTutorMonologueSeconds),
    wordsPerMinute: durationSeconds > 0 ? Math.round(totalWords / (durationSeconds / 60)) : 0,
    turnCount,
    speakerWordCounts,
  };
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

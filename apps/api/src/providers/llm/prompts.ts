import { formatTimestamp, PROMPT_VERSION, type TranscriptMetrics, type TranscriptSegment } from '@slc/shared';
import type { LlmMessage } from './index.js';

export interface RubricForPrompt {
  name: string;
  meetingTypeLabel: string;
  categories: {
    name: string;
    description: string;
    criteria: {
      code: string;
      title: string;
      description: string;
      weight: number;
      isMandatory: boolean;
      descriptors: Record<string, string>;
    }[];
  }[];
}

export interface AnalysisPromptInput {
  rubric: RubricForPrompt;
  segments: TranscriptSegment[];
  metrics: TranscriptMetrics | null;
  meeting: { title: string; meetingDate: string; programme: string | null; learnerFirstName: string | null; tutorName: string; notes: string | null };
  learnerProfileText: string | null;
  presentationText: string | null;
  otherDocumentsText: string | null;
  collegeName: string;
}

export const MAX_TRANSCRIPT_CHARS = 140_000;
export const MAX_DOC_CHARS = 16_000;

export const RUBRIC_BLOCK_START = '<<<RUBRIC_JSON>>>';
export const RUBRIC_BLOCK_END = '<<<END_RUBRIC_JSON>>>';
export const TRANSCRIPT_BLOCK_START = '<<<TRANSCRIPT>>>';
export const TRANSCRIPT_BLOCK_END = '<<<END_TRANSCRIPT>>>';

export function formatTranscript(segments: TranscriptSegment[]): { text: string; truncated: boolean } {
  const lines = segments.map((s) => `[${formatTimestamp(s.start)}] ${s.speaker}: ${s.text}`);
  let text = lines.join('\n');
  let truncated = false;
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = `${text.slice(0, MAX_TRANSCRIPT_CHARS)}\n[... transcript truncated for length ...]`;
    truncated = true;
  }
  return { text, truncated };
}

function clip(text: string | null, max = MAX_DOC_CHARS): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}\n[... truncated ...]` : text;
}

export function buildAnalysisMessages(input: AnalysisPromptInput): { messages: LlmMessage[]; truncated: boolean } {
  const { text: transcript, truncated } = formatTranscript(input.segments);
  const rubricJson = JSON.stringify(
    {
      name: input.rubric.name,
      categories: input.rubric.categories.map((c) => ({
        name: c.name,
        criteria: c.criteria.map((k) => ({
          code: k.code,
          title: k.title,
          description: k.description,
          mandatory: k.isMandatory,
          weight: k.weight,
          descriptors: k.descriptors,
        })),
      })),
    },
    null,
    1,
  );

  const system = `You are an experienced further education quality reviewer in the United Kingdom, reviewing a recorded one-to-one meeting between a college tutor and a learner at ${input.collegeName}. You assess the TUTOR's conduct of the meeting against a rubric. You are fair, specific and evidence-led: every judgement must point to what was actually said. Use British English. Never speculate about protected characteristics or diagnose anyone. If a learner discloses something that may be a safeguarding, wellbeing or data-protection concern, record it under "risks" factually and without judgement so a human can follow up. Scores are for the tutor's practice, not the learner. Output must be a single JSON object and nothing else.`;

  const user = `# Meeting
- Title: ${input.meeting.title}
- Type: ${input.rubric.meetingTypeLabel}
- Date: ${input.meeting.meetingDate}
- Programme: ${input.meeting.programme ?? 'not stated'}
- Tutor: ${input.meeting.tutorName}
- Learner first name (if known): ${input.meeting.learnerFirstName ?? 'not provided'}
${input.meeting.notes ? `- Notes from the uploader: ${input.meeting.notes}` : ''}
${input.metrics ? `
# Objective transcript metrics (computed, not estimated)
- Duration: ${formatTimestamp(input.metrics.durationSeconds)}
- Tutor talk share: ${input.metrics.tutorTalkShare}% / learner ${input.metrics.learnerTalkShare}% (based on the current speaker-role guess; you will confirm roles below)
- Tutor questions: ${input.metrics.tutorQuestions} (open: ${input.metrics.tutorOpenQuestions}); learner questions: ${input.metrics.learnerQuestions}
- Longest uninterrupted tutor stretch: ${formatTimestamp(input.metrics.longestTutorMonologueSeconds)}
` : ''}
# Rubric (score each criterion 1-5 using the descriptors; 2 and 4 are in-between)
${RUBRIC_BLOCK_START}
${rubricJson}
${RUBRIC_BLOCK_END}

${input.learnerProfileText ? `# Learner information booklet / profile (use it to judge personalisation; do not copy sensitive details into the report)
${clip(input.learnerProfileText)}
` : '# Learner information booklet: not provided\n'}
${input.presentationText ? `# Presentation used in the meeting (use it to judge whether key slides were covered and how materials were used)
${clip(input.presentationText)}
` : '# Presentation: not provided\n'}
${input.otherDocumentsText ? `# Other supporting documents\n${clip(input.otherDocumentsText, 8000)}\n` : ''}
# Transcript (speaker labels are raw; decide which label is the tutor and which is the learner)
${TRANSCRIPT_BLOCK_START}
${transcript}
${TRANSCRIPT_BLOCK_END}

# Your task
Return ONLY a JSON object with exactly this shape:
{
  "speakerRoles": { "<raw speaker label>": "TUTOR" | "LEARNER" | "OTHER", ... },   // one entry per raw label in the transcript
  "summary": "3-6 sentences: what happened in the meeting and the overall quality of the tutor's practice",
  "strengths": ["specific strength with what the tutor did", ... 3 to 5 items],
  "improvements": ["specific, actionable improvement", ... up to 5 items, most important first],
  "actionPlan": [{ "action": "what the tutor should do next time", "why": "the benefit for the learner", "priority": "HIGH"|"MEDIUM"|"LOW" }, ... up to 5],
  "criteria": [
    {
      "criterionCode": "A1",
      "score": 1-5 or null,
      "notApplicable": false,
      "rationale": "2-4 sentences explaining the score against the descriptors",
      "evidence": [{ "quote": "verbatim words from the transcript (max 40 words)", "startSeconds": <number from the [mm:ss] of that line>, "speaker": "<raw label>" }, ... 1 to 3 items],
      "suggestion": "one practical suggestion, or null if score is 5"
    },
    ... one entry for EVERY criterion code in the rubric
  ],
  "risks": [{ "type": "SAFEGUARDING"|"COMPLIANCE"|"DATA_PROTECTION"|"WELLBEING"|"OTHER", "note": "factual description", "startSeconds": <number or null> }],
  "materialsCoverage": [{ "topic": "slide or booklet topic", "covered": true|false, "note": "optional" }],   // only when a presentation was provided, otherwise []
  "learnerExperience": "2-3 sentences on how the meeting likely felt from the learner's point of view",
  "confidence": "HIGH"|"MEDIUM"|"LOW",
  "confidenceReason": "why, e.g. clear two-speaker transcript, or transcript truncated / single speaker / poor audio"
}

Rules:
1. Score every criterion. A MANDATORY criterion that was not covered scores 1 with rationale "Not observed in the transcript". Use notApplicable:true (score null) only for a NON-mandatory criterion that could not arise in this meeting (for example, use of a presentation when none was provided).
2. Evidence quotes must be verbatim from the transcript, with the startSeconds of the line they come from. Do not invent quotes. If there is no evidence, give an empty evidence list and say so in the rationale.
3. Judge the tutor against the descriptors for that criterion only. Do not double-penalise the same gap across several criteria.
4. Be concrete: name what was said or missed, not generalities.
5. The JSON must be valid: no comments, no trailing commas, double quotes only.`;

  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], truncated };
}

export function buildRepairMessages(original: LlmMessage[], badReply: string, problem: string): LlmMessage[] {
  return [
    ...original,
    { role: 'assistant', content: badReply.slice(0, 20_000) },
    {
      role: 'user',
      content: `Your previous reply could not be used: ${problem}\nReturn the complete corrected JSON object only, with no explanation. Remember every criterion code must appear exactly once.`,
    },
  ];
}

export const STATS_BLOCK_START = '<<<STATS_JSON>>>';
export const STATS_BLOCK_END = '<<<END_STATS_JSON>>>';

export function buildAppraisalMessages(input: {
  tutorName: string;
  periodLabel: string;
  stats: unknown;
  meetingSummaries: { title: string; date: string; score: number | null; grade: string | null; strengths: string[]; improvements: string[] }[];
  managerNotes: string | null;
  collegeName: string;
}): LlmMessage[] {
  const system = `You write balanced, evidence-based appraisal summaries for college tutors at ${input.collegeName}. You only use the statistics and meeting summaries provided. Use British English, plain language, and a supportive, professional tone suitable for a performance review that the tutor will read. Never invent incidents. Output a single JSON object only.`;
  const user = `# Tutor: ${input.tutorName}
# Period: ${input.periodLabel}
${input.managerNotes ? `# Manager notes\n${input.managerNotes}\n` : ''}
# Aggregated statistics (from AI-assisted, human-moderated meeting reviews)
${STATS_BLOCK_START}
${JSON.stringify(input.stats, null, 1)}
${STATS_BLOCK_END}

# Individual meeting summaries
${input.meetingSummaries
  .map(
    (m, i) =>
      `${i + 1}. ${m.title} (${m.date}) - score ${m.score ?? 'n/a'}${m.grade ? ` (${m.grade})` : ''}\n   Strengths: ${m.strengths.join('; ') || 'none recorded'}\n   Improvements: ${m.improvements.join('; ') || 'none recorded'}`,
  )
  .join('\n')}

Return ONLY this JSON:
{
  "headline": "one sentence overall assessment",
  "overview": "2-3 paragraphs covering performance over the period, trend, and comparison with department and college averages where available",
  "strengths": ["evidence-based strength", ... up to 6],
  "developmentAreas": ["specific area with a suggested approach", ... up to 6],
  "suggestedCpd": ["concrete CPD activity", ... up to 4],
  "evidenceNotes": ["which numbers or meetings support the main points", ... up to 6]
}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export { PROMPT_VERSION };

import { createHash } from 'node:crypto';
import type { AnalysisOutput, AppraisalNarrative } from '@slc/shared';
import type { LlmMessage, LlmProvider, LlmResult } from './index.js';
import {
  RUBRIC_BLOCK_END,
  RUBRIC_BLOCK_START,
  STATS_BLOCK_END,
  STATS_BLOCK_START,
  TRANSCRIPT_BLOCK_END,
  TRANSCRIPT_BLOCK_START,
} from './prompts.js';
import { INDUCTION_PRESET_RUBRIC, SLC_INDUCTION_PRESET_RUBRIC } from '@slc/shared';

/**
 * Mock language model for local development and demos (LLM_PROVIDER=mock).
 * It reads the rubric and transcript out of the prompt and produces a
 * plausible, deterministic report by keyword matching, so the UI can be
 * exercised end-to-end with no API key. It is clearly labelled as mock output.
 */

interface PromptRubric {
  name?: string;
  categories: { name: string; criteria: { code: string; title: string; mandatory: boolean; descriptors: Record<string, string> }[] }[];
}
interface Line {
  start: number;
  speaker: string;
  text: string;
}

/**
 * Keyword cues per preset (by rubric name, then criterion code). Codes are
 * reused across presets with different meanings, so the map is keyed by the
 * rubric name first. A custom or renamed rubric falls back to the words of
 * each criterion's title.
 */
const GENERIC_KEYWORDS: Record<string, string[]> = {
  A1: ['i am', 'my name', 'your course tutor', 'nice to meet', 'said that right'],
  A2: ['induction meeting', 'take about', 'go through', 'cover today', 'purpose'],
  A3: ['tell me', 'how do you feel', 'what do you', 'does that sound', 'make sense'],
  B1: ['units', 'timetable', 'days a week', 'modules'],
  B2: ['assess', 'deadline', 'grade', 'progress to', 'exam'],
  B3: ['attendance', 'on time', 'respect', 'punctual', 'absent'],
  C1: ['gcse', 'level 2', 'initial assessment', 'qualification', 'prior'],
  C2: ['learning need', 'dyslex', 'learning support', 'adjustment', 'health condition'],
  C3: ['bursary', 'laptop', 'travel', 'caring', 'at home', 'finance'],
  C4: ['goal', 'target', 'achieve', 'aiming for', 'review'],
  D1: ['safeguarding', 'prevent', 'british values', 'feel unsafe'],
  D2: ['bullying', 'discrimination', 'equal', 'harassment', 'diversity'],
  D3: ['online', 'login', 'health and safety', 'confidential', 'safety'],
  D4: ['learner agreement', 'privacy', 'complaint', 'data', 'appeal'],
  E1: ['careers', 'university', 'progression', 'apprenticeship', 'adviser'],
  E2: ['portal', 'library', 'counselling', 'wellbeing', 'student services'],
  F1: ['does that make sense', 'does that sound', 'in other words', 'put simply'],
  F2: ['slide', 'presentation', 'booklet', 'show you'],
  F3: ['care home', 'your shifts', 'you said', 'your manager', 'you mentioned'],
  F4: ['summarise', 'summary', 'we have agreed', 'last questions', 'next steps', 'see you'],
};

const SLC_KEYWORDS: Record<string, string[]> = {
  A1: ['being recorded', 'recorded', 'hear me', 'shared screen', 'privacy notice'],
  A2: ['i am amara', 'your mentor', 'introductions', 'pronounced your name', 'hope to achieve'],
  A3: ['purpose of today', 'forty five minutes', 'we will cover', 'raise hand', 'interrupt me'],
  B1: ['right course', 'pathway', 'expert witness', 'deputy manager or manager', 'observation of your practice'],
  B2: ['pre-course learner profile', 'prior learning', 'initial assessment', 'level 3 in', 'experience counts'],
  B3: ['english, maths and digital', 'writing guides', 'first draft', 'english is not good'],
  B4: ['adjustments', 'disability', 'health condition', 'extra time', 'assistive software'],
  B5: ['hours a week', 'realistic week', 'plan for', 'children at home', 'review it at our first check-in'],
  C1: ['nine hundred hours', 'guided learning', 'ninety credits', 'regulated by ofqual', 'twelve months of access'],
  C2: ['shared core units', 'mandatory units', 'optional units', 'achieved or not yet achieved', 'learning outcomes'],
  C3: ['written assignments', 'feedback within fourteen days', 'word document', 'file name', 'resubmission'],
  C4: ['peel', 'report structure', 'harvard', 'reference list', 'paragraph'],
  C5: ['academic integrity', 'plagiarism', 'malpractice', 'collusion', 'ai tool'],
  C6: ['progression', 'registered manager roles', 'degree top-up', 'level 6', 'nearer the time'],
  D1: ['learner portal', 'dashboard', 'getting started', 'fourteen days of today', 'documents tab'],
  D2: ['laptop or a phone', 'online version of word', 'internet connection', 'technical support', 'captions'],
  D3: ['named mentor', 'two working days', 'whatsapp', 'learner forum', 'booking a call'],
  D4: ['falling behind', 'go quiet', 'three weeks', 'extensions are possible', 'tell me early'],
  E1: ['safeguarding', 'designated safeguarding lead', 'concern about', 'prevent', 'british values'],
  E2: ['wellbeing service', 'mental health', 'counselling', 'helpline', 'samaritans'],
  E3: ['equality, diversity and inclusion', 'treated fairly', 'respectful language', 'treated unfairly'],
  E4: ['appeals procedure', 'complain', 'awarding organisation', 'approved centre', 'learner agreement'],
  F1: ['does that', 'make sense', 'good question', 'is that right', 'anything from you'],
  F2: ['in practice it means', 'which means', 'that is', 'for example', 'roughly'],
  F3: ['tomasz', 'grace', 'for you the', 'you said', 'you mentioned'],
  F4: ['on screen', 'let me show you', 'share the learner portal', 'this is your dashboard', 'title slide'],
  F5: ['first,', 'now,', 'which brings me to', 'let me summarise', 'one last thing'],
  F6: ['everyone', 'you can tell me now or privately', 'stays within', 'thank you for saying that'],
  G1: ['summarise what we have agreed', 'check-in call', 'in two weeks', 'have i missed anything', 'first action'],
  G2: ['feedback survey', 'complete it honestly', 'good or bad', 'raise anything about the course'],
};

const KEYWORDS_BY_RUBRIC: Record<string, Record<string, string[]>> = {
  [INDUCTION_PRESET_RUBRIC.name]: GENERIC_KEYWORDS,
  [SLC_INDUCTION_PRESET_RUBRIC.name]: SLC_KEYWORDS,
};

/** The criterion in each preset that cannot be judged without slides or a booklet. */
const MATERIALS_CRITERION_BY_RUBRIC: Record<string, string> = {
  [INDUCTION_PRESET_RUBRIC.name]: 'F2',
  [SLC_INDUCTION_PRESET_RUBRIC.name]: 'F4',
};

const GENERIC_PENALTIES: Record<string, { missing: string[]; note: string }> = {
  D1: { missing: ['prevent', 'british values'], note: 'The Prevent duty and British values were not explained.' },
  D4: { missing: ['complaint', 'appeal'], note: 'The complaints and appeals process was not mentioned.' },
  C4: { missing: ['by when', 'measurable', 'smart'], note: 'Targets were agreed in broad terms but were not fully specific or time-bound.' },
};
const SLC_PENALTIES: Record<string, { missing: string[]; note: string }> = {
  E1: { missing: ['prevent', 'british values'], note: 'Prevent and British values were not explained.' },
  E4: { missing: ['complain'], note: 'The complaints route was not explained (only appeals).' },
  C6: { missing: ['careers', 'skills for care', 'job'], note: 'Progression was covered in general terms; careers guidance was not linked to each learner\'s goal.' },
};
const PENALTIES_BY_RUBRIC: Record<string, Record<string, { missing: string[]; note: string }>> = {
  [INDUCTION_PRESET_RUBRIC.name]: GENERIC_PENALTIES,
  [SLC_INDUCTION_PRESET_RUBRIC.name]: SLC_PENALTIES,
};

function hashInt(s: string): number {
  return parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16);
}

function between(text: string, start: string, end: string): string | null {
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j <= i) return null;
  return text.slice(i + start.length, j).trim();
}

function parseLines(transcript: string): Line[] {
  const out: Line[] = [];
  for (const raw of transcript.split('\n')) {
    const m = raw.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s*(.*)$/);
    if (!m) continue;
    const parts = m[1].split(':').map(Number);
    const start = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    out.push({ start, speaker: m[2].trim(), text: m[3] });
  }
  return out;
}

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock' as const;
  defaultModel(): string {
    return 'mock/rule-based-reviewer';
  }

  async complete(messages: LlmMessage[]): Promise<LlmResult> {
    const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    await new Promise((r) => setTimeout(r, 1500));
    if (user.includes(STATS_BLOCK_START)) {
      return { text: JSON.stringify(this.appraisal(user)), model: this.defaultModel(), usage: null };
    }
    return { text: JSON.stringify(this.analysis(user)), model: this.defaultModel(), usage: null };
  }

  private analysis(prompt: string): AnalysisOutput {
    const rubricJson = between(prompt, RUBRIC_BLOCK_START, RUBRIC_BLOCK_END);
    const transcript = between(prompt, TRANSCRIPT_BLOCK_START, TRANSCRIPT_BLOCK_END) ?? '';
    const rubric = (rubricJson ? JSON.parse(rubricJson) : { categories: [] }) as PromptRubric;
    const lines = parseLines(transcript);
    const presentationProvided = !prompt.includes('# Presentation: not provided');
    const lower = transcript.toLowerCase();

    // Guess roles: the speaker with the most words is the tutor.
    const words: Record<string, number> = {};
    for (const l of lines) words[l.speaker] = (words[l.speaker] ?? 0) + l.text.split(/\s+/).length;
    const speakers = Object.keys(words).sort((a, b) => words[b] - words[a]);
    const speakerRoles: Record<string, 'TUTOR' | 'LEARNER' | 'OTHER'> = {};
    speakers.forEach((s, i) => (speakerRoles[s] = i === 0 ? 'TUTOR' : i === 1 ? 'LEARNER' : 'OTHER'));
    const tutorLabel = speakers[0];

    const KEYWORDS = KEYWORDS_BY_RUBRIC[rubric.name ?? ''] ?? {};
    const PENALTY_KEYWORDS = PENALTIES_BY_RUBRIC[rubric.name ?? ''] ?? {};
    const materialsCode = MATERIALS_CRITERION_BY_RUBRIC[rubric.name ?? ''];
    const criteria: AnalysisOutput['criteria'] = [];
    const strengths: string[] = [];
    const improvements: string[] = [];
    for (const cat of rubric.categories) {
      for (const c of cat.criteria) {
        const kws = KEYWORDS[c.code] ?? c.title.toLowerCase().split(/\s+/).filter((w) => w.length > 5);
        const hits = lines.filter((l) => l.speaker === tutorLabel && kws.some((k) => l.text.toLowerCase().includes(k)));
        const evidence = hits.slice(0, 2).map((l) => ({ quote: clipQuote(l.text), startSeconds: l.start, speaker: l.speaker }));
        let score: number | null;
        let notApplicable = false;
        let rationale: string;
        let suggestion: string | null = null;

        if (c.code === materialsCode && !presentationProvided) {
          score = null;
          notApplicable = true;
          rationale = 'No presentation or booklet was provided with this meeting, so use of materials could not be assessed.';
        } else if (hits.length === 0) {
          score = c.mandatory ? 1 : 2;
          rationale = `Not observed in the transcript. ${c.descriptors['1'] ?? ''}`.trim();
          suggestion = `Build "${c.title.toLowerCase()}" into your meeting checklist so it is covered every time.`;
        } else {
          const base = hits.length >= 3 ? 5 : hits.length === 2 ? 4 : 3;
          const penalty = PENALTY_KEYWORDS[c.code];
          const missing = penalty ? penalty.missing.every((k) => !lower.includes(k)) : false;
          score = missing ? Math.min(base, 3) : base;
          rationale = `${score >= 4 ? 'Covered well. ' : 'Partly covered. '}The tutor addressed this at ${evidence.map((e) => fmt(e.startSeconds ?? 0)).join(' and ')}. ${c.descriptors[String(score)] ?? c.descriptors[score >= 4 ? '5' : '3'] ?? ''}${missing ? ` ${penalty!.note}` : ''}`.trim();
          if (score < 5) suggestion = missing ? penalty!.note.replace('were not', 'should be').replace('was not', 'should be') : `Check the learner's understanding after covering ${c.title.toLowerCase()}.`;
        }
        if (score === 5) strengths.push(`${c.title}: ${evidence[0] ? `"${evidence[0].quote.slice(0, 80)}..."` : 'clearly covered'}`);
        if (score !== null && score <= 3 && !notApplicable) improvements.push(`${c.title}: ${suggestion ?? 'cover this more fully'}`);
        criteria.push({ criterionCode: c.code, score, notApplicable, rationale, evidence, suggestion });
      }
    }
    const learnerLines = lines.filter((l) => speakerRoles[l.speaker] === 'LEARNER');
    const disclosure = learnerLines.find((l) => /dyslex|anxiety|unsafe|bullied|carer/i.test(l.text));

    return {
      speakerRoles,
      summary: `[Sample report generated by the built-in mock reviewer - connect OpenRouter for real analysis.] The tutor (${tutorLabel}) led a ${lines.length ? fmt(lines[lines.length - 1].start) : 'short'} meeting covering ${criteria.filter((c) => (c.score ?? 0) >= 4).length} of ${criteria.length} criteria well. The conversation was two-way, with the learner contributing ${learnerLines.length} times. The main gaps are listed under improvements.`,
      strengths: strengths.slice(0, 5).length ? strengths.slice(0, 5) : ['The meeting took place and a transcript was available for review.'],
      improvements: improvements.slice(0, 5),
      actionPlan: improvements.slice(0, 3).map((imp, i) => ({ action: imp.split(': ')[1] ?? imp, why: 'Closes a gap against the college criteria.', priority: i === 0 ? ('HIGH' as const) : ('MEDIUM' as const) })),
      criteria,
      risks: disclosure
        ? [{ type: 'WELLBEING' as const, note: `Learner disclosed: "${clipQuote(disclosure.text)}" - confirm the referral was made.`, startSeconds: disclosure.start }]
        : [],
      materialsCoverage: presentationProvided ? [{ topic: 'Presentation slides', covered: true, note: 'Mock provider cannot check slide coverage.' }] : [],
      learnerExperience: 'The learner appears to have been listened to and left with clear next steps, based on the number of questions they asked and answered.',
      confidence: lines.length > 20 && speakers.length >= 2 ? 'MEDIUM' : 'LOW',
      confidenceReason: 'Produced by the rule-based mock reviewer; scores are keyword-based and should not be used for real decisions.',
    };
  }

  private appraisal(prompt: string): AppraisalNarrative {
    const statsJson = between(prompt, STATS_BLOCK_START, STATS_BLOCK_END);
    const stats = (statsJson ? JSON.parse(statsJson) : {}) as { meetingCount?: number; averageScore?: number | null; collegeAverage?: number | null; criteriaAverages?: { title: string; average: number | null }[] };
    const sorted = [...(stats.criteriaAverages ?? [])].filter((c) => c.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
    const n = stats.meetingCount ?? 0;
    const avg = stats.averageScore ?? null;
    const seed = hashInt(JSON.stringify(stats)) % 3;
    return {
      headline: `[Mock narrative] ${n} reviewed meeting${n === 1 ? '' : 's'} with an average score of ${avg ?? 'n/a'}${stats.collegeAverage != null ? ` against a college average of ${stats.collegeAverage}` : ''}.`,
      overview: `This summary was produced by the mock provider for demonstration. Over the period the tutor had ${n} meetings reviewed. ${avg != null ? `The average overall score was ${avg} out of 100.` : ''} ${sorted[0] ? `The strongest area was "${sorted[0].title}".` : ''} ${sorted.length ? `The area with most room to grow was "${sorted[sorted.length - 1].title}".` : ''} Connect OpenRouter to generate a full narrative.`,
      strengths: sorted.slice(0, 3).map((c) => `${c.title} (average ${c.average})`),
      developmentAreas: sorted.slice(-3).reverse().map((c) => `${c.title} (average ${c.average}) - agree a focus for the next term`),
      suggestedCpd: [['Peer observation of an induction meeting', 'Safeguarding and Prevent refresher', 'Target-setting workshop'][seed]],
      evidenceNotes: [`Based on ${n} meetings in the period.`],
    };
  }
}

function clipQuote(text: string): string {
  const words = text.split(/\s+/);
  return words.length > 40 ? `${words.slice(0, 40).join(' ')}...` : text;
}
function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

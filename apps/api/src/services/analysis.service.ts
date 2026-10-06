import {
  AnalysisOutputSchema,
  computeOverallScore,
  computeTranscriptMetrics,
  gradeFor,
  MEETING_TYPE_LABELS,
  PROMPT_VERSION,
  type Analysis,
  type AnalysisOutput,
  type CriterionResult,
  type GradeBand,
  type SpeakerMap,
  type TranscriptSegment,
} from '@slc/shared';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../lib/audit.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { notify } from '../lib/notify.js';
import { asArray, asRecord, asStringArray, fullName, iso, isoReq, round1 } from '../lib/serialize.js';
import { logger } from '../logger.js';
import { extractJson, getLlmProvider } from '../providers/llm/index.js';
import { buildAnalysisMessages, buildRepairMessages } from '../providers/llm/prompts.js';
import { getSettings } from './settings.service.js';

/* ------------------------------------------------------------------ */
/* Running an analysis                                                  */
/* ------------------------------------------------------------------ */

export function guessSpeakerMap(segments: TranscriptSegment[]): SpeakerMap {
  const words: Record<string, number> = {};
  for (const s of segments) words[s.speaker] = (words[s.speaker] ?? 0) + s.text.split(/\s+/).length;
  const ordered = Object.keys(words).sort((a, b) => words[b] - words[a]);
  const map: SpeakerMap = {};
  ordered.forEach((label, i) => (map[label] = i === 0 ? 'TUTOR' : i === 1 ? 'LEARNER' : 'OTHER'));
  return map;
}

export async function runAnalysis(meetingId: string, opts: { triggeredBy?: string | null } = {}): Promise<string> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      tutor: true,
      transcript: true,
      files: { where: { status: { in: ['UPLOADED', 'PROCESSED'] } } },
      rubric: { include: { categories: { orderBy: { order: 'asc' }, include: { criteria: { where: { isArchived: false }, orderBy: { order: 'asc' } } } } } },
    },
  });
  if (!meeting) throw new NotFoundError('Meeting');
  if (!meeting.transcript) throw new BadRequestError('The meeting has no transcript yet');
  const segments = asArray<TranscriptSegment>(meeting.transcript.segments);
  if (!segments.length) throw new BadRequestError('The transcript is empty');

  const settings = await getSettings();
  const llm = getLlmProvider();

  // Mark previous analyses as superseded and create the new record up-front so the UI can show progress.
  await prisma.analysis.updateMany({ where: { meetingId, isCurrent: true }, data: { isCurrent: false } });
  const analysis = await prisma.analysis.create({
    data: { meetingId, rubricId: meeting.rubricId, rubricVersion: meeting.rubric.version, status: 'RUNNING', provider: llm.name, model: llm.name === 'openrouter' ? settings.llmModel : llm.defaultModel(), promptVersion: PROMPT_VERSION, startedAt: new Date() },
  });
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'ANALYSING' } });

  try {
    const storedMap = (asRecord(meeting.transcript.speakerMap) ?? {}) as SpeakerMap;
    const initialMap = Object.keys(storedMap).length ? storedMap : guessSpeakerMap(segments);
    const initialMetrics = computeTranscriptMetrics(segments, initialMap);

    const booklet = meeting.files.find((f) => f.kind === 'LEARNER_BOOKLET' && f.extractedText);
    const presentation = meeting.files.find((f) => f.kind === 'PRESENTATION' && f.extractedText);
    const others = meeting.files.filter((f) => f.kind === 'OTHER' && f.extractedText);
    const inputsUsed = [
      meeting.transcript.source === 'UPLOADED' ? 'Uploaded transcript' : meeting.transcript.source === 'AWS_TRANSCRIBE' ? 'Recording transcribed with Amazon Transcribe' : 'Mock transcript (development)',
      ...(booklet ? [`Learner booklet: ${booklet.fileName}`] : []),
      ...(presentation ? [`Presentation: ${presentation.fileName}`] : []),
      ...others.map((f) => `Document: ${f.fileName}`),
    ];

    const { messages, truncated } = buildAnalysisMessages({
      rubric: {
        name: meeting.rubric.name,
        meetingTypeLabel: MEETING_TYPE_LABELS[meeting.meetingType],
        categories: meeting.rubric.categories.map((c) => ({
          name: c.name,
          description: c.description,
          criteria: c.criteria.map((k) => ({ code: k.code, title: k.title, description: k.description, weight: k.weight, isMandatory: k.isMandatory, descriptors: (k.descriptors as Record<string, string>) ?? {} })),
        })),
      },
      segments,
      metrics: initialMetrics,
      meeting: {
        title: meeting.title,
        meetingDate: meeting.meetingDate.toISOString().slice(0, 10),
        programme: meeting.programme,
        learnerFirstName: settings.redactLearnerNames ? null : meeting.learnerFirstName,
        tutorName: fullName(meeting.tutor),
        notes: meeting.notes,
      },
      learnerProfileText: booklet?.extractedText ?? null,
      presentationText: presentation?.extractedText ?? null,
      otherDocumentsText: others.length ? others.map((f) => `## ${f.fileName}\n${f.extractedText}`).join('\n\n') : null,
      collegeName: settings.collegeName,
    });
    if (truncated) inputsUsed.push('Transcript truncated for length');

    const allCodes = meeting.rubric.categories.flatMap((c) => c.criteria.map((k) => k.code));
    const { output, model, usage, raw } = await callModelWithValidation(messages, allCodes, settings.llmModel);

    // Speaker roles: respect a manual confirmation; otherwise take the model's view.
    const finalMap: SpeakerMap = meeting.transcript.speakerMapSource === 'manual' ? initialMap : { ...initialMap, ...output.speakerRoles };
    const metrics = computeTranscriptMetrics(segments, finalMap);
    if (meeting.transcript.speakerMapSource !== 'manual') {
      await prisma.transcript.update({ where: { id: meeting.transcript.id }, data: { speakerMap: finalMap as never } });
    }

    // Deterministic scoring.
    const criteriaRows = meeting.rubric.categories.flatMap((c) => c.criteria);
    const byCode = new Map(output.criteria.map((c) => [c.criterionCode.toUpperCase(), c]));
    const forScoring = criteriaRows.map((k) => {
      const o = byCode.get(k.code.toUpperCase());
      const notApplicable = !!o?.notApplicable || o?.score == null;
      return { criterionId: k.id, weight: k.weight, isMandatory: k.isMandatory, score: notApplicable ? null : o!.score, notApplicable: notApplicable && !k.isMandatory };
    });
    // A mandatory criterion with no score counts as 1 (not observed), never "not applicable".
    const normalised = forScoring.map((c) => (c.isMandatory && c.score === null ? { ...c, score: 1, notApplicable: false } : c));
    const result = computeOverallScore(normalised);
    const bands = asArray<GradeBand>(meeting.rubric.gradeBands);
    const grade = gradeFor(result.overallScore, bands.length ? bands : undefined).label;

    await prisma.$transaction(async (tx) => {
      await tx.analysis.update({
        where: { id: analysis.id },
        data: {
          status: 'COMPLETE',
          model,
          overallScore: result.overallScore,
          grade,
          mandatoryCoverage: result.mandatoryCoverage,
          summary: output.summary,
          learnerExperience: output.learnerExperience ?? null,
          strengths: output.strengths as never,
          improvements: output.improvements as never,
          actionPlan: output.actionPlan as never,
          risks: output.risks as never,
          materialsCoverage: output.materialsCoverage as never,
          metrics: metrics as never,
          scoreBreakdown: { ...result, speakerMap: finalMap } as never,
          confidence: output.confidence,
          confidenceReason: output.confidenceReason,
          inputsUsed: inputsUsed as never,
          tokenUsage: (usage ?? undefined) as never,
          rawOutput: raw as never,
          completedAt: new Date(),
        },
      });
      for (const k of criteriaRows) {
        const o = byCode.get(k.code.toUpperCase());
        const n = normalised.find((x) => x.criterionId === k.id)!;
        await tx.criterionResult.create({
          data: {
            analysisId: analysis.id,
            criterionId: k.id,
            score: n.score,
            notApplicable: n.notApplicable,
            rationale: o?.rationale ?? (k.isMandatory ? 'Not observed in the transcript.' : 'Not assessed.'),
            evidence: (o?.evidence ?? []) as never,
            suggestion: o?.suggestion ?? null,
          },
        });
      }
      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: 'READY', completedAt: new Date(), durationSeconds: Math.round(metrics.durationSeconds), failureReason: null, processingLog: appendLog(meeting.processingLog, 'analysis', 'done', `Scored ${result.applicableCount} criteria`) as never },
      });
    });

    await notify({
      userId: meeting.tutorId,
      type: 'ANALYSIS_READY',
      title: `Report ready: ${meeting.title}`,
      body: `Your meeting review scored ${result.overallScore} (${grade}). Open the report to see strengths, improvements and evidence.`,
      link: `/meetings/${meetingId}`,
    });
    if (meeting.createdById !== meeting.tutorId) {
      await notify({ userId: meeting.createdById, type: 'ANALYSIS_READY', title: `Report ready: ${meeting.title}`, body: `The review for ${fullName(meeting.tutor)} is ready (${result.overallScore}, ${grade}).`, link: `/meetings/${meetingId}`, email: false });
    }
    audit({ actorId: opts.triggeredBy ?? null, action: 'analysis.completed', entityType: 'meeting', entityId: meetingId, metadata: { analysisId: analysis.id, score: result.overallScore, model } });
    return analysis.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, meetingId }, 'analysis failed');
    await prisma.analysis.update({ where: { id: analysis.id }, data: { status: 'FAILED', error: message.slice(0, 2000), completedAt: new Date() } });
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'FAILED', failureReason: `The review could not be completed: ${message.slice(0, 300)}`, processingLog: appendLog(meeting.processingLog, 'analysis', 'failed', message.slice(0, 300)) as never },
    });
    await notify({ userId: meeting.createdById, type: 'ANALYSIS_FAILED', title: `Review failed: ${meeting.title}`, body: 'The automatic review could not be completed. Open the meeting to see the reason and try again.', link: `/meetings/${meetingId}` });
    throw err;
  }
}

export function appendLog(existing: unknown, step: string, state: 'started' | 'done' | 'failed' | 'skipped', detail?: string) {
  const log = asArray<{ step: string; state: string; detail?: string; at: string }>(existing);
  return [...log, { step, state, detail, at: new Date().toISOString() }].slice(-40);
}

async function callModelWithValidation(messages: ReturnType<typeof buildAnalysisMessages>['messages'], expectedCodes: string[], model: string) {
  const llm = getLlmProvider();
  let reply = await llm.complete(messages, { purpose: 'analysis', model });
  let problem: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = extractJson(reply.text);
      const parsed = AnalysisOutputSchema.safeParse(json);
      if (!parsed.success) {
        problem = `JSON did not match the required shape: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
      } else {
        const got = new Set(parsed.data.criteria.map((c) => c.criterionCode.toUpperCase()));
        const missing = expectedCodes.filter((c) => !got.has(c.toUpperCase()));
        if (missing.length > Math.ceil(expectedCodes.length * 0.25)) {
          problem = `These criterion codes were missing: ${missing.join(', ')}`;
        } else {
          return { output: parsed.data as AnalysisOutput, model: reply.model, usage: reply.usage, raw: json };
        }
      }
    } catch (err) {
      problem = `The reply was not valid JSON (${(err as Error).message})`;
    }
    if (attempt === 0) {
      logger.warn({ problem }, 'model output invalid - asking for a repair');
      reply = await llm.complete(buildRepairMessages(messages, reply.text, problem ?? 'invalid output'), { purpose: 'analysis-repair', model });
    }
  }
  throw new Error(problem ?? 'The model did not return a usable report');
}

/* ------------------------------------------------------------------ */
/* Reading an analysis                                                  */
/* ------------------------------------------------------------------ */

const analysisInclude = {
  rubric: true,
  criteria: { include: { criterion: { include: { category: true } } } },
  moderations: { orderBy: { createdAt: 'desc' as const }, take: 1, include: { moderator: true } },
} satisfies Prisma.AnalysisInclude;

type AnalysisRow = Prisma.AnalysisGetPayload<{ include: typeof analysisInclude }>;

export function serializeAnalysis(a: AnalysisRow): Analysis {
  const criteria: CriterionResult[] = [...a.criteria]
    .sort((x, y) => x.criterion.category.order - y.criterion.category.order || x.criterion.order - y.criterion.order)
    .map((c) => ({
      id: c.id,
      criterionId: c.criterionId,
      code: c.criterion.code.split('~')[0],
      title: c.criterion.title,
      description: c.criterion.description,
      categoryName: c.criterion.category.name,
      weight: c.criterion.weight,
      isMandatory: c.criterion.isMandatory,
      descriptors: (c.criterion.descriptors as Record<string, string>) ?? {},
      frameworkRefs: asArray<{ framework: string; note: string }>(c.criterion.frameworkRefs),
      score: c.score,
      notApplicable: c.notApplicable,
      rationale: c.rationale,
      evidence: asArray(c.evidence),
      suggestion: c.suggestion,
      moderatedScore: c.moderatedScore,
      moderationNote: c.moderationNote,
      effectiveScore: c.notApplicable ? null : (c.moderatedScore ?? c.score),
    }));
  const mod = a.moderations[0];
  return {
    id: a.id,
    meetingId: a.meetingId,
    status: a.status,
    model: a.model,
    provider: a.provider,
    promptVersion: a.promptVersion,
    rubricId: a.rubricId,
    rubricName: a.rubric.name,
    rubricVersion: a.rubricVersion,
    gradeBands: asArray<GradeBand>(a.rubric.gradeBands),
    overallScore: a.overallScore,
    moderatedOverallScore: a.moderatedOverallScore,
    effectiveOverallScore: a.moderatedOverallScore ?? a.overallScore,
    grade: a.grade,
    mandatoryCoverage: a.mandatoryCoverage,
    summary: a.summary,
    learnerExperience: a.learnerExperience,
    strengths: asStringArray(a.strengths),
    improvements: asStringArray(a.improvements),
    actionPlan: asArray(a.actionPlan),
    risks: asArray(a.risks),
    materialsCoverage: asArray(a.materialsCoverage),
    metrics: asRecord(a.metrics),
    confidence: a.confidence,
    confidenceReason: a.confidenceReason,
    inputsUsed: asStringArray(a.inputsUsed),
    tokenUsage: (asRecord(a.tokenUsage) as Record<string, number> | null) ?? null,
    scoreBreakdown: asRecord(a.scoreBreakdown),
    criteria,
    moderation: mod ? { moderatorName: fullName(mod.moderator), note: mod.note, createdAt: isoReq(mod.createdAt) } : null,
    error: a.error,
    startedAt: iso(a.startedAt),
    completedAt: iso(a.completedAt),
  };
}

export async function getCurrentAnalysis(meetingId: string): Promise<Analysis | null> {
  const a = await prisma.analysis.findFirst({ where: { meetingId, isCurrent: true }, include: analysisInclude, orderBy: { createdAt: 'desc' } });
  return a ? serializeAnalysis(a) : null;
}

/* ------------------------------------------------------------------ */
/* Moderation (human override with an audit trail)                      */
/* ------------------------------------------------------------------ */

export async function moderateAnalysis(
  actor: { id: string },
  analysisId: string,
  input: { note: string; criteria: { criterionResultId: string; moderatedScore: number | null; moderationNote?: string | null }[] },
) {
  const a = await prisma.analysis.findUnique({ where: { id: analysisId }, include: { criteria: { include: { criterion: true } }, rubric: true, meeting: true } });
  if (!a) throw new NotFoundError('Report');
  if (a.status !== 'COMPLETE') throw new BadRequestError('Only completed reports can be moderated');

  const changes: { code: string; from: number | null; to: number | null }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const change of input.criteria) {
      const row = a.criteria.find((c) => c.id === change.criterionResultId);
      if (!row) throw new BadRequestError('Unknown criterion in moderation');
      await tx.criterionResult.update({ where: { id: row.id }, data: { moderatedScore: change.moderatedScore, moderationNote: change.moderationNote ?? null } });
      changes.push({ code: row.criterion.code, from: row.score, to: change.moderatedScore });
    }
    const fresh = await tx.criterionResult.findMany({ where: { analysisId }, include: { criterion: true } });
    const result = computeOverallScore(
      fresh.map((c) => ({ criterionId: c.criterionId, weight: c.criterion.weight, isMandatory: c.criterion.isMandatory, score: c.notApplicable ? null : (c.moderatedScore ?? c.score), notApplicable: c.notApplicable })),
    );
    const anyModerated = fresh.some((c) => c.moderatedScore !== null);
    const bands = asArray<GradeBand>(a.rubric.gradeBands);
    const effective = anyModerated ? result.overallScore : a.overallScore ?? 0;
    await tx.analysis.update({
      where: { id: analysisId },
      data: {
        moderatedOverallScore: anyModerated ? result.overallScore : null,
        mandatoryCoverage: result.mandatoryCoverage,
        grade: gradeFor(effective, bands.length ? bands : undefined).label,
      },
    });
    await tx.moderation.create({
      data: { analysisId, moderatorId: actor.id, originalOverall: a.overallScore, moderatedOverall: anyModerated ? result.overallScore : null, note: input.note, changes: changes as never },
    });
  });
  audit({ actorId: actor.id, action: 'analysis.moderated', entityType: 'meeting', entityId: a.meetingId, metadata: { analysisId, changes } });
  await notify({
    userId: a.meeting.tutorId,
    type: 'MODERATED',
    title: `Your report was moderated: ${a.meeting.title}`,
    body: `A manager reviewed your report and left a note: "${input.note.slice(0, 200)}"`,
    link: `/meetings/${a.meetingId}`,
  });
  return getCurrentAnalysis(a.meetingId);
}

/** Recompute objective metrics after a manual speaker-role correction. */
export async function applySpeakerMap(meetingId: string, speakerMap: SpeakerMap) {
  const transcript = await prisma.transcript.findUnique({ where: { meetingId } });
  if (!transcript) throw new NotFoundError('Transcript');
  const segments = asArray<TranscriptSegment>(transcript.segments);
  const metrics = computeTranscriptMetrics(segments, speakerMap);
  await prisma.transcript.update({ where: { id: transcript.id }, data: { speakerMap: speakerMap as never, speakerMapSource: 'manual' } });
  const current = await prisma.analysis.findFirst({ where: { meetingId, isCurrent: true, status: 'COMPLETE' } });
  if (current) {
    const breakdown = asRecord(current.scoreBreakdown) ?? {};
    await prisma.analysis.update({ where: { id: current.id }, data: { metrics: metrics as never, scoreBreakdown: { ...breakdown, speakerMap } as never } });
  }
  return { metrics: { ...metrics, tutorTalkShare: round1(metrics.tutorTalkShare) } };
}

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Calculator, CheckCircle2, ChevronDown, Flag, Lightbulb, MessageSquare, Quote, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { computeOverallScore, formatTimestamp, type Analysis, type CriterionResult, type SpeakerRole } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Field';
import { HelpTip } from '@/components/ui/HelpTip';
import { Alert, ScorePill, ScoreRing, Stat } from '@/components/ui/Misc';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, gradeToneForLabel } from '@/lib/format';
import { keys, mutations, useComments, useTranscript, type MeetingDetail } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

export function Report({ meeting, onChanged }: { meeting: MeetingDetail; onChanged: () => void }) {
  const a = meeting.analysis!;
  const [tab, setTab] = useState('criteria');
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [moderating, setModerating] = useState(false);
  const metrics = (a.metrics ?? {}) as Record<string, number>;
  const tone = gradeToneForLabel(a.grade, a.gradeBands);
  const band = a.gradeBands.find((b) => b.label === a.grade);
  const mandatory = a.criteria.filter((c) => c.isMandatory);
  const mandatoryCovered = mandatory.filter((c) => (c.effectiveScore ?? 0) >= 3).length;

  const jump = (seconds: number) => {
    setTab('transcript');
    setJumpTo(seconds);
  };

  return (
    <div className="space-y-6">
      {a.risks.length > 0 && (
        <Alert tone="warning" title="Things a person should follow up">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {a.risks.map((r, i) => (
              <li key={i}>
                <span className="font-medium">{r.type.replace('_', ' ').toLowerCase()}:</span> {r.note}
                {r.startSeconds != null && (
                  <button className="ml-2 text-xs underline" onClick={() => jump(r.startSeconds!)}>at {formatTimestamp(r.startSeconds)}</button>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Headline */}
      <Card>
        <CardBody className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={a.effectiveOverallScore} label={a.grade} bands={a.gradeBands} />
            {a.moderatedOverallScore !== null && (
              <Badge tone="brand"><ShieldCheck className="h-3 w-3" /> Moderated (AI score {Math.round(a.overallScore ?? 0)})</Badge>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-3 py-1 text-sm font-semibold ring-1', tone.bg, tone.text, tone.ring)}>{a.grade}</span>
              {band && <span className="text-sm text-slate-600">{band.description}</span>}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">{a.summary}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniStat label="Essential items covered" value={`${mandatoryCovered} of ${mandatory.length}`} help="Criteria your college marks as essential (for example safeguarding and support needs), scored 3 or more." tone={mandatoryCovered === mandatory.length ? 'good' : mandatoryCovered >= mandatory.length * 0.75 ? 'ok' : 'poor'} />
              <MiniStat label="Learner talk share" value={metrics.learnerTalkShare !== undefined ? `${Math.round(metrics.learnerTalkShare)}%` : '-'} help="How much of the conversation the learner spoke, counted from the transcript." tone={metrics.learnerTalkShare >= 30 ? 'good' : metrics.learnerTalkShare >= 15 ? 'ok' : 'poor'} />
              <MiniStat label="Questions the tutor asked" value={metrics.tutorQuestions !== undefined ? `${metrics.tutorQuestions} (${metrics.tutorOpenQuestions ?? 0} open)` : '-'} help="Open questions start with what, how, why, tell me... and invite the learner to talk." tone="neutral" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <ConfidenceBadge level={a.confidence} reason={a.confidenceReason} />
              <span>Criteria: {a.rubricName} (v{a.rubricVersion})</span>
              <span>&middot;</span>
              <span>Completed {fmtDateTime(a.completedAt)}</span>
              {meeting.permissions.canModerate && (
                <Button size="sm" variant="outline" className="no-print ml-auto" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setModerating(true)}>
                  Moderate scores
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Strengths / improvements */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> What went well</span>} />
          <CardBody>
            <ul className="space-y-2.5">
              {a.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-800"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />{s}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-500" /> What to do next time</span>} />
          <CardBody>
            {a.improvements.length ? (
              <ul className="space-y-2.5">
                {a.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-800"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />{s}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No improvements were suggested.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {a.actionPlan.length > 0 && (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Flag className="h-5 w-5 text-brand-700" /> Action plan</span>} description="Small, concrete steps for the next meeting" />
          <ul className="divide-y divide-slate-100">
            {a.actionPlan.map((item, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <Badge tone={item.priority === 'HIGH' ? 'danger' : item.priority === 'MEDIUM' ? 'warning' : 'neutral'} className="mt-0.5 shrink-0">{item.priority.toLowerCase()}</Badge>
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.action}</p>
                  {item.why && <p className="text-xs text-slate-500">{item.why}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {a.learnerExperience && (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><UserRound className="h-5 w-5 text-brand-700" /> From the learner&rsquo;s point of view</span>} />
          <CardBody><p className="text-sm leading-relaxed text-slate-800">{a.learnerExperience}</p></CardBody>
        </Card>
      )}

      <div className="no-print">
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'criteria', label: 'Criteria', count: a.criteria.length },
          { value: 'transcript', label: 'Transcript' },
          { value: 'how', label: 'How this was scored' },
          { value: 'comments', label: 'Comments' },
        ]}
      >
        <TabPanel value="criteria"><CriteriaList analysis={a} onJump={jump} /></TabPanel>
        <TabPanel value="transcript"><TranscriptPanel meeting={meeting} jumpTo={jumpTo} onChanged={onChanged} /></TabPanel>
        <TabPanel value="how"><HowScored analysis={a} meeting={meeting} /></TabPanel>
        <TabPanel value="comments"><CommentsPanel meetingId={meeting.id} /></TabPanel>
      </Tabs>
      </div>

      {/* Print-only sections (tabs are hidden on paper) */}
      <div className="print-only space-y-6">
        <h2 className="text-xl">Criteria</h2>
        <CriteriaList analysis={a} onJump={() => undefined} />
        <h2 className="text-xl">How this was scored</h2>
        <HowScored analysis={a} meeting={meeting} />
      </div>

      <ModerationDialog open={moderating} onOpenChange={setModerating} analysis={a} onDone={onChanged} />
    </div>
  );
}

function MiniStat({ label, value, help, tone }: { label: string; value: string; help: string; tone: 'good' | 'ok' | 'poor' | 'neutral' }) {
  const colours = { good: 'text-emerald-700', ok: 'text-amber-700', poor: 'text-rose-700', neutral: 'text-slate-900' };
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="flex items-center gap-1 text-xs text-slate-500">
        {label} <HelpTip>{help}</HelpTip>
      </p>
      <p className={cn('mt-0.5 text-lg font-semibold', colours[tone])}>{value}</p>
    </div>
  );
}

export function ConfidenceBadge({ level, reason }: { level: Analysis['confidence']; reason: string | null }) {
  if (!level) return null;
  const tone = level === 'HIGH' ? 'success' : level === 'MEDIUM' ? 'warning' : 'danger';
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={tone}>Confidence: {level.toLowerCase()}</Badge>
      {reason && <HelpTip label="Why this confidence level?">{reason}</HelpTip>}
    </span>
  );
}

/* ---------------- Criteria ---------------- */

function CriteriaList({ analysis, onJump }: { analysis: Analysis; onJump: (s: number) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, CriterionResult[]>();
    for (const c of analysis.criteria) map.set(c.categoryName, [...(map.get(c.categoryName) ?? []), c]);
    return [...map.entries()];
  }, [analysis]);
  return (
    <div className="space-y-6">
      {groups.map(([category, items]) => {
        const scored = items.filter((c) => c.effectiveScore !== null);
        const avg = scored.length ? scored.reduce((n, c) => n + (c.effectiveScore ?? 0), 0) / scored.length : null;
        return (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 id={`cat-${category}`} className="text-base font-semibold text-slate-900">{category}</h3>
              {avg !== null && <span className="text-xs text-slate-500">average {avg.toFixed(1)} / 5</span>}
            </div>
            <div className="space-y-3">
              {items.map((c) => <CriterionCard key={c.id} c={c} onJump={onJump} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CriterionCard({ c, onJump }: { c: CriterionResult; onJump: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  const descriptor = c.effectiveScore !== null ? c.descriptors[String(c.effectiveScore)] ?? c.descriptors[c.effectiveScore >= 4 ? '5' : c.effectiveScore >= 2 ? '3' : '1'] : null;
  return (
    <Card className={cn(c.isMandatory && (c.effectiveScore ?? 0) < 3 && !c.notApplicable && 'border-rose-200')}>
      <button type="button" className="flex w-full items-start gap-3 px-5 py-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="mt-0.5 shrink-0 text-xs font-semibold text-slate-400">{c.code}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{c.title}</span>
            {c.isMandatory && <Badge tone="brand">Essential</Badge>}
            {c.moderatedScore !== null && <Badge tone="info"><ShieldCheck className="h-3 w-3" /> moderated from {c.score ?? '-'}</Badge>}
          </span>
          <span className="mt-1 block text-sm text-slate-600">{c.notApplicable ? 'Not applicable to this meeting.' : c.rationale}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ScorePill score={c.effectiveScore} />
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="print-expand space-y-4 border-t border-slate-100 px-5 py-4">
          {c.description && <p className="text-sm text-slate-600">{c.description}</p>}
          {c.evidence.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Quote className="h-3.5 w-3.5" /> Evidence from the meeting</p>
              <ul className="space-y-2">
                {c.evidence.map((e, i) => (
                  <li key={i} className="rounded-xl border-l-4 border-brand-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800">
                    &ldquo;{e.quote}&rdquo;
                    {e.startSeconds != null && (
                      <button type="button" className="no-print ml-2 rounded-md bg-white px-1.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50" onClick={() => onJump(e.startSeconds!)}>
                        {formatTimestamp(e.startSeconds)}
                      </button>
                    )}
                    {e.speaker && <span className="ml-2 text-xs text-slate-500">{e.speaker}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !c.notApplicable && <p className="text-sm italic text-slate-500">No direct evidence was found in the transcript.</p>
          )}
          {descriptor && (
            <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">What a {c.effectiveScore} looks like:</span> {descriptor}</p>
          )}
          {c.suggestion && (
            <p className="flex gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> {c.suggestion}</p>
          )}
          {c.moderationNote && <p className="text-sm text-slate-700"><span className="font-medium">Moderator&rsquo;s note:</span> {c.moderationNote}</p>}
          {c.frameworkRefs.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <BookOpen className="h-3.5 w-3.5" /> Draws on:
              {c.frameworkRefs.map((f, i) => (
                <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5">{f.framework}{f.note ? ` - ${f.note}` : ''}</span>
              ))}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------------- Transcript ---------------- */

function TranscriptPanel({ meeting, jumpTo, onChanged }: { meeting: MeetingDetail; jumpTo: number | null; onChanged: () => void }) {
  const { data: t, isLoading } = useTranscript(meeting.id);
  const qc = useQueryClient();
  const [map, setMap] = useState<Record<string, SpeakerRole>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (t) setMap(t.speakerMap);
  }, [t]);
  useEffect(() => {
    if (jumpTo === null || !t) return;
    const idx = t.segments.findIndex((s) => s.start >= jumpTo - 0.5);
    const el = document.getElementById(`seg-${idx === -1 ? t.segments.length - 1 : idx}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('ring-2', 'ring-brand-400');
    setTimeout(() => el?.classList.remove('ring-2', 'ring-brand-400'), 2500);
  }, [jumpTo, t]);
  if (isLoading || !t) return <p className="text-sm text-slate-500">Loading transcript&hellip;</p>;

  const changed = JSON.stringify(map) !== JSON.stringify(t.speakerMap);
  const roleColour: Record<SpeakerRole, string> = { TUTOR: 'bg-brand-100 text-brand-900', LEARNER: 'bg-accent-100 text-accent-700', OTHER: 'bg-slate-100 text-slate-700' };
  const save = async (reanalyse: boolean) => {
    setSaving(true);
    try {
      await mutations.updateSpeakers(meeting.id, { speakerMap: map, reanalyse });
      await qc.invalidateQueries({ queryKey: keys.transcript(meeting.id) });
      onChanged();
      toast.success(reanalyse ? 'Speakers saved. The review is running again.' : 'Speakers saved and talk-time updated.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="max-h-[70vh] overflow-y-auto scrollbar-thin">
        <ol className="divide-y divide-slate-50">
          {t.segments.map((s, i) => {
            const role = map[s.speaker] ?? 'OTHER';
            return (
              <li key={i} id={`seg-${i}`} className="flex gap-3 px-4 py-2.5 transition-shadow">
                <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">{formatTimestamp(s.start)}</span>
                <div className="min-w-0">
                  <span className={cn('mb-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold', roleColour[role])}>
                    {role === 'TUTOR' ? 'Tutor' : role === 'LEARNER' ? 'Learner' : 'Other'} <span className="font-normal opacity-70">({s.speaker})</span>
                  </span>
                  <p className="text-sm leading-relaxed text-slate-800">{s.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
      <div className="no-print space-y-4">
        <Card>
          <CardHeader title="Who is who?" description="Check the speaker labels. Talk-time figures depend on this." />
          <CardBody className="space-y-3">
            {t.speakerLabels.map((label) => (
              <label key={label} className="block text-sm">
                <span className="mb-1 block font-medium text-slate-800">{label}</span>
                <Select value={map[label] ?? 'OTHER'} onChange={(e) => setMap({ ...map, [label]: e.target.value as SpeakerRole })}>
                  <option value="TUTOR">Tutor</option>
                  <option value="LEARNER">Learner</option>
                  <option value="OTHER">Someone else</option>
                </Select>
              </label>
            ))}
            {changed && (
              <div className="flex flex-col gap-2 pt-1">
                <Button size="sm" loading={saving} onClick={() => save(false)}>Save speakers</Button>
                <Button size="sm" variant="outline" loading={saving} onClick={() => save(true)}>Save and re-run review</Button>
              </div>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-slate-500">
          Source: {t.source === 'AWS_TRANSCRIBE' ? 'Amazon Transcribe' : t.source === 'UPLOADED' ? 'uploaded transcript' : 'sample transcript (development)'} &middot; {t.wordCount.toLocaleString()} words
        </p>
      </div>
    </div>
  );
}

/* ---------------- Transparency ---------------- */

function HowScored({ analysis: a, meeting }: { analysis: Analysis; meeting: MeetingDetail }) {
  const rows = a.criteria.map((c) => ({ criterionId: c.criterionId, weight: c.weight, isMandatory: c.isMandatory, score: c.effectiveScore, notApplicable: c.notApplicable }));
  const result = computeOverallScore(rows);
  const metrics = (a.metrics ?? {}) as Record<string, number>;
  return (
    <div className="space-y-6">
      <Alert tone="info" title="AI-assisted, human-decided">
        The language model reads the transcript and proposes a score and evidence for each criterion. The overall score, grade and talk-time figures are then calculated with the fixed arithmetic shown below, so anyone can check them. Academic managers can moderate any score and their reasons are recorded.
      </Alert>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Calculator className="h-5 w-5 text-brand-700" /> The calculation</span>} />
        <CardBody className="space-y-3 text-sm text-slate-800">
          <p>
            Overall score = (sum of <em>score &times; weight</em>) &divide; (sum of <em>5 &times; weight</em>) &times; 100, over the {result.applicableCount} applicable criteria.
          </p>
          <p className="rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm">
            {result.totalWeightedPoints} &divide; {result.totalMaxPoints} &times; 100 = <strong>{result.overallScore}</strong>
            {a.moderatedOverallScore !== null && <span className="ml-2 text-slate-500">(after moderation; the original AI score was {a.overallScore})</span>}
          </p>
          <p>
            Essential items covered = {result.mandatoryCovered} of {result.mandatoryTotal} essential criteria scored 3 or more = <strong>{result.mandatoryCoverage}%</strong>.
          </p>
          <p>Grade bands for &ldquo;{a.rubricName}&rdquo;: {[...a.gradeBands].sort((x, y) => y.min - x.min).map((b) => `${b.label} (${b.min}+)`).join(', ')}.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Weights and scores" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Criterion</th>
                <th className="px-4 py-2 font-medium">Weight</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Points</th>
                <th className="px-4 py-2 font-medium">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {a.criteria.map((c) => {
                const r = result.rows.find((x) => x.criterionId === c.criterionId)!;
                return (
                  <tr key={c.id} className={cn(c.notApplicable && 'text-slate-400')}>
                    <td className="px-4 py-2">{c.code} {c.title}{c.isMandatory && <span className="ml-1 text-xs text-brand-700">(essential)</span>}</td>
                    <td className="px-4 py-2">{c.weight}</td>
                    <td className="px-4 py-2">{c.notApplicable ? 'n/a' : c.effectiveScore}{c.moderatedScore !== null && <span className="text-xs text-slate-500"> (AI: {c.score})</span>}</td>
                    <td className="px-4 py-2">{r.weightedPoints}</td>
                    <td className="px-4 py-2">{r.maxPoints}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={3}>Total</td>
                <td className="px-4 py-2">{result.totalWeightedPoints}</td>
                <td className="px-4 py-2">{result.totalMaxPoints}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Objective measures" description="Counted directly from the transcript, no AI involved" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Kv k="Tutor talk share" v={`${Math.round(metrics.tutorTalkShare ?? 0)}%`} />
              <Kv k="Learner talk share" v={`${Math.round(metrics.learnerTalkShare ?? 0)}%`} />
              <Kv k="Tutor questions" v={`${metrics.tutorQuestions ?? 0} (${metrics.tutorOpenQuestions ?? 0} open)`} />
              <Kv k="Learner questions" v={String(metrics.learnerQuestions ?? 0)} />
              <Kv k="Longest tutor stretch" v={formatTimestamp(metrics.longestTutorMonologueSeconds ?? 0)} />
              <Kv k="Speaking pace" v={`${metrics.wordsPerMinute ?? 0} words/min`} />
              <Kv k="Turns taken" v={String(metrics.turnCount ?? 0)} />
              <Kv k="Total words" v={(metrics.totalWords ?? 0).toLocaleString()} />
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="What the review was based on" />
          <CardBody className="space-y-3 text-sm text-slate-800">
            <ul className="list-disc space-y-1 pl-5">{a.inputsUsed.map((i) => <li key={i}>{i}</li>)}</ul>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-slate-600">
              <dt>Model</dt><dd>{a.model ?? '-'} via {a.provider ?? '-'}</dd>
              <dt>Prompt version</dt><dd>{a.promptVersion ?? '-'}</dd>
              <dt>Criteria version</dt><dd>{a.rubricName} v{a.rubricVersion}</dd>
              {a.tokenUsage && <><dt>Tokens used</dt><dd>{a.tokenUsage.totalTokens?.toLocaleString?.() ?? '-'}</dd></>}
              <dt>Started</dt><dd>{fmtDateTime(a.startedAt)}</dd>
              <dt>Completed</dt><dd>{fmtDateTime(a.completedAt)}</dd>
            </dl>
            <div className="flex items-center gap-2"><ConfidenceBadge level={a.confidence} reason={a.confidenceReason} /><span className="text-xs text-slate-500">{a.confidenceReason}</span></div>
            {a.moderation && (
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-900"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Moderated by {a.moderation.moderatorName} on {fmtDateTime(a.moderation.createdAt)}: &ldquo;{a.moderation.note}&rdquo;</p>
            )}
            <p className="text-xs text-slate-500">Meeting uploaded by {meeting.createdBy.firstName} {meeting.createdBy.lastName}.</p>
          </CardBody>
        </Card>
      </div>

      {a.materialsCoverage.length > 0 && (
        <Card>
          <CardHeader title="Presentation coverage" description="Topics from the uploaded slides and whether they came up" />
          <ul className="divide-y divide-slate-100">
            {a.materialsCoverage.map((m, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                {m.covered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                <span className="flex-1 text-slate-800">{m.topic}</span>
                {m.note && <span className="text-xs text-slate-500">{m.note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="flex items-center gap-2 text-xs text-slate-500"><Sparkles className="h-3.5 w-3.5" /> Limitations: automatic transcription can mis-hear words and names; scores reflect what was said, not body language; the model can miss context. Treat the report as a structured second opinion.</p>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-900">{v}</dd>
    </div>
  );
}

/* ---------------- Comments ---------------- */

function CommentsPanel({ meetingId }: { meetingId: string }) {
  const { user, can } = useAuth();
  const { data: comments } = useComments(meetingId);
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await mutations.addComment(meetingId, body.trim());
      setBody('');
      await qc.invalidateQueries({ queryKey: keys.comments(meetingId) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not post the comment.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4" id="comments">
      {comments?.length ? (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar firstName={c.author.firstName} lastName={c.author.lastName} src={c.author.avatarUrl} />
              <div className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 shadow-[var(--shadow-card)] ring-1 ring-slate-200">
                <p className="text-sm font-medium text-slate-900">
                  {c.author.firstName} {c.author.lastName} <span className="text-xs font-normal text-slate-500">{fmtDateTime(c.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-slate-500">No comments yet. Use this space to discuss the report with the tutor or manager.</p>
      )}
      {(can('analysis:comment') || can('meeting:read:any')) && user && (
        <div className="no-print flex gap-3">
          <Avatar firstName={user.firstName} lastName={user.lastName} src={user.avatarUrl} />
          <div className="flex-1 space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment for the tutor or manager" aria-label="New comment" />
            <div className="flex justify-end"><Button size="sm" onClick={submit} loading={busy} icon={<MessageSquare className="h-4 w-4" />}>Post comment</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Moderation ---------------- */

function ModerationDialog({ open, onOpenChange, analysis: a, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; analysis: Analysis; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setScores(Object.fromEntries(a.criteria.map((c) => [c.id, c.moderatedScore])));
      setNote('');
    }
  }, [open, a]);
  const preview = computeOverallScore(a.criteria.map((c) => ({ criterionId: c.criterionId, weight: c.weight, isMandatory: c.isMandatory, score: c.notApplicable ? null : (scores[c.id] ?? c.score), notApplicable: c.notApplicable })));
  const submit = async () => {
    if (note.trim().length < 5) return toast.error('Please explain the reason for the change.');
    setBusy(true);
    try {
      await mutations.moderate(a.id, { note: note.trim(), criteria: a.criteria.filter((c) => scores[c.id] !== c.moderatedScore).map((c) => ({ criterionResultId: c.id, moderatedScore: scores[c.id] ?? null })) });
      toast.success('Moderation saved.');
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Moderate scores" description="Override any AI score where you disagree. Your reason is recorded and shown on the report." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit}>Save moderation</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
          Overall score with these changes: <strong>{preview.overallScore}</strong> (AI score {a.overallScore})
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {a.criteria.filter((c) => !c.notApplicable).map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <span className="w-10 text-xs font-semibold text-slate-400">{c.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{c.title}</span>
              <span className="text-xs text-slate-500">AI: {c.score}</span>
              <Select className="h-9 w-28 text-sm" value={scores[c.id] === null || scores[c.id] === undefined ? '' : String(scores[c.id])} onChange={(e) => setScores({ ...scores, [c.id]: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`Moderated score for ${c.title}`}>
                <option value="">Keep AI</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Reason for moderation <span className="text-rose-600">*</span></span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the tutor did explain Prevent at 12:40 but the transcript mis-heard the word." />
        </label>
      </div>
    </Dialog>
  );
}

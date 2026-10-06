import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ClipboardList, Lock, Plus, Printer, Send, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Appraisal } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { ScoreTrendChart, CriteriaComparisonChart } from '@/components/charts/Charts';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, PageHeader, Skeleton, Stat } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtScore, toDateInput } from '@/lib/format';
import { keys, mutations, useAppraisal, useAppraisals, useUsers } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

const statusTone = { DRAFT: 'neutral', GENERATED: 'info', SHARED: 'success', LOCKED: 'brand' } as const;
const statusLabel = { DRAFT: 'Draft', GENERATED: 'Summary ready', SHARED: 'Shared with tutor', LOCKED: 'Locked' } as const;

export function AppraisalsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useAppraisals();
  const [open, setOpen] = useState(!!params.get('new'));
  const manage = can('appraisal:manage');
  return (
    <div>
      <PageHeader title="Appraisals" description={manage ? 'Evidence-based summaries of a tutor’s reviewed meetings over a period, for appraisal conversations.' : 'Appraisal summaries your manager has shared with you.'} actions={manage ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New appraisal</Button> : undefined} />
      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={ClipboardList} title="No appraisals yet" description={manage ? 'Create one for a tutor and a period, then generate the summary.' : 'When your manager shares an appraisal summary it will appear here.'} />
      ) : (
        <div className="card divide-y divide-slate-100">
          {data.map((a) => (
            <Link key={a.id} to={`/appraisals/${a.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
              <Avatar firstName={a.tutor.firstName} lastName={a.tutor.lastName} src={a.tutor.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{a.title}</p>
                <p className="text-xs text-slate-500">{a.tutor.firstName} {a.tutor.lastName} · {fmtDate(a.periodStart)} to {fmtDate(a.periodEnd)} · {a.stats?.meetingCount ?? 0} meetings{a.stats?.averageScore != null ? ` · average ${a.stats.averageScore}` : ''}</p>
              </div>
              <Badge tone={statusTone[a.status]}>{statusLabel[a.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
      <NewAppraisalDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { params.delete('new'); setParams(params); } }} presetTutorId={params.get('new') ?? ''} />
    </div>
  );
}

function NewAppraisalDialog({ open, onOpenChange, presetTutorId }: { open: boolean; onOpenChange: (o: boolean) => void; presetTutorId: string }) {
  const qc = useQueryClient();
  const { data: users } = useUsers({}, open);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ tutorId: presetTutorId, title: '', periodStart: toDateInput(new Date(Date.now() - 180 * 86_400_000)), periodEnd: toDateInput(new Date()), managerNotes: '' });
  useEffect(() => setF((x) => ({ ...x, tutorId: presetTutorId || x.tutorId })), [presetTutorId]);
  const submit = async () => {
    setBusy(true);
    try {
      const a = await mutations.createAppraisal({ ...f, managerNotes: f.managerNotes || null });
      await qc.invalidateQueries({ queryKey: ['appraisals'] });
      toast.success('Appraisal created.');
      onOpenChange(false);
      window.location.assign(`/appraisals/${a.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New appraisal" description="Statistics are gathered from the tutor's reviewed meetings in the period." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit} disabled={!f.tutorId || !f.title.trim()}>Create</Button></>}>
      <div className="space-y-4">
        <Field label="Tutor" id="at" required><Select id="at" value={f.tutorId} onChange={(e) => setF({ ...f, tutorId: e.target.value })}><option value="">Choose</option>{users?.filter((u) => ['TUTOR', 'ACADEMIC_ADMIN', 'ACADEMIC_MANAGER'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</Select></Field>
        <Field label="Title" id="ati" required><Input id="ati" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Mid-year review 2026" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Period from" id="aps"><Input id="aps" type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
          <Field label="Period to" id="ape"><Input id="ape" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field>
        </div>
        <Field label="Manager notes (optional)" id="amn" hint="Context the summary should take into account, such as extra responsibilities."><Textarea id="amn" value={f.managerNotes} onChange={(e) => setF({ ...f, managerNotes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

export function AppraisalPage() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const { data: a, isLoading, error } = useAppraisal(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [tutorComment, setTutorComment] = useState('');
  useEffect(() => {
    if (a) {
      setNotes(a.managerNotes ?? '');
      setTutorComment(a.tutorComment ?? '');
    }
  }, [a]);
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  if (error || !a) return <Alert tone="warning" title="We could not open this appraisal">{error instanceof ApiError ? error.message : ''}</Alert>;
  const manage = can('appraisal:manage');
  const isTutor = a.tutor.id === user?.id;
  const locked = a.status === 'LOCKED';
  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: keys.appraisal(a.id) });
      await qc.invalidateQueries({ queryKey: ['appraisals'] });
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  const s = a.stats;
  const n = a.narrative;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={{ to: '/appraisals', label: 'Appraisals' }}
        title={<span className="flex items-center gap-2">{a.title} <Badge tone={statusTone[a.status]}>{statusLabel[a.status]}</Badge></span>}
        description={<span className="flex items-center gap-2"><Avatar firstName={a.tutor.firstName} lastName={a.tutor.lastName} src={a.tutor.avatarUrl} size="sm" /><Link to={`/people/${a.tutor.id}`} className="hover:underline">{a.tutor.firstName} {a.tutor.lastName}</Link> · {a.tutor.jobTitle ?? ''}{a.tutor.departmentName ? ` · ${a.tutor.departmentName}` : ''} · {fmtDate(a.periodStart)} to {fmtDate(a.periodEnd)}</span>}
        actions={
          <>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Download PDF</Button>
            {manage && !locked && <Button variant="outline" icon={<Sparkles className="h-4 w-4" />} loading={busy === 'gen'} onClick={() => run('gen', () => mutations.generateAppraisal(a.id), 'Generating the summary - this takes about a minute.')}>{n ? 'Regenerate summary' : 'Generate summary'}</Button>}
            {manage && a.status === 'GENERATED' && <Button icon={<Send className="h-4 w-4" />} loading={busy === 'share'} onClick={() => run('share', () => mutations.updateAppraisal(a.id, { status: 'SHARED', managerNotes: notes }), 'Shared with the tutor.')}>Share with tutor</Button>}
            {manage && a.status === 'SHARED' && <Button variant="outline" icon={<Lock className="h-4 w-4" />} loading={busy === 'lock'} onClick={() => run('lock', () => mutations.updateAppraisal(a.id, { status: 'LOCKED' }), 'Appraisal locked.')}>Lock</Button>}
            {manage && !locked && <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (confirm('Delete this appraisal?')) void run('del', async () => { await mutations.deleteAppraisal(a.id); window.location.assign('/appraisals'); }, 'Deleted.'); }}>Delete</Button>}
          </>
        }
      />

      <Alert tone="info" className="mb-6">This summary is generated from statistics and completed reports. It is a starting point for a conversation between the tutor and their manager, not a decision.</Alert>

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Meetings reviewed" value={s.meetingCount} sub={`${fmtDate(a.periodStart)} - ${fmtDate(a.periodEnd)}`} />
          <Stat label="Average score" value={fmtScore(s.averageScore)} sub={s.bestScore !== null ? `best ${s.bestScore} · lowest ${s.lowestScore}` : undefined} />
          <Stat label="Department average" value={fmtScore(s.departmentAverage)} sub={a.tutor.departmentName ?? ''} />
          <Stat label="College average" value={fmtScore(s.collegeAverage)} sub={s.averageMandatoryCoverage !== null ? `essentials covered ${Math.round(s.averageMandatoryCoverage)}%` : undefined} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Scores over the period" /><CardBody><ScoreTrendChart points={s?.trend ?? []} height={200} /></CardBody></Card>
        <Card><CardHeader title="By criterion vs college" /><CardBody><CriteriaComparisonChart rows={s?.criteriaAverages ?? []} height={220} /></CardBody></Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Summary" description={n ? `Generated ${fmtDateTime(a.generatedAt)} · ${a.model ?? ''}` : 'Not generated yet'} />
        <CardBody className="space-y-5">
          {!n && <p className="text-sm text-slate-500">{manage ? 'Press "Generate summary" to write the narrative from the statistics above.' : 'Your manager has not generated the summary yet.'}</p>}
          {n && (
            <>
              <p className="text-lg font-medium text-slate-900">{n.headline}</p>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{n.overview}</div>
              <div className="grid gap-5 md:grid-cols-2">
                <Section title="Strengths" items={n.strengths} tone="bg-emerald-500" />
                <Section title="Development areas" items={n.developmentAreas} tone="bg-amber-500" />
                <Section title="Suggested CPD" items={n.suggestedCpd} tone="bg-brand-500" />
                <Section title="Evidence notes" items={n.evidenceNotes} tone="bg-slate-400" />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Manager's notes" />
          <CardBody>
            {manage && !locked ? (
              <>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[140px]" />
                <div className="mt-2 flex justify-end"><Button size="sm" variant="outline" loading={busy === 'notes'} onClick={() => run('notes', () => mutations.updateAppraisal(a.id, { managerNotes: notes }), 'Notes saved.')}>Save notes</Button></div>
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-800">{a.managerNotes || <span className="text-slate-500">No notes.</span>}</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tutor's response" description={isTutor ? 'Add your own reflections and comments.' : undefined} />
          <CardBody>
            {(isTutor || manage) && !locked && (a.status === 'SHARED' || manage) ? (
              <>
                <Textarea value={tutorComment} onChange={(e) => setTutorComment(e.target.value)} className="min-h-[140px]" placeholder={isTutor ? 'For example: I agree with the development areas and would like support with...' : ''} />
                <div className="mt-2 flex justify-end"><Button size="sm" variant="outline" loading={busy === 'tc'} onClick={() => run('tc', () => mutations.updateAppraisal(a.id, { tutorComment }), 'Response saved.')}>Save response</Button></div>
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-800">{a.tutorComment || <span className="text-slate-500">No response yet.</span>}</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-900">{title}</h4>
      <ul className="space-y-1.5">{items.map((i, idx) => <li key={idx} className="flex gap-2 text-sm text-slate-800"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden />{i}</li>)}</ul>
    </div>
  );
}

export type { Appraisal };

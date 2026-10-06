import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Medal, Plus, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { KPI_METRIC_LABELS, KPI_METRICS, type Competition, type KpiMetric } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, PageHeader, Skeleton, Switch } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, toDateInput } from '@/lib/format';
import { keys, mutations, useCompetition, useCompetitions, useDepartments, useRubrics, useUsers } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

const statusTone = { UPCOMING: 'info', ACTIVE: 'success', CLOSED: 'neutral' } as const;
const statusLabel = { UPCOMING: 'Starts soon', ACTIVE: 'Live', CLOSED: 'Finished' } as const;

export function CompetitionsPage() {
  const { can } = useAuth();
  const { data, isLoading } = useCompetitions();
  const [open, setOpen] = useState(false);
  const manage = can('competition:manage');
  return (
    <div>
      <PageHeader title="Competitions" description="Friendly challenges based on reviewed meetings. Join one and watch the standings update as reports come in." actions={manage ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New competition</Button> : undefined} />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={Trophy} title="No competitions yet" description="Managers can create one, for example 'highest average induction score this term'." action={manage ? <Button onClick={() => setOpen(true)}>Create a competition</Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Link key={c.id} to={`/competitions/${c.id}`} className="card flex flex-col p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{c.name}</h3>
                <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                {KPI_METRIC_LABELS[c.metric]} · {fmtDate(c.startDate)} to {fmtDate(c.endDate)} · min {c.minMeetings} meetings
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><Users className="h-3.5 w-3.5" /> {c.participantCount} taking part{c.joined && <Badge tone="brand" className="ml-1">You are in</Badge>}</p>
            </Link>
          ))}
        </div>
      )}
      <CompetitionDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function CompetitionPage() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const { data: c, isLoading } = useCompetition(id);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  if (isLoading || !c) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  const refresh = () => qc.invalidateQueries({ queryKey: keys.competition(c.id) });
  const toggle = async () => {
    setBusy(true);
    try {
      if (c.joined) await mutations.leaveCompetition(c.id);
      else await mutations.joinCompetition(c.id);
      await refresh();
      await qc.invalidateQueries({ queryKey: keys.competitions });
      toast.success(c.joined ? 'You have left the competition.' : 'You are in! Good luck.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  };
  const medal = (rank: number | null) => (rank === 1 ? 'text-amber-500' : rank === 2 ? 'text-slate-500' : rank === 3 ? 'text-amber-700' : 'text-slate-300');
  const unit = c.metric === 'MEETINGS_REVIEWED' ? '' : c.metric === 'AVERAGE_SCORE' ? '' : '%';
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={{ to: '/competitions', label: 'Competitions' }}
        title={<span className="flex items-center gap-2">{c.name} <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge></span>}
        description={c.description}
        actions={
          <>
            {c.status !== 'CLOSED' && (c.joined ? <Button variant="outline" loading={busy} onClick={toggle}>Leave</Button> : <Button loading={busy} onClick={toggle} icon={<Trophy className="h-4 w-4" />}>Join this competition</Button>)}
            {can('competition:manage') && <Button variant="outline" onClick={() => setAddOpen(true)}>Add people</Button>}
          </>
        }
      />
      <div className="mb-6 grid gap-3 text-sm sm:grid-cols-4">
        <Info k="Measured by" v={KPI_METRIC_LABELS[c.metric]} />
        <Info k="Period" v={`${fmtDate(c.startDate)} - ${fmtDate(c.endDate)}`} />
        <Info k="To qualify" v={`at least ${c.minMeetings} reviewed meeting${c.minMeetings === 1 ? '' : 's'}`} />
        <Info k="Prize" v={c.prize ?? 'Bragging rights'} />
      </div>
      {c.rubricName && <p className="mb-4 text-xs text-slate-500">Only meetings reviewed with &ldquo;{c.rubricName}&rdquo; count.{c.departmentName ? ` Open to the ${c.departmentName} department.` : ''}</p>}
      <Card>
        <CardHeader title="Standings" description="Updates automatically as reports complete. Moderated scores are used where a manager has moderated." />
        {c.standings?.length ? (
          <ol className="divide-y divide-slate-100">
            {c.standings.map((s) => (
              <li key={s.userId} className={cn('flex items-center gap-4 px-5 py-3', s.isMe && 'bg-brand-50/60')}>
                <span className={cn('w-8 text-center text-lg font-semibold', s.rank ? 'text-slate-900' : 'text-slate-300')}>{s.rank ? (s.rank <= 3 ? <Medal className={cn('mx-auto h-6 w-6', medal(s.rank))} aria-label={`Rank ${s.rank}`} /> : s.rank) : '-'}</span>
                <Avatar firstName={s.name.split(' ')[0] ?? ''} lastName={s.name.split(' ').slice(1).join(' ')} src={s.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{s.name}{s.isMe && <span className="ml-1 text-xs text-brand-700">(you)</span>}{s.userId === user?.id ? '' : ''}</p>
                  <p className="text-xs text-slate-500">{s.departmentName ?? ''}{s.departmentName ? ' · ' : ''}{s.meetings} meeting{s.meetings === 1 ? '' : 's'}{!s.qualifies && ` · needs ${Math.max(0, c.minMeetings - s.meetings)} more to qualify`}</p>
                </div>
                <span className="text-lg font-semibold text-slate-900">{s.value ?? '-'}{s.value !== null ? unit : ''}</span>
              </li>
            ))}
          </ol>
        ) : (
          <CardBody><Alert tone="info">Nobody has joined yet. {c.status !== 'CLOSED' && 'Be the first!'}</Alert></CardBody>
        )}
      </Card>
      <AddPeopleDialog open={addOpen} onOpenChange={setAddOpen} competition={c} onDone={refresh} />
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div className="card px-4 py-3"><p className="text-xs text-slate-500">{k}</p><p className="font-medium text-slate-900">{v}</p></div>;
}

function CompetitionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: departments } = useDepartments();
  const { data: rubrics } = useRubrics();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', description: '', metric: 'AVERAGE_SCORE' as KpiMetric, rubricId: '', departmentId: '', startDate: toDateInput(new Date()), endDate: toDateInput(new Date(Date.now() + 90 * 86_400_000)), minMeetings: 3, prize: '', autoEnrol: true });
  const submit = async () => {
    setBusy(true);
    try {
      await mutations.createCompetition({ ...f, rubricId: f.rubricId || null, departmentId: f.departmentId || null, prize: f.prize || null, minMeetings: Number(f.minMeetings) });
      await qc.invalidateQueries({ queryKey: keys.competitions });
      toast.success('Competition created.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="New competition" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit} disabled={!f.name.trim()}>Create</Button></>}>
      <div className="space-y-4">
        <Field label="Name" id="cn" required><Input id="cn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Autumn induction challenge" /></Field>
        <Field label="Description and rules" id="cd"><Textarea id="cd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Measured by" id="cm"><Select id="cm" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as KpiMetric })}>{KPI_METRICS.map((m) => <option key={m} value={m}>{KPI_METRIC_LABELS[m]}</option>)}</Select></Field>
          <Field label="Minimum meetings to qualify" id="cmin"><Input id="cmin" type="number" min={1} value={f.minMeetings} onChange={(e) => setF({ ...f, minMeetings: Number(e.target.value) })} /></Field>
          <Field label="Starts" id="cs"><Input id="cs" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="Ends" id="ce"><Input id="ce" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          <Field label="Criteria set (optional)" id="cr"><Select id="cr" value={f.rubricId} onChange={(e) => setF({ ...f, rubricId: e.target.value })}><option value="">Any</option>{rubrics?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Department (optional)" id="cdep"><Select id="cdep" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Whole college</option>{departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        </div>
        <Field label="Prize (optional)" id="cp"><Input id="cp" value={f.prize} onChange={(e) => setF({ ...f, prize: e.target.value })} /></Field>
        <Switch id="ce2" checked={f.autoEnrol} onCheckedChange={(v) => setF({ ...f, autoEnrol: v })} label="Enter everyone automatically" description="Otherwise tutors join themselves." />
      </div>
    </Dialog>
  );
}

function AddPeopleDialog({ open, onOpenChange, competition, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; competition: Competition; onDone: () => void }) {
  const { data: users } = useUsers({}, open);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const already = new Set(competition.standings?.map((s) => s.userId) ?? []);
  const submit = async () => {
    setBusy(true);
    try {
      await mutations.addParticipants(competition.id, selected);
      onDone();
      onOpenChange(false);
      setSelected([]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add people" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} disabled={!selected.length} onClick={submit}>Add {selected.length || ''}</Button></>}>
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {users?.filter((u) => !already.has(u.id) && ['TUTOR', 'ACADEMIC_ADMIN', 'ACADEMIC_MANAGER'].includes(u.role)).map((u) => (
          <li key={u.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={selected.includes(u.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, u.id] : selected.filter((x) => x !== u.id))} />
              <Avatar firstName={u.firstName} lastName={u.lastName} src={u.avatarUrl} size="sm" />
              <span className="text-sm text-slate-800">{u.firstName} {u.lastName}</span>
              <span className="ml-auto text-xs text-slate-500">{u.departmentName ?? ''}</span>
            </label>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

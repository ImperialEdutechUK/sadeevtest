import { useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { KPI_METRIC_LABELS, KPI_METRICS, type KpiMetric, type KpiProgress } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, PageHeader, ProgressBar, Skeleton } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { fmtDate, toDateInput } from '@/lib/format';
import { keys, mutations, useDepartments, useKpis, useUsers } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

const unit = (m: KpiMetric) => (m === 'MEETINGS_REVIEWED' ? '' : m === 'AVERAGE_SCORE' ? ' / 100' : '%');

export function KpisPage() {
  const { can } = useAuth();
  const { data, isLoading } = useKpis();
  const [open, setOpen] = useState(false);
  const manage = can('kpi:manage');
  return (
    <div>
      <PageHeader title="KPIs" description="Targets for meeting quality, updated automatically from completed reports." actions={manage ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New KPI</Button> : undefined} />
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={Target} title="No KPIs yet" description="Set a target such as 'average induction score of at least 75 this term'." action={manage ? <Button onClick={() => setOpen(true)}>Create the first KPI</Button> : undefined} />
      ) : (
        <div className="space-y-4">{data.map((k) => <KpiCard key={k.id} kpi={k} manage={manage} />)}</div>
      )}
      <KpiDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function KpiCard({ kpi: k, manage }: { kpi: KpiProgress; manage: boolean }) {
  const qc = useQueryClient();
  const [showPeople, setShowPeople] = useState(false);
  const tone = k.met === null ? 'brand' : k.met ? 'success' : (k.progressPct ?? 0) >= 75 ? 'warning' : 'danger';
  const remove = async () => {
    if (!confirm(`Delete the KPI "${k.name}"?`)) return;
    await mutations.deleteKpi(k.id);
    await qc.invalidateQueries({ queryKey: keys.kpis });
  };
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
              {k.name}
              {k.met === true && <Badge tone="success">On target</Badge>}
              {k.met === false && <Badge tone="warning">Below target</Badge>}
              {k.met === null && <Badge tone="neutral">No data yet</Badge>}
            </h3>
            <p className="text-sm text-slate-600">{k.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              {KPI_METRIC_LABELS[k.metric]} · {k.comparison === 'AT_LEAST' ? 'at least' : 'at most'} {k.target}{unit(k.metric)} · {fmtDate(k.periodStart)} to {fmtDate(k.periodEnd)} · {k.userName ? `for ${k.userName}` : k.departmentName ? `${k.departmentName} department` : 'all tutors'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900">{k.current === null ? '-' : k.current}<span className="text-sm font-normal text-slate-500">{unit(k.metric)}</span></p>
            <p className="text-xs text-slate-500">target {k.target}{unit(k.metric)} · {k.sampleSize} meeting{k.sampleSize === 1 ? '' : 's'}</p>
          </div>
        </div>
        <ProgressBar className="mt-3" value={k.progressPct} tone={tone} label={`${k.name} progress`} />
        <div className="mt-3 flex items-center gap-3">
          {k.perTutor && k.perTutor.length > 0 && <button className="text-sm text-brand-700 hover:underline" onClick={() => setShowPeople((s) => !s)}>{showPeople ? 'Hide' : 'Show'} by person ({k.perTutor.filter((p) => p.met).length} of {k.perTutor.length} on target)</button>}
          {manage && <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={remove} className="ml-auto">Delete</Button>}
        </div>
        {showPeople && k.perTutor && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1.5 font-medium">Person</th><th className="py-1.5 font-medium">Value</th><th className="py-1.5 font-medium">Meetings</th><th className="py-1.5 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {[...k.perTutor].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map((p) => (
                <tr key={p.userId}><td className="py-1.5 text-slate-800">{p.name}</td><td className="py-1.5">{p.value ?? '-'}{p.value !== null ? unit(k.metric) : ''}</td><td className="py-1.5 text-slate-600">{p.sampleSize}</td><td className="py-1.5">{p.met === null ? <Badge tone="neutral">no data</Badge> : p.met ? <Badge tone="success">on target</Badge> : <Badge tone="warning">below</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

export function KpiDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: departments } = useDepartments();
  const { data: users } = useUsers({}, open);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', description: '', metric: 'AVERAGE_SCORE' as KpiMetric, target: 75, comparison: 'AT_LEAST' as 'AT_LEAST' | 'AT_MOST', periodStart: toDateInput(new Date()), periodEnd: toDateInput(new Date(Date.now() + 90 * 86_400_000)), scope: 'all', departmentId: '', userId: '' });
  const submit = async () => {
    setBusy(true);
    try {
      await mutations.createKpi({ name: f.name, description: f.description || null, metric: f.metric, target: Number(f.target), comparison: f.comparison, periodStart: f.periodStart, periodEnd: f.periodEnd, departmentId: f.scope === 'department' ? f.departmentId || null : null, userId: f.scope === 'person' ? f.userId || null : null });
      await qc.invalidateQueries({ queryKey: keys.kpis });
      toast.success('KPI created.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the KPI.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New KPI" description="Progress is calculated automatically from completed reports in the period." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit} disabled={!f.name.trim()}>Create KPI</Button></>}>
      <div className="space-y-4">
        <Field label="Name" id="kn" required><Input id="kn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Induction quality this term" /></Field>
        <Field label="Description" id="kd"><Textarea id="kd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[64px]" /></Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
          <Field label="Measure" id="km"><Select id="km" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as KpiMetric })}>{KPI_METRICS.map((m) => <option key={m} value={m}>{KPI_METRIC_LABELS[m]}</option>)}</Select></Field>
          <Field label="Should be" id="kc"><Select id="kc" value={f.comparison} onChange={(e) => setF({ ...f, comparison: e.target.value as 'AT_LEAST' | 'AT_MOST' })}><option value="AT_LEAST">at least</option><option value="AT_MOST">at most</option></Select></Field>
          <Field label="Target" id="kt" required><Input id="kt" type="number" min={0} value={f.target} onChange={(e) => setF({ ...f, target: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" id="ks" required><Input id="ks" type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
          <Field label="To" id="ke" required><Input id="ke" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field>
        </div>
        <Field label="Applies to" id="ksc">
          <Select id="ksc" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="all">All tutors</option><option value="department">One department</option><option value="person">One person</option></Select>
        </Field>
        {f.scope === 'department' && <Field label="Department" id="kdep"><Select id="kdep" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Choose</option>{departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
        {f.scope === 'person' && <Field label="Person" id="kp"><Select id="kp" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</Select></Field>}
      </div>
    </Dialog>
  );
}

import { Link, useParams } from 'react-router-dom';
import { Target } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { CriteriaComparisonChart, ScoreTrendChart } from '@/components/charts/Charts';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { HelpTip } from '@/components/ui/HelpTip';
import { Alert, PageHeader, ProgressBar, Skeleton, Stat } from '@/components/ui/Misc';
import { ScoreChip } from '@/pages/DashboardPage';
import { fmtDate, fmtScore } from '@/lib/format';
import { usePerson } from '@/lib/queries';
import { KPI_METRIC_LABELS, type KpiMetric } from '@slc/shared';

export function PersonPage() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const { data: p, isLoading, error } = usePerson(id);
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-16 w-1/2" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  if (error || !p) return <Alert tone="warning" title="We could not open this profile">You may not have access to it.</Alert>;
  const isMe = p.user.id === user?.id;
  const strongest = [...p.criteriaAverages].filter((c) => c.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0)).slice(0, 3);
  const weakest = [...p.criteriaAverages].filter((c) => c.average !== null).sort((a, b) => (a.average ?? 0) - (b.average ?? 0)).slice(0, 3);

  return (
    <div>
      <PageHeader
        breadcrumb={can('people:read') ? { to: '/people', label: 'People' } : undefined}
        title={
          <span className="flex items-center gap-3">
            <Avatar firstName={p.user.firstName} lastName={p.user.lastName} src={p.user.avatarUrl} size="lg" />
            {p.user.firstName} {p.user.lastName}
          </span>
        }
        description={`${p.user.jobTitle ?? ROLE_LABELS[p.user.role as Role]}${p.user.departmentName ? ` · ${p.user.departmentName}` : ''} · ${p.user.email}`}
        actions={
          <>
            {isMe && <Link to="/me/profile"><Button variant="outline">Edit my profile</Button></Link>}
            {can('appraisal:manage') && <Link to={`/appraisals?new=${p.user.id}`}><Button variant="outline">Start an appraisal</Button></Link>}
            <Link to={`/meetings?tutorId=${p.user.id}`}><Button variant="secondary">All meetings</Button></Link>
          </>
        }
      />
      {p.user.bio && <p className="mb-6 max-w-3xl text-sm text-slate-600">{p.user.bio}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Average score (12 months)" value={fmtScore(p.averageScore)} sub={`${p.readyCount} reviewed of ${p.meetingCount} uploaded`} />
        <Stat label="Department average" value={fmtScore(p.departmentAverage)} sub={p.user.departmentName ?? 'no department set'} help={<HelpTip>Average of all reviewed meetings in the same department over the same period. An internal benchmark, not an external one.</HelpTip>} />
        <Stat label="College average" value={fmtScore(p.collegeAverage)} sub="all reviewed meetings" />
        <Stat label="Essential items covered" value={p.mandatoryCoverage === null ? '-' : `${Math.round(p.mandatoryCoverage)}%`} sub={p.learnerTalkShare !== null ? `learner talk share ${Math.round(p.learnerTalkShare)}%` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Scores over time" description="Each point is one reviewed meeting" />
          <CardBody><ScoreTrendChart points={p.trend} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="KPIs" description="Targets that apply to this person" />
          <CardBody className="space-y-4">
            {p.kpis.length ? (
              p.kpis.map((k) => (
                <div key={k.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800"><Target className="h-4 w-4 text-brand-600" /> {k.name}</span>
                    <span className={k.met === null ? 'text-slate-400' : k.met ? 'text-emerald-700' : 'text-amber-700'}>{k.current === null ? 'no data' : `${k.current} / ${k.target}`}</span>
                  </div>
                  <ProgressBar className="mt-1.5" value={k.current === null ? 0 : Math.min(100, (k.current / Math.max(k.target, 1)) * 100)} tone={k.met === null ? 'brand' : k.met ? 'success' : 'warning'} label={k.name} />
                  <p className="mt-0.5 text-xs text-slate-500">{KPI_METRIC_LABELS[k.metric as KpiMetric]}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No KPIs apply in this period.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="By criterion" description="This person's average (1-5) compared with the college average" />
          <CardBody><CriteriaComparisonChart rows={p.criteriaAverages} /></CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Strongest areas" />
            <ul className="divide-y divide-slate-100">
              {strongest.map((c) => (
                <li key={c.code} className="flex items-center justify-between px-5 py-2.5 text-sm"><span className="text-slate-800">{c.code} {c.title}</span><span className="font-semibold text-emerald-700">{c.average?.toFixed(1)}</span></li>
              ))}
              {!strongest.length && <li className="px-5 py-3 text-sm text-slate-500">No data yet.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Areas to develop" />
            <ul className="divide-y divide-slate-100">
              {weakest.map((c) => (
                <li key={c.code} className="flex items-center justify-between px-5 py-2.5 text-sm"><span className="text-slate-800">{c.code} {c.title}</span><span className="font-semibold text-amber-700">{c.average?.toFixed(1)}</span></li>
              ))}
              {!weakest.length && <li className="px-5 py-3 text-sm text-slate-500">No data yet.</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent meetings" />
        <ul className="divide-y divide-slate-100">
          {p.recentMeetings.map((m) => (
            <li key={m.id}>
              <Link to={`/meetings/${m.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                <ScoreChip score={m.score} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{m.title}</span>
                  <span className="block text-xs text-slate-500">{fmtDate(m.meetingDate)}{m.grade ? ` · ${m.grade}` : ''}</span>
                </span>
                <StatusBadge status={m.status} />
              </Link>
            </li>
          ))}
          {!p.recentMeetings.length && <li className="px-5 py-4 text-sm text-slate-500">No meetings uploaded yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

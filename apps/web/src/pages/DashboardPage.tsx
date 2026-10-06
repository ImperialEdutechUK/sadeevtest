import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, FileCheck2, Gauge, MessageSquareText, Upload, Users, Video } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { GradeDistributionChart, MonthlyTrendChart } from '@/components/charts/Charts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { HelpTip } from '@/components/ui/HelpTip';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/ui/Misc';
import { StatusBadge } from '@/components/ui/Badge';
import { fmtDate, fmtScore, scoreTone } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import { cn } from '@/lib/cn';

export function DashboardPage() {
  const { user, can } = useAuth();
  const { data, isLoading } = useDashboard();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const all = data?.scope === 'ALL';
  const delta = data && data.totals.averageScore !== null && data.totals.previousAverageScore !== null ? Math.round((data.totals.averageScore - data.totals.previousAverageScore) * 10) / 10 : null;

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.firstName}`}
        description={all ? `Here is how learner meetings are going across the college (${data?.periodLabel ?? 'last 90 days'}).` : `Here is how your learner meetings are going (${data?.periodLabel ?? 'last 90 days'}).`}
        actions={
          <>
            <Link to="/meetings/new"><Button icon={<Upload className="h-4 w-4" />}>Upload a meeting</Button></Link>
            <Link to="/meetings"><Button variant="outline">See all meetings</Button></Link>
          </>
        }
      />

      {data && !(data.onboarding.profileComplete && data.onboarding.hasMeeting && data.onboarding.hasReport) && (
        <Card className="mb-6 border-brand-100 bg-gradient-to-r from-brand-50 to-white">
          <CardBody>
            <p className="text-sm font-semibold text-brand-900">Getting started - three quick steps</p>
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              <OnboardingStep done={data.onboarding.profileComplete} to="/me/profile" label="Complete your profile" hint="Add your job title and department so reports are grouped correctly." />
              <OnboardingStep done={data.onboarding.hasMeeting} to="/meetings/new" label="Upload your first meeting" hint="A recording or a transcript is all you need." />
              <OnboardingStep done={data.onboarding.hasReport} to="/meetings" label="Read your first report" hint="See strengths, improvements and the evidence behind each score." />
            </ol>
          </CardBody>
        </Card>
      )}

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Gauge} label="Average score" value={fmtScore(data.totals.averageScore)} sub={delta === null ? 'out of 100' : <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{delta >= 0 ? '+' : ''}{delta} vs the previous period</span>} help={<HelpTip>The average of all completed meeting reports in the period, scored 0-100 against the college criteria.</HelpTip>} />
          <Stat icon={Video} label="Meetings reviewed" value={data.totals.ready} sub={data.totals.inProgress ? `${data.totals.inProgress} in progress` : data.totals.failed ? `${data.totals.failed} need attention` : `${data.totals.meetings} uploaded`} />
          <Stat icon={FileCheck2} label="Essential items covered" value={data.totals.mandatoryCoverage === null ? '-' : `${Math.round(data.totals.mandatoryCoverage)}%`} sub="safeguarding, support needs, targets and more" help={<HelpTip>The share of essential criteria (marked as such in the criteria set) that were covered adequately - a score of 3 or more - across all reviewed meetings.</HelpTip>} />
          {all ? (
            <Stat icon={Users} label="Tutors with reports" value={data.totals.activeTutors} sub="in this period" />
          ) : (
            <Stat icon={MessageSquareText} label="Learner talk share" value={data.totals.learnerTalkShare === null ? '-' : `${Math.round(data.totals.learnerTalkShare)}%`} sub="of the words spoken" help={<HelpTip>How much of the conversation the learner spoke, counted directly from the transcript. A higher share usually means a more two-way meeting.</HelpTip>} />
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Score over time" description="Monthly average of completed reports" />
          <CardBody>{data ? <MonthlyTrendChart points={data.trend} /> : <Skeleton className="h-56" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Grades" description="How reports were graded" />
          <CardBody>{data ? <GradeDistributionChart rows={data.gradeDistribution} /> : <Skeleton className="h-44" />}</CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent meetings" action={<Link to="/meetings" className="link text-sm">All meetings <ArrowRight className="inline h-3.5 w-3.5" /></Link>} />
          {data?.recentMeetings.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentMeetings.map((m) => (
                <li key={m.id}>
                  <Link to={`/meetings/${m.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                    <ScoreChip score={m.score} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500">
                        {m.tutorName} &middot; {fmtDate(m.meetingDate)}
                      </p>
                    </div>
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <EmptyState icon={Video} title="No meetings yet" description="Upload a recording or transcript to get your first report." action={<Link to="/meetings/new"><Button>Upload a meeting</Button></Link>} />
            </CardBody>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Where to focus" description="Lowest-scoring criteria in this period" />
            <CardBody className="space-y-3">
              {data?.criteriaHotspots.length ? (
                data.criteriaHotspots.map((h) => (
                  <div key={h.code} className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {h.code} {h.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {h.categoryName} &middot; average {h.average.toFixed(1)} / 5 across {h.count} meeting{h.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Hotspots appear once reports are complete.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Going well" />
            <CardBody className="space-y-2">
              {data?.topStrengths.length ? (
                data.topStrengths.map((s) => (
                  <div key={s.code} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="flex-1 text-slate-800">
                      {s.code} {s.title}
                    </span>
                    <span className="text-xs text-slate-500">{s.average.toFixed(1)} / 5</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Strengths appear once reports are complete.</p>
              )}
            </CardBody>
          </Card>
          {all && can('people:read') && data?.departmentLeaderboard?.length ? (
            <Card>
              <CardHeader title="By department" />
              <ul className="divide-y divide-slate-100">
                {data.departmentLeaderboard.map((d) => (
                  <li key={d.departmentId ?? d.name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="text-slate-800">{d.name}</span>
                    <span className="text-slate-500">
                      <span className="font-semibold text-slate-900">{fmtScore(d.averageScore)}</span> &middot; {d.meetings} meeting{d.meetings === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OnboardingStep({ done, to, label, hint }: { done: boolean; to: string; label: string; hint: string }) {
  return (
    <li>
      <Link to={to} className={cn('flex h-full items-start gap-3 rounded-xl border bg-white p-3 text-left hover:border-brand-300', done ? 'border-emerald-200' : 'border-slate-200')}>
        {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
        <span>
          <span className={cn('block text-sm font-medium', done ? 'text-slate-500 line-through' : 'text-slate-900')}>{label}</span>
          <span className="block text-xs text-slate-500">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

export function ScoreChip({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' }) {
  const tone = scoreTone(score);
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-xl font-semibold ring-1', tone.bg, tone.text, tone.ring, size === 'md' ? 'h-11 w-11 text-base' : 'h-8 w-10 text-sm')} aria-label={score === null ? 'No score yet' : `Score ${Math.round(score)}`}>
      {score === null ? '-' : Math.round(score)}
    </span>
  );
}

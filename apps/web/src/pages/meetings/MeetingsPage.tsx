import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Upload, Video } from 'lucide-react';
import { MEETING_STATUSES, MEETING_STATUS_LABELS, MEETING_TYPE_LABELS, MEETING_TYPES } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, PageHeader, Pagination, Skeleton } from '@/components/ui/Misc';
import { ScoreChip } from '@/pages/DashboardPage';
import { fmtDate, fmtDuration } from '@/lib/format';
import { useDepartments, useMeetings, useUsers } from '@/lib/queries';

export function MeetingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const all = can('meeting:read:any');
  const q = {
    page: Number(params.get('page') ?? 1),
    pageSize: 15,
    search: params.get('search') ?? undefined,
    status: params.get('status') ?? undefined,
    meetingType: params.get('meetingType') ?? undefined,
    tutorId: params.get('tutorId') ?? undefined,
    departmentId: params.get('departmentId') ?? undefined,
    sort: params.get('sort') ?? 'newest',
  };
  const { data, isLoading } = useMeetings(q);
  const { data: tutors } = useUsers({}, all);
  const { data: departments } = useDepartments();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div>
      <PageHeader title={all ? 'Meetings' : 'My meetings'} description="Every uploaded meeting and its report." actions={<Link to="/meetings/new"><Button icon={<Upload className="h-4 w-4" />}>Upload a meeting</Button></Link>} />

      <form
        className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          set('search', search);
        }}
      >
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input aria-label="Search meetings" placeholder="Search title, learner reference or tutor" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set('search', search)} />
        </div>
        <Select aria-label="Status" value={q.status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option>
          {MEETING_STATUSES.map((s) => (
            <option key={s} value={s}>{MEETING_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Select aria-label="Meeting type" value={q.meetingType ?? ''} onChange={(e) => set('meetingType', e.target.value)}>
          <option value="">Any type</option>
          {MEETING_TYPES.map((t) => (
            <option key={t} value={t}>{MEETING_TYPE_LABELS[t]}</option>
          ))}
        </Select>
        {all ? (
          <Select aria-label="Tutor" value={q.tutorId ?? ''} onChange={(e) => set('tutorId', e.target.value)}>
            <option value="">Any tutor</option>
            {tutors?.map((t) => (
              <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
            ))}
          </Select>
        ) : (
          <div />
        )}
        {all ? (
          <Select aria-label="Department" value={q.departmentId ?? ''} onChange={(e) => set('departmentId', e.target.value)}>
            <option value="">Any department</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        ) : (
          <Select aria-label="Sort" value={q.sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest score</option>
            <option value="lowest">Lowest score</option>
          </Select>
        )}
      </form>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !data?.items.length ? (
        <EmptyState icon={Video} title={q.search || q.status ? 'No meetings match these filters' : 'No meetings yet'} description={q.search || q.status ? 'Try clearing the filters.' : 'Upload a recording or a transcript to get your first report.'} action={<Link to="/meetings/new"><Button>Upload a meeting</Button></Link>} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Meeting</th>
                {all && <th className="hidden px-4 py-3 font-medium md:table-cell">Tutor</th>}
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Date</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Length</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((m) => (
                <tr key={m.id} className="group hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/meetings/${m.id}`} aria-label={`Open ${m.title}`}>
                      <ScoreChip score={m.moderatedScore ?? m.overallScore} size="sm" />
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/meetings/${m.id}`} className="block">
                      <span className="font-medium text-slate-900 group-hover:text-brand-700">{m.title}</span>
                      <span className="block text-xs text-slate-500">
                        {MEETING_TYPE_LABELS[m.meetingType]} &middot; Learner {m.learnerReference}
                        {m.programme ? ` · ${m.programme}` : ''}
                        {m.grade ? ` · ${m.grade}` : ''}
                      </span>
                    </Link>
                  </td>
                  {all && (
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="flex items-center gap-2 text-slate-700">
                        <Avatar firstName={m.tutor.firstName} lastName={m.tutor.lastName} src={m.tutor.avatarUrl} size="sm" />
                        {m.tutor.firstName} {m.tutor.lastName}
                      </span>
                    </td>
                  )}
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{fmtDate(m.meetingDate)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{fmtDuration(m.durationSeconds)}</td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => set('page', String(p))} />
          </div>
        </div>
      )}
    </div>
  );
}

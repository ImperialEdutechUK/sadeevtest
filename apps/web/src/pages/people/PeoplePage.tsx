import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Download, Search, Users } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/Misc';
import { ScoreChip } from '@/pages/DashboardPage';
import { API_BASE } from '@/lib/api';
import { fmtDate, fmtScore } from '@/lib/format';
import { useDepartments, usePeople } from '@/lib/queries';

export function PeoplePage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const { data, isLoading } = usePeople({ departmentId: departmentId || undefined, search: search || undefined });
  const { data: departments } = useDepartments();
  return (
    <div>
      <PageHeader
        title="People"
        description="Everyone whose meetings are reviewed, with their progress over the last 12 months."
        actions={can('export:data') ? <a href={`${API_BASE}/export/reviews.csv`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"><Download className="h-4 w-4" /> Export CSV</a> : undefined}
      />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" aria-hidden />
          <Input aria-label="Search people" placeholder="Search by name or email" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={Users} title="No people found" description="Invite tutors from the Admin screen, or clear the filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Link key={p.id} to={`/people/${p.id}`} className="card flex gap-4 p-5 transition-shadow hover:shadow-md">
              <Avatar firstName={p.firstName} lastName={p.lastName} src={p.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{p.firstName} {p.lastName}</p>
                <p className="truncate text-xs text-slate-500">{p.jobTitle ?? ROLE_LABELS[p.role as Role]}{p.departmentName ? ` · ${p.departmentName}` : ''}</p>
                <div className="mt-3 flex items-center gap-3">
                  <ScoreChip score={p.averageScore} size="sm" />
                  <div className="text-xs text-slate-600">
                    <p><span className="font-medium text-slate-900">{fmtScore(p.averageScore)}</span> average · {p.meetingCount} reviewed</p>
                    <p className="flex items-center gap-1">
                      {p.trendDelta !== null ? (
                        p.trendDelta >= 0 ? <><ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" /> up {p.trendDelta}</> : <><ArrowDownRight className="h-3.5 w-3.5 text-rose-600" /> down {Math.abs(p.trendDelta)}</>
                      ) : (
                        p.lastMeetingAt ? `last ${fmtDate(p.lastMeetingAt)}` : 'no reviews yet'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

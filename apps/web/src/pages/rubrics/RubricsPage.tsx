import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Copy, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { MEETING_TYPE_LABELS } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Skeleton, Alert } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { keys, mutations, useRubrics } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

export function RubricsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useRubrics(true);
  const [busy, setBusy] = useState<string | null>(null);
  const manage = can('rubric:manage');

  const clone = async (id: string) => {
    setBusy(id);
    try {
      const r = await mutations.cloneRubric(id);
      await qc.invalidateQueries({ queryKey: keys.rubrics });
      toast.success('Copy created. You can now edit it.');
      navigate(`/criteria/${r.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not copy.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Review criteria" description="The criteria sets meetings are scored against. Start from the preset, make a copy, and adjust wording, weights and essentials to match the college's expectations." actions={manage ? <Link to="/criteria/new"><Button icon={<Plus className="h-4 w-4" />}>New criteria set</Button></Link> : undefined} />
      <Alert tone="info" className="mb-5">Editing a set creates a new version. Reports already produced keep the version they were scored against, so historical scores never change.</Alert>
      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={BookOpen} title="No criteria sets" description="The preset is created automatically when the API starts." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((r) => (
            <div key={r.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/criteria/${r.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.description}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.isDefault && <Badge tone="brand"><Star className="h-3 w-3" /> Default</Badge>}
                  {r.isPreset && <Badge tone="neutral">Preset</Badge>}
                  {!r.isActive && <Badge tone="warning">Archived</Badge>}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {MEETING_TYPE_LABELS[r.meetingType]} · {r.criteriaCount} criteria in {r.categories.length} groups · version {r.version}
              </p>
              {manage && (
                <div className="mt-4 flex gap-2">
                  <Link to={`/criteria/${r.id}`}><Button size="sm" variant="outline">{r.isPreset ? 'View and edit' : 'Edit'}</Button></Link>
                  <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} loading={busy === r.id} onClick={() => clone(r.id)}>Make a copy</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

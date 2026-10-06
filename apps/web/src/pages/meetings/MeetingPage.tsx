import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Clock, Download, FileText, Loader2, MessageSquare, Pencil, Printer, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { MEETING_TYPE_LABELS, type ProcessingStep } from '@slc/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, PageHeader, Skeleton } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, fmtDuration } from '@/lib/format';
import { keys, mutations, useMeeting, type MeetingDetail } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Report } from './report/Report';

export function MeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: m, isLoading, error } = useMeeting(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (m?.status === 'READY') document.title = `${m.title} - Meeting Review`;
    return () => {
      document.title = 'Meeting Review';
    };
  }, [m]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (error || !m) return <Alert tone="danger" title="We could not open this meeting">{error instanceof ApiError ? error.message : 'It may have been removed, or you may not have access to it.'}</Alert>;

  const refresh = () => qc.invalidateQueries({ queryKey: keys.meeting(m.id) });

  const act = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const busyState = ['QUEUED', 'TRANSCRIBING', 'EXTRACTING', 'ANALYSING'].includes(m.status);

  return (
    <div>
      <PageHeader
        breadcrumb={{ to: '/meetings', label: 'Meetings' }}
        eyebrow={MEETING_TYPE_LABELS[m.meetingType]}
        title={m.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Avatar firstName={m.tutor.firstName} lastName={m.tutor.lastName} src={m.tutor.avatarUrl} size="sm" />
              <Link to={`/people/${m.tutor.id}`} className="hover:underline">{m.tutor.firstName} {m.tutor.lastName}</Link>
            </span>
            <span>Learner {m.learnerReference}{m.learnerFirstName ? ` (${m.learnerFirstName})` : ''}</span>
            <span>{fmtDate(m.meetingDate)}</span>
            {m.durationSeconds ? <span>{fmtDuration(m.durationSeconds)}</span> : null}
            {m.programme && <span>{m.programme}</span>}
            <StatusBadge status={m.status} />
          </span>
        }
        actions={
          <>
            {m.status === 'READY' && (
              <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Download PDF
              </Button>
            )}
            {m.permissions.canEdit && !busyState && (
              <Link to={`/meetings/${m.id}/edit`}><Button variant="outline" icon={<Pencil className="h-4 w-4" />}>Edit</Button></Link>
            )}
            {m.permissions.canReanalyse && (m.status === 'READY' || m.status === 'FAILED') && (
              <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} loading={busy === 'reanalyse'} onClick={() => act('reanalyse', () => mutations.reanalyse(m.id), 'Review restarted.')}>
                {m.status === 'FAILED' ? 'Try again' : 'Re-run review'}
              </Button>
            )}
            {m.permissions.canDelete && (
              <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)} aria-label="Delete meeting">
                Delete
              </Button>
            )}
          </>
        }
      />

      {m.status === 'DRAFT' && (
        <Alert tone="info" title="This meeting has not been submitted yet" className="mb-6">
          <Link to={`/meetings/${m.id}/edit`} className="link">Add the files and submit it for review</Link>.
        </Alert>
      )}
      {m.status === 'FAILED' && (
        <Alert tone="danger" title="The review could not be completed" className="mb-6">
          {m.failureReason ?? 'Please try again. If it keeps failing, contact your administrator.'}
        </Alert>
      )}

      {m.status !== 'READY' && m.status !== 'DRAFT' && <ProcessingCard m={m} />}

      {m.status === 'READY' && m.analysis && <Report meeting={m} onChanged={refresh} />}

      <FilesCard m={m} />

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this meeting?"
        description="The files, transcript and report will be permanently removed. This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={() => act('delete', async () => { await mutations.deleteMeeting(m.id); navigate('/meetings'); }, 'Meeting deleted.')}>
              Delete meeting
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">If this meeting is part of an appraisal or competition, its score will no longer count.</p>
      </Dialog>
    </div>
  );
}

function ProcessingCard({ m }: { m: MeetingDetail }) {
  const icon = (s: ProcessingStep['state']) =>
    s === 'done' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : s === 'active' ? <Loader2 className="h-5 w-5 animate-spin text-brand-700" /> : s === 'failed' ? <XCircle className="h-5 w-5 text-rose-600" /> : s === 'skipped' ? <Circle className="h-5 w-5 text-slate-300" /> : <Circle className="h-5 w-5 text-slate-300" />;
  return (
    <Card className="mb-6">
      <CardHeader title={m.status === 'FAILED' ? 'What happened' : 'Your report is being prepared'} description={m.status === 'FAILED' ? undefined : 'You can close this page - we will notify you when it is ready.'} />
      <CardBody>
        <ol className="space-y-4">
          {m.steps.map((s) => (
            <li key={s.key} className="flex gap-3">
              <span className="mt-0.5 shrink-0">{icon(s.state)}</span>
              <div>
                <p className={cn('text-sm font-medium', s.state === 'pending' || s.state === 'skipped' ? 'text-slate-500' : 'text-slate-900')}>{s.label}</p>
                {s.detail && <p className="text-xs text-slate-500">{s.detail}</p>}
                {s.at && s.state === 'done' && <p className="text-[11px] text-slate-500">{fmtDateTime(s.at)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function FilesCard({ m }: { m: MeetingDetail }) {
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (fileId: string) => {
    setBusy(fileId);
    try {
      const { url } = await mutations.downloadFile(m.id, fileId);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not prepare the download.');
    } finally {
      setBusy(null);
    }
  };
  const labels: Record<string, string> = { RECORDING: 'Recording', TRANSCRIPT: 'Transcript', LEARNER_BOOKLET: 'Learner booklet', PRESENTATION: 'Presentation', OTHER: 'Document' };
  return (
    <Card className="no-print mt-6">
      <CardHeader title="Files" description={m.notes ? `Notes from the uploader: ${m.notes}` : undefined} />
      {m.files.length ? (
        <ul className="divide-y divide-slate-100">
          {m.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <FileText className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{f.fileName}</p>
                <p className="text-xs text-slate-500">
                  {labels[f.kind]} &middot; {f.status === 'DELETED' ? 'deleted under the retention policy' : f.status === 'FAILED' ? 'could not be read' : f.extractedChars ? `${f.extractedChars.toLocaleString()} characters read` : f.status.toLowerCase()}
                </p>
              </div>
              {f.status !== 'DELETED' && (
                <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} loading={busy === f.id} onClick={() => download(f.id)}>
                  Download
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <CardBody><p className="text-sm text-slate-500">No files yet.</p></CardBody>
      )}
    </Card>
  );
}

export { AlertTriangle, Clock, MessageSquare, ShieldCheck, Badge };

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { CreateMeetingSchema, FILE_KIND_LABELS, MEETING_TYPE_LABELS, MEETING_TYPES, type FileKind, type MeetingType } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dropzone, type UploadedFile } from '@/components/ui/Dropzone';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, PageHeader } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toDateInput } from '@/lib/format';
import { keys, mutations, useMeeting, useRubrics, useUsers } from '@/lib/queries';
import { uploadMeetingFile } from '@/lib/upload';
import { useQueryClient } from '@tanstack/react-query';

const STEPS = ['About the meeting', 'Add the files', 'Check and submit'];

export function NewMeetingPage() {
  const { id: editId } = useParams();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: existing } = useMeeting(editId);
  const { data: rubrics } = useRubrics();
  const canPickTutor = can('meeting:create:any');
  const { data: tutors } = useUsers({}, canPickTutor);

  const [step, setStep] = useState(0);
  const [meetingId, setMeetingId] = useState<string | null>(editId ?? null);
  const [form, setForm] = useState({
    title: '',
    meetingType: 'INDUCTION' as MeetingType,
    tutorId: user?.id ?? '',
    learnerReference: '',
    learnerFirstName: '',
    programme: '',
    meetingDate: toDateInput(new Date()),
    rubricId: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<Partial<Record<FileKind, UploadedFile | null>>>({});
  const [progress, setProgress] = useState<Partial<Record<FileKind, number | null>>>({});
  const [fileErrors, setFileErrors] = useState<Partial<Record<FileKind, string | null>>>({});

  useEffect(() => {
    if (!existing) return;
    setForm({
      title: existing.title,
      meetingType: existing.meetingType,
      tutorId: existing.tutor.id,
      learnerReference: existing.learnerReference,
      learnerFirstName: existing.learnerFirstName ?? '',
      programme: existing.programme ?? '',
      meetingDate: toDateInput(existing.meetingDate),
      rubricId: existing.rubric.id,
      notes: existing.notes ?? '',
    });
    const map: Partial<Record<FileKind, UploadedFile>> = {};
    for (const f of existing.files) map[f.kind] = { id: f.id, fileName: f.fileName, sizeBytes: f.sizeBytes, status: f.status };
    setFiles(map);
  }, [existing]);

  // Suggest a title the way staff name things: "Induction - L12345".
  useEffect(() => {
    if (form.learnerReference && (!form.title || /^(Induction|Progress review|One-to-one tutorial|Exit interview|Other meeting) - /.test(form.title))) {
      setForm((f) => ({ ...f, title: `${MEETING_TYPE_LABELS[f.meetingType].replace(' meeting', '')} - ${f.learnerReference}` }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.learnerReference, form.meetingType]);

  const rubricOptions = useMemo(() => (rubrics ?? []).filter((r) => r.isActive), [rubrics]);
  const defaultRubric = rubricOptions.find((r) => r.meetingType === form.meetingType && r.isDefault) ?? rubricOptions.find((r) => r.meetingType === form.meetingType) ?? rubricOptions[0];
  const chosenRubric = rubricOptions.find((r) => r.id === form.rubricId) ?? defaultRubric;

  const saveStep1 = async () => {
    const payload = {
      title: form.title.trim(),
      meetingType: form.meetingType,
      tutorId: canPickTutor ? form.tutorId || undefined : undefined,
      learnerReference: form.learnerReference.trim(),
      learnerFirstName: form.learnerFirstName.trim() || null,
      programme: form.programme.trim() || null,
      meetingDate: form.meetingDate,
      rubricId: chosenRubric?.id,
      notes: form.notes.trim() || null,
    };
    const parsed = CreateMeetingSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return false;
    }
    setErrors({});
    setSaving(true);
    try {
      if (meetingId) await mutations.updateMeeting(meetingId, parsed.data);
      else {
        const m = await mutations.createMeeting(parsed.data);
        setMeetingId(m.id);
      }
      await qc.invalidateQueries({ queryKey: ['meetings'] });
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the meeting.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: FileKind, file: File) => {
    if (!meetingId) return;
    setFileErrors((e) => ({ ...e, [kind]: null }));
    setFiles((f) => ({ ...f, [kind]: { id: '', fileName: file.name, sizeBytes: file.size, status: 'PENDING' } }));
    setProgress((p) => ({ ...p, [kind]: 0 }));
    try {
      const done = await uploadMeetingFile(meetingId, kind, file, (pct) => setProgress((p) => ({ ...p, [kind]: pct })));
      setFiles((f) => ({ ...f, [kind]: { id: done.id, fileName: done.fileName, sizeBytes: done.sizeBytes, status: done.status } }));
      if (kind === 'RECORDING' && files.TRANSCRIPT) {
        // Keep one source of truth for the conversation.
        await mutations.removeFile(meetingId, files.TRANSCRIPT.id).catch(() => undefined);
        setFiles((f) => ({ ...f, TRANSCRIPT: null }));
      }
      if (kind === 'TRANSCRIPT' && files.RECORDING) {
        await mutations.removeFile(meetingId, files.RECORDING.id).catch(() => undefined);
        setFiles((f) => ({ ...f, RECORDING: null }));
      }
    } catch (err) {
      setFiles((f) => ({ ...f, [kind]: null }));
      setFileErrors((e) => ({ ...e, [kind]: err instanceof Error ? err.message : 'Upload failed' }));
    } finally {
      setProgress((p) => ({ ...p, [kind]: null }));
    }
  };

  const remove = async (kind: FileKind) => {
    const f = files[kind];
    if (!meetingId || !f?.id) return;
    await mutations.removeFile(meetingId, f.id).catch(() => undefined);
    setFiles((x) => ({ ...x, [kind]: null }));
  };

  const hasSource = !!(files.RECORDING || files.TRANSCRIPT);

  const submit = async () => {
    if (!meetingId) return;
    setSaving(true);
    try {
      await mutations.submitMeeting(meetingId);
      await qc.invalidateQueries({ queryKey: keys.meeting(meetingId) });
      toast.success('Submitted. We will let you know when the report is ready.');
      navigate(`/meetings/${meetingId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not submit the meeting.');
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 0 && !(await saveStep1())) return;
    if (step === 1 && !hasSource) {
      setFileErrors((e) => ({ ...e, RECORDING: 'Add a recording or a transcript to continue.' }));
      return;
    }
    setStep((s) => Math.min(2, s + 1));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader breadcrumb={{ to: '/meetings', label: 'Meetings' }} title={editId ? 'Edit meeting' : 'Upload a meeting'} description="Three short steps. You can come back and finish later - nothing is reviewed until you press Submit." />

      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-600')} aria-current={i === step ? 'step' : undefined}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn('hidden text-sm sm:block', i === step ? 'font-semibold text-slate-900' : 'text-slate-500')}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-slate-200 sm:block" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader title="About the meeting" description="Basic details so the report can be filed against the right tutor and learner." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type of meeting" id="type" required>
                <Select id="type" value={form.meetingType} onChange={(e) => setForm({ ...form, meetingType: e.target.value as MeetingType, rubricId: '' })}>
                  {MEETING_TYPES.map((t) => (
                    <option key={t} value={t}>{MEETING_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Date of the meeting" id="date" required error={errors.meetingDate}>
                <Input id="date" type="date" value={form.meetingDate} max={toDateInput(new Date())} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} aria-invalid={!!errors.meetingDate} />
              </Field>
            </div>
            {canPickTutor && (
              <Field label="Tutor who led the meeting" id="tutor" required help="Choose yourself if you are uploading your own meeting.">
                <Select id="tutor" value={form.tutorId} onChange={(e) => setForm({ ...form, tutorId: e.target.value })}>
                  {tutors?.map((t) => (
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}{t.id === user?.id ? ' (me)' : ''}{t.departmentName ? ` - ${t.departmentName}` : ''}</option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Learner reference" id="ref" required error={errors.learnerReference} help="The learner's ID from the student record system. We use this rather than their full name to keep personal data to a minimum.">
                <Input id="ref" value={form.learnerReference} onChange={(e) => setForm({ ...form, learnerReference: e.target.value })} placeholder="e.g. L10234" aria-invalid={!!errors.learnerReference} />
              </Field>
              <Field label="Learner first name" id="fname" hint="Optional. Helps the review spot personalisation.">
                <Input id="fname" value={form.learnerFirstName} onChange={(e) => setForm({ ...form, learnerFirstName: e.target.value })} />
              </Field>
            </div>
            <Field label="Meeting title" id="title" required error={errors.title}>
              <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!!errors.title} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Programme or course" id="prog" hint="Optional">
                <Input id="prog" value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })} placeholder="e.g. Level 3 Diploma in Health and Social Care" />
              </Field>
              <Field label="Criteria to review against" id="rubric" help="The set of criteria the meeting is scored against. The default for this meeting type is pre-selected.">
                <Select id="rubric" value={chosenRubric?.id ?? ''} onChange={(e) => setForm({ ...form, rubricId: e.target.value })}>
                  {rubricOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.isDefault ? ' (default)' : ''}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Anything the reviewer should know?" id="notes" hint="Optional. For example: 'Learner joined late' or 'Second induction after a course change'.">
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
            </Field>
          </CardBody>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader title="Add the files" description="A recording or a transcript is required. The booklet and presentation are optional but make the review more personal." />
          <CardBody className="space-y-5">
            <div className="space-y-3">
              <Dropzone kind="RECORDING" title="Recording of the meeting" description="Video or audio from Teams, Zoom or a phone. We transcribe it for you." file={files.RECORDING ?? null} progress={progress.RECORDING ?? null} error={fileErrors.RECORDING} onFile={(f) => upload('RECORDING', f)} onRemove={() => remove('RECORDING')} required={!files.TRANSCRIPT} />
              <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">or</p>
              <Dropzone kind="TRANSCRIPT" title="Transcript of the meeting" description="The .vtt or .docx transcript that Teams creates, or a .srt or .txt file." file={files.TRANSCRIPT ?? null} progress={progress.TRANSCRIPT ?? null} error={fileErrors.TRANSCRIPT} onFile={(f) => upload('TRANSCRIPT', f)} onRemove={() => remove('TRANSCRIPT')} required={!files.RECORDING} />
            </div>
            <div className="grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-2">
              <Dropzone kind="LEARNER_BOOKLET" title={FILE_KIND_LABELS.LEARNER_BOOKLET} description="The learner's profile or information booklet (PDF or Word)." file={files.LEARNER_BOOKLET ?? null} progress={progress.LEARNER_BOOKLET ?? null} error={fileErrors.LEARNER_BOOKLET} onFile={(f) => upload('LEARNER_BOOKLET', f)} onRemove={() => remove('LEARNER_BOOKLET')} />
              <Dropzone kind="PRESENTATION" title={FILE_KIND_LABELS.PRESENTATION} description="The slides used in the meeting (PowerPoint or PDF)." file={files.PRESENTATION ?? null} progress={progress.PRESENTATION ?? null} error={fileErrors.PRESENTATION} onFile={(f) => upload('PRESENTATION', f)} onRemove={() => remove('PRESENTATION')} />
            </div>
            <Alert tone="info">Files are stored securely and only visible to you and the academic team. Recordings are deleted automatically after the retention period.</Alert>
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader title="Check and submit" description="Everything look right? You can still edit the details after submitting; the files cannot change while the review runs." />
          <CardBody className="space-y-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row k="Title" v={form.title} />
              <Row k="Type" v={MEETING_TYPE_LABELS[form.meetingType]} />
              <Row k="Date" v={form.meetingDate} />
              <Row k="Learner" v={`${form.learnerReference}${form.learnerFirstName ? ` (${form.learnerFirstName})` : ''}`} />
              <Row k="Programme" v={form.programme || '-'} />
              <Row k="Criteria" v={chosenRubric?.name ?? '-'} />
              <Row k="Conversation" v={files.RECORDING ? `Recording: ${files.RECORDING.fileName}` : files.TRANSCRIPT ? `Transcript: ${files.TRANSCRIPT.fileName}` : 'Missing'} />
              <Row k="Supporting documents" v={[files.LEARNER_BOOKLET?.fileName, files.PRESENTATION?.fileName].filter(Boolean).join(', ') || 'None'} />
            </dl>
            <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4" /> What happens next
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {files.RECORDING && <li>We transcribe the recording (a few minutes for every 10 minutes of audio).</li>}
                {(files.LEARNER_BOOKLET || files.PRESENTATION) && <li>We read the supporting documents.</li>}
                <li>The meeting is reviewed against the {chosenRubric?.criteriaCount ?? ''} criteria in &ldquo;{chosenRubric?.name}&rdquo;.</li>
                <li>You get a notification when the report is ready. You can close this page.</li>
              </ol>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mt-5 flex items-center justify-between">
        <div>
          {step > 0 ? (
            <Button variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : (
            <Link to="/meetings" className="text-sm text-slate-500 hover:text-slate-800">Cancel</Link>
          )}
        </div>
        {step < 2 ? (
          <Button onClick={next} loading={saving} icon={<ChevronRight className="h-4 w-4" />}>
            {step === 0 ? 'Save and continue' : 'Continue'}
          </Button>
        ) : (
          <Button onClick={submit} loading={saving} size="lg" disabled={!hasSource}>
            Submit for review
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-900">{v}</dd>
    </div>
  );
}

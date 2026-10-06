import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, KeyRound, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type AuditLogItem, type Role, type UserSummary } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert, PageHeader, Pagination, Switch } from '@/components/ui/Misc';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { ApiError, get, qs } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { keys, mutations, useDepartments, useSettings, useUsers } from '@/lib/queries';

export function AdminPage() {
  const { tab = 'users' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const tabs = [
    ...(can('user:invite') || can('user:manage') ? [{ value: 'users', label: 'Users' }] : []),
    ...(can('settings:manage') ? [{ value: 'settings', label: 'Settings' }] : []),
    ...(can('audit:read') ? [{ value: 'audit', label: 'Audit log' }] : []),
  ];
  return (
    <div>
      <PageHeader title="Admin" description="Users, roles, system settings and the audit trail." />
      <Tabs value={tab} onValueChange={(v) => navigate(`/admin/${v}`)} tabs={tabs}>
        <TabPanel value="users"><UsersTab /></TabPanel>
        <TabPanel value="settings"><SettingsTab /></TabPanel>
        <TabPanel value="audit"><AuditTab /></TabPanel>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { user: me, can } = useAuth();
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: users } = useUsers({ includeInactive });
  const { data: departments } = useDepartments();
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [newDept, setNewDept] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const resetPw = async (u: UserSummary) => {
    if (!confirm(`Reset the password for ${u.firstName} ${u.lastName}? They will get a temporary password.`)) return;
    try {
      const r = await mutations.resetPassword(u.id);
      await navigator.clipboard.writeText(r.temporaryPassword).catch(() => undefined);
      toast.success(`Temporary password: ${r.temporaryPassword} (copied). They must change it on first sign-in.`, { duration: 15000 });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not reset.');
    }
  };
  const addDept = async () => {
    if (!newDept.trim()) return;
    await mutations.createDepartment(newDept.trim());
    setNewDept('');
    await qc.invalidateQueries({ queryKey: keys.departments });
    toast.success('Department added.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Switch id="inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} label="Show deactivated accounts" />
        <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInvite(true)}>Invite a colleague</Button>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-medium">Person</th><th className="hidden px-4 py-3 font-medium md:table-cell">Role</th><th className="hidden px-4 py-3 font-medium lg:table-cell">Department</th><th className="hidden px-4 py-3 font-medium lg:table-cell">Last sign-in</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users?.map((u) => (
              <tr key={u.id} className={!u.isActive ? 'opacity-60' : ''}>
                <td className="px-4 py-3"><span className="flex items-center gap-3"><Avatar firstName={u.firstName} lastName={u.lastName} src={u.avatarUrl} /><span><span className="block font-medium text-slate-900">{u.firstName} {u.lastName}{u.id === me?.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}</span><span className="block text-xs text-slate-500">{u.email}</span></span></span></td>
                <td className="hidden px-4 py-3 md:table-cell"><Badge tone={u.role === 'SYSTEM_ADMIN' ? 'danger' : u.role === 'TUTOR' ? 'neutral' : 'brand'}>{ROLE_LABELS[u.role]}</Badge>{!u.isActive && <Badge tone="warning" className="ml-1">Deactivated</Badge>}</td>
                <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{u.departmentName ?? '-'}</td>
                <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'never'}</td>
                <td className="px-4 py-3"><div className="flex gap-1">{(can('user:manage') || can('people:manage')) && <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>}{can('user:manage') && <Button size="sm" variant="ghost" icon={<KeyRound className="h-4 w-4" />} onClick={() => resetPw(u)} aria-label={`Reset password for ${u.firstName}`}>Reset</Button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <CardHeader title="Departments" description="Used to group people and compare averages." />
        <CardBody>
          <div className="flex flex-wrap gap-2">{departments?.map((d) => <Badge key={d.id} tone="neutral" className="px-3 py-1 text-sm">{d.name}</Badge>)}</div>
          {(can('user:manage') || can('people:manage')) && (
            <div className="mt-3 flex max-w-md gap-2"><Input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="New department name" aria-label="New department name" /><Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addDept}>Add</Button></div>
          )}
        </CardBody>
      </Card>
      <InviteDialog open={invite} onOpenChange={setInvite} onDone={refresh} />
      <EditUserDialog user={editing} onOpenChange={(o) => !o && setEditing(null)} onDone={refresh} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { user: me } = useAuth();
  const { data: departments } = useDepartments();
  const [f, setF] = useState({ email: '', firstName: '', lastName: '', role: 'TUTOR' as Role, departmentId: '', jobTitle: '' });
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roles = ROLES.filter((r) => me?.role === 'SYSTEM_ADMIN' || r !== 'SYSTEM_ADMIN');
  const submit = async () => {
    setBusy(true);
    try {
      const r = await mutations.inviteUser({ ...f, departmentId: f.departmentId || null, jobTitle: f.jobTitle || null });
      setLink(r.inviteLink);
      onDone();
      toast.success('Invitation created.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not invite.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setLink(null); setF({ email: '', firstName: '', lastName: '', role: 'TUTOR', departmentId: '', jobTitle: '' }); } }} title="Invite a colleague" description="They will receive an email with a link to set up their account (valid for 7 days)." footer={link ? <Button onClick={() => onOpenChange(false)}>Done</Button> : <><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit} disabled={!f.email || !f.firstName || !f.lastName}>Send invitation</Button></>}>
      {link ? (
        <div className="space-y-3">
          <Alert tone="success" title="Invitation created">If email is not set up on this system, copy the link below and send it to them yourself.</Alert>
          <div className="flex gap-2"><Input readOnly value={link} aria-label="Invitation link" /><Button variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => { void navigator.clipboard.writeText(link); toast.success('Link copied.'); }}>Copy</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" id="ifn" required><Input id="ifn" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
            <Field label="Last name" id="iln" required><Input id="iln" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
          </div>
          <Field label="College email" id="iem" required><Input id="iem" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role" id="irole" hint={ROLE_DESCRIPTIONS[f.role]}><Select id="irole" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department" id="idep"><Select id="idep" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Not set</option>{departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Job title" id="ijt"><Input id="ijt" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></Field>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function EditUserDialog({ user: u, onOpenChange, onDone }: { user: UserSummary | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { user: me } = useAuth();
  const { data: departments } = useDepartments();
  const [f, setF] = useState<{ role: Role; departmentId: string; jobTitle: string; isActive: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = f ?? (u ? { role: u.role, departmentId: u.departmentId ?? '', jobTitle: u.jobTitle ?? '', isActive: u.isActive } : null);
  if (!u || !current) return null;
  const roles = ROLES.filter((r) => me?.role === 'SYSTEM_ADMIN' || r !== 'SYSTEM_ADMIN');
  const submit = async () => {
    setBusy(true);
    try {
      await mutations.updateUser(u.id, { role: current.role, departmentId: current.departmentId || null, jobTitle: current.jobTitle || null, isActive: current.isActive });
      onDone();
      toast.success('Saved.');
      onOpenChange(false);
      setF(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!u} onOpenChange={(o) => { onOpenChange(o); if (!o) setF(null); }} title={`Edit ${u.firstName} ${u.lastName}`} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Role" id="erole" hint={ROLE_DESCRIPTIONS[current.role]}><Select id="erole" value={current.role} onChange={(e) => setF({ ...current, role: e.target.value as Role })} disabled={u.id === me?.id}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
        <Field label="Department" id="edep"><Select id="edep" value={current.departmentId} onChange={(e) => setF({ ...current, departmentId: e.target.value })}><option value="">Not set</option>{departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Job title" id="ejt"><Input id="ejt" value={current.jobTitle} onChange={(e) => setF({ ...current, jobTitle: e.target.value })} /></Field>
        {u.id !== me?.id && <Switch id="eact" checked={current.isActive} onCheckedChange={(v) => setF({ ...current, isActive: v })} label="Account active" description="Deactivated accounts cannot sign in; their reports are kept." />}
      </div>
    </Dialog>
  );
}

function SettingsTab() {
  const { data } = useSettings();
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string | number | boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = f ?? (data ? { collegeName: data.collegeName, llmModel: data.llmModel, retentionDaysRecordings: data.retentionDaysRecordings, retentionDaysTranscripts: data.retentionDaysTranscripts, redactLearnerNames: data.redactLearnerNames, allowTutorSelfUpload: data.allowTutorSelfUpload, emailNotifications: data.emailNotifications, transcriptionLanguage: data.transcriptionLanguage } : null);
  if (!data || !cur) return null;
  const save = async () => {
    setBusy(true);
    try {
      await mutations.updateSettings({ ...cur, retentionDaysRecordings: Number(cur.retentionDaysRecordings), retentionDaysTranscripts: Number(cur.retentionDaysTranscripts) });
      await qc.invalidateQueries({ queryKey: keys.settings });
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader title="Connected services" description="Configured by environment variables on the server." />
        <CardBody>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(data.providers).map(([k, v]) => <div key={k}><dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}{v === 'mock' && <Badge tone="warning" className="ml-2">demo mode</Badge>}</dd></div>)}
          </dl>
          {(data.providers.llm === 'mock' || data.providers.transcription === 'mock') && <Alert tone="warning" className="mt-3">Demo providers are active: reports are generated by a simple rule-based reviewer. Set LLM_PROVIDER=openrouter and TRANSCRIPTION_PROVIDER=aws on the server for real reviews.</Alert>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="General" />
        <CardBody className="space-y-4">
          <Field label="College name" id="scn"><Input id="scn" value={String(cur.collegeName)} onChange={(e) => setF({ ...cur, collegeName: e.target.value })} /></Field>
          <Field label="Language model" id="sm" hint="Any chat model available on OpenRouter, e.g. anthropic/claude-sonnet-5.5. Used for every new review and appraisal summary."><Input id="sm" value={String(cur.llmModel)} onChange={(e) => setF({ ...cur, llmModel: e.target.value })} /></Field>
          <Field label="Transcription language" id="sl" hint="Language code for Amazon Transcribe, e.g. en-GB. Used for new recordings."><Input id="sl" value={String(cur.transcriptionLanguage)} onChange={(e) => setF({ ...cur, transcriptionLanguage: e.target.value })} /></Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Data protection" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delete recordings after (days)" id="sr" hint="0 keeps them indefinitely."><Input id="sr" type="number" min={0} value={Number(cur.retentionDaysRecordings)} onChange={(e) => setF({ ...cur, retentionDaysRecordings: Number(e.target.value) })} /></Field>
            <Field label="Delete transcripts after (days)" id="st" hint="Reports are kept."><Input id="st" type="number" min={0} value={Number(cur.retentionDaysTranscripts)} onChange={(e) => setF({ ...cur, retentionDaysTranscripts: Number(e.target.value) })} /></Field>
          </div>
          <Switch id="sred" checked={Boolean(cur.redactLearnerNames)} onCheckedChange={(v) => setF({ ...cur, redactLearnerNames: v })} label="Redact learner first names from transcripts" description="Replaces the learner's first name with [learner] before anything is stored or sent for review." />
          <Switch id="sself" checked={Boolean(cur.allowTutorSelfUpload)} onCheckedChange={(v) => setF({ ...cur, allowTutorSelfUpload: v })} label="Tutors can upload their own meetings" description="Turn off if only academic admins should upload." />
          <Switch id="semail" checked={Boolean(cur.emailNotifications)} onCheckedChange={(v) => setF({ ...cur, emailNotifications: v })} label="Email notifications" description="Requires the email provider to be configured on the server." />
        </CardBody>
      </Card>
      <div className="flex justify-end"><Button loading={busy} onClick={save}>Save settings</Button></div>
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data } = useQuery({ queryKey: keys.audit({ page, action }), queryFn: () => get<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }>(`/audit${qs({ page, pageSize: 40, action: action || undefined })}`) });
  return (
    <div className="space-y-4">
      <div className="max-w-sm"><Input placeholder="Filter by action, e.g. meeting. or auth." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter by action" /></div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Who</th><th className="px-4 py-3 font-medium">Action</th><th className="hidden px-4 py-3 font-medium md:table-cell">Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((a) => (
              <tr key={a.id}><td className="whitespace-nowrap px-4 py-2 text-slate-600">{fmtDateTime(a.createdAt)}</td><td className="px-4 py-2 text-slate-800">{a.actorName ?? 'system'}</td><td className="px-4 py-2 font-mono text-xs text-slate-800">{a.action}<span className="ml-1 text-slate-400">{a.entityType}{a.entityId ? ` ${a.entityId.slice(-6)}` : ''}</span></td><td className="hidden max-w-md truncate px-4 py-2 font-mono text-xs text-slate-500 md:table-cell">{a.metadata ? JSON.stringify(a.metadata) : ''}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 pb-3">{data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}</div>
      </Card>
    </div>
  );
}

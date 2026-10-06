import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader, Switch } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { mutations, useDepartments } from '@/lib/queries';
import { ROLE_LABELS } from '@slc/shared';
import { Link } from 'react-router-dom';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const { data: departments } = useDepartments();
  const [form, setForm] = useState({ firstName: '', lastName: '', jobTitle: '', bio: '', departmentId: '', avatarUrl: '', emailNotifications: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) setForm({ firstName: user.firstName, lastName: user.lastName, jobTitle: user.jobTitle ?? '', bio: user.bio ?? '', departmentId: user.departmentId ?? '', avatarUrl: user.avatarUrl ?? '', emailNotifications: true });
  }, [user]);
  if (!user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await mutations.updateProfile({ ...form, jobTitle: form.jobTitle || null, bio: form.bio || null, departmentId: form.departmentId || null, avatarUrl: form.avatarUrl || null });
      setUser(updated);
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My profile" description="This is how you appear to colleagues in reports, people lists and competitions." />
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader title="About you" />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar firstName={form.firstName || 'A'} lastName={form.lastName || 'B'} src={form.avatarUrl || null} size="xl" />
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-900">
                  {user.firstName} {user.lastName}
                </p>
                <p>{ROLE_LABELS[user.role]} &middot; {user.email}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" id="fn" required>
                <Input id="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </Field>
              <Field label="Last name" id="ln" required>
                <Input id="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title" id="jt" hint="For example: Lecturer, Health and Social Care">
                <Input id="jt" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              </Field>
              <Field label="Department" id="dept">
                <Select id="dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">Not set</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="A few words about you" id="bio" hint="Optional. Shown on your profile page.">
              <Textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={1000} />
            </Field>
            <Field label="Photo link" id="av" hint="Optional. Paste a link to a photo (for example from your staff directory). Leave blank to use your initials.">
              <Input id="av" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://" />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Notifications" />
          <CardBody>
            <Switch id="emails" checked={form.emailNotifications} onCheckedChange={(v) => setForm({ ...form, emailNotifications: v })} label="Email me when a report is ready or someone comments" description="You will always see notifications in the app." />
          </CardBody>
        </Card>
        <div className="flex items-center justify-between">
          <Link to="/me/password" className="link text-sm">Change password</Link>
          <Button type="submit" loading={busy}>Save profile</Button>
        </div>
      </form>
    </div>
  );
}

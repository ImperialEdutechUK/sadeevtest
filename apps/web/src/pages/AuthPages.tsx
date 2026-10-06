import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AcceptInviteSchema, ChangePasswordSchema } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert, PageHeader } from '@/components/ui/Misc';
import { ApiError, get, post } from '@/lib/api';
import { mutations } from '@/lib/queries';

const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Meeting Review';
const COLLEGE = (import.meta.env.VITE_COLLEGE_NAME as string | undefined) ?? 'South London College';
const LOGO_URL = (import.meta.env.VITE_LOGO_URL as string | undefined) ?? '/slc-logo.png';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-800 lg:flex-row">
      <div className="relative flex flex-1 flex-col justify-between p-8 text-white lg:p-14">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="flex items-center gap-4">
          {LOGO_URL ? (
            <span className="inline-flex items-center rounded-xl bg-white px-3 py-2">
              <img src={LOGO_URL} alt={COLLEGE} className="h-16 w-auto object-contain" />
            </span>
          ) : null}
          <div>
            <p className="text-lg font-semibold">{APP_NAME}</p>
            <p className="text-xs text-brand-200">{COLLEGE}</p>
          </div>
        </div>
        <div className="hidden max-w-md lg:block">
          <h2 className="text-3xl font-semibold leading-tight text-white">Clear, fair feedback on every learner meeting.</h2>
          <p className="mt-4 text-brand-100">Upload a recording or transcript, and get a transparent report against the college&rsquo;s criteria: what went well, what to do next time, and the evidence behind every score.</p>
          <ul className="mt-6 space-y-2 text-sm text-brand-100">
            <li>&#10003; Every score backed by quotes from the meeting</li>
            <li>&#10003; Human moderation and a full audit trail</li>
            <li>&#10003; Progress, KPIs and appraisal summaries in one place</li>
          </ul>
        </div>
        <p className="hidden text-xs text-brand-200 lg:block">AI-assisted. Decisions about people are always made by people.</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-white px-6 py-10 lg:rounded-l-[2rem]">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Use your college email address.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email address" id="email" required>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.ac.uk" autoFocus />
        </Field>
        <Field label="Password" id="password" required>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Sign in
        </Button>
        <p className="text-center text-xs text-slate-500">Forgotten your password? Ask your system administrator to reset it.</p>
      </form>
    </AuthLayout>
  );
}

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ email: string; firstName: string; lastName: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setError('This invitation link is missing its code. Please use the link from your email.');
    get<typeof info>(`/auth/invite?token=${encodeURIComponent(token)}`)
      .then((i) => {
        setInfo(i);
        if (i) setForm((f) => ({ ...f, firstName: i.firstName, lastName: i.lastName }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'This invitation is not valid.'));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('The two passwords do not match.');
    const parsed = AcceptInviteSchema.safeParse({ token, firstName: form.firstName, lastName: form.lastName, password: form.password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Please check the form.');
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ user: Parameters<typeof setUser>[0] }>('/auth/accept-invite', parsed.data);
      setUser(res.user);
      toast.success('Welcome! Your account is ready.');
      navigate('/me/profile', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Set up your account" subtitle={info ? `You have been invited as ${info.email}.` : undefined}>
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {info && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" id="fn" required>
              <Input id="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Last name" id="ln" required>
              <Input id="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label="Choose a password" id="pw" required hint="At least 10 characters, mixing lower-case with capitals or numbers.">
            <Input id="pw" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Confirm password" id="pw2" required>
            <Input id="pw2" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Create my account
          </Button>
        </form>
      )}
      {!info && !error && <p className="text-sm text-slate-500">Checking your invitation&hellip;</p>}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="link">Already have an account? Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setError('The two new passwords do not match.');
    const parsed = ChangePasswordSchema.safeParse({ currentPassword: form.currentPassword, newPassword: form.newPassword });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Please check the form.');
    setBusy(true);
    setError(null);
    try {
      await mutations.changePassword(parsed.data);
      await refresh();
      toast.success('Password changed.');
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Change your password" description={user?.mustChangePassword ? 'You are using a temporary password. Please choose a new one to continue.' : 'Choose a strong password you do not use anywhere else.'} />
      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Current password" id="cp" required>
          <Input id="cp" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password" id="np" required hint="At least 10 characters, mixing lower-case with capitals or numbers.">
          <Input id="np" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Field label="Confirm new password" id="np2" required>
          <Input id="np2" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <Button type="submit" loading={busy}>Save new password</Button>
      </form>
    </div>
  );
}

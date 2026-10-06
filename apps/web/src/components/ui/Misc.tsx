import * as RSwitch from '@radix-ui/react-switch';
import { AlertTriangle, CheckCircle2, Info, Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function PageHeader({ title, description, actions, breadcrumb, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: { to: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && (
          <Link to={breadcrumb.to} className="no-print mb-1 inline-block text-sm text-slate-500 hover:text-brand-700">
            &larr; {breadcrumb.label}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} aria-hidden />;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const map = {
    info: { cls: 'border-blue-200 bg-blue-50 text-blue-900', Icon: Info },
    warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
    danger: { cls: 'border-rose-200 bg-rose-50 text-rose-900', Icon: AlertTriangle },
    success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', map.cls, className)}>
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, description, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <RSwitch.Root id={id} checked={checked} onCheckedChange={onCheckedChange} className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-600">
        <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </RSwitch.Root>
    </label>
  );
}

export function ProgressBar({ value, tone = 'brand', className, label }: { value: number | null; tone?: 'brand' | 'success' | 'warning' | 'danger'; className?: string; label?: string }) {
  const colours = { brand: 'bg-brand-600', success: 'bg-emerald-600', warning: 'bg-amber-500', danger: 'bg-rose-600' };
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-all', colours[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, help, tone, icon: Icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; help?: ReactNode; tone?: string; icon?: LucideIcon }) {
  return (
    <div className="card flex items-start gap-4 px-5 py-4">
      {Icon && (
        <span className={cn('mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700', tone)}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-sm text-slate-500">
          {label}
          {help}
        </div>
        <div className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function ScoreRing({ score, label, size = 140, bands }: { score: number | null; label?: string | null; size?: number; bands?: readonly { min: number; label: string; colour: string }[] }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const colourName = bands?.length ? [...bands].sort((a, b) => b.min - a.min).find((b) => pct >= b.min)?.colour : undefined;
  const hex = { emerald: '#1b7f3b', teal: '#2a78d6', amber: '#eda100', rose: '#e34948' }[colourName ?? ''] ?? (pct >= 85 ? '#1b7f3b' : pct >= 70 ? '#2a78d6' : pct >= 55 ? '#eda100' : '#e34948');
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Overall score ${score ?? 'not available'} out of 100${label ? `, ${label}` : ''}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth="12" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={hex} strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold leading-none text-slate-900">{score === null ? '-' : Math.round(score)}</span>
        <span className="mt-1 text-xs text-slate-500">out of 100</span>
        {label && <span className="mt-1 text-xs font-semibold" style={{ color: hex }}>{label}</span>}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-4 text-sm text-slate-600" aria-label="Pagination">
      <span>
        Page {page} of {pages} &middot; {total} in total
      </span>
      <div className="flex gap-2">
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

export function ScorePill({ score, max = 5 }: { score: number | null; max?: number }) {
  if (score === null) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">N/A</span>;
  const tone = score >= 4 ? 'bg-emerald-100 text-emerald-800' : score === 3 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', tone)} aria-label={`Score ${score} out of ${max}`}>
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < score ? 'bg-current' : 'bg-current/25')} />
        ))}
      </span>
      {score}/{max}
    </span>
  );
}

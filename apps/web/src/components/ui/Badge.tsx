import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    DRAFT: { tone: 'neutral', label: 'Draft' },
    QUEUED: { tone: 'info', label: 'Queued' },
    TRANSCRIBING: { tone: 'info', label: 'Transcribing' },
    EXTRACTING: { tone: 'info', label: 'Reading documents' },
    ANALYSING: { tone: 'info', label: 'Reviewing' },
    READY: { tone: 'success', label: 'Report ready' },
    FAILED: { tone: 'danger', label: 'Needs attention' },
  };
  const m = map[status] ?? { tone: 'neutral' as Tone, label: status };
  const busy = ['QUEUED', 'TRANSCRIBING', 'EXTRACTING', 'ANALYSING'].includes(status);
  return (
    <Badge tone={m.tone}>
      {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {m.label}
    </Badge>
  );
}

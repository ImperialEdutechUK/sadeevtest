import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { formatTimestamp, type GradeBand } from '@slc/shared';

export { formatTimestamp };

export function fmtDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}
export function fmtDateTime(iso: string | null | undefined): string {
  return fmtDate(iso, 'd MMM yyyy, HH:mm');
}
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return '';
  }
}
export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return '-';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function fmtScore(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return '-';
  return n.toFixed(digits);
}
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
export function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}
export function toDateInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? parseISO(iso) : iso;
  return format(d, 'yyyy-MM-dd');
}

/** Visual treatment for a grade label / colour name. */
export type GradeTone = { bg: string; text: string; ring: string; hex: string; bar: string };
const TONES: Record<string, GradeTone> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-800', ring: 'ring-emerald-200', hex: '#1b7f3b', bar: 'bg-[var(--color-grade-excellent)]' },
  teal: { bg: 'bg-blue-50', text: 'text-blue-800', ring: 'ring-blue-200', hex: '#2a78d6', bar: 'bg-[var(--color-grade-good)]' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-900', ring: 'ring-amber-200', hex: '#eda100', bar: 'bg-[var(--color-grade-developing)]' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-800', ring: 'ring-rose-200', hex: '#e34948', bar: 'bg-[var(--color-grade-support)]' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-200', hex: '#94a3b8', bar: 'bg-slate-400' },
};
export function toneFor(colour: string | null | undefined): GradeTone {
  return TONES[colour ?? ''] ?? TONES.slate;
}
export function bandFor(score: number | null | undefined, bands: readonly GradeBand[] | undefined): GradeBand | null {
  if (score === null || score === undefined || !bands?.length) return null;
  return [...bands].sort((a, b) => b.min - a.min).find((b) => score >= b.min) ?? null;
}
export function gradeToneForLabel(label: string | null | undefined, bands: readonly GradeBand[] | undefined): GradeTone {
  const band = bands?.find((b) => b.label === label);
  return toneFor(band?.colour);
}
export function scoreTone(score: number | null | undefined): GradeTone {
  if (score === null || score === undefined) return TONES.slate;
  if (score >= 85) return TONES.emerald;
  if (score >= 70) return TONES.teal;
  if (score >= 55) return TONES.amber;
  return TONES.rose;
}
export function criterionTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-slate-200 text-slate-600';
  if (score >= 4) return 'bg-emerald-100 text-emerald-800';
  if (score === 3) return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-800';
}
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

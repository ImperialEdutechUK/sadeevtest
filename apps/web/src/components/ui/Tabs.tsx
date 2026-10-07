import * as RT from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode; count?: number }[]; children: ReactNode; className?: string }) {
  return (
    <RT.Root value={value} onValueChange={onValueChange} className={className}>
      <RT.List className="no-print scrollbar-thin flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Sections">
        {tabs.map((t) => (
          <RT.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              '-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-slate-600 hover:text-slate-900',
              'data-[state=active]:border-brand-600 data-[state=active]:text-brand-800',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.count}</span>}
          </RT.Trigger>
        ))}
      </RT.List>
      {children}
    </RT.Root>
  );
}
export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RT.Content value={value} className={cn('pt-5 focus:outline-none print-expand', className)} forceMount={undefined}>
      {children}
    </RT.Content>
  );
}

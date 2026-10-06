import * as Tooltip from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/** A small "?" that explains a term in plain English on hover/focus. */
export function HelpTip({ children, label = 'What does this mean?' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-brand-600 focus-visible:text-brand-600">
          <HelpCircle className="h-4 w-4" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-xl bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          {children}
          <Tooltip.Arrow className="fill-slate-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

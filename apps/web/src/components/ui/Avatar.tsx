import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export function Avatar({ firstName, lastName, src, size = 'md', className }: { firstName: string; lastName: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizes = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm', xl: 'h-20 w-20 text-xl' };
  const hue = ((firstName.charCodeAt(0) ?? 0) * 7 + (lastName.charCodeAt(0) ?? 0) * 13) % 360;
  if (src) return <img src={src} alt={`${firstName} ${lastName}`} className={cn('rounded-full object-cover', sizes[size], className)} />;
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', sizes[size], className)} style={{ background: `hsl(${hue} 45% 45%)` }}>
      {initials(firstName, lastName)}
    </span>
  );
}

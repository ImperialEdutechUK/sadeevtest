import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as DM from '@radix-ui/react-dropdown-menu';
import { Bell, BookOpen, ClipboardList, Gauge, HelpCircle, LogOut, Menu, Settings, Shield, Target, Trophy, UserCircle2, Users, Video, X, type LucideIcon } from 'lucide-react';
import { ROLE_LABELS, type Permission } from '@slc/shared';
import { useAuth } from './AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { fmtAgo } from '@/lib/format';
import { mutations, useApiMutation, useNotifications, keys } from '@/lib/queries';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission | Permission[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Gauge },
  { to: '/meetings', label: 'Meetings', icon: Video },
  { to: '/people', label: 'People', icon: Users, permission: 'people:read' },
  { to: '/kpis', label: 'KPIs', icon: Target, permission: 'kpi:read' },
  { to: '/competitions', label: 'Competitions', icon: Trophy, permission: 'competition:read' },
  { to: '/appraisals', label: 'Appraisals', icon: ClipboardList, permission: ['appraisal:read:own', 'appraisal:read:any'] },
  { to: '/criteria', label: 'Criteria', icon: BookOpen, permission: 'rubric:manage' },
  { to: '/admin', label: 'Admin', icon: Shield, permission: ['user:manage', 'audit:read', 'settings:manage'] },
];

const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Meeting Review';
const COLLEGE = (import.meta.env.VITE_COLLEGE_NAME as string | undefined) ?? 'South London College';

export function AppShell() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  if (!user) return null;

  const items = NAV.filter((n) => !n.permission || (Array.isArray(n.permission) ? n.permission.some(can) : can(n.permission)));

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white')
          }
        >
          <n.icon className="h-5 w-5 shrink-0" aria-hidden />
          {n.label}
        </NavLink>
      ))}
      <div className="mt-auto pt-4">
        <NavLink to="/help" className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white')}>
          <HelpCircle className="h-5 w-5" aria-hidden /> Help &amp; guide
        </NavLink>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-brand-800 text-white lg:flex lg:sticky lg:top-0 lg:h-screen">
        <Brand />
        {nav}
        <div className="border-t border-white/10 p-3 text-xs text-brand-200">{COLLEGE}</div>
      </aside>

      {/* Sidebar (mobile drawer) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-brand-800 text-white shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button className="rounded-lg p-2 text-brand-100 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 lg:hidden">
            <span className="font-semibold text-slate-900">{APP_NAME}</span>
          </div>
          <div className="hidden flex-1 lg:block" />
          <Link to="/meetings/new" className="hidden h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 sm:inline-flex">
            + Upload a meeting
          </Link>
          <NotificationsMenu />
          <UserMenu onLogout={logout} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 px-5 py-5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500 text-white">
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
          <path d="M8 20l5-6 4 4 7-9" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>
        <span className="block text-base font-semibold leading-tight">{APP_NAME}</span>
        <span className="block text-[11px] text-brand-200">Quality review for learner meetings</span>
      </span>
    </Link>
  );
}

function NotificationsMenu() {
  const { data } = useNotifications();
  const navigate = useNavigate();
  const markRead = useApiMutation(mutations.markNotificationsRead, [keys.notifications]);
  const unread = data?.unread ?? 0;
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-[22rem] rounded-2xl border border-slate-200 bg-white p-2 shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button className="text-xs text-brand-700 hover:underline" onClick={() => markRead.mutate('all')}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {!data?.items.length && <p className="px-2 py-6 text-center text-sm text-slate-500">You are all caught up.</p>}
            {data?.items.map((n) => (
              <DM.Item
                key={n.id}
                className={cn('cursor-pointer rounded-xl px-3 py-2.5 outline-none hover:bg-slate-50 focus:bg-slate-50', !n.readAt && 'bg-brand-50/60')}
                onSelect={() => {
                  if (!n.readAt) markRead.mutate([n.id]);
                  if (n.link) navigate(n.link);
                }}
              >
                <p className="text-sm font-medium text-slate-900">{n.title}</p>
                <p className="line-clamp-2 text-xs text-slate-600">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{fmtAgo(n.createdAt)}</p>
              </DM.Item>
            ))}
          </div>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function UserMenu({ onLogout }: { onLogout: () => Promise<void> }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100" aria-label="Account menu">
          <Avatar firstName={user.firstName} lastName={user.lastName} src={user.avatarUrl} />
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-900">{user.firstName}</span>
            <span className="block text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</span>
          </span>
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[var(--shadow-pop)]">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <DM.Separator className="my-1 h-px bg-slate-100" />
          <MenuItem icon={UserCircle2} label="My profile" onSelect={() => navigate('/me/profile')} />
          <MenuItem icon={Settings} label="Change password" onSelect={() => navigate('/me/password')} />
          <DM.Separator className="my-1 h-px bg-slate-100" />
          <MenuItem icon={LogOut} label="Sign out" onSelect={() => void onLogout().then(() => navigate('/login'))} />
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function MenuItem({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return (
    <DM.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-50 focus:bg-slate-50">
      <Icon className="h-4 w-4 text-slate-500" aria-hidden /> {label}
    </DM.Item>
  );
}

import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth, RequirePermission } from './guards';
import { LoginPage, AcceptInvitePage, ChangePasswordPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { MeetingsPage } from '@/pages/meetings/MeetingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Skeleton } from '@/components/ui/Misc';

/** Heavier screens load on demand so the first paint stays fast. */
function lazyPage<T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) {
  const C = lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>}>
      <C />
    </Suspense>
  );
}
const NewMeetingPage = () => lazyPage(() => import('@/pages/meetings/NewMeetingPage'), 'NewMeetingPage');
const MeetingPage = () => lazyPage(() => import('@/pages/meetings/MeetingPage'), 'MeetingPage');
const PeoplePage = () => lazyPage(() => import('@/pages/people/PeoplePage'), 'PeoplePage');
const PersonPage = () => lazyPage(() => import('@/pages/people/PersonPage'), 'PersonPage');
const ProfilePage = () => lazyPage(() => import('@/pages/ProfilePage'), 'ProfilePage');
const RubricsPage = () => lazyPage(() => import('@/pages/rubrics/RubricsPage'), 'RubricsPage');
const RubricEditorPage = () => lazyPage(() => import('@/pages/rubrics/RubricEditorPage'), 'RubricEditorPage');
const KpisPage = () => lazyPage(() => import('@/pages/performance/KpisPage'), 'KpisPage');
const CompetitionsPage = () => lazyPage(() => import('@/pages/performance/CompetitionsPages'), 'CompetitionsPage');
const CompetitionPage = () => lazyPage(() => import('@/pages/performance/CompetitionsPages'), 'CompetitionPage');
const AppraisalsPage = () => lazyPage(() => import('@/pages/performance/AppraisalPages'), 'AppraisalsPage');
const AppraisalPage = () => lazyPage(() => import('@/pages/performance/AppraisalPages'), 'AppraisalPage');
const AdminPage = () => lazyPage(() => import('@/pages/admin/AdminPage'), 'AdminPage');
const HelpPage = () => lazyPage(() => import('@/pages/HelpPage'), 'HelpPage');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/meetings', element: <MeetingsPage /> },
          { path: '/meetings/new', element: <NewMeetingPage /> },
          { path: '/meetings/:id', element: <MeetingPage /> },
          { path: '/meetings/:id/edit', element: <NewMeetingPage /> },
          { path: '/people', element: <RequirePermission permission="people:read"><PeoplePage /></RequirePermission> },
          { path: '/people/:id', element: <PersonPage /> },
          { path: '/me/profile', element: <ProfilePage /> },
          { path: '/me/password', element: <ChangePasswordPage /> },
          { path: '/criteria', element: <RequirePermission permission="rubric:read"><RubricsPage /></RequirePermission> },
          { path: '/criteria/new', element: <RequirePermission permission="rubric:manage"><RubricEditorPage /></RequirePermission> },
          { path: '/criteria/:id', element: <RequirePermission permission="rubric:read"><RubricEditorPage /></RequirePermission> },
          { path: '/kpis', element: <RequirePermission permission="kpi:read"><KpisPage /></RequirePermission> },
          { path: '/competitions', element: <RequirePermission permission="competition:read"><CompetitionsPage /></RequirePermission> },
          { path: '/competitions/:id', element: <RequirePermission permission="competition:read"><CompetitionPage /></RequirePermission> },
          { path: '/appraisals', element: <AppraisalsPage /> },
          { path: '/appraisals/:id', element: <AppraisalPage /> },
          { path: '/admin', element: <RequirePermission permission={['user:manage', 'audit:read', 'settings:manage', 'user:invite']}><AdminPage /></RequirePermission> },
          { path: '/admin/:tab', element: <RequirePermission permission={['user:manage', 'audit:read', 'settings:manage', 'user:invite']}><AdminPage /></RequirePermission> },
          { path: '/help', element: <HelpPage /> },
          { path: '/dashboard', element: <Navigate to="/" replace /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

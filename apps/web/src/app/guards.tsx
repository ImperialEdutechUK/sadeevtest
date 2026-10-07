import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '@slc/shared';
import { useAuth } from './AuthProvider';
import { Alert } from '@/components/ui/Misc';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" aria-busy="true">
        Loading&hellip;
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/me/password') return <Navigate to="/me/password" replace />;
  return <Outlet />;
}

export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const allowed = Array.isArray(permission) ? permission.some(can) : can(permission);
  if (!allowed) return <Alert tone="warning" title="You do not have access to this page">Ask your academic manager or system administrator if you think you should.</Alert>;
  return <>{children}</>;
}

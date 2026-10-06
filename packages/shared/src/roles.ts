/**
 * Roles and permissions - the single source of truth used by both the API
 * (to authorise requests) and the web app (to decide what to show).
 */
export const ROLES = [
  'TUTOR',
  'ACADEMIC_ADMIN',
  'ACADEMIC_MANAGER',
  'HR',
  'DIRECTOR',
  'SYSTEM_ADMIN',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  TUTOR: 'Tutor',
  ACADEMIC_ADMIN: 'Academic admin',
  ACADEMIC_MANAGER: 'Academic manager',
  HR: 'HR',
  DIRECTOR: 'Director',
  SYSTEM_ADMIN: 'System admin',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  TUTOR: 'Uploads their own meetings and sees their own reports, progress and appraisals.',
  ACADEMIC_ADMIN: 'Uploads meetings on behalf of tutors and maintains the review criteria.',
  ACADEMIC_MANAGER:
    'Sees every tutor, moderates reports, sets KPIs, runs competitions and writes appraisals.',
  HR: 'Sees performance summaries and appraisals for people processes. Cannot change criteria.',
  DIRECTOR: 'Full read access to all progress, KPIs and reports across the college.',
  SYSTEM_ADMIN: 'Manages users, settings and integrations. Full access.',
};

export const PERMISSIONS = [
  // Meetings
  'meeting:create:own',
  'meeting:create:any',
  'meeting:read:own',
  'meeting:read:any',
  'meeting:delete:own',
  'meeting:delete:any',
  'meeting:reanalyse',
  // Analysis
  'analysis:moderate',
  'analysis:comment',
  // Rubrics
  'rubric:read',
  'rubric:manage',
  // People
  'people:read',
  'people:manage',
  'user:invite',
  'user:manage',
  // Performance management
  'kpi:read',
  'kpi:manage',
  'competition:read',
  'competition:manage',
  'appraisal:read:own',
  'appraisal:read:any',
  'appraisal:manage',
  // Admin
  'audit:read',
  'settings:manage',
  'export:data',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  TUTOR: [
    'meeting:create:own',
    'meeting:read:own',
    'meeting:delete:own',
    'analysis:comment',
    'rubric:read',
    'competition:read',
    'appraisal:read:own',
  ],
  ACADEMIC_ADMIN: [
    'meeting:create:own',
    'meeting:create:any',
    'meeting:read:own',
    'meeting:read:any',
    'meeting:delete:any',
    'meeting:reanalyse',
    'analysis:comment',
    'rubric:read',
    'rubric:manage',
    'people:read',
    'user:invite',
    'competition:read',
    'appraisal:read:own',
  ],
  ACADEMIC_MANAGER: [
    'meeting:create:own',
    'meeting:create:any',
    'meeting:read:own',
    'meeting:read:any',
    'meeting:delete:any',
    'meeting:reanalyse',
    'analysis:moderate',
    'analysis:comment',
    'rubric:read',
    'rubric:manage',
    'people:read',
    'people:manage',
    'user:invite',
    'kpi:read',
    'kpi:manage',
    'competition:read',
    'competition:manage',
    'appraisal:read:own',
    'appraisal:read:any',
    'appraisal:manage',
    'export:data',
  ],
  HR: [
    'meeting:read:any',
    'rubric:read',
    'people:read',
    'kpi:read',
    'competition:read',
    'appraisal:read:any',
    'appraisal:manage',
    'export:data',
  ],
  DIRECTOR: [
    'meeting:read:own',
    'meeting:read:any',
    'analysis:comment',
    'rubric:read',
    'people:read',
    'kpi:read',
    'kpi:manage',
    'competition:read',
    'competition:manage',
    'appraisal:read:any',
    'audit:read',
    'export:data',
  ],
  SYSTEM_ADMIN: ALL,
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: Role | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Roles that are "staff being reviewed" (appear in people lists, competitions, KPIs). */
export const REVIEWABLE_ROLES: Role[] = ['TUTOR', 'ACADEMIC_ADMIN', 'ACADEMIC_MANAGER'];

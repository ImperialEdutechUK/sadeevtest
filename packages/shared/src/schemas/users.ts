import { z } from 'zod';
import { ROLES } from '../roles.js';

export const InviteUserSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  role: z.enum(ROLES),
  departmentId: z.string().nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
});
export type InviteUserInput = z.infer<typeof InviteUserSchema>;

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  role: z.enum(ROLES).optional(),
  departmentId: z.string().nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  emailNotifications: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const UsersQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  departmentId: z.string().optional(),
  search: z.string().max(100).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export const DepartmentSchema = z.object({ id: z.string(), name: z.string() });
export const CreateDepartmentSchema = z.object({ name: z.string().min(1).max(120) });

export const ResetPasswordSchema = z.object({ userId: z.string().min(1) });

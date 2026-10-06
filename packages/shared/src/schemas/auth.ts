import { z } from 'zod';
import { ROLES } from '../roles.js';

export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z0-9]/.test(v), 'Mix lower-case with capitals or numbers');

export const LoginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const AcceptInviteSchema = z.object({
  token: z.string().min(10),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  password: PasswordSchema,
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

export const UserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(ROLES),
  jobTitle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  bio: z.string().nullable().optional(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

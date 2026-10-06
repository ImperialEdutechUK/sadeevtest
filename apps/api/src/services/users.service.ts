import type { Role, UserSummary } from '@slc/shared';
import { loadConfig } from '../config.js';
import { prisma } from '../db.js';
import type { Prisma, User, Department } from '../generated/prisma/client.js';
import { audit } from '../lib/audit.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { generateTemporaryPassword, hashPassword } from '../lib/password.js';
import { iso, isoReq } from '../lib/serialize.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { getEmailProvider } from '../providers/email/index.js';
import { logger } from '../logger.js';

type UserWithDept = User & { department: Department | null };

export function serializeUser(u: UserWithDept): UserSummary {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    jobTitle: u.jobTitle,
    avatarUrl: u.avatarUrl,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    bio: u.bio,
    createdAt: isoReq(u.createdAt),
    lastLoginAt: iso(u.lastLoginAt),
  };
}

export async function getUser(id: string): Promise<UserSummary> {
  const u = await prisma.user.findUnique({ where: { id }, include: { department: true } });
  if (!u) throw new NotFoundError('User');
  return serializeUser(u);
}

export async function listUsers(q: { role?: Role; departmentId?: string; search?: string; includeInactive?: boolean }) {
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.departmentId ? { departmentId: q.departmentId } : {}),
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.search
      ? { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] }
      : {}),
  };
  const users = await prisma.user.findMany({ where, include: { department: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  return users.map(serializeUser);
}

const ROLE_RANK: Record<Role, number> = { TUTOR: 1, ACADEMIC_ADMIN: 2, HR: 2, ACADEMIC_MANAGER: 3, DIRECTOR: 4, SYSTEM_ADMIN: 5 };

/** Managers may invite/alter roles at or below their own level; only system admins can create admins. */
export function assertCanAssignRole(actorRole: Role, targetRole: Role) {
  if (actorRole === 'SYSTEM_ADMIN') return;
  if (targetRole === 'SYSTEM_ADMIN' || ROLE_RANK[targetRole] > ROLE_RANK[actorRole]) {
    throw new ForbiddenError(`You cannot assign the ${targetRole} role`);
  }
}

export async function inviteUser(actor: { id: string; role: Role }, input: { email: string; firstName: string; lastName: string; role: Role; departmentId?: string | null; jobTitle?: string | null }) {
  assertCanAssignRole(actor.role, input.role);
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) throw new ConflictError('A user with this email already exists');
  const token = randomToken(32);
  await prisma.invitation.create({
    data: {
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      departmentId: input.departmentId ?? null,
      jobTitle: input.jobTitle ?? null,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      invitedById: actor.id,
    },
  });
  const cfg = loadConfig();
  const link = `${cfg.WEB_ORIGIN}/accept-invite?token=${token}`;
  await getEmailProvider().send({
    to: email,
    subject: 'You have been invited to Meeting Review',
    text: `Hello ${input.firstName},\n\nYou have been invited to Meeting Review. Set up your account here (link valid for 7 days):\n${link}\n\nIf you were not expecting this, you can ignore this email.`,
  });
  audit({ actorId: actor.id, action: 'user.invited', entityType: 'invitation', metadata: { email, role: input.role } });
  // The link is returned so an admin can copy it when email is not configured.
  return { inviteLink: link, email };
}

export async function updateUser(actor: { id: string; role: Role }, id: string, input: { firstName?: string; lastName?: string; role?: Role; departmentId?: string | null; jobTitle?: string | null; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new NotFoundError('User');
  if (input.role && input.role !== target.role) {
    assertCanAssignRole(actor.role, input.role);
    assertCanAssignRole(actor.role, target.role);
  }
  if (input.isActive === false && id === actor.id) throw new BadRequestError('You cannot deactivate your own account');
  const u = await prisma.user.update({ where: { id }, data: input, include: { department: true } });
  if (input.isActive === false) await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  audit({ actorId: actor.id, action: 'user.updated', entityType: 'user', entityId: id, metadata: input as Record<string, unknown> });
  return serializeUser(u);
}

export async function updateProfile(userId: string, input: { firstName?: string; lastName?: string; jobTitle?: string | null; bio?: string | null; departmentId?: string | null; avatarUrl?: string | null; emailNotifications?: boolean }) {
  const u = await prisma.user.update({ where: { id: userId }, data: input, include: { department: true } });
  audit({ actorId: userId, action: 'profile.updated', entityType: 'user', entityId: userId });
  return serializeUser(u);
}

export async function resetPassword(actor: { id: string; role: Role }, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError('User');
  assertCanAssignRole(actor.role, target.role);
  const temp = generateTemporaryPassword();
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await getEmailProvider()
    .send({ to: target.email, subject: 'Your Meeting Review password has been reset', text: `Hello ${target.firstName},\n\nA temporary password has been set for you: ${temp}\n\nSign in and you will be asked to choose a new password.` })
    .catch((err: unknown) => logger.warn({ err }, 'reset email failed'));
  audit({ actorId: actor.id, action: 'user.password_reset', entityType: 'user', entityId: userId });
  return { temporaryPassword: temp };
}

export async function listDepartments() {
  const rows = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  return rows.map((d) => ({ id: d.id, name: d.name }));
}
export async function createDepartment(actorId: string, name: string) {
  const d = await prisma.department.upsert({ where: { name }, create: { name }, update: {} });
  audit({ actorId, action: 'department.created', entityType: 'department', entityId: d.id });
  return { id: d.id, name: d.name };
}

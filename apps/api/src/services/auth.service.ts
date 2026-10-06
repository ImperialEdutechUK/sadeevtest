import type { FastifyReply, FastifyRequest } from 'fastify';
import { loadConfig } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, BadRequestError, UnauthorizedError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { randomToken, sha256, signJwt } from '../lib/tokens.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../plugins/auth.js';
import { serializeUser } from './users.service.js';

const cfg = loadConfig();

function cookieOptions(path: string, maxAgeSeconds: number) {
  const secure = cfg.NODE_ENV === 'production';
  return { httpOnly: true, secure, sameSite: 'lax' as const, path, maxAge: maxAgeSeconds, signed: false };
}

export async function issueSession(reply: FastifyReply, userId: string, role: string) {
  const access = signJwt({ sub: userId, role }, cfg.JWT_SECRET, cfg.ACCESS_TOKEN_MINUTES * 60);
  const refresh = randomToken(48);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(refresh), expiresAt: new Date(Date.now() + cfg.REFRESH_TOKEN_DAYS * 86_400_000) },
  });
  reply.setCookie(ACCESS_COOKIE, access, cookieOptions('/', cfg.ACCESS_TOKEN_MINUTES * 60));
  reply.setCookie(REFRESH_COOKIE, refresh, cookieOptions('/api/auth', cfg.REFRESH_TOKEN_DAYS * 86_400));
  return { accessToken: access };
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export async function login(request: FastifyRequest, reply: FastifyReply, email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { department: true } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    audit({ action: 'auth.login_failed', entityType: 'user', entityId: user?.id ?? null, metadata: { email }, ip: request.ip });
    throw new UnauthorizedError('Email or password is incorrect');
  }
  if (!user.isActive) throw new AppError(403, 'This account has been deactivated. Contact your administrator.', 'INACTIVE');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const session = await issueSession(reply, user.id, user.role);
  audit({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: request.ip });
  return { user: serializeUser(user), ...session };
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.[REFRESH_COOKIE];
  if (!token) throw new UnauthorizedError('Session expired');
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { department: true } } } });
  if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.isActive) {
    clearSession(reply);
    throw new UnauthorizedError('Session expired');
  }
  // Rotate: revoke the used refresh token and issue a new pair.
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const session = await issueSession(reply, row.userId, row.user.role);
  return { user: serializeUser(row.user), ...session };
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.[REFRESH_COOKIE];
  if (token) {
    await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  clearSession(reply);
  if (request.user) audit({ actorId: request.user.id, action: 'auth.logout', entityType: 'user', entityId: request.user.id, ip: request.ip });
}

export async function acceptInvite(reply: FastifyReply, input: { token: string; firstName: string; lastName: string; password: string }) {
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new BadRequestError('This invitation link is invalid or has expired. Ask your administrator to send a new one.');
  }
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  const passwordHash = await hashPassword(input.password);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, firstName: input.firstName, lastName: input.lastName, isActive: true, mustChangePassword: false, lastLoginAt: new Date() },
        include: { department: true },
      })
    : await prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: invite.role,
          departmentId: invite.departmentId,
          jobTitle: invite.jobTitle,
          lastLoginAt: new Date(),
        },
        include: { department: true },
      });
  await prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await prisma.notification.create({
    data: { userId: user.id, type: 'WELCOME', title: 'Welcome to Meeting Review', body: 'Start by completing your profile, then upload your first meeting.', link: '/me/profile' },
  });
  const session = await issueSession(reply, user.id, user.role);
  audit({ actorId: user.id, action: 'auth.invite_accepted', entityType: 'user', entityId: user.id });
  return { user: serializeUser(user), ...session };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new BadRequestError('Your current password is incorrect');
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  audit({ actorId: userId, action: 'auth.password_changed', entityType: 'user', entityId: userId });
}

export async function getInviteInfo(token: string) {
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new BadRequestError('This invitation link is invalid or has expired.');
  return { email: invite.email, firstName: invite.firstName, lastName: invite.lastName, role: invite.role };
}

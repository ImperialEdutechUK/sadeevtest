import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { can, type Permission, type Role } from '@slc/shared';
import { loadConfig } from '../config.js';
import { prisma } from '../db.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { verifyJwt } from '../lib/tokens.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  mustChangePassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    authVia: 'cookie' | 'bearer' | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (...permissions: Permission[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const ACCESS_COOKIE = 'mr_access';
export const REFRESH_COOKIE = 'mr_refresh';

export const authPlugin = fp(async (app: FastifyInstance) => {
  const cfg = loadConfig();

  app.decorateRequest('user', null);
  app.decorateRequest('authVia', null);

  app.addHook('onRequest', async (request) => {
    let token: string | null = null;
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7);
      request.authVia = 'bearer';
    } else if (request.cookies?.[ACCESS_COOKIE]) {
      token = request.cookies[ACCESS_COOKIE] ?? null;
      request.authVia = 'cookie';
    }
    if (!token) return;
    const claims = verifyJwt(token, cfg.JWT_SECRET);
    if (!claims) return;
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, departmentId: true, isActive: true, mustChangePassword: true },
    });
    if (!user || !user.isActive) return;
    request.user = { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, departmentId: user.departmentId, mustChangePassword: user.mustChangePassword };
  });

  // CSRF protection for cookie-authenticated state changes: the Origin (or Referer) must match the web app.
  app.addHook('onRequest', async (request) => {
    if (request.authVia !== 'cookie') return;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin ?? (request.headers.referer ? safeOrigin(request.headers.referer) : null);
    const allowed = new Set([cfg.WEB_ORIGIN, cfg.API_PUBLIC_URL].map((u) => safeOrigin(u)).filter(Boolean));
    if (!origin || !(allowed.has(origin) || (cfg.NODE_ENV !== 'production' && isLoopback(origin)))) {
      throw new ForbiddenError('Request blocked: origin not allowed');
    }
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    if (!request.user) throw new UnauthorizedError();
  });

  app.decorate('requirePermission', (...permissions: Permission[]) => async (request: FastifyRequest) => {
    if (!request.user) throw new UnauthorizedError();
    if (!permissions.some((p) => can(request.user!.role, p))) throw new ForbiddenError();
  });
});

function isLoopback(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return can(user.role, permission);
}

export function assertPermission(user: AuthUser, ...permissions: Permission[]): void {
  if (!permissions.some((p) => can(user.role, p))) throw new ForbiddenError();
}

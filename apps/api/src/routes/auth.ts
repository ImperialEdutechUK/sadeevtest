import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AcceptInviteSchema, ChangePasswordSchema, LoginSchema } from '@slc/shared';
import * as auth from '../services/auth.service.js';
import { getUser } from '../services/users.service.js';
import { requireUser } from '../plugins/auth.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['Auth'], body: LoginSchema } }, async (req, reply) => auth.login(req, reply, req.body.email, req.body.password));

  app.post('/auth/refresh', { schema: { tags: ['Auth'] } }, async (req, reply) => auth.refresh(req, reply));

  app.post('/auth/logout', { schema: { tags: ['Auth'] } }, async (req, reply) => {
    await auth.logout(req, reply);
    return { ok: true };
  });

  app.get('/auth/me', { schema: { tags: ['Auth'] } }, async (req) => {
    const user = requireUser(req);
    return getUser(user.id);
  });

  app.get('/auth/invite', { schema: { tags: ['Auth'], querystring: z.object({ token: z.string().min(10) }) } }, async (req) => auth.getInviteInfo(req.query.token));

  app.post('/auth/accept-invite', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['Auth'], body: AcceptInviteSchema } }, async (req, reply) => auth.acceptInvite(reply, req.body));

  app.post('/auth/change-password', { schema: { tags: ['Auth'], body: ChangePasswordSchema } }, async (req) => {
    const user = requireUser(req);
    await auth.changePassword(user.id, req.body.currentPassword, req.body.newPassword);
    return { ok: true };
  });
};

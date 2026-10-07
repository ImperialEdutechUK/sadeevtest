import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateDepartmentSchema, InviteUserSchema, ResetPasswordSchema, UpdateProfileSchema, UpdateUserSchema, UsersQuerySchema } from '@slc/shared';
import { requireUser } from '../plugins/auth.js';
import * as users from '../services/users.service.js';
import { personPerformance } from '../services/dashboard.service.js';

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/users', { onRequest: app.requirePermission('people:read', 'user:invite', 'meeting:create:any'), schema: { tags: ['Users'], querystring: UsersQuerySchema } }, async (req) => users.listUsers(req.query));

  app.post('/users/invite', { onRequest: app.requirePermission('user:invite', 'user:manage'), schema: { tags: ['Users'], body: InviteUserSchema } }, async (req) => users.inviteUser(requireUser(req), req.body));

  app.patch('/users/:id', { onRequest: app.requirePermission('user:manage', 'people:manage'), schema: { tags: ['Users'], params: z.object({ id: z.string() }), body: UpdateUserSchema } }, async (req) => users.updateUser(requireUser(req), req.params.id, req.body));

  app.post('/users/reset-password', { onRequest: app.requirePermission('user:manage'), schema: { tags: ['Users'], body: ResetPasswordSchema } }, async (req) => users.resetPassword(requireUser(req), req.body.userId));

  app.get('/users/:id', { onRequest: app.authenticate, schema: { tags: ['Users'], params: z.object({ id: z.string() }) } }, async (req) => users.getUser(req.params.id));

  app.get('/users/:id/performance', { onRequest: app.authenticate, schema: { tags: ['Users'], params: z.object({ id: z.string() }), querystring: z.object({ from: z.string().optional(), to: z.string().optional() }) } }, async (req) => personPerformance(requireUser(req), req.params.id, req.query));

  app.patch('/me/profile', { onRequest: app.authenticate, schema: { tags: ['Users'], body: UpdateProfileSchema } }, async (req) => users.updateProfile(requireUser(req).id, req.body));

  app.get('/departments', { onRequest: app.authenticate, schema: { tags: ['Users'] } }, async () => users.listDepartments());

  app.post('/departments', { onRequest: app.requirePermission('user:manage', 'people:manage'), schema: { tags: ['Users'], body: CreateDepartmentSchema } }, async (req) => users.createDepartment(requireUser(req).id, req.body.name));
};

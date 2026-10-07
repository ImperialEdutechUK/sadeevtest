import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateRubricSchema, QueryBoolSchema, UpdateRubricSchema } from '@slc/shared';
import { requireUser } from '../plugins/auth.js';
import * as rubrics from '../services/rubrics.service.js';

export const rubricRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/rubrics', { onRequest: app.requirePermission('rubric:read'), schema: { tags: ['Criteria'], querystring: z.object({ includeInactive: QueryBoolSchema }) } }, async (req) => rubrics.listRubrics(req.query));
  app.get('/rubrics/:id', { onRequest: app.requirePermission('rubric:read'), schema: { tags: ['Criteria'], params: z.object({ id: z.string() }) } }, async (req) => rubrics.getRubric(req.params.id));
  app.post('/rubrics', { onRequest: app.requirePermission('rubric:manage'), schema: { tags: ['Criteria'], body: CreateRubricSchema } }, async (req) => rubrics.createRubric(requireUser(req).id, req.body));
  app.patch('/rubrics/:id', { onRequest: app.requirePermission('rubric:manage'), schema: { tags: ['Criteria'], params: z.object({ id: z.string() }), body: UpdateRubricSchema } }, async (req) => rubrics.updateRubric(requireUser(req).id, req.params.id, req.body));
  app.post('/rubrics/:id/clone', { onRequest: app.requirePermission('rubric:manage'), schema: { tags: ['Criteria'], params: z.object({ id: z.string() }), body: z.object({ name: z.string().min(1).max(160).optional() }).optional() } }, async (req) => rubrics.cloneRubric(requireUser(req).id, req.params.id, req.body?.name));
  app.delete('/rubrics/:id', { onRequest: app.requirePermission('rubric:manage'), schema: { tags: ['Criteria'], params: z.object({ id: z.string() }) } }, async (req) => rubrics.deleteRubric(requireUser(req).id, req.params.id));
};

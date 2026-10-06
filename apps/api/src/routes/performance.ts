import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateAppraisalSchema, CreateCompetitionSchema, CreateKpiSchema, UpdateAppraisalSchema, UpdateCompetitionSchema, UpdateKpiSchema } from '@slc/shared';
import { requireUser } from '../plugins/auth.js';
import { dashboardSummary, listPeople } from '../services/dashboard.service.js';
import * as kpis from '../services/kpi.service.js';
import * as competitions from '../services/competitions.service.js';
import * as appraisals from '../services/appraisals.service.js';

const idParam = z.object({ id: z.string() });
const rangeQuery = z.object({ from: z.string().optional(), to: z.string().optional(), departmentId: z.string().optional(), search: z.string().optional() });

export const performanceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/dashboard', { schema: { tags: ['Dashboard'], querystring: rangeQuery } }, async (req) => dashboardSummary(requireUser(req), req.query));
  app.get('/people', { schema: { tags: ['Dashboard'], querystring: rangeQuery } }, async (req) => listPeople(requireUser(req), req.query));

  app.get('/kpis', { schema: { tags: ['KPIs'], querystring: z.object({ includeInactive: z.coerce.boolean().optional() }) } }, async (req) => kpis.listKpis(requireUser(req), req.query));
  app.get('/kpis/:id', { schema: { tags: ['KPIs'], params: idParam } }, async (req) => kpis.getKpi(requireUser(req), req.params.id));
  app.post('/kpis', { onRequest: app.requirePermission('kpi:manage'), schema: { tags: ['KPIs'], body: CreateKpiSchema } }, async (req) => kpis.createKpi(requireUser(req), req.body));
  app.patch('/kpis/:id', { onRequest: app.requirePermission('kpi:manage'), schema: { tags: ['KPIs'], params: idParam, body: UpdateKpiSchema } }, async (req) => kpis.updateKpi(requireUser(req), req.params.id, req.body));
  app.delete('/kpis/:id', { onRequest: app.requirePermission('kpi:manage'), schema: { tags: ['KPIs'], params: idParam } }, async (req) => {
    await kpis.deleteKpi(requireUser(req), req.params.id);
    return { ok: true };
  });

  app.get('/competitions', { onRequest: app.requirePermission('competition:read'), schema: { tags: ['Competitions'] } }, async (req) => competitions.listCompetitions(requireUser(req)));
  app.get('/competitions/:id', { onRequest: app.requirePermission('competition:read'), schema: { tags: ['Competitions'], params: idParam } }, async (req) => competitions.getCompetition(requireUser(req), req.params.id));
  app.post('/competitions', { onRequest: app.requirePermission('competition:manage'), schema: { tags: ['Competitions'], body: CreateCompetitionSchema } }, async (req) => competitions.createCompetition(requireUser(req), req.body));
  app.patch('/competitions/:id', { onRequest: app.requirePermission('competition:manage'), schema: { tags: ['Competitions'], params: idParam, body: UpdateCompetitionSchema } }, async (req) => competitions.updateCompetition(requireUser(req), req.params.id, req.body));
  app.delete('/competitions/:id', { onRequest: app.requirePermission('competition:manage'), schema: { tags: ['Competitions'], params: idParam } }, async (req) => {
    await competitions.deleteCompetition(requireUser(req), req.params.id);
    return { ok: true };
  });
  app.post('/competitions/:id/join', { onRequest: app.requirePermission('competition:read'), schema: { tags: ['Competitions'], params: idParam } }, async (req) => competitions.joinCompetition(requireUser(req), req.params.id));
  app.post('/competitions/:id/leave', { onRequest: app.requirePermission('competition:read'), schema: { tags: ['Competitions'], params: idParam } }, async (req) => competitions.leaveCompetition(requireUser(req), req.params.id));
  app.post('/competitions/:id/participants', { onRequest: app.requirePermission('competition:manage'), schema: { tags: ['Competitions'], params: idParam, body: z.object({ userIds: z.array(z.string()).min(1) }) } }, async (req) => competitions.addParticipants(requireUser(req), req.params.id, req.body.userIds));

  app.get('/appraisals', { schema: { tags: ['Appraisals'], querystring: z.object({ tutorId: z.string().optional() }) } }, async (req) => appraisals.listAppraisals(requireUser(req), req.query));
  app.get('/appraisals/:id', { schema: { tags: ['Appraisals'], params: idParam } }, async (req) => appraisals.getAppraisal(requireUser(req), req.params.id));
  app.post('/appraisals', { onRequest: app.requirePermission('appraisal:manage'), schema: { tags: ['Appraisals'], body: CreateAppraisalSchema } }, async (req) => appraisals.createAppraisal(requireUser(req), req.body));
  app.patch('/appraisals/:id', { schema: { tags: ['Appraisals'], params: idParam, body: UpdateAppraisalSchema } }, async (req) => appraisals.updateAppraisal(requireUser(req), req.params.id, req.body));
  app.post('/appraisals/:id/generate', { onRequest: app.requirePermission('appraisal:manage'), schema: { tags: ['Appraisals'], params: idParam } }, async (req) => appraisals.requestGeneration(requireUser(req), req.params.id));
  app.delete('/appraisals/:id', { onRequest: app.requirePermission('appraisal:manage'), schema: { tags: ['Appraisals'], params: idParam } }, async (req) => {
    await appraisals.deleteAppraisal(requireUser(req), req.params.id);
    return { ok: true };
  });
};

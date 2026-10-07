import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UpdateSettingsSchema } from '@slc/shared';
import { requireUser } from '../plugins/auth.js';
import { listAudit, listNotifications, markRead } from '../services/notifications.service.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { loadAnalyses } from '../services/stats.service.js';
import { audit } from '../lib/audit.js';
import { loadConfig } from '../config.js';

export const systemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/notifications', { onRequest: app.authenticate, schema: { tags: ['System'] } }, async (req) => listNotifications(requireUser(req).id));
  app.post('/notifications/read', { onRequest: app.authenticate, schema: { tags: ['System'], body: z.object({ ids: z.union([z.array(z.string()), z.literal('all')]) }) } }, async (req) => {
    await markRead(requireUser(req).id, req.body.ids);
    return { ok: true };
  });

  app.get('/settings', { onRequest: app.authenticate, schema: { tags: ['System'] } }, async () => {
    const cfg = loadConfig();
    const s = await getSettings();
    return { ...s, providers: { storage: cfg.STORAGE_PROVIDER, transcription: cfg.TRANSCRIPTION_PROVIDER, llm: cfg.LLM_PROVIDER, email: cfg.EMAIL_PROVIDER } };
  });
  app.patch('/settings', { onRequest: app.requirePermission('settings:manage'), schema: { tags: ['System'], body: UpdateSettingsSchema } }, async (req) => updateSettings(requireUser(req).id, req.body));

  app.get('/audit', { onRequest: app.requirePermission('audit:read'), schema: { tags: ['System'], querystring: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50), action: z.string().optional(), entityType: z.string().optional(), actorId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) } }, async (req) => listAudit(req.query));

  /** CSV export of completed reviews for appraisal / KPI work in spreadsheets. */
  app.get('/export/reviews.csv', { onRequest: app.requirePermission('export:data'), schema: { tags: ['System'], querystring: z.object({ from: z.string().optional(), to: z.string().optional(), departmentId: z.string().optional(), tutorId: z.string().optional() }) } }, async (req, reply) => {
    const user = requireUser(req);
    const rows = await loadAnalyses({ from: req.query.from ? new Date(req.query.from) : undefined, to: req.query.to ? new Date(req.query.to) : undefined, departmentId: req.query.departmentId, tutorId: req.query.tutorId });
    const codes = [...new Set(rows.flatMap((r) => r.criteria.map((c) => c.code)))].sort();
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['meeting_id', 'title', 'meeting_date', 'tutor_id', 'score', 'grade', 'mandatory_coverage', 'learner_talk_share', ...codes].map(esc).join(',');
    const lines = rows.map((r) => [r.meetingId, r.title, r.meetingDate.toISOString().slice(0, 10), r.tutorId, r.score, r.grade, r.mandatoryCoverage, r.learnerTalkShare, ...codes.map((code) => r.criteria.find((c) => c.code === code)?.score ?? '')].map(esc).join(','));
    audit({ actorId: user.id, action: 'export.reviews_csv', entityType: 'system', metadata: { rows: rows.length } });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="meeting-reviews-${new Date().toISOString().slice(0, 10)}.csv"`);
    return [header, ...lines].join('\n');
  });
};

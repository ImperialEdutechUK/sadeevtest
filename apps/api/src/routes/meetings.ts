import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateCommentSchema, CreateMeetingSchema, MeetingsQuerySchema, ModerateAnalysisSchema, PresignFileSchema, UpdateMeetingSchema, UpdateSpeakersSchema } from '@slc/shared';
import { requireUser } from '../plugins/auth.js';
import * as meetings from '../services/meetings.service.js';
import { moderateAnalysis } from '../services/analysis.service.js';

const idParam = z.object({ id: z.string() });

export const meetingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/meetings', { schema: { tags: ['Meetings'], querystring: MeetingsQuerySchema } }, async (req) => meetings.listMeetings(requireUser(req), req.query));
  app.post('/meetings', { schema: { tags: ['Meetings'], body: CreateMeetingSchema } }, async (req) => meetings.createMeeting(requireUser(req), req.body));
  app.get('/meetings/:id', { schema: { tags: ['Meetings'], params: idParam } }, async (req) => meetings.getMeeting(requireUser(req), req.params.id));
  app.patch('/meetings/:id', { schema: { tags: ['Meetings'], params: idParam, body: UpdateMeetingSchema } }, async (req) => meetings.updateMeeting(requireUser(req), req.params.id, req.body));
  app.delete('/meetings/:id', { schema: { tags: ['Meetings'], params: idParam } }, async (req) => {
    await meetings.deleteMeeting(requireUser(req), req.params.id);
    return { ok: true };
  });

  app.post('/meetings/:id/files/presign', { schema: { tags: ['Meetings'], params: idParam, body: PresignFileSchema } }, async (req) => meetings.presignFile(requireUser(req), req.params.id, req.body));
  app.post('/meetings/:id/files/:fileId/complete', { schema: { tags: ['Meetings'], params: z.object({ id: z.string(), fileId: z.string() }) } }, async (req) => meetings.completeFile(requireUser(req), req.params.id, req.params.fileId));
  app.delete('/meetings/:id/files/:fileId', { schema: { tags: ['Meetings'], params: z.object({ id: z.string(), fileId: z.string() }) } }, async (req) => {
    await meetings.removeFile(requireUser(req), req.params.id, req.params.fileId);
    return { ok: true };
  });
  app.get('/meetings/:id/files/:fileId/download', { schema: { tags: ['Meetings'], params: z.object({ id: z.string(), fileId: z.string() }) } }, async (req) => meetings.downloadUrl(requireUser(req), req.params.id, req.params.fileId));

  app.post('/meetings/:id/submit', { schema: { tags: ['Meetings'], params: idParam } }, async (req) => meetings.submitMeeting(requireUser(req), req.params.id));
  app.post('/meetings/:id/reanalyse', { schema: { tags: ['Meetings'], params: idParam } }, async (req) => meetings.reanalyseMeeting(requireUser(req), req.params.id));

  app.get('/meetings/:id/transcript', { schema: { tags: ['Meetings'], params: idParam } }, async (req) => meetings.getTranscript(requireUser(req), req.params.id));
  app.patch('/meetings/:id/transcript/speakers', { schema: { tags: ['Meetings'], params: idParam, body: UpdateSpeakersSchema } }, async (req) => meetings.updateSpeakers(requireUser(req), req.params.id, req.body.speakerMap, req.body.reanalyse));

  app.get('/meetings/:id/comments', { schema: { tags: ['Meetings'], params: idParam } }, async (req) => meetings.listComments(requireUser(req), req.params.id));
  app.post('/meetings/:id/comments', { onRequest: app.requirePermission('analysis:comment', 'meeting:read:any'), schema: { tags: ['Meetings'], params: idParam, body: CreateCommentSchema } }, async (req) => meetings.addComment(requireUser(req), req.params.id, req.body.body));

  app.post('/analyses/:id/moderate', { onRequest: app.requirePermission('analysis:moderate'), schema: { tags: ['Meetings'], params: idParam, body: ModerateAnalysisSchema } }, async (req) => moderateAnalysis(requireUser(req), req.params.id, req.body));
};

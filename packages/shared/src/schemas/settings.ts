import { z } from 'zod';

export const SettingsSchema = z.object({
  collegeName: z.string().min(1).max(120),
  llmModel: z.string().min(1).max(120),
  retentionDaysRecordings: z.number().int().min(0).max(3650),
  retentionDaysTranscripts: z.number().int().min(0).max(3650),
  redactLearnerNames: z.boolean(),
  allowTutorSelfUpload: z.boolean(),
  emailNotifications: z.boolean(),
  transcriptionLanguage: z.string().min(2).max(10),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const UpdateSettingsSchema = SettingsSchema.partial();

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const AuditLogItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

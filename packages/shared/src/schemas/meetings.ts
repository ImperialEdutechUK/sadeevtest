import { z } from 'zod';
import { FILE_KINDS, MEETING_STATUSES, MEETING_TYPES, SPEAKER_ROLES } from '../enums.js';

export const CreateMeetingSchema = z.object({
  title: z.string().min(1, 'Give the meeting a title').max(160),
  meetingType: z.enum(MEETING_TYPES).default('INDUCTION'),
  tutorId: z.string().min(1).optional(), // defaults to the current user
  learnerReference: z.string().min(1, 'Enter the learner reference or ID').max(60),
  learnerFirstName: z.string().max(60).nullable().optional(),
  programme: z.string().max(160).nullable().optional(),
  meetingDate: z.string().min(1, 'Enter the meeting date'),
  rubricId: z.string().min(1).optional(), // defaults to the default rubric for the type
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateMeetingInput = z.infer<typeof CreateMeetingSchema>;

export const UpdateMeetingSchema = CreateMeetingSchema.partial();

export const MeetingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  tutorId: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  meetingType: z.enum(MEETING_TYPES).optional(),
  search: z.string().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
});
export type MeetingsQuery = z.infer<typeof MeetingsQuerySchema>;

export const PresignFileSchema = z.object({
  kind: z.enum(FILE_KINDS),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(1),
});
export type PresignFileInput = z.infer<typeof PresignFileSchema>;

export const CompleteFileSchema = z.object({
  fileId: z.string().min(1),
});

export const UpdateSpeakersSchema = z.object({
  speakerMap: z.record(z.string(), z.enum(SPEAKER_ROLES)),
  reanalyse: z.boolean().default(false),
});

export const MeetingFileSchema = z.object({
  id: z.string(),
  kind: z.enum(FILE_KINDS),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  status: z.enum(['PENDING', 'UPLOADED', 'PROCESSED', 'FAILED', 'DELETED']),
  extractedChars: z.number().nullable(),
  createdAt: z.string(),
});
export type MeetingFile = z.infer<typeof MeetingFileSchema>;

export const MeetingListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  meetingType: z.enum(MEETING_TYPES),
  status: z.enum(MEETING_STATUSES),
  meetingDate: z.string(),
  learnerReference: z.string(),
  learnerFirstName: z.string().nullable(),
  programme: z.string().nullable(),
  tutor: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), avatarUrl: z.string().nullable() }),
  rubric: z.object({ id: z.string(), name: z.string() }),
  overallScore: z.number().nullable(),
  moderatedScore: z.number().nullable(),
  grade: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MeetingListItem = z.infer<typeof MeetingListItemSchema>;

export const ProcessingStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(['done', 'active', 'pending', 'failed', 'skipped']),
  detail: z.string().nullable(),
  at: z.string().nullable(),
});
export type ProcessingStep = z.infer<typeof ProcessingStepSchema>;

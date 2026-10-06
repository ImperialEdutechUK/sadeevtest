export const MEETING_STATUSES = [
  'DRAFT',
  'QUEUED',
  'TRANSCRIBING',
  'EXTRACTING',
  'ANALYSING',
  'READY',
  'FAILED',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  DRAFT: 'Draft - not yet submitted',
  QUEUED: 'Waiting to start',
  TRANSCRIBING: 'Transcribing the recording',
  EXTRACTING: 'Reading the documents',
  ANALYSING: 'Reviewing against the criteria',
  READY: 'Report ready',
  FAILED: 'Something went wrong',
};

export const MEETING_TYPES = [
  'INDUCTION',
  'PROGRESS_REVIEW',
  'ONE_TO_ONE',
  'EXIT_INTERVIEW',
  'OTHER',
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];
export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  INDUCTION: 'Induction meeting',
  PROGRESS_REVIEW: 'Progress review',
  ONE_TO_ONE: 'One-to-one tutorial',
  EXIT_INTERVIEW: 'Exit interview',
  OTHER: 'Other meeting',
};

export const FILE_KINDS = [
  'RECORDING',
  'TRANSCRIPT',
  'LEARNER_BOOKLET',
  'PRESENTATION',
  'OTHER',
] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABELS: Record<FileKind, string> = {
  RECORDING: 'Meeting recording',
  TRANSCRIPT: 'Meeting transcript',
  LEARNER_BOOKLET: 'Learner information booklet',
  PRESENTATION: 'Presentation used in the meeting',
  OTHER: 'Other supporting document',
};

export const SPEAKER_ROLES = ['TUTOR', 'LEARNER', 'OTHER'] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const KPI_METRICS = [
  'AVERAGE_SCORE',
  'MEETINGS_REVIEWED',
  'MANDATORY_COVERAGE',
  'LEARNER_TALK_SHARE',
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];
export const KPI_METRIC_LABELS: Record<KpiMetric, string> = {
  AVERAGE_SCORE: 'Average meeting score (0-100)',
  MEETINGS_REVIEWED: 'Number of meetings reviewed',
  MANDATORY_COVERAGE: 'Essential items covered (%)',
  LEARNER_TALK_SHARE: 'Learner talk share (%)',
};

export const COMPETITION_STATUSES = ['UPCOMING', 'ACTIVE', 'CLOSED'] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const APPRAISAL_STATUSES = ['DRAFT', 'GENERATED', 'SHARED', 'LOCKED'] as const;
export type AppraisalStatus = (typeof APPRAISAL_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'ANALYSIS_READY',
  'ANALYSIS_FAILED',
  'COMMENT_ADDED',
  'MODERATED',
  'APPRAISAL_SHARED',
  'COMPETITION_STARTED',
  'WELCOME',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

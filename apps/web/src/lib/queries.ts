import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type {
  Analysis,
  Appraisal,
  Comment,
  Competition,
  DashboardSummary,
  KpiProgress,
  MeetingFile,
  MeetingListItem,
  Notification,
  Paginated,
  PeopleListItem,
  PersonPerformance,
  ProcessingStep,
  Rubric,
  Settings,
  Transcript,
  UserSummary,
} from '@slc/shared';
import { del, get, patch, post, qs } from './api';

export interface MeetingDetail extends MeetingListItem {
  notes: string | null;
  createdBy: { id: string; firstName: string; lastName: string };
  submittedAt: string | null;
  completedAt: string | null;
  statusLabel: string;
  files: MeetingFile[];
  hasTranscript: boolean;
  steps: ProcessingStep[];
  analysis: Analysis | null;
  permissions: { canModerate: boolean; canEdit: boolean; canReanalyse: boolean; canDelete: boolean };
}

export const keys = {
  dashboard: (p: Record<string, string | undefined>) => ['dashboard', p] as const,
  meetings: (p: Record<string, unknown>) => ['meetings', p] as const,
  meeting: (id: string) => ['meeting', id] as const,
  transcript: (id: string) => ['transcript', id] as const,
  comments: (id: string) => ['comments', id] as const,
  rubrics: ['rubrics'] as const,
  rubric: (id: string) => ['rubric', id] as const,
  people: (p: Record<string, string | undefined>) => ['people', p] as const,
  person: (id: string, p: Record<string, string | undefined>) => ['person', id, p] as const,
  users: (p: Record<string, string | boolean | undefined>) => ['users', p] as const,
  departments: ['departments'] as const,
  kpis: ['kpis'] as const,
  competitions: ['competitions'] as const,
  competition: (id: string) => ['competition', id] as const,
  appraisals: (p: Record<string, string | undefined>) => ['appraisals', p] as const,
  appraisal: (id: string) => ['appraisal', id] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
  audit: (p: Record<string, unknown>) => ['audit', p] as const,
};

const BUSY = new Set(['QUEUED', 'TRANSCRIBING', 'EXTRACTING', 'ANALYSING']);

export const useDashboard = (p: { from?: string; to?: string; departmentId?: string } = {}) => useQuery({ queryKey: keys.dashboard(p), queryFn: () => get<DashboardSummary>(`/dashboard${qs(p)}`) });

export const useMeetings = (p: Record<string, string | number | undefined>) => useQuery({ queryKey: keys.meetings(p), queryFn: () => get<Paginated<MeetingListItem>>(`/meetings${qs(p)}`), placeholderData: (prev) => prev });

export const useMeeting = (id: string | undefined, opts: Partial<UseQueryOptions<MeetingDetail>> = {}) =>
  useQuery({
    queryKey: keys.meeting(id ?? ''),
    queryFn: () => get<MeetingDetail>(`/meetings/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && BUSY.has(q.state.data.status) ? 3000 : false),
    ...opts,
  });

export const useTranscript = (id: string | undefined, enabled = true) => useQuery({ queryKey: keys.transcript(id ?? ''), queryFn: () => get<Transcript>(`/meetings/${id}/transcript`), enabled: !!id && enabled });
export const useComments = (id: string | undefined) => useQuery({ queryKey: keys.comments(id ?? ''), queryFn: () => get<Comment[]>(`/meetings/${id}/comments`), enabled: !!id });

export const useRubrics = (includeInactive = false) => useQuery({ queryKey: [...keys.rubrics, includeInactive], queryFn: () => get<Rubric[]>(`/rubrics${qs({ includeInactive: includeInactive || undefined })}`) });
export const useRubric = (id: string | undefined) => useQuery({ queryKey: keys.rubric(id ?? ''), queryFn: () => get<Rubric>(`/rubrics/${id}`), enabled: !!id });

export const usePeople = (p: { departmentId?: string; search?: string; from?: string; to?: string } = {}) => useQuery({ queryKey: keys.people(p), queryFn: () => get<PeopleListItem[]>(`/people${qs(p)}`) });
export const usePerson = (id: string | undefined, p: { from?: string; to?: string } = {}) => useQuery({ queryKey: keys.person(id ?? '', p), queryFn: () => get<PersonPerformance>(`/users/${id}/performance${qs(p)}`), enabled: !!id });
export const useUsers = (p: { role?: string; departmentId?: string; search?: string; includeInactive?: boolean } = {}, enabled = true) => useQuery({ queryKey: keys.users(p), queryFn: () => get<UserSummary[]>(`/users${qs(p)}`), enabled });
export const useDepartments = () => useQuery({ queryKey: keys.departments, queryFn: () => get<{ id: string; name: string }[]>('/departments'), staleTime: 5 * 60_000 });

export const useKpis = (includeInactive = false) => useQuery({ queryKey: [...keys.kpis, includeInactive], queryFn: () => get<KpiProgress[]>(`/kpis${qs({ includeInactive: includeInactive || undefined })}`) });
export const useCompetitions = () => useQuery({ queryKey: keys.competitions, queryFn: () => get<Competition[]>('/competitions') });
export const useCompetition = (id: string | undefined) => useQuery({ queryKey: keys.competition(id ?? ''), queryFn: () => get<Competition>(`/competitions/${id}`), enabled: !!id });
export const useAppraisals = (p: { tutorId?: string } = {}) => useQuery({ queryKey: keys.appraisals(p), queryFn: () => get<Appraisal[]>(`/appraisals${qs(p)}`) });
export const useAppraisal = (id: string | undefined) =>
  useQuery({ queryKey: keys.appraisal(id ?? ''), queryFn: () => get<Appraisal>(`/appraisals/${id}`), enabled: !!id, refetchInterval: (q) => (q.state.data && q.state.data.status === 'DRAFT' && !q.state.data.narrative ? 4000 : false) });

export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => get<{ items: Notification[]; unread: number }>('/notifications'), refetchInterval: 30_000 });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => get<Settings & { providers: Record<string, string> }>('/settings') });

/** Generic mutation helper that invalidates the given query prefixes on success. */
export function useApiMutation<TInput, TOut>(fn: (input: TInput) => Promise<TOut>, invalidate: readonly (readonly unknown[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k as unknown[] })));
    },
  });
}

export const mutations = {
  createMeeting: (body: unknown) => post<MeetingListItem>('/meetings', body),
  updateMeeting: (id: string, body: unknown) => patch<MeetingListItem>(`/meetings/${id}`, body),
  deleteMeeting: (id: string) => del(`/meetings/${id}`),
  submitMeeting: (id: string) => post<MeetingDetail>(`/meetings/${id}/submit`),
  reanalyse: (id: string) => post<MeetingDetail>(`/meetings/${id}/reanalyse`),
  removeFile: (meetingId: string, fileId: string) => del(`/meetings/${meetingId}/files/${fileId}`),
  downloadFile: (meetingId: string, fileId: string) => get<{ url: string; fileName: string }>(`/meetings/${meetingId}/files/${fileId}/download`),
  updateSpeakers: (id: string, body: unknown) => patch(`/meetings/${id}/transcript/speakers`, body),
  addComment: (id: string, body: string) => post<Comment>(`/meetings/${id}/comments`, { body }),
  moderate: (analysisId: string, body: unknown) => post<Analysis>(`/analyses/${analysisId}/moderate`, body),
  createRubric: (body: unknown) => post<Rubric>('/rubrics', body),
  updateRubric: (id: string, body: unknown) => patch<Rubric>(`/rubrics/${id}`, body),
  cloneRubric: (id: string, name?: string) => post<Rubric>(`/rubrics/${id}/clone`, { name }),
  deleteRubric: (id: string) => del<{ archived: boolean }>(`/rubrics/${id}`),
  inviteUser: (body: unknown) => post<{ inviteLink: string; email: string }>('/users/invite', body),
  updateUser: (id: string, body: unknown) => patch<UserSummary>(`/users/${id}`, body),
  resetPassword: (userId: string) => post<{ temporaryPassword: string }>('/users/reset-password', { userId }),
  updateProfile: (body: unknown) => patch<UserSummary>('/me/profile', body),
  changePassword: (body: unknown) => post('/auth/change-password', body),
  createDepartment: (name: string) => post<{ id: string; name: string }>('/departments', { name }),
  createKpi: (body: unknown) => post<KpiProgress>('/kpis', body),
  updateKpi: (id: string, body: unknown) => patch<KpiProgress>(`/kpis/${id}`, body),
  deleteKpi: (id: string) => del(`/kpis/${id}`),
  createCompetition: (body: unknown) => post<Competition>('/competitions', body),
  updateCompetition: (id: string, body: unknown) => patch<Competition>(`/competitions/${id}`, body),
  deleteCompetition: (id: string) => del(`/competitions/${id}`),
  joinCompetition: (id: string) => post<Competition>(`/competitions/${id}/join`),
  leaveCompetition: (id: string) => post<Competition>(`/competitions/${id}/leave`),
  addParticipants: (id: string, userIds: string[]) => post<Competition>(`/competitions/${id}/participants`, { userIds }),
  createAppraisal: (body: unknown) => post<Appraisal>('/appraisals', body),
  updateAppraisal: (id: string, body: unknown) => patch<Appraisal>(`/appraisals/${id}`, body),
  generateAppraisal: (id: string) => post(`/appraisals/${id}/generate`),
  deleteAppraisal: (id: string) => del(`/appraisals/${id}`),
  markNotificationsRead: (ids: string[] | 'all') => post('/notifications/read', { ids }),
  updateSettings: (body: unknown) => patch<Settings>('/settings', body),
};

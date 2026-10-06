# Meeting Review - HTTP API reference

The API is a Fastify application mounted under `/api`. In production the web app and API share one hostname (`https://<domain>/api/...`); locally the API listens on `http://localhost:4000` and the Vite dev server proxies `/api` to it. Every route, schema and permission below is taken from `apps/api/src/routes/*.ts` and the Zod schemas in `packages/shared/src/schemas/*.ts`.

A live, generated OpenAPI document with a Swagger UI is available at **`/api/docs`** whenever `NODE_ENV` is not `production`. It is built from the same Zod schemas and is the authoritative description of request bodies; this page adds permissions, behaviour and a worked example.

## Conventions

- **Content type**: JSON in and out (`Content-Type: application/json`). An empty body is accepted on JSON requests and treated as `{}` (so `POST .../submit` needs no payload).
- **IDs** are opaque strings (cuids). **Dates and times** are ISO 8601 strings in UTC; date-only inputs such as `meetingDate`, `periodStart`, `from`/`to` accept anything `new Date()` can parse (`YYYY-MM-DD` recommended).
- **Pagination**: endpoints that page return `{ items: T[], total, page, pageSize }`. Query parameters `page` (default 1) and `pageSize` (default 20, max 100; the audit log defaults to 50).
- **Permissions**: shown per endpoint as the `requirePermission(...)` list from the route (any one of the listed permissions is enough) plus any ownership rule applied by the service. "authenticated" means any signed-in user. The role-to-permission matrix is in [architecture.md](architecture.md#6-authentication-and-security).
- **Rate limits**: 300 requests per minute per client across the API (`/api/health` exempt); `POST /auth/login` and `POST /auth/accept-invite` are limited to 10 per minute. Exceeding a limit returns HTTP 429 from `@fastify/rate-limit` (its default body is `{ statusCode, error, message }`).

### Error format

Application errors return:

```json
{ "error": "CODE", "message": "Human-readable explanation", "issues": [ { "path": "field.name", "message": "..." } ] }
```

| HTTP | `error` | When |
| --- | --- | --- |
| 400 | `VALIDATION` | A request body, query or params failed the Zod schema. `issues` lists each problem; `message` repeats the first one with its path. |
| 400 | `BAD_REQUEST` | A business rule failed (for example submitting without a recording or transcript). May carry `details`. |
| 400 | `REQUEST_ERROR` | Other 4xx raised by Fastify (malformed JSON, body too large, and so on). |
| 401 | `UNAUTHORIZED` | Not signed in, token expired, or wrong credentials on login. |
| 403 | `FORBIDDEN` | Missing permission, not the owner, or a cookie-authenticated write without an allowed `Origin` header ("Request blocked: origin not allowed"). |
| 403 | `INACTIVE` | Login to a deactivated account. |
| 404 | `NOT_FOUND` | Unknown route or an item outside the caller's scope (meetings the caller may not see are reported as not found). |
| 409 | `CONFLICT` | Inviting an email that already has an account. |
| 500 | `SERIALIZATION` | The server produced a response that did not match its own schema. |
| 500 | `INTERNAL` | Unhandled error (details are in the server log, not the response). |

## Authentication

Authentication is cookie-based for the browser and bearer-based for everything else; both are checked on every request by the auth plugin.

1. `POST /api/auth/login` with `{ email, password }` sets two `httpOnly` cookies: `mr_access` (an HS256 JWT, path `/`, lifetime `ACCESS_TOKEN_MINUTES`, default 30 minutes) and `mr_refresh` (an opaque token, path `/api/auth`, lifetime `REFRESH_TOKEN_DAYS`, default 14 days). The JSON response also contains the same access token as `accessToken`.
2. Browser clients send the cookies automatically (`credentials: 'include'`). On a 401 the web app calls `POST /api/auth/refresh` once and replays the request; refresh rotates the refresh token.
3. Non-browser clients send `Authorization: Bearer <accessToken>`. A bearer token is accepted on every route and takes precedence over the cookie.
4. **CSRF**: when the cookie is used for a non-GET request, the `Origin` header (or the origin of `Referer`) must match the origin of `WEB_ORIGIN` or `API_PUBLIC_URL` (loopback origins are also accepted outside production). Bearer requests skip this check, which is why the curl walkthrough below uses the bearer token.
5. A user with `mustChangePassword = true` (temporary password from an admin reset) is still authenticated; the web app routes them to the change-password screen.

### Auth endpoints (tag: Auth)

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `POST /api/auth/login` | public (10/min) | `{ email, password }` (`LoginSchema`) | `{ user: UserSummary, accessToken }`; sets cookies; updates `lastLoginAt`; audit `auth.login` / `auth.login_failed`. 401 on bad credentials, 403 `INACTIVE` on a deactivated account. |
| `POST /api/auth/refresh` | refresh cookie | - | `{ user, accessToken }`; revokes the used refresh token and issues a new pair. 401 `Session expired` (and cookies cleared) if the token is missing, revoked, expired or the user is inactive. |
| `POST /api/auth/logout` | cookie (optional) | - | `{ ok: true }`; revokes the refresh token and clears both cookies. |
| `GET /api/auth/me` | authenticated | - | `UserSummary` for the caller. |
| `GET /api/auth/invite?token=` | public | `token` (min 10 chars) | `{ email, firstName, lastName, role }` for a valid, unaccepted, unexpired invitation; 400 otherwise. |
| `POST /api/auth/accept-invite` | public (10/min) | `{ token, firstName, lastName, password }` (`AcceptInviteSchema`; password >= 10 chars mixing lower case with capitals or digits) | `{ user, accessToken }`; creates (or re-activates) the user, marks the invitation accepted, creates a `WELCOME` notification and signs the user in. |
| `POST /api/auth/change-password` | authenticated | `{ currentPassword, newPassword }` | `{ ok: true }`; clears `mustChangePassword`; revokes all refresh tokens. |

`UserSummary`: `{ id, email, firstName, lastName, role, jobTitle, avatarUrl, departmentId, departmentName, isActive, mustChangePassword, bio?, createdAt, lastLoginAt }`.

## Users and departments (tag: Users)

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/users` | `people:read`, `user:invite` or `meeting:create:any` | query `role?`, `departmentId?`, `search?` (name or email, case-insensitive), `includeInactive?` | `UserSummary[]` sorted by last name; active users only unless `includeInactive` is present. |
| `POST /api/users/invite` | `user:invite` or `user:manage` | `{ email, firstName, lastName, role, departmentId?, jobTitle? }` (`InviteUserSchema`) | `{ inviteLink, email }`. The inviter may only assign roles at or below their own rank and never `SYSTEM_ADMIN` unless they are one. Sends an email through the configured provider (or logs it) and returns the link so it can be copied. 409 if the email already has a password. Invitations expire after 7 days. |
| `PATCH /api/users/:id` | `user:manage` or `people:manage` | `{ firstName?, lastName?, role?, departmentId?, jobTitle?, isActive? }` (`UpdateUserSchema`) | `UserSummary`. Role changes are rank-checked for both the old and new role. Deactivating (`isActive: false`) revokes the user's refresh tokens; you cannot deactivate yourself. |
| `POST /api/users/reset-password` | `user:manage` | `{ userId }` | `{ temporaryPassword }`; sets `mustChangePassword`, revokes refresh tokens, emails the temporary password (failures are logged, not raised). Rank-checked. |
| `GET /api/users/:id` | authenticated | - | `UserSummary` for any user. |
| `GET /api/users/:id/performance` | authenticated; own profile or `people:read` | query `from?`, `to?` (default: last 365 days) | `PersonPerformance`: user card, `meetingCount` (all uploaded), `readyCount`, `averageScore`, `departmentAverage`, `collegeAverage`, `mandatoryCoverage`, `learnerTalkShare`, `trend[]` (one point per reviewed meeting), `criteriaAverages[]` (with `collegeAverage` per code), `recentMeetings[]` (8), `kpis[]` that apply to the person (personal, department or college-wide). |
| `PATCH /api/me/profile` | authenticated | `{ firstName?, lastName?, jobTitle?, bio?, departmentId?, avatarUrl?, emailNotifications? }` (`UpdateProfileSchema`) | `UserSummary`; audit `profile.updated`. |
| `GET /api/departments` | authenticated | - | `{ id, name }[]` sorted by name. |
| `POST /api/departments` | `user:manage` or `people:manage` | `{ name }` | `{ id, name }` (upsert by name). |

## Criteria sets / rubrics (tag: Criteria)

Schemas: `GradeBandSchema { min 0-100, label, colour, description }`, `CriterionInputSchema { code (<=12 chars, stored upper-case), title, description, weight 0.25-5 (default 1), isMandatory, descriptors { '1','3','5' }, frameworkRefs[] (<=6 of { framework, note }), order? }`, `CategoryInputSchema { id?, name, description, order?, criteria[] (each may carry an `id` when updating) }`.

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/rubrics` | `rubric:read` | query `includeInactive?` | `Rubric[]`, defaults first then by name. |
| `GET /api/rubrics/:id` | `rubric:read` | - | `Rubric` (categories with non-archived criteria, `criteriaCount`, `version`, `isPreset`, `isActive`, `isDefault`, `gradeBands`). |
| `POST /api/rubrics` | `rubric:manage` | `{ name, description?, meetingType (default INDUCTION), gradeBands? (2-6, defaults to DEFAULT_GRADE_BANDS), categories[] }` (`CreateRubricSchema`) | `Rubric`. Codes must be unique within the set and at least one criterion is required. |
| `PATCH /api/rubrics/:id` | `rubric:manage` | any of `name, description, meetingType, isActive, isDefault, gradeBands, categories` (`UpdateRubricSchema`) | `Rubric`. Supplying `categories` bumps `version`, updates criteria by `id`, creates those without an id, deletes removed criteria that were never scored and archives the rest. `isDefault: true` clears the default flag on other sets of the same meeting type. |
| `POST /api/rubrics/:id/clone` | `rubric:manage` | `{ name? }` (optional body) | New `Rubric` copied from the source (name defaults to `<name> (copy)`), never preset, not default. |
| `DELETE /api/rubrics/:id` | `rubric:manage` | - | `{ archived: true }` when any meeting uses the set (it is deactivated instead), `{ archived: false }` when it was deleted. |

## Meetings (tag: Meetings)

All meeting routes require authentication. Visibility: callers with `meeting:read:any` see every meeting; everyone else only meetings where they are the tutor or the uploader. A meeting outside the caller's scope is reported as 404.

### Meetings

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/meetings` | authenticated (scoped) | query `page`, `pageSize`, `tutorId?`, `departmentId?`, `status?`, `meetingType?`, `search?` (title, learner reference, programme, tutor name), `from?`, `to?`, `sort` = `newest` (default) / `oldest` / `highest` / `lowest` (`MeetingsQuerySchema`) | Paginated `MeetingListItem`. Score sorting is applied within the returned page. |
| `POST /api/meetings` | `meeting:create:own` (self) or `meeting:create:any` (another tutor) | `{ title, meetingType?, tutorId?, learnerReference, learnerFirstName?, programme?, meetingDate, rubricId?, notes? }` (`CreateMeetingSchema`) | `MeetingListItem` in status `DRAFT`. 403 if a `TUTOR` self-uploads while `allowTutorSelfUpload` is off. `rubricId` defaults to the active default set for the meeting type; it must be active. |
| `GET /api/meetings/:id` | scoped | - | `MeetingDetail`: everything in `MeetingListItem` plus `notes`, `createdBy`, `submittedAt`, `completedAt`, `statusLabel`, `files[]` (`MeetingFile`), `hasTranscript`, `steps[]` (`ProcessingStep { key, label, state: done/active/pending/failed/skipped, detail, at }`), `analysis` (`Analysis` or null) and `permissions { canModerate, canEdit, canReanalyse, canDelete }`. |
| `PATCH /api/meetings/:id` | owner (tutor or uploader) or `meeting:delete:any` | partial `CreateMeetingSchema` | `MeetingListItem`. `tutorId` is only applied for callers with `meeting:create:any`. |
| `DELETE /api/meetings/:id` | owner with `meeting:delete:own`, or `meeting:delete:any` | - | `{ ok: true }`. Deletes stored files and the row (cascades to files, transcript, analyses and comments). |
| `POST /api/meetings/:id/submit` | scoped | - | `MeetingDetail` (status `QUEUED`). Only from `DRAFT` or `FAILED`; requires an uploaded `RECORDING` or `TRANSCRIPT`. |
| `POST /api/meetings/:id/reanalyse` | owner or `meeting:reanalyse` | - | `MeetingDetail` (status `QUEUED`). Only from `READY` or `FAILED`. Re-runs the model on the existing transcript (or the whole pipeline if there is none). |

`MeetingListItem`: `{ id, title, meetingType, status, meetingDate, learnerReference, learnerFirstName, programme, tutor { id, firstName, lastName, avatarUrl }, rubric { id, name }, overallScore, moderatedScore, grade, durationSeconds, failureReason, createdAt, updatedAt }` (scores are null until the current analysis is `COMPLETE`).

### Files

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `POST /api/meetings/:id/files/presign` | scoped; meeting must be `DRAFT`, `FAILED` or `READY` | `{ kind: RECORDING / TRANSCRIPT / LEARNER_BOOKLET / PRESENTATION / OTHER, fileName, mimeType?, sizeBytes }` (`PresignFileSchema`) | `{ fileId, uploadUrl, method: 'PUT', headers: { 'Content-Type' }, expiresInSeconds: 3600 }`. Validates the extension (`ACCEPTED_EXTENSIONS`) and size (4 GB recordings, 50 MB documents). Replaces any existing file of the same kind except `OTHER`. The file record starts as `PENDING`. |
| `PUT <uploadUrl>` | signed URL | raw bytes with the returned headers | S3 presigned PUT in production; `/api/uploads/put` with local storage (see below). |
| `POST /api/meetings/:id/files/:fileId/complete` | scoped | - | `MeetingFile { id, kind, fileName, mimeType, sizeBytes, status: 'UPLOADED', extractedChars, createdAt }`. 400 if the object is not in storage. |
| `DELETE /api/meetings/:id/files/:fileId` | scoped; same status rule as presign | - | `{ ok: true }`. |
| `GET /api/meetings/:id/files/:fileId/download` | scoped | - | `{ url, fileName, expiresInSeconds: 900 }`; audit `file.downloaded`. |

Accepted extensions: recordings `.mp4 .m4a .mp3 .wav .webm .mov .ogg .flac .amr`; transcripts `.vtt .srt .txt .docx .json` (Amazon Transcribe JSON); learner booklet `.pdf .docx .txt .md`; presentation `.pptx .pdf`; other `.pdf .docx .txt .md .pptx`.

### Transcript, comments and moderation

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/meetings/:id/transcript` | scoped | - | `Transcript { id, source: AWS_TRANSCRIBE / UPLOADED / MOCK, language, wordCount, segments[] { start, end, speaker, text }, speakerMap { label: TUTOR/LEARNER/OTHER }, speakerLabels[], createdAt }`; 404 until a transcript exists. |
| `PATCH /api/meetings/:id/transcript/speakers` | owner or `meeting:reanalyse` | `{ speakerMap: { label: role }, reanalyse?: boolean }` (`UpdateSpeakersSchema`) | `{ metrics }` recomputed for the current analysis; the map is marked manual so later analyses keep it. With `reanalyse: true` the review is queued again. |
| `GET /api/meetings/:id/comments` | scoped | - | `Comment[] { id, body, createdAt, author { id, firstName, lastName, avatarUrl, role } }` oldest first. |
| `POST /api/meetings/:id/comments` | `analysis:comment` or `meeting:read:any` (and scoped) | `{ body }` (1-3000 chars) | `Comment`. Notifies the tutor and uploader (`COMMENT_ADDED`) unless they are the author. |
| `POST /api/analyses/:id/moderate` | `analysis:moderate` | `{ note (5-2000 chars), criteria: [ { criterionResultId, moderatedScore: 1-5 or null, moderationNote? } ] }` (`ModerateAnalysisSchema`) | The updated current `Analysis`. Only `COMPLETE` analyses. `null` removes a moderated score. Recomputes `moderatedOverallScore`, `mandatoryCoverage` and `grade`; records a `Moderation`; notifies the tutor (`MODERATED`). |

`Analysis` (see `AnalysisSchema`): `{ id, meetingId, status, model, provider, promptVersion, rubricId, rubricName, rubricVersion, gradeBands[], overallScore, moderatedOverallScore, effectiveOverallScore, grade, mandatoryCoverage, summary, learnerExperience, strengths[], improvements[], actionPlan[] { action, why, priority }, risks[] { type, note, startSeconds }, materialsCoverage[] { topic, covered, note }, metrics, confidence, confidenceReason, inputsUsed[], tokenUsage, scoreBreakdown, criteria[] (CriterionResult), moderation { moderatorName, note, createdAt } | null, error, startedAt, completedAt }`. `CriterionResult`: `{ id, criterionId, code, title, description, categoryName, weight, isMandatory, descriptors, frameworkRefs[], score, notApplicable, rationale, evidence[] { quote, startSeconds, speaker }, suggestion, moderatedScore, moderationNote, effectiveScore }`.

## Dashboard and people (tag: Dashboard)

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/dashboard` | authenticated | query `from?`, `to?` (default last 90 days), `departmentId?` (only honoured for callers with `meeting:read:any`) | `DashboardSummary { scope: 'ME' / 'ALL', periodLabel, totals { meetings, ready, inProgress, failed, averageScore, previousAverageScore, mandatoryCoverage, learnerTalkShare, activeTutors }, gradeDistribution[], trend[] (6 months), criteriaHotspots[] (4 lowest), topStrengths[] (3 highest), recentMeetings[] (6), departmentLeaderboard[]? (ALL scope only), onboarding { profileComplete, hasMeeting, hasReport } }`. |
| `GET /api/people` | authenticated | query `departmentId?`, `search?`, `from?`, `to?` (default last 365 days) | `PeopleListItem[]` for active users in reviewable roles (Tutor, Academic admin, Academic manager): `{ id, names, email, role, jobTitle, avatarUrl, departmentName, departmentId, isActive, meetingCount, averageScore, lastMeetingAt, trendDelta }`. Callers without `people:read` only get themselves. `trendDelta` compares the newer half of a person's reviews with the older half and needs at least 4. |

## KPIs (tag: KPIs)

`CreateKpiSchema`: `{ name, metric: AVERAGE_SCORE / MEETINGS_REVIEWED / MANDATORY_COVERAGE / LEARNER_TALK_SHARE, target (0-100000), comparison: AT_LEAST (default) / AT_MOST, periodStart, periodEnd, departmentId?, userId?, description? }`. A KPI with `userId` is personal, with `departmentId` departmental, otherwise college-wide.

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/kpis` | authenticated | query `includeInactive?` | `KpiProgress[]`. Callers without `kpi:read` see only KPIs that apply to them (personal, their department, or college-wide) and progress computed from their own meetings. |
| `GET /api/kpis/:id` | authenticated | - | `KpiProgress { ...kpi, departmentName, userName, current, progressPct, met, sampleSize, perTutor[]? { userId, name, value, met, sampleSize } }`. For team KPIs `perTutor` lists every active reviewable user in scope. |
| `POST /api/kpis` | `kpi:manage` | `CreateKpiSchema` | `KpiProgress`. Period end must not be before the start. |
| `PATCH /api/kpis/:id` | `kpi:manage` | partial `CreateKpiSchema` + `isActive?` | `KpiProgress`. |
| `DELETE /api/kpis/:id` | `kpi:manage` | - | `{ ok: true }`. |

## Competitions (tag: Competitions)

`CreateCompetitionSchema`: `{ name, description (default ''), metric (default AVERAGE_SCORE), rubricId?, departmentId?, startDate, endDate, minMeetings (1-100, default 3), prize?, autoEnrol (default false) }`.

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/competitions` | `competition:read` | - | `Competition[]` without standings: `{ id, name, description, metric, rubricId, rubricName, departmentId, departmentName, startDate, endDate, minMeetings, prize, status: UPCOMING / ACTIVE / CLOSED (derived from the dates), participantCount, joined, createdBy }`. |
| `GET /api/competitions/:id` | `competition:read` | - | `Competition` with `standings[] { rank, userId, name, avatarUrl, departmentName, value, meetings, qualifies, isMe }`. Only participants with at least `minMeetings` reviewed meetings in the period (and matching rubric, if set) are ranked; others are listed unranked. |
| `POST /api/competitions` | `competition:manage` | `CreateCompetitionSchema` | `Competition`. With `autoEnrol` every active reviewable user (optionally in the department) is entered and notified (`COMPETITION_STARTED`). |
| `PATCH /api/competitions/:id` | `competition:manage` | partial `CreateCompetitionSchema` | `Competition`. |
| `DELETE /api/competitions/:id` | `competition:manage` | - | `{ ok: true }`. |
| `POST /api/competitions/:id/join` | `competition:read` | - | `Competition`; 400 once the competition is `CLOSED`. |
| `POST /api/competitions/:id/leave` | `competition:read` | - | `Competition`. |
| `POST /api/competitions/:id/participants` | `competition:manage` | `{ userIds: string[] }` (min 1) | `Competition`; duplicates are ignored; the added users are notified. |

## Appraisals (tag: Appraisals)

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/appraisals` | authenticated | query `tutorId?` | `Appraisal[]`. Callers with `appraisal:read:any` see all; others see only their own appraisals in status `SHARED` or `LOCKED`. |
| `GET /api/appraisals/:id` | authenticated (same scope) | - | `Appraisal { id, title, status: DRAFT / GENERATED / SHARED / LOCKED, tutor { ... }, createdBy, periodStart, periodEnd, managerNotes, tutorComment, stats (AppraisalStats or null), narrative (AppraisalNarrative or null), generatedAt, model, createdAt, updatedAt }`. |
| `POST /api/appraisals` | `appraisal:manage` | `{ tutorId, title, periodStart, periodEnd, managerNotes? }` (`CreateAppraisalSchema`) | `Appraisal` in `DRAFT` with `stats` computed immediately. |
| `PATCH /api/appraisals/:id` | authenticated; managers (`appraisal:manage`) or the tutor | `{ title?, managerNotes?, tutorComment?, status? }` (`UpdateAppraisalSchema`) | `Appraisal`. Managers may set every field; the tutor may only set `tutorComment`. A `LOCKED` appraisal can only be changed by a manager. Changing status to `SHARED` notifies the tutor (`APPRAISAL_SHARED`). |
| `POST /api/appraisals/:id/generate` | `appraisal:manage` | - | `{ queued: true }`; refreshes `stats` and queues the narrative job. 400 if locked or if the period has no completed reviews. The narrative appears on a later `GET`; a `DRAFT` becomes `GENERATED`. |
| `DELETE /api/appraisals/:id` | `appraisal:manage` | - | `{ ok: true }`; 400 when locked. |

`AppraisalStats`: `{ meetingCount, averageScore, bestScore, lowestScore, averageMandatoryCoverage, averageLearnerTalkShare, departmentAverage, collegeAverage, trend[], criteriaAverages[], gradeCounts }`. `AppraisalNarrative`: `{ headline, overview, strengths[], developmentAreas[], suggestedCpd[], evidenceNotes[] }`.

## System: notifications, settings, audit, export, health (tag: System)

| Method and path | Permission | Request | Response and notes |
| --- | --- | --- | --- |
| `GET /api/health` | public (not rate limited) | - | `{ status: 'ok' / 'degraded', db: 'ok' / 'error', version, providers { storage, transcription, llm, email } }`; HTTP 503 when the database check fails. |
| `GET /api/notifications` | authenticated | - | `{ items: Notification[] (latest 30) { id, type, title, body, link, readAt, createdAt }, unread }`. Types: `ANALYSIS_READY`, `ANALYSIS_FAILED`, `COMMENT_ADDED`, `MODERATED`, `APPRAISAL_SHARED`, `COMPETITION_STARTED`, `WELCOME`. |
| `POST /api/notifications/read` | authenticated | `{ ids: string[] | 'all' }` | `{ ok: true }`. |
| `GET /api/settings` | authenticated | - | `Settings { collegeName, llmModel, retentionDaysRecordings, retentionDaysTranscripts, redactLearnerNames, allowTutorSelfUpload, emailNotifications, transcriptionLanguage }` plus `providers { storage, transcription, llm, email }`. |
| `PATCH /api/settings` | `settings:manage` | partial `Settings` (`UpdateSettingsSchema`) | `Settings`; audit `settings.updated`. See [architecture.md](architecture.md#9-configuration-reference) for which settings are enforced. |
| `GET /api/audit` | `audit:read` | query `page`, `pageSize` (default 50), `action?` (substring), `entityType?`, `actorId?`, `from?`, `to?` | Paginated `AuditLogItem { id, action, entityType, entityId, actorName, actorEmail, metadata, ip, createdAt }`, newest first. |
| `GET /api/export/reviews.csv` | `export:data` | query `from?`, `to?`, `departmentId?`, `tutorId?` | `text/csv` attachment `meeting-reviews-<date>.csv`. One row per completed current analysis of a `READY` meeting in the filter. Columns: `meeting_id, title, meeting_date, tutor_id, score, grade, mandatory_coverage, learner_talk_share`, then one column per criterion code found in the data (the effective 1-5 score, blank when not applicable). Audit `export.reviews_csv`. |

## Local-storage upload endpoints (only when `STORAGE_PROVIDER=local`)

These two routes exist only with local storage and are hidden from the OpenAPI document. They imitate S3 presigned URLs: the query string carries an expiry and an HMAC-SHA256 signature over `<op>:<key>:<exp>` computed with `COOKIE_SECRET`. Clients never build these URLs themselves; they come from the presign and download endpoints.

| Method and path | Auth | Notes |
| --- | --- | --- |
| `PUT /api/uploads/put?key=&exp=&sig=` | signature (valid 1 hour) | Raw request body (any content type, up to 4 GB) is written to `LOCAL_STORAGE_DIR/<key>`. Returns `{ ok: true }`; 403 if the link is invalid or expired. |
| `GET /api/uploads/get?key=&exp=&sig=&name=` | signature (valid 15 minutes) | Streams the file with `Content-Disposition: attachment; filename="<name>"`; 404 if it no longer exists. |

## Worked example with curl

The example uses the demo data created by `pnpm db:seed` with `SEED_DEMO_DATA=true` (see `apps/api/src/seed/seed.ts`). Demo accounts all use the password `Demo-Pass-2026`; the tutor below is `daniel.okafor@demo.slc.ac.uk`. The seeded system admin is `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (`admin@example.ac.uk` / `ChangeMe-2026!` unless changed). With the default local configuration (`STORAGE_PROVIDER=local`, `TRANSCRIPTION_PROVIDER=mock`, `LLM_PROVIDER=mock`) the whole flow runs on one machine; the report will be clearly labelled as a mock sample. `jq` is used to pick values out of responses.

```bash
API=http://localhost:4000/api

# 1. Sign in. The bearer token in the response avoids the cookie CSRF check for the rest of the script.
TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"daniel.okafor@demo.slc.ac.uk","password":"Demo-Pass-2026"}' | jq -r .accessToken)
AUTH="Authorization: Bearer $TOKEN"

# 2. Create a draft meeting (the tutor defaults to the caller; the criteria set defaults to the active default for INDUCTION).
MEETING=$(curl -s -X POST "$API/meetings" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"title":"Induction - L10999","meetingType":"INDUCTION","learnerReference":"L10999","learnerFirstName":"Priya","programme":"Level 3 Health and Social Care","meetingDate":"2026-10-01"}' | jq -r .id)
echo "meeting $MEETING"

# 3. Prepare a transcript to upload (any of the accepted formats; plain "Name: text" lines are fine).
cat > /tmp/induction.txt <<'EOT'
[00:00:00] Daniel: Hi Priya, I am Daniel, your course tutor. Is it Priya, have I said that right?
[00:00:08] Priya: Yes, that is right.
[00:00:12] Daniel: This is your induction meeting. Tell me what you are hoping to get from the course?
[00:00:20] Priya: I want to work in a care home and maybe go on to nursing.
[00:00:30] Daniel: Great. Let me explain the units, the timetable and how you will be assessed.
EOT

# 4. Ask for an upload link, PUT the bytes to it, then tell the API the upload is complete.
PRESIGN=$(curl -s -X POST "$API/meetings/$MEETING/files/presign" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"TRANSCRIPT\",\"fileName\":\"induction.txt\",\"mimeType\":\"text/plain\",\"sizeBytes\":$(wc -c < /tmp/induction.txt)}")
FILE_ID=$(echo "$PRESIGN" | jq -r .fileId)
UPLOAD_URL=$(echo "$PRESIGN" | jq -r .uploadUrl)
CONTENT_TYPE=$(echo "$PRESIGN" | jq -r '.headers["Content-Type"]')

curl -s -X PUT "$UPLOAD_URL" -H "Content-Type: $CONTENT_TYPE" --data-binary @/tmp/induction.txt
curl -s -X POST "$API/meetings/$MEETING/files/$FILE_ID/complete" -H "$AUTH" | jq '{id, kind, status}'

# 5. Submit for review. The meeting moves to QUEUED and the background jobs take over.
curl -s -X POST "$API/meetings/$MEETING/submit" -H "$AUTH" | jq '{status, steps}'

# 6. Poll until the report is ready (READY) or something failed (FAILED).
until [ "$(curl -s "$API/meetings/$MEETING" -H "$AUTH" | jq -r .status)" = "READY" ]; do
  sleep 3
  curl -s "$API/meetings/$MEETING" -H "$AUTH" | jq -r '"\(.status): " + ([.steps[] | select(.state=="active") | .label] | join(", "))'
done

# 7. Read the report: the analysis is embedded in the meeting detail.
curl -s "$API/meetings/$MEETING" -H "$AUTH" \
  | jq '.analysis | {overallScore, grade, mandatoryCoverage, confidence, strengths, improvements, criteria: [.criteria[] | {code, score, effectiveScore, rationale}]}'

# 8. Optional extras: the transcript with the speaker map, and the "how this was scored" numbers.
curl -s "$API/meetings/$MEETING/transcript" -H "$AUTH" | jq '{source, wordCount, speakerMap}'
curl -s "$API/meetings/$MEETING" -H "$AUTH" | jq '.analysis.scoreBreakdown | {overallScore, totalWeightedPoints, totalMaxPoints, mandatoryCovered, mandatoryTotal}'
```

Variations:

- **Uploading a recording** is the same flow with `"kind":"RECORDING"`, the file's real `Content-Type` and the recording's `sizeBytes`. With `TRANSCRIPTION_PROVIDER=mock` the audio is ignored and a sample conversation is returned after a few seconds; with `aws` the poll loop will spend several minutes in `TRANSCRIBING`.
- **Moderating as a manager**: sign in as `amira.hassan@demo.slc.ac.uk`, take `.analysis.id` and a `criteria[].id` from the meeting detail, then `POST /api/analyses/<analysisId>/moderate` with `{"note":"Prevent was covered at 12:40 but mis-heard by the transcript","criteria":[{"criterionResultId":"<id>","moderatedScore":4}]}`.
- **Cookie instead of bearer**: add `-c cookies.txt` to the login call and `-b cookies.txt -H 'Origin: http://localhost:5173'` to every later call. Without the `Origin` header a cookie-authenticated POST is rejected with 403.
- **CSV export**: `curl -s "$API/export/reviews.csv?from=2026-09-01" -H "$AUTH" -o reviews.csv` (requires `export:data`, which the demo manager has).

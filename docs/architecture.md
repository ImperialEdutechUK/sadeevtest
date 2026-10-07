# Meeting Review - architecture

This document describes how Meeting Review is built and how it behaves at runtime. It is written for developers and IT staff. For the step-by-step AWS deployment see [deployment-aws.md](deployment-aws.md) and [infra/terraform/README.md](../infra/terraform/README.md); for the HTTP API see [api.md](api.md); for staff-facing instructions see [user-guide.md](user-guide.md).

Everything below is taken from the code in this repository. Where the code and the user interface disagree, this document says so rather than smoothing it over.

## 1. System overview

Meeting Review is a web application in which academic staff upload a recording or transcript of a tutor-learner meeting (plus, optionally, the learner information booklet and the presentation used). The system transcribes the recording, extracts text from the documents, asks a language model to score the **tutor's** conduct against a configurable criteria set ("rubric") with verbatim evidence, and then calculates the overall score, grade and talk-time figures with plain arithmetic. Managers can moderate scores, and the stored results feed dashboards, people profiles, KPIs, competitions, appraisals, notifications, an audit log and a CSV export.

### Components

```
                          Production (AWS, eu-west-2)                      Local development
                          ----------------------------                      -----------------
 Browser
   |  https://<domain>/            (React SPA)                              Vite dev server :5173
   |  https://<domain>/api/*       (same origin)                            (proxies /api -> :4000)
   v
 CloudFront ----/*-------> S3 "web" bucket (static SPA)                    or docker-compose: nginx :8080
   |
   +---/api/*--> ALB --> ECS Fargate: Node 22 "api" container               tsx watch src/server.ts :4000
                              |   Fastify 5 + Prisma 7 + pg-boss 12         (or the api container in compose)
                              |
                              +--> RDS PostgreSQL 16 (app tables + pgboss schema)   Postgres (compose / local)
                              +--> S3 "uploads" bucket  <-- browser PUTs via presigned URL    local disk (STORAGE_PROVIDER=local,
                              |                                                               PUT goes to /api/uploads/put) or MinIO
                              +--> Amazon Transcribe (batch jobs, reads/writes the uploads bucket)   mock provider
                              +--> OpenRouter (chat completions, outbound internet via NAT)          mock provider
                              +--> Amazon SES (invitation / notification email)                      "none" (log only)
```

| Concern | Production | Local development |
| --- | --- | --- |
| Web app | `apps/web` built with Vite, served from S3 through CloudFront | `pnpm dev` (Vite on :5173, proxying `/api` to :4000) or the `web` container in `infra/docker-compose.yml` (nginx on :8080) |
| API and background jobs | One Docker image (`apps/api/Dockerfile`) on ECS Fargate behind an ALB; jobs run inside the API process by default | `pnpm dev` runs `tsx watch src/server.ts`; jobs run in-process |
| Database | RDS PostgreSQL 16 | Postgres 16 (compose) or any local Postgres |
| File storage | S3 bucket, presigned PUT/GET | `STORAGE_PROVIDER=local` (files under `apps/api/storage`, HMAC-signed links served by the API) or MinIO through `S3_ENDPOINT` |
| Transcription | Amazon Transcribe (`TRANSCRIPTION_PROVIDER=aws`, requires S3 storage) | `mock` (returns a fixed sample induction conversation after 5 seconds) |
| Language model | OpenRouter (`LLM_PROVIDER=openrouter`) | `mock` (keyword-based reviewer, no network) |
| Email | Amazon SES | `none` (logs the message instead of sending) |

The web app and the API share one hostname in production: CloudFront forwards `/api/*` to the load balancer and adds a secret `X-Origin-Verify` header that the ALB requires. That keeps the auth cookies same-site and means no CORS is needed between web and API. Details are in [deployment-aws.md](deployment-aws.md).

### Technology

- **Monorepo**: pnpm workspaces (`pnpm@10.28.0`, Node 22 per `.nvmrc`; `engines.node >= 20`). TypeScript throughout, ESM modules.
- **Shared package** `@slc/shared`: Zod 4 schemas, enums, roles and permissions, the deterministic scoring code and the preset rubric. Consumed by both the API and the web app from its `dist` folder.
- **API** `@slc/api`: Fastify 5 with `fastify-type-provider-zod` (request validation, response serialisation and OpenAPI generation from the same Zod schemas), Prisma 7 with `@prisma/adapter-pg`, pg-boss 12 for jobs, pino 10 for logs, `@fastify/helmet`, `@fastify/cors`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/swagger` and `@fastify/swagger-ui`. AWS SDK v3 clients for S3, Transcribe and SES. `mammoth` (DOCX), `pdf-parse` (PDF) and `jszip` (PPTX) for document text.
- **Web** `@slc/web`: React 19, Vite 7, React Router 7, TanStack Query 5, Tailwind CSS 4, Radix UI primitives, Recharts, sonner toasts, `react-hook-form` + Zod. No client-side token storage; authentication is cookie-based.
- **Infrastructure**: Terraform under `infra/terraform`, GitHub Actions workflows under `.github/workflows` (`ci.yml`, `deploy-api.yml`, `deploy-web.yml`), `infra/docker-compose.yml` for a single-machine stack with Postgres and MinIO.

## 2. Monorepo layout

```
.
+-- package.json, pnpm-workspace.yaml, tsconfig.base.json, .nvmrc (22)
+-- packages/shared/src
|   +-- roles.ts            ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, PERMISSIONS, ROLE_PERMISSIONS, can()
|   +-- enums.ts            meeting statuses/types, file kinds, speaker roles, KPI metrics, competition/appraisal statuses, notification types
|   +-- constants.ts        upload limits, accepted extensions, MIME map, SCORE_SCALE_MAX (5), DEFAULT_GRADE_BANDS, PROMPT_VERSION
|   +-- scoring.ts          computeOverallScore(), gradeFor(), computeTranscriptMetrics(), formatTimestamp()
|   +-- analysisOutput.ts   Zod schema for the JSON the language model must return (AnalysisOutputSchema, AppraisalNarrativeSchema)
|   +-- presetRubric.ts     the generic "Learner induction meeting (UK further education)" preset and the PRESET_RUBRICS list
|   +-- presetRubricSlc.ts  the default "Online learner induction (South London College)" preset (see docs/induction-criteria-review.md)
|   +-- schemas/*.ts        request/response schemas: auth, users, rubrics, meetings, analysis, performance, dashboard, settings, common
|   +-- scoring.test.ts     vitest unit tests
+-- apps/api
|   +-- prisma/schema.prisma, prisma/migrations/   data model and migrations (Prisma 7, `prisma.config.ts`)
|   +-- Dockerfile                                 multi-stage Node 22 Alpine image (tini, non-root user, health check)
|   +-- .env.example                               configuration reference
|   +-- src/server.ts        API entry point (optional migrations on start, preset rubric bootstrap, in-process workers)
|   +-- src/worker.ts        standalone worker entry point (RUN_WORKER_IN_API=false)
|   +-- src/app.ts           Fastify app factory: helmet, CORS, cookies, rate limit, swagger, auth plugin, error handler
|   +-- src/config.ts        Zod-validated environment (loadConfig) with cross-checks between providers
|   +-- src/db.ts, logger.ts
|   +-- src/plugins/auth.ts  JWT/cookie/bearer authentication, CSRF origin check, requirePermission()
|   +-- src/routes/*.ts      health, auth, users, rubrics, meetings, performance, system, uploads (all under /api)
|   +-- src/services/*.ts    auth, users, rubrics, meetings, pipeline, analysis, stats, dashboard, kpi, competitions, appraisals, notifications, settings, retention
|   +-- src/providers/       storage (local, s3), transcription (aws, mock, parsers), llm (openrouter, mock, prompts), documents (extract), email (ses/none)
|   +-- src/jobs/            queue.ts (pg-boss queues and enqueue helpers), handlers.ts (workers + nightly schedule)
|   +-- src/lib/             errors, tokens (HS256 JWT, random tokens), password (scrypt), audit, notify, serialize, dates
|   +-- src/seed/            seed.ts (first admin, preset rubric, optional demo data), sampleTranscript.ts
|   +-- src/__tests__/       vitest tests for parsers, document extraction and the mock reviewer
+-- apps/web
|   +-- Dockerfile, nginx.conf                     static build served by nginx (used by docker-compose)
|   +-- src/app/router.tsx   routes and lazy-loaded pages
|   +-- src/app/AppShell.tsx navigation (filtered by permission), notifications menu, account menu
|   +-- src/app/guards.tsx   RequireAuth (redirects to /login, forces /me/password when mustChangePassword), RequirePermission
|   +-- src/app/AuthProvider.tsx  /auth/me on load, login/logout, can()
|   +-- src/lib/api.ts       fetch wrapper (credentials: include, one silent /auth/refresh on 401), ApiError
|   +-- src/lib/upload.ts    presign -> XHR PUT with progress -> complete
|   +-- src/lib/queries.ts   TanStack Query hooks and all mutations (the full list of endpoints the UI uses)
|   +-- src/pages/**         Dashboard, Meetings list, NewMeeting (3-step wizard, also used for edit), Meeting + report, People, Person,
|                            Profile, Auth pages, Rubrics list + editor, KPIs, Competitions, Appraisals, Admin (Users/Settings/Audit), Help
+-- infra/docker-compose.yml, infra/.env.compose.example, infra/terraform/
+-- docs/
+-- .github/workflows/ci.yml, deploy-api.yml, deploy-web.yml
```

## 3. Request and processing flow for a meeting

### 3.1 From the browser to a queued job

1. **Create** - `POST /api/meetings` creates a `Meeting` in status `DRAFT` (wizard step 1, "About the meeting"). The tutor defaults to the caller; choosing another tutor requires `meeting:create:any`. If the caller is a `TUTOR` and the setting `allowTutorSelfUpload` is off, creation is refused. The criteria set defaults to the active default rubric for the meeting type (`getDefaultRubricId`).
2. **Presign** - `POST /api/meetings/:id/files/presign` with `{ kind, fileName, mimeType?, sizeBytes }`. The API checks the extension against `ACCEPTED_EXTENSIONS[kind]`, the size against `MAX_UPLOAD_BYTES` (4 GB, recordings) or `MAX_DOCUMENT_BYTES` (50 MB, documents), deletes any previous file of the same kind (only `OTHER` may have several), creates a `MeetingFile` in status `PENDING` with a storage key `recordings/<meetingId>/<uuid><ext>` or `documents/<meetingId>/<uuid><ext>`, and returns `{ fileId, uploadUrl, method: 'PUT', headers, expiresInSeconds: 3600 }`. Files may only be changed while the meeting is `DRAFT`, `FAILED` or `READY`.
3. **Upload** - the browser `PUT`s the bytes straight to `uploadUrl` with the returned headers (`Content-Type`). With S3 this is a presigned S3 URL; with local storage it is `/api/uploads/put?key=&exp=&sig=`, an HMAC-SHA256 link (signed with `COOKIE_SECRET`) that the API itself accepts and writes to `LOCAL_STORAGE_DIR`.
4. **Complete** - `POST /api/meetings/:id/files/:fileId/complete`. The API verifies the object exists in storage (`HeadObject` or `fs.access`) and marks the file `UPLOADED`, clearing any previously extracted text.
5. **Submit** - `POST /api/meetings/:id/submit` (wizard step 3). Allowed from `DRAFT` or `FAILED`; requires at least one `RECORDING` or `TRANSCRIPT` file in status `UPLOADED`/`PROCESSED`. Sets status `QUEUED`, `submittedAt`, clears `failureReason` and enqueues the pg-boss job `meeting.process` with `singletonKey = process:<meetingId>` so a meeting cannot be queued twice at once.

The browser then polls `GET /api/meetings/:id` every 3 seconds while the status is `QUEUED`, `TRANSCRIBING`, `EXTRACTING` or `ANALYSING` (`useMeeting` in `queries.ts`). The response includes `steps`, a plain-language view of `meeting.processingLog` built by `processingSteps()` in `meetings.service.ts`.

### 3.2 Background jobs

```
meeting.process ---------------------------------------------------------------.
  |  extractDocuments()   status EXTRACTING   (booklet / presentation / other without extractedText)
  |                                                                              |
  |  transcript already present and not MOCK?  -> log "Existing transcript reused" -> enqueue meeting.analyse
  |  TRANSCRIPT file?      status TRANSCRIBING -> parseTranscriptFile() -> saveTranscript() -> enqueue meeting.analyse
  |  RECORDING file?       status TRANSCRIBING -> provider.start() -> Transcript row with jobName
  |                                             -> enqueue meeting.transcribe.poll (startAfter 30 s; 5 s with mock)
  |  neither               -> throw -> failMeeting()
  v
meeting.transcribe.poll
  |  provider.check(jobName)
  |    IN_PROGRESS -> re-enqueue itself: every 30 s for the first 20 attempts, then every 60 s; fail after 240 attempts
  |    FAILED      -> failMeeting("Transcription failed: ...")
  |    COMPLETED   -> saveTranscript() -> recording file PROCESSED -> enqueue meeting.analyse
  v
meeting.analyse
  |  runAnalysis()   status ANALYSING -> (see section 4) -> status READY, notifications
  v
notify(): Notification row for the tutor (ANALYSIS_READY, with email if the user allows it) and,
          if different, for the uploader (in-app only). On failure: ANALYSIS_FAILED to the uploader.
```

`saveTranscript()` applies the `redactLearnerNames` setting (replaces the learner's first name with `[learner]` in every segment, whole-word, case-insensitive), computes `wordCount`, guesses the speaker map (`guessSpeakerMap`: the label with the most words is `TUTOR`, the next is `LEARNER`, the rest `OTHER`), and stores `durationSeconds` on the meeting.

Every step appends `{ step, state, detail, at }` to `meeting.processingLog` (`appendLog`, capped at the last 40 entries). `failMeeting()` sets `FAILED`, stores `failureReason` (500 chars) and notifies the uploader.

Other jobs on the same queue: `appraisal.generate` (section 9) and `maintenance.retention` (nightly, section 8).

### 3.3 Meeting status state machine

```
            submit (needs recording or transcript)
 DRAFT ------------------------------------------> QUEUED
                                                     |  meeting.process starts
                                                     v
                                   (documents attached) EXTRACTING
                                                     |
                                                     v
                                             TRANSCRIBING  (parse upload, or Transcribe job + polling)
                                                     |
                                                     v
                                               ANALYSING
                                                     |
                                                     v
                                                  READY  ---- reanalyse ----> QUEUED (new Analysis row; old one isCurrent=false)
 any processing step may fail
                                                     v
                                                  FAILED ---- submit or reanalyse ("Try again") ----> QUEUED
```

Notes:

- `EXTRACTING` happens **before** `TRANSCRIBING` in `processMeeting()` (documents are cheap, so they are read first). The `MEETING_STATUSES` enum and the processing card in the UI list transcription before documents; this is cosmetic.
- `reanalyseMeeting()` is allowed from `READY` or `FAILED`. If a transcript with segments exists it enqueues `meeting.analyse` directly (no re-transcription and no document re-extraction); otherwise it enqueues `meeting.process`. Documents added after the first run are therefore only read if the meeting has no transcript yet (see Known limitations).
- `DRAFT` meetings can be edited and files replaced; `READY` and `FAILED` meetings can also have files replaced (the API allows presign in those states); nothing can be changed while processing.

## 4. The analysis pipeline in detail

All of this lives in `apps/api/src/services/analysis.service.ts`, `apps/api/src/providers/llm/prompts.ts` and `packages/shared/src/scoring.ts`.

### 4.1 Inputs to the prompt (`buildAnalysisMessages`)

| Input | Source | Limit |
| --- | --- | --- |
| Meeting metadata | title, meeting type label, date, programme, tutor name, learner first name (omitted when `redactLearnerNames` is on), uploader notes | - |
| Objective transcript metrics | `computeTranscriptMetrics(segments, initialMap)` where `initialMap` is the stored speaker map or `guessSpeakerMap()` | - |
| Rubric | name, categories, and for each criterion: code, title, description, `mandatory`, `weight`, descriptors (levels 1, 3, 5) as JSON between `<<<RUBRIC_JSON>>>` markers | - |
| Learner information booklet | extracted text of the `LEARNER_BOOKLET` file | `MAX_DOC_CHARS` = 16,000 characters (extraction itself keeps at most 60,000) |
| Presentation | extracted text of the `PRESENTATION` file (slide by slide, with speaker notes) | 16,000 characters |
| Other documents | `OTHER` files concatenated with `## filename` headings | 8,000 characters |
| Transcript | one line per segment: `[mm:ss] <raw speaker label>: text` between `<<<TRANSCRIPT>>>` markers | `MAX_TRANSCRIPT_CHARS` = 140,000 characters; truncated with a marker and `inputsUsed` gets "Transcript truncated for length" |
| College name | `collegeName` setting | - |

The system prompt casts the model as an experienced UK further-education quality reviewer assessing the **tutor's** conduct, evidence-led, in British English, never speculating about protected characteristics, recording anything that looks like a safeguarding, wellbeing or data-protection concern under `risks`, and returning a single JSON object. The user prompt ends with the exact JSON shape required and five rules (score every criterion; a mandatory criterion that was not covered scores 1; `notApplicable` only for non-mandatory criteria that could not arise; verbatim evidence quotes with `startSeconds`; judge against the descriptors only; valid JSON). `PROMPT_VERSION` (`2026-10-v1`) is stored on every analysis.

### 4.2 Calling the model and validating the reply (`callModelWithValidation`)

1. `llm.complete(messages, { purpose: 'analysis' })`. With OpenRouter: `temperature` 0.2, `max_tokens` 6000, `response_format: { type: 'json_object' }`, `provider.require_parameters: false`, headers `HTTP-Referer: WEB_ORIGIN` and `X-Title`. Up to 3 attempts per model with exponential back-off (1.5 s, 3 s, 6 s) on network errors, 408, 429 and 5xx; then the same for `OPENROUTER_FALLBACK_MODEL` if set. Each request is aborted after `LLM_TIMEOUT_MS`.
2. `extractJson()` tolerates code fences and preambles (takes the text from the first `{` to the last `}`).
3. `AnalysisOutputSchema.safeParse()` (Zod) enforces the shape: `speakerRoles`, `summary` (max 2500 chars), 1-6 `strengths`, up to 6 `improvements`, up to 6 `actionPlan` items with priority, at least one `criteria` entry (`criterionCode`, integer `score` 1-5 or null, `notApplicable`, `rationale`, up to 6 `evidence` quotes of max 600 chars, optional `suggestion`), up to 10 `risks`, up to 40 `materialsCoverage` rows, optional `learnerExperience`, `confidence` HIGH/MEDIUM/LOW with `confidenceReason`.
4. Coverage check: if more than a quarter (`ceil(n * 0.25)`) of the rubric's criterion codes are missing from the reply, it is treated as invalid.
5. **Repair retry**: on the first failure the API sends the original messages plus the bad reply and a description of the problem (`buildRepairMessages`) and asks for the complete corrected JSON. If the second reply is still invalid, `runAnalysis` throws, the analysis is marked `FAILED` with the error, the meeting becomes `FAILED` and the uploader is notified.

The raw parsed JSON is kept in `Analysis.rawOutput`, token usage in `Analysis.tokenUsage`, and the model actually used (as reported by OpenRouter) in `Analysis.model`.

### 4.3 Speaker roles

- If the transcript's `speakerMapSource` is `manual` (someone saved "Who is who?" in the Transcript tab), the stored map is used unchanged.
- Otherwise the model's `speakerRoles` are merged over the initial guess and stored back on the transcript.
- Metrics are recomputed with the final map and stored in `Analysis.metrics`; `Analysis.scoreBreakdown.speakerMap` records the map used.
- `PATCH /meetings/:id/transcript/speakers` (`applySpeakerMap`) recomputes metrics for the current analysis without calling the model and marks the map `manual`; with `reanalyse: true` it also re-runs the analysis.

### 4.4 Deterministic scoring (`computeOverallScore`)

For each criterion in the rubric (archived criteria excluded, ordered by category then criterion order):

- The model's entry is matched by code (case-insensitive). A criterion is **not applicable** when the model says `notApplicable: true` or gives no score, **unless it is mandatory**: a mandatory criterion with no score is normalised to score 1, not applicable = false ("Not observed in the transcript.").
- `score` is rounded and clamped to 1..5 (`SCORE_SCALE_MAX`).
- `weightedPoints = score x weight`, `maxPoints = 5 x weight`; not-applicable criteria contribute 0 to both.
- `overallScore = round1(totalWeightedPoints / totalMaxPoints x 100)`, or 0 when nothing is applicable.
- **Mandatory coverage**: `mandatoryCovered` counts mandatory criteria that are applicable and scored >= 3 (`MANDATORY_COVERED_THRESHOLD`); `mandatoryCoverage = round1(mandatoryCovered / mandatoryTotal x 100)` (100 when the rubric has no mandatory criteria).
- **Grade**: `gradeFor(overallScore, rubric.gradeBands)` returns the band with the highest `min` that the score reaches. Each rubric stores its own bands; `DEFAULT_GRADE_BANDS` are Excellent (85+), Good (70+), Developing (55+) and Needs support (0+).

The same function runs in the browser on the "How this was scored" tab and in the moderation dialog preview, so the numbers on screen are reproducible by hand.

### 4.5 What is stored

In one transaction: the `Analysis` row is updated to `COMPLETE` with `overallScore`, `grade`, `mandatoryCoverage`, `summary`, `learnerExperience`, `strengths`, `improvements`, `actionPlan`, `risks`, `materialsCoverage`, `metrics`, `scoreBreakdown` (the full `computeOverallScore` result plus the speaker map), `confidence`, `confidenceReason`, `inputsUsed`, `tokenUsage`, `rawOutput`; one `CriterionResult` per rubric criterion (`score`, `notApplicable`, `rationale`, `evidence`, `suggestion`); and the meeting becomes `READY` with `completedAt`, `durationSeconds` and a log entry "Scored N criteria".

### 4.6 Moderation (`moderateAnalysis`)

Requires `analysis:moderate` and a `COMPLETE` analysis. The caller supplies a note (5-2000 characters, mandatory) and a list of `{ criterionResultId, moderatedScore (1-5 or null), moderationNote? }`. For each, `CriterionResult.moderatedScore` and `moderationNote` are set; then the overall score is recomputed with the effective score per criterion (`moderatedScore ?? score`). If any criterion is moderated, `Analysis.moderatedOverallScore` is set (otherwise null), `mandatoryCoverage` and `grade` are recomputed from the effective score, a `Moderation` row records the original and moderated overall scores, the note and the per-criterion changes, an audit entry `analysis.moderated` is written and the tutor receives a `MODERATED` notification. Everywhere else in the system (lists, dashboards, KPIs, competitions, appraisals, CSV) uses the effective score: `moderatedOverallScore ?? overallScore`.

Re-running a review creates a **new** `Analysis` row and marks the previous one `isCurrent = false`; its moderation stays attached to the old row and no longer applies to the current report.

### 4.7 Objective transcript metrics (`computeTranscriptMetrics`)

Computed from the words alone, no model involved:

| Metric | How it is calculated |
| --- | --- |
| `durationSeconds` | largest segment `end` |
| `totalWords`, `tutorWords`, `learnerWords`, `speakerWordCounts` | whitespace-split word counts per segment, attributed by the speaker map |
| `tutorTalkShare`, `learnerTalkShare` | percentage of `tutorWords + learnerWords` (words from `OTHER` speakers are excluded from the denominator) |
| `tutorQuestions`, `learnerQuestions` | sentences (split on `. ? !`) that end with `?` |
| `tutorOpenQuestions` | tutor questions that start with what / how / why / tell me / describe / explain / which / where / when / who / could you tell / can you tell / what about |
| `longestTutorMonologueSeconds` | the longest run of consecutive tutor segments before a learner or other speaker talks |
| `wordsPerMinute` | `totalWords / (durationSeconds / 60)` |
| `turnCount` | number of speaker changes |

For uploaded transcripts without end times (plain text), `parseTranscriptText` estimates segment ends from word counts at roughly 150 words per minute and warns that timings are estimated.

## 5. Data model

Source of truth: `apps/api/prisma/schema.prisma` (PostgreSQL, Prisma 7, generated client under `apps/api/src/generated/prisma`, git-ignored). IDs are cuids. All timestamps are stored in UTC.

| Table | Purpose and key fields | Relations |
| --- | --- | --- |
| `Department` | `name` (unique) | users, kpis, competitions |
| `User` | `email` (unique), `passwordHash` (null until an invitation is accepted), `role` (enum `Role`), `jobTitle`, `bio`, `avatarUrl`, `isActive`, `mustChangePassword`, `emailNotifications`, `lastLoginAt` | department (set null on delete); owns meetings as tutor and as creator, comments, moderations, notifications, audit entries, rubrics, KPIs, competitions, appraisals |
| `Invitation` | `email`, names, `role`, `departmentId`, `jobTitle`, `tokenHash` (unique, SHA-256 of the link token), `expiresAt` (7 days), `acceptedAt` | invitedBy -> User |
| `RefreshToken` | `tokenHash` (unique), `expiresAt`, `revokedAt` | user (cascade) |
| `Rubric` | criteria set: `name`, `description`, `meetingType`, `version`, `isPreset`, `isActive`, `isDefault`, `gradeBands` (JSON) | categories, criteria, meetings, analyses, competitions |
| `RubricCategory` | `name`, `description`, `order` | rubric (cascade) |
| `Criterion` | `code` (unique per rubric), `title`, `description`, `weight` (0.25-5), `isMandatory`, `descriptors` (JSON `{1,3,5}`), `frameworkRefs` (JSON), `order`, `isArchived` | rubric and category (cascade); results |
| `Meeting` | `title`, `meetingType`, `status`, `tutorId`, `createdById`, `learnerReference`, `learnerFirstName`, `programme`, `meetingDate`, `durationSeconds`, `rubricId`, `notes`, `failureReason`, `processingLog` (JSON), `submittedAt`, `completedAt`, `deletedAt` | tutor, createdBy, rubric; files, transcript (1:1), analyses, comments |
| `MeetingFile` | `kind`, `fileName`, `mimeType`, `sizeBytes` (BigInt), `storageKey`, `status` (PENDING/UPLOADED/PROCESSED/FAILED/DELETED), `extractedText`, `extractedChars`, `error` | meeting (cascade) |
| `Transcript` | `source` (AWS_TRANSCRIBE/UPLOADED/MOCK), `language`, `segments` (JSON `{start,end,speaker,text}[]`), `speakerMap` (JSON), `speakerMapSource` (`auto`/`manual`), `wordCount`, `jobName` | meeting (unique, cascade) |
| `Analysis` | `status` (PENDING/RUNNING/COMPLETE/FAILED), `isCurrent`, `provider`, `model`, `promptVersion`, `rubricVersion`, `overallScore`, `moderatedOverallScore`, `grade`, `mandatoryCoverage`, narrative fields, `metrics`, `scoreBreakdown`, `confidence`, `confidenceReason`, `inputsUsed`, `tokenUsage`, `rawOutput`, `error`, `startedAt`, `completedAt` | meeting (cascade), rubric; criteria results, moderations |
| `CriterionResult` | `score`, `notApplicable`, `rationale`, `evidence` (JSON), `suggestion`, `moderatedScore`, `moderationNote`; unique per (analysis, criterion) | analysis (cascade), criterion |
| `Moderation` | `originalOverall`, `moderatedOverall`, `note`, `changes` (JSON) | analysis (cascade), moderator |
| `Comment` | `body` | meeting (cascade), author |
| `Kpi` | `name`, `description`, `metric`, `target`, `comparison` (AT_LEAST/AT_MOST), `periodStart/End`, optional `departmentId` or `userId` (scope), `isActive` | department, user (cascade), createdBy |
| `Competition` | `name`, `description`, `metric`, optional `rubricId` and `departmentId`, `startDate`, `endDate`, `minMeetings`, `prize`, `autoEnrol` | participants (composite key competition+user, cascade) |
| `Appraisal` | `title`, `tutorId`, `createdById`, period, `status` (DRAFT/GENERATED/SHARED/LOCKED), `managerNotes`, `tutorComment`, `stats` (JSON), `narrative` (JSON), `model`, `generatedAt` | tutor, createdBy |
| `Notification` | `type`, `title`, `body`, `link`, `readAt` | user (cascade) |
| `AuditLog` | `actorId` (nullable), `action`, `entityType`, `entityId`, `metadata` (JSON), `ip` | actor (set null) |
| `Setting` | key/value JSON; the single row `app` holds the settings object | - |

Rubric versioning: `updateRubric` increments `Rubric.version` whenever categories are supplied. Criteria that disappear from the payload are deleted if no `CriterionResult` references them, otherwise they are archived (`isArchived = true`, `code` suffixed with `~` + the last four characters of the id so the unique constraint still holds). Serialisers strip the suffix. Historical analyses therefore keep pointing at the exact criterion rows they were scored against, and `Analysis.rubricVersion` records which version was used. `deleteRubric` archives (sets `isActive = false`, `isDefault = false`) when any meeting uses the rubric and deletes otherwise. Preset rubrics are created on API start by `ensurePresetRubrics()` (idempotent by name) and made default for their meeting type when no default exists.

pg-boss keeps its own tables in the `pgboss` schema of the same database.

## 6. Authentication and security

- **Passwords**: scrypt (Node `crypto.scrypt`, N = 16384, 16-byte random salt, 64-byte key, password NFKC-normalised), stored as `scrypt$N$salt$key` and compared with `timingSafeEqual`. Policy (`PasswordSchema`): at least 10 characters mixing lower case with capitals or digits. Temporary passwords from an admin reset are 14 random characters in three groups and force `mustChangePassword`.
- **Sessions**: on login the API issues an HS256 JWT (`lib/tokens.ts`, no external library; claims `sub`, `role`, `iat`, `exp`) valid for `ACCESS_TOKEN_MINUTES` (default 30) and a random 48-byte refresh token whose SHA-256 hash is stored in `RefreshToken` with `REFRESH_TOKEN_DAYS` (default 14). Both are set as `httpOnly`, `sameSite=lax` cookies (`secure` in production): `mr_access` on path `/` and `mr_refresh` on path `/api/auth`. `POST /auth/refresh` rotates: the presented refresh token is revoked and a new pair is issued. Logout revokes the refresh token and clears both cookies. Changing a password, an admin reset or deactivation revokes all of a user's refresh tokens. The login response also returns `accessToken` for non-browser clients.
- **Bearer tokens**: `Authorization: Bearer <access JWT>` is accepted on every request and takes precedence over the cookie.
- **CSRF**: for cookie-authenticated requests that are not GET/HEAD/OPTIONS, the `Origin` header (or the origin of `Referer`) must equal the origin of `WEB_ORIGIN` or `API_PUBLIC_URL`; outside production, loopback origins are also allowed. Bearer requests are exempt.
- **CORS**: requests with no `Origin`, from `WEB_ORIGIN`, or (outside production) from `http://localhost:<port>` / `http://127.0.0.1:<port>` are allowed with credentials. In production the SPA and API share an origin so CORS is not exercised.
- **Same-origin API in production**: CloudFront routes `/api/*` to the ALB and adds `X-Origin-Verify`; the ALB refuses requests without it (see the deployment guide).
- **Rate limiting**: 300 requests per minute per client (`@fastify/rate-limit`), `/api/health` exempt; `POST /auth/login` and `POST /auth/accept-invite` are limited to 10 per minute. `TRUST_PROXY` (default true) makes the limiter and audit log use the forwarded client IP.
- **Headers**: `@fastify/helmet` with `contentSecurityPolicy` disabled and `crossOriginResourcePolicy: cross-origin`.
- **Body limits**: 10 MB for JSON bodies; the local upload route accepts raw bodies up to 4 GB.
- **Authorisation**: every route either calls `app.authenticate` or `app.requirePermission(...permissions)` (any one of the listed permissions suffices), and services apply further ownership checks. The matrix is `ROLE_PERMISSIONS` in `packages/shared/src/roles.ts`:

| Permission | Tutor | Academic admin | Academic manager | HR | Director | System admin |
| --- | --- | --- | --- | --- | --- | --- |
| meeting:create:own | yes | yes | yes | - | - | yes |
| meeting:create:any | - | yes | yes | - | - | yes |
| meeting:read:own / :any | own | own + any | own + any | any | own + any | all |
| meeting:delete:own / :any | own | any | any | - | - | all |
| meeting:reanalyse | - | yes | yes | - | - | yes |
| analysis:moderate | - | - | yes | - | - | yes |
| analysis:comment | yes | yes | yes | - | yes | yes |
| rubric:read | yes | yes | yes | yes | yes | yes |
| rubric:manage | - | yes | yes | - | - | yes |
| people:read | - | yes | yes | yes | yes | yes |
| people:manage | - | - | yes | - | - | yes |
| user:invite | - | yes | yes | - | - | yes |
| user:manage | - | - | - | - | - | yes |
| kpi:read / kpi:manage | - | - | read + manage | read | read + manage | all |
| competition:read / :manage | read | read | read + manage | read | read + manage | all |
| appraisal:read:own / :any | own | own | own + any | any | any | all |
| appraisal:manage | - | - | yes | yes | - | yes |
| audit:read | - | - | - | - | yes | yes |
| settings:manage | - | - | - | - | - | yes |
| export:data | - | - | yes | yes | yes | yes |

  Meeting visibility (`meetingScope`): users with `meeting:read:any` see every meeting; everyone else sees meetings where they are the tutor or the uploader. Role assignment is additionally ranked (`assertCanAssignRole`): only a system admin can create or edit system admins, and other inviters may only assign roles at or below their own rank (Tutor 1; Academic admin and HR 2; Academic manager 3; Director 4; System admin 5).
- **Invitations**: random 32-byte token in the link, only its SHA-256 hash stored, valid 7 days, single use. The invite link is returned to the inviter so it can be copied when email is not configured.
- **Audit log**: `audit()` writes fire-and-forget rows (a failure is logged, never thrown). Actions recorded: `auth.login`, `auth.login_failed`, `auth.logout`, `auth.invite_accepted`, `auth.password_changed`, `user.invited`, `user.updated`, `user.password_reset`, `profile.updated`, `department.created`, `meeting.created|updated|deleted|submitted|reanalysed`, `file.uploaded|removed|downloaded`, `transcript.speakers_updated`, `comment.added`, `analysis.completed`, `analysis.moderated`, `rubric.created|updated|archived|deleted`, `kpi.created|updated|deleted`, `competition.created|updated|deleted|joined`, `appraisal.created|updated|generated|deleted`, `settings.updated`, `export.reviews_csv`, `retention.sweep`. Reading a report is not audited; downloading a file is.
- **Logging hygiene**: pino redacts `req.headers.authorization` and `req.headers.cookie`.
- **Storage**: S3 objects are private; downloads are 15-minute presigned URLs with `Content-Disposition: attachment`. Local storage keys are resolved under `LOCAL_STORAGE_DIR` and rejected if they escape it.

## 7. Providers and how to swap them

Each integration is behind a small interface with a factory that reads `loadConfig()` once:

| Provider | Interface | Implementations | Selected by |
| --- | --- | --- | --- |
| Storage | `StorageProvider` (`presignUpload`, `presignDownload`, `exists`, `read`, `write`, `delete`, `s3Uri`) | `LocalStorageProvider`, `S3StorageProvider` | `STORAGE_PROVIDER=local|s3` (+ `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` for MinIO / S3-compatible services) |
| Transcription | `TranscriptionProvider` (`start`, `check`) | `AwsTranscribeProvider` (batch job with `ShowSpeakerLabels`, `MaxSpeakerLabels = TRANSCRIBE_MAX_SPEAKERS`, output written to `transcribe-output/<job>.json` in the uploads bucket), `MockTranscriptionProvider` | `TRANSCRIPTION_PROVIDER=aws|mock` (+ `TRANSCRIBE_REGION`, `TRANSCRIBE_LANGUAGE`) |
| Language model | `LlmProvider` (`complete`, `defaultModel`) | `OpenRouterProvider`, `MockLlmProvider` | `LLM_PROVIDER=openrouter|mock` (+ `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`, `LLM_TIMEOUT_MS`) |
| Email | `EmailProvider` (`send`) | `SesEmail` (lazy-loaded SDK), `NoopEmail` (logs) | `EMAIL_PROVIDER=ses|none` (+ `SES_REGION`, `EMAIL_FROM`) |
| Document text | `extractDocumentText(fileName, buffer)` | PDF (`pdf-parse`), DOCX (`mammoth`), PPTX (`jszip`, `<a:t>` runs plus notes), TXT/MD/VTT/SRT/JSON as text | by extension |
| Transcript parsing | `parseTranscriptFile` | WebVTT (incl. Teams `<v Name>` tags), SRT, plain text (`[hh:mm:ss] Name: text`, `Name (mm:ss): text`, `Name: text`), DOCX containing any of those, Amazon Transcribe JSON | by extension / content sniffing |

`config.ts` enforces the combinations: `STORAGE_PROVIDER=s3` needs `S3_BUCKET`; `TRANSCRIPTION_PROVIDER=aws` needs S3 storage (Transcribe reads from S3); `LLM_PROVIDER=openrouter` needs `OPENROUTER_API_KEY`. AWS credentials come from the standard SDK chain (environment, profile, or the ECS task role). To add a provider, implement the interface, add the value to the enum in `config.ts` and the factory's `switch`.

The mock providers exist so the whole flow can be exercised without any cloud account: the mock transcriber returns the fixed sample conversation in `seed/sampleTranscript.ts` for any recording, and the mock reviewer scores the preset criteria by keyword matching and labels its output as a sample. `GET /api/settings` and the Admin > Settings screen show which providers are active and warn when a mock is in use.

## 8. Background jobs and the retention sweep

- **Queue**: pg-boss on the application database (schema `pgboss`, pool max 4). Queues are created on start: `meeting.process`, `meeting.transcribe.poll`, `meeting.analyse`, `appraisal.generate`, `maintenance.retention`.
- **Job options**: default `retryLimit 2`, `retryDelay 30 s` with back-off, `expireInSeconds 3600`. `meeting.analyse` uses `retryLimit 1`, 30-minute expiry and a unique `singletonKey` per run; `meeting.process` uses `singletonKey process:<meetingId>`; `meeting.transcribe.poll` is scheduled with `startAfter`. Workers run with `batchSize 1` and a 2-second polling interval per queue.
- **Where workers run**: `RUN_WORKER_IN_API=true` (default) starts them inside the API process (`server.ts`). With `RUN_WORKER_IN_API=false` run `pnpm --filter @slc/api worker` (`tsx src/worker.ts`) or `node dist/worker.js` in a separate container with the same environment.
- **Retention** (`maintenance.retention`, scheduled nightly at 02:30 UTC via `boss.schedule`): deletes recordings (`MeetingFile.kind = RECORDING`, status `UPLOADED`/`PROCESSED`) created more than `retentionDaysRecordings` days ago from storage and marks them `DELETED` (up to 200 per run); deletes `Transcript` rows created more than `retentionDaysTranscripts` days ago. A value of 0 disables the corresponding sweep. Analyses, criterion results (including evidence quotes) and comments are kept. The Terraform deployment additionally applies an S3 lifecycle rule to `recordings/` and `transcribe-output/`.
- **Appraisal generation** (`appraisal.generate`): computes the statistics for the period, builds a prompt from those statistics and the per-meeting strengths/improvements (not from transcripts), validates the reply with `AppraisalNarrativeSchema`, stores the narrative and moves a `DRAFT` appraisal to `GENERATED`.

## 9. Configuration reference

All variables are read by `apps/api/src/config.ts` (Zod-validated; the process refuses to start with a readable list of problems). Values shown are the defaults in `config.ts`; `apps/api/.env.example` documents the same keys for local development.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`. Production disables Swagger UI and request logging, uses JSON logs and `secure` cookies. |
| `PORT` | `4000` | Listening port. |
| `HOST` | `0.0.0.0` | Bind address (not listed in `.env.example`). |
| `LOG_LEVEL` | `info` | pino level. |
| `WEB_ORIGIN` | `http://localhost:5173` | Public URL of the web app: CORS allow-list, CSRF origin check, links in emails and notifications, `HTTP-Referer` sent to OpenRouter. |
| `API_PUBLIC_URL` | `http://localhost:4000` | Public URL of the API: used to build local-storage upload/download links and listed as the OpenAPI server; also an accepted CSRF origin. |
| `DATABASE_URL` | required | PostgreSQL connection string (also used by pg-boss and Prisma migrations). |
| `JWT_SECRET` | required, >= 16 chars | HS256 signing key for access tokens. |
| `COOKIE_SECRET` | required, >= 16 chars | `@fastify/cookie` secret and the HMAC key for local-storage signed links. |
| `ACCESS_TOKEN_MINUTES` | `30` (min 5) | Access token and `mr_access` cookie lifetime. |
| `REFRESH_TOKEN_DAYS` | `14` | Refresh token and `mr_refresh` cookie lifetime. |
| `STORAGE_PROVIDER` | `local` | `local` or `s3`. |
| `LOCAL_STORAGE_DIR` | `storage` | Directory for local storage, relative to the working directory (not listed in `.env.example`). |
| `S3_BUCKET` | `` | Uploads bucket (required for `s3`). |
| `S3_REGION` | `eu-west-2` | Bucket region. |
| `S3_ENDPOINT` | `` | Custom endpoint for MinIO / S3-compatible storage. |
| `S3_FORCE_PATH_STYLE` | `false` | Path-style addressing (needed for MinIO). |
| `TRANSCRIPTION_PROVIDER` | `mock` | `aws` or `mock`. `aws` requires `STORAGE_PROVIDER=s3`. |
| `TRANSCRIBE_REGION` | `eu-west-2` | Amazon Transcribe region. |
| `TRANSCRIBE_LANGUAGE` | `en-GB` | Language code passed to Transcribe. |
| `TRANSCRIBE_MAX_SPEAKERS` | `4` (2-10) | `MaxSpeakerLabels` for speaker identification. |
| `LLM_PROVIDER` | `mock` | `openrouter` or `mock`. |
| `OPENROUTER_API_KEY` | `` | Required for `openrouter`. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible endpoint. |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-5.5` | Primary model id. |
| `OPENROUTER_FALLBACK_MODEL` | `` (`.env.example` suggests `openai/gpt-4.1`) | Tried after the primary model's retries are exhausted. |
| `LLM_TIMEOUT_MS` | `180000` | Per-request abort timeout. |
| `EMAIL_PROVIDER` | `none` | `ses` or `none`. |
| `SES_REGION` | `eu-west-2` | SES region. |
| `EMAIL_FROM` | `Meeting Review <no-reply@example.ac.uk>` | Sender address (must be verified in SES). |
| `SEED_ADMIN_EMAIL` | `admin@example.ac.uk` | First system admin created by `pnpm db:seed`. |
| `SEED_ADMIN_PASSWORD` | `ChangeMe-2026!` | Its initial password. |
| `SEED_DEMO_DATA` | `true` | Also create demo departments, staff, meetings, reports, KPIs, a competition and an appraisal. |
| `RUN_WORKER_IN_API` | `true` | Run pg-boss workers inside the API process. |
| `RUN_MIGRATIONS_ON_START` | `false` | Run `prisma migrate deploy` before listening (the ECS task and docker-compose set it to `true`; not listed in `.env.example`). |
| `TRUST_PROXY` | `true` | Fastify `trustProxy` (client IP from `X-Forwarded-For`; not listed in `.env.example`). |

Web build-time variables (`apps/web/.env.example`, baked in by Vite): `VITE_API_BASE_URL` (default `/api`; set a full URL only when the API is on another host), `VITE_APP_NAME`, `VITE_COLLEGE_NAME`. `VITE_DEV_API_URL` changes the Vite dev proxy target.

Runtime settings that live in the database (`Setting` row `app`, editable in Admin > Settings, cached for 15 seconds per process): `collegeName`, `llmModel`, `retentionDaysRecordings` (90), `retentionDaysTranscripts` (730), `redactLearnerNames` (false), `allowTutorSelfUpload` (true), `emailNotifications` (true), `transcriptionLanguage`. All of these are enforced by the code: `llmModel` is passed to the OpenRouter provider for every new review and appraisal summary (the `OPENROUTER_MODEL` environment variable is only the initial default), `transcriptionLanguage` is passed to Amazon Transcribe for every new recording, and the global `emailNotifications` switch gates `notify()` together with each user's own `emailNotifications` flag.

## 10. Observability

- **Logs**: pino. Outside production, `pino-pretty` with timestamps; in production, one JSON line per event (CloudWatch Logs `/ecs/<project>-<env>/api` on AWS). Request logging is disabled in production (`disableRequestLogging`). Key events: `Meeting Review API ready` (with the active providers), `processing meeting`, `analysing meeting`, `model output invalid - asking for a repair`, `OpenRouter request failed`, `analysis failed`, `retention sweep complete`, `pg-boss error`, `audit log write failed`, `notification failed`, `email (not sent - EMAIL_PROVIDER=none)`.
- **Health**: `GET /api/health` runs `SELECT 1` and returns `{ status: 'ok' | 'degraded', db, version, providers: { storage, transcription, llm, email } }`, HTTP 503 when the database is unreachable. It is exempt from rate limiting and used by the Docker `HEALTHCHECK`, the compose health check and the ALB target group.
- **OpenAPI**: `@fastify/swagger` builds the spec from the Zod schemas (tags Auth, Users, Criteria, Meetings, Dashboard, KPIs, Competitions, Appraisals, System). The Swagger UI is mounted at `/api/docs` only when `NODE_ENV` is not `production`. The local-storage upload routes are hidden from the spec.
- **Audit trail**: Admin > Audit log (`GET /api/audit`, `audit:read`) with filters by action, entity type, actor and date.
- **Per-analysis diagnostics**: `Analysis.model`, `promptVersion`, `tokenUsage`, `inputsUsed`, `confidence`/`confidenceReason`, `startedAt`/`completedAt`, `rawOutput` and `error` are stored, and most are shown on the "How this was scored" tab.

## 11. Scaling notes

- The API is stateless apart from a 15-second in-memory settings cache and the provider singletons; run several ECS tasks behind the ALB freely (`api_desired_count` in Terraform). Sessions are JWTs plus database-backed refresh tokens.
- Heavy work (transcription polling, document extraction, model calls) happens in pg-boss workers. Set `RUN_WORKER_IN_API=false` on the API tasks and run one or more worker containers from the same image with `node dist/worker.js`; each worker processes one job per queue at a time (`batchSize 1`), so add workers to increase concurrency. pg-boss uses PostgreSQL row locking, so multiple workers do not need any coordination.
- Uploads never pass through the API in production (presigned S3 PUT). With `STORAGE_PROVIDER=local` the API receives the whole body (buffered), which is why local storage is for development or small installs only.
- Transcription latency is bounded by Amazon Transcribe (polled every 30 s, then 60 s, up to 240 polls); the model call is bounded by `LLM_TIMEOUT_MS` and the retry/fallback policy.
- Database growth is dominated by `Transcript.segments`, `Analysis.rawOutput` and `AuditLog`; the retention sweep bounds transcripts, nothing prunes audit rows.
- Dashboards, KPIs, competitions and appraisals all aggregate in memory from `loadAnalyses()` (one query per scope); this is fine for a college-sized data set and would be the first thing to index or pre-aggregate at larger scale.

## 12. Testing

- Framework: vitest 3. `pnpm test` at the root runs every workspace's tests (`pnpm -r test`).
- `packages/shared/src/scoring.test.ts`: weighted scoring and percentage conversion, mandatory coverage threshold, empty input, grade bands, transcript metrics (talk share, questions, turns, monologue, duration), timestamp formatting.
- `apps/api/src/__tests__/parsers.test.ts`: timestamp parsing, Teams WebVTT with voice tags and merging of consecutive cues, SRT, plain text (with and without timestamps, continuation lines), Amazon Transcribe JSON speaker attribution.
- `apps/api/src/__tests__/documents.test.ts`: PPTX slide order, text and notes extraction; plain text clean-up; unsupported types.
- `apps/api/src/__tests__/mockLlm.test.ts`: the mock reviewer's output validates against `AnalysisOutputSchema`, covers every preset criterion, guesses speaker roles, marks F2 not applicable without a presentation, penalises D1 when Prevent is absent, flags a wellbeing risk; mock appraisal narrative; `extractJson` tolerance.
- `apps/api/vitest.config.ts` sets `DATABASE_URL`, `JWT_SECRET` and `COOKIE_SECRET` so `loadConfig()` succeeds; the current tests do not touch the database. `pnpm --filter @slc/api test` runs `prisma generate` first.
- CI (`.github/workflows/ci.yml`): Postgres 16 service, `pnpm install --frozen-lockfile`, build `@slc/shared`, `prisma migrate deploy`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and a no-push Docker build of the API image. There are no end-to-end browser tests and no HTTP-level API tests.

## 13. Known limitations

- **Mock providers are for demonstrations only.** The mock reviewer scores by keyword matching against the preset codes and the mock transcriber ignores the uploaded recording and returns a fixed sample conversation. Reports produced with either are labelled as such and must not be used for real decisions.
- **Long inputs are truncated.** Transcripts longer than `MAX_TRANSCRIPT_CHARS` (140,000 characters, roughly two hours of speech) are cut before being sent to the model (the report's `inputsUsed` says so and confidence should reflect it); document text is capped at 60,000 characters on extraction and 16,000 (booklet, presentation) or 8,000 (other) in the prompt.
- **Video is transcribed, not watched.** Only the audio track is used; body language, slides shown on screen and anything visual are not analysed. Scanned PDFs without a text layer yield no text (a warning is recorded on the file).
- **No single sign-on.** Authentication is email + password with invitation links; there is no SSO/SAML/OIDC integration and no self-service password reset (an admin issues a temporary password).
- **Model output is probabilistic.** Scores can vary between runs; the deterministic part is everything after the per-criterion scores. A mandatory criterion the model fails to score is recorded as 1 ("not observed"), which may under-score a meeting if the model simply omitted it.
- **Speaker identification is heuristic.** The initial guess assumes the person who speaks most is the tutor; the model may correct it; staff can override it in the Transcript tab. Talk-share figures are only as good as the speaker map and the transcript's speaker labels (Amazon Transcribe is limited to `TRANSCRIBE_MAX_SPEAKERS`; single-speaker transcripts produce a warning and limited metrics).
- **One language.** `TRANSCRIBE_LANGUAGE` applies to every recording; there is no per-meeting language selection.
- **Re-running a review** goes straight to `meeting.analyse` when the transcript exists and no file is still in the `UPLOADED` state; if a booklet, presentation or replacement recording/transcript was added since the last run, it goes through `meeting.process` again so the new files are read (a new conversation file replaces the stored transcript).
- **Deletes are hard deletes.** `Meeting.deletedAt` exists in the schema and is filtered on, but `deleteMeeting` removes the row (and, by cascade, files, transcript, analyses and comments) and deletes the stored objects. There is no recycle bin.
- **Local storage buffers uploads in memory** and signs links with `COOKIE_SECRET`; it is intended for development and small on-premise installs, not for multi-gigabyte recordings at scale.
- **No pruning of the audit log or of superseded analyses**, and the CSV export is unpaginated (one row per completed analysis in the filter).
- **Sorting by score in the meetings list** (`sort=highest|lowest`) loads the whole filtered set and sorts in memory because scores live on the related analysis row; fine for thousands of meetings, worth revisiting beyond that.
- **`includeInactive` query parameters** use `z.coerce.boolean()`, so any non-empty value (including `false`) is treated as true; omit the parameter to get the default.

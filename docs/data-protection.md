# Data protection and responsible use

This note describes what personal data Meeting Review processes, the controls built into the software, and the decisions the college must take before using it. It is practical guidance from the engineering side, **not legal advice**; the college's Data Protection Officer should review it and complete a Data Protection Impact Assessment (DPIA) before go-live.

## 1. Personal data processed

| Data | About | Where it lives | Default retention |
|---|---|---|---|
| Recording of the meeting (audio/video) | tutor and learner (special category data may be disclosed in conversation, e.g. health, disability) | S3 uploads bucket (encrypted at rest, private, pre-signed access only) | Deleted after 90 days (Settings → Delete recordings after) |
| Transcript | tutor and learner | PostgreSQL | Deleted after 730 days by default (Settings) |
| Learner booklet / presentation / other documents and the extracted text | learner | S3 + PostgreSQL (extracted text) | Kept with the meeting; deleted when the meeting is deleted |
| Learner reference, optional first name, programme | learner | PostgreSQL | Kept with the meeting |
| Report (scores, rationale, evidence quotes, risks, summary) | tutor (and quotes from the learner) | PostgreSQL | Kept with the meeting |
| Staff account, role, department, job title, photo link, bio | staff | PostgreSQL | Until the account is deleted; deactivation is reversible |
| Comments, moderation records, appraisals, KPIs, competition entries | staff | PostgreSQL | Until deleted by a manager (locked appraisals cannot be deleted in the app) |
| Audit log (who did what, when, from which IP) | staff | PostgreSQL | Not deleted by the app |
| Notification emails | staff | Amazon SES (transit only) | Not stored by the app |

Data sent to third parties during processing:

- **Amazon Transcribe** (AWS, region configurable, default London `eu-west-2`): the recording, read directly from the college's own bucket. Output JSON is written back to the same bucket.
- **OpenRouter** and the chosen model provider: the transcript text, extracted document text, meeting details (title, programme, tutor name, learner first name unless redaction is on) and the criteria. OpenRouter routes requests to the model provider selected by `OPENROUTER_MODEL`; the college should check OpenRouter's and the provider's data-retention and training policies and choose a model/provider combination consistent with them. Setting a fallback model (`OPENROUTER_FALLBACK_MODEL`) sends data to that provider too.
- **Amazon SES**: notification emails (subject and short body only; no transcript content).

## 2. Controls in the software

- **Data minimisation.** Learners are identified by a reference number; the first name is optional and can be redacted from transcripts and prompts (Settings → Redact learner first names). Appraisal summaries are generated from statistics and short report summaries, not from raw transcripts.
- **Retention.** A nightly job deletes recordings and transcripts past their retention periods; reports are kept so trends remain. Deleting a meeting removes its files, transcript and report.
- **Access control.** Six roles with a fixed permission matrix (`packages/shared/src/roles.ts`). Tutors see only their own meetings and only appraisals that have been shared with them. Every object-level read is scoped on the server, not just hidden in the UI.
- **Authentication.** Passwords are hashed with scrypt; sessions use short-lived signed tokens in httpOnly cookies with refresh-token rotation; failed logins are rate-limited and audited; administrators can reset passwords (temporary password, must change on first sign-in) and deactivate accounts.
- **Transport and storage security.** HTTPS only (CloudFront and the load balancer), S3 server-side encryption, RDS encryption, private subnets, pre-signed upload and download links that expire (1 hour and 15 minutes respectively).
- **Auditability.** Logins, uploads, downloads, submissions, moderations, comments, criteria changes, role changes, settings changes, exports, deletions and retention sweeps are written to the audit log, visible to directors and system administrators.
- **Transparency of automated processing.** Every report shows the model, prompt version, criteria version, inputs used, confidence and the full calculation. Nothing is hidden from the tutor being reviewed.

## 3. Decisions for the college

1. **Lawful basis and transparency.** Decide the lawful basis for processing staff and learner data for this purpose (for staff this is commonly the employment relationship / legitimate interests with a documented balancing test; for learners, the public task of delivering education). Update the staff and learner privacy notices to say that meetings may be recorded and reviewed with AI assistance, what is stored, for how long, and who can see it.
2. **Recording consent and notice.** Decide how learners are told a meeting is recorded and how they can object. Recording a minor or a vulnerable adult needs particular care; follow the college's existing safeguarding and recording policies.
3. **Special category data.** Learners disclose health, disability, religion and similar information in induction meetings. The system flags such disclosures under "things a person should follow up" rather than scoring them, but the transcript still contains them. Keep transcript retention as short as the purpose allows and restrict who holds the manager, HR and director roles.
4. **No solely automated decisions.** UK GDPR Article 22 restricts decisions with legal or similarly significant effects based solely on automated processing. Appraisal, competition and KPI outcomes in this system are inputs to human decisions: managers moderate, write notes and share; tutors respond. Keep it that way in policy as well as in practice and say so in the staff privacy notice and any appraisal procedure.
5. **Staff consultation.** Monitoring of staff performance by recording should be discussed with staff and their representatives before launch, including how competitions and KPIs will be used.
6. **DPIA.** Complete a DPIA covering the above, the AWS and OpenRouter processors (data processing agreements, international transfers if a model provider is outside the UK/EEA), and the retention settings chosen.
7. **Subject access and erasure.** Reports, transcripts and comments are retrievable per person through the app and the database; the CSV export and the audit log help answer subject access requests. Deleting a meeting removes learner data for that meeting; deleting a staff account should be done by an administrator at database level if required, after locked appraisals have been exported.

## 4. Operational checklist before go-live

- [ ] DPIA completed and signed off
- [ ] Privacy notices updated (staff and learners)
- [ ] Retention periods set in Settings and agreed with the DPO
- [ ] Learner-name redaction decision made
- [ ] OpenRouter model/provider chosen with its data policy reviewed; API key stored in Secrets Manager
- [ ] AWS region confirmed (default `eu-west-2`, London)
- [ ] Roles assigned on a least-privilege basis; system admin accounts limited
- [ ] Email domain verified in SES or email notifications turned off
- [ ] Backups: RDS automated backups enabled (Terraform default 7 days) and a restore test done
- [ ] Staff briefing and the Help page reviewed for accuracy against local policy

# Criteria, scoring and benchmarks

This document explains what the system measures, where the preset criteria come from, how a score is calculated, and what "benchmark" means in this product. It is written so that a quality team can audit and adjust every part of it.

## 1. What is being assessed

The system assesses **the tutor's conduct of a one-to-one meeting with a learner**, not the learner. For an induction meeting that means: did the tutor welcome the learner properly, explain the programme, find out about the learner's starting point and needs, cover the safeguarding and compliance essentials, give useful information and guidance, and communicate clearly and personally.

## 2. The preset criteria sets

Two presets are installed. The default for induction meetings is **South London College online academic induction (Mentor-led, group or one-to-one)**: 7 groups, 30 criteria, 13 essential, designed from the college's own mentor guidelines, evaluation form and induction deck, the profile of the learners the college enrols, and published UK practice. Its full rationale, the concerns found in the current materials and every source are in `induction-criteria-review.md`. The generic preset below is kept for comparison and for campus-based provision.

### 2a. The generic preset

The preset set "Learner induction meeting (UK further education)" has 20 criteria in six groups. It is defined in `packages/shared/src/presetRubric.ts` and seeded into the database on first start. It is fully editable in the app (Criteria screen); editing creates a new version and earlier reports keep the version they were scored with.

| Group | Criteria | Essential items |
|---|---|---|
| A. Welcome and rapport | A1 Professional welcome and introductions; A2 Purpose and agenda explained; A3 Active listening and learner voice | - |
| B. Programme information | B1 Course structure, content and timetable; B2 Assessment and progression; B3 Expectations and ground rules | B1, B2, B3 |
| C. Learner needs and support | C1 Prior learning and initial assessment; C2 Learning support needs and reasonable adjustments; C3 Personal circumstances and barriers; C4 Goals and targets agreed | C1, C2, C4 |
| D. Safeguarding, wellbeing and compliance | D1 Safeguarding and Prevent explained; D2 Equality, diversity and inclusion; D3 Health, safety and online safety; D4 Policies, consent and learner agreement | D1, D2, D4 |
| E. Information, advice and guidance | E1 Careers and progression guidance; E2 Resources and services | - |
| F. Communication quality | F1 Clarity, pace and plain language; F2 Use of presentation and materials; F3 Personalisation; F4 Closing, actions and next steps | F4 |

Each criterion has:

- a **description** of what the reviewer looks for;
- **descriptors** for scores 1, 3 and 5 (2 and 4 are in between);
- a **weight** (0.5 to 3; the preset uses 1 for most, 1.5 for listening, prior learning, support needs, targets and personalisation, and 2 for safeguarding);
- an **essential** flag (the item must be covered in every meeting);
- **framework references** that explain why the criterion is there.

### Where the criteria come from

The preset criteria were written with reference to publicly available UK frameworks and statutory guidance. The references explain the *rationale* for each criterion. They are not a claim that any of these bodies has endorsed, reviewed or published this rubric, and the rubric is not a substitute for the college's own policies.

| Framework | Used for |
|---|---|
| Ofsted Education Inspection Framework (further education and skills) | Quality of education (intent, implementation, impact), behaviour and attitudes, personal development, safeguarding under leadership and management |
| Education and Training Foundation (ETF) Professional Standards for Teachers and Trainers (2022) | Professional values, communication, planning for individual needs, use of resources |
| Matrix Standard (information, advice and guidance) | Explaining the service, meeting individual needs, access to resources, agreed outcomes |
| Keeping Children Safe in Education (DfE) and the Prevent duty (Counter-Terrorism and Security Act 2015) | Safeguarding contact, reporting routes, Prevent and British values |
| Equality Act 2010 | Reasonable adjustments, protected characteristics, anti-discrimination expectations |
| UK GDPR / Data Protection Act 2018 | Transparency about data use, privacy notice, consent |
| Department for Education apprenticeship funding rules | Initial assessment, recognition of prior learning, commitment statement / learner agreement |

The college's quality team should check the wording against current guidance (the frameworks above change over time) and against the college's own induction checklist, and adjust weights and essential flags accordingly. Nothing in the scoring depends on the preset wording.

## 3. How a report is produced

1. **Transcript.** Either the uploaded transcript is parsed (Teams `.vtt`/`.docx`, `.srt`, plain text with speaker names) or the recording is transcribed by Amazon Transcribe with speaker identification.
2. **Documents.** Text is extracted from the learner booklet (PDF/Word), the presentation (PowerPoint/PDF) and any other document, up to 60,000 characters each. The reviewer uses the booklet to judge personalisation and the presentation to judge whether key slides were covered.
3. **Review.** The transcript, documents, meeting details, objective metrics and the full criteria set (with descriptors) are sent to the language model with a fixed prompt (`apps/api/src/providers/llm/prompts.ts`, version `PROMPT_VERSION`). The model must return JSON containing, for every criterion, a score 1-5 (or "not applicable" for a non-essential criterion that could not arise), a rationale, up to three verbatim evidence quotes with timestamps, and a suggestion. It also returns speaker roles, a summary, strengths, improvements, an action plan, risks for a person to follow up, presentation coverage, and a confidence level with a reason.
4. **Validation.** The JSON is validated against a schema. If it is malformed or misses criteria, the model is asked once to repair it. If it still fails, the meeting is marked as failed and nobody sees a partial report.
5. **Scoring.** All arithmetic is done in code, not by the model (see section 4).
6. **Storage.** The report, the raw model output, the model name, prompt version, criteria version, inputs used and token usage are stored so the report can be explained later.

## 4. The score, step by step

For each applicable criterion *i* with score *s<sub>i</sub>* (1-5) and weight *w<sub>i</sub>*:

- **Overall score** = ( Σ *s<sub>i</sub>* × *w<sub>i</sub>* ) ÷ ( Σ 5 × *w<sub>i</sub>* ) × 100, rounded to one decimal place.
- A criterion marked **not applicable** is excluded from both sums. An **essential** criterion can never be "not applicable": if the model does not score it, it is scored 1 ("not observed").
- **Essential items covered** = number of essential criteria scored 3 or more ÷ number of essential criteria × 100.
- **Grade** = the band whose minimum the overall score reaches. Default bands: Excellent 85+, Good 70+, Developing 55+, Needs support 0+. Bands and labels are editable per criteria set.
- **Moderation.** A manager can override any criterion score with a written reason. The overall score and grade are recalculated with the same formula from the moderated scores; the original AI scores remain visible, and the moderation (who, when, why, what changed) is shown on the report and written to the audit log.

The "How this was scored" tab on every report shows the weights, scores, points and the exact sums, so the calculation can be checked by hand. The same function (`computeOverallScore` in `packages/shared/src/scoring.ts`) is used by the API and by the web app's preview during moderation.

### Objective transcript measures

These are counted directly from the transcript words and timestamps (no AI): tutor and learner talk share (% of words), number of tutor questions and how many are open questions (start with what, how, why, tell me, describe, explain, which, where, when, who), number of learner questions, longest uninterrupted tutor stretch, speaking pace (words per minute), number of speaking turns and total words. They depend on the speaker-role assignment, which the model proposes and staff can correct in the Transcript tab.

## 5. What "benchmark" means here

The product shows **internal benchmarks**: the college-wide average, the department average, and each person's own history, over the same period and with the same criteria. These are computed from the college's own completed reports and are therefore directly comparable.

The product does **not** ship external numeric benchmarks (for example, "the sector average induction score is X" or "learners should speak Y% of the time"). We are not aware of a published, verified dataset of scores for one-to-one induction meetings against a rubric like this, and inventing such figures would undermine the transparency the system is built on. If the college obtains sector figures from a trusted source, KPI targets can be set to them.

## 6. Confidence and limitations

- Every report carries a **confidence level** (high / medium / low) with the model's reason, typically driven by transcript quality (single speaker label, truncation, poor audio).
- Automatic transcription mis-hears names and specialist terms; speaker identification can merge or split people. Staff can correct speaker roles.
- The model scores what was said. It cannot see body language, slides on screen, or anything off-microphone.
- Transcripts longer than about 140,000 characters are truncated for the review and the report says so.
- Reports produced with the **mock providers** (`LLM_PROVIDER=mock`, used for demos) are rule-based and clearly labelled; they are not valid for any decision about a person.
- Results depend on the model chosen (`OPENROUTER_MODEL`). Changing the model or the prompt version is recorded on each report; comparing scores across different models should be done with care.

## 7. Governance recommendations

- Treat reports as structured evidence for a professional conversation, not as a decision. Moderation and comments exist for that reason.
- Sample-check reports against the recording every term and record the outcome; adjust descriptors where the model and moderators disagree consistently.
- Review the criteria set at least once a year or when the referenced frameworks change.
- Agree with staff representatives how reports feed into appraisal, competitions and KPIs before switching those features on.

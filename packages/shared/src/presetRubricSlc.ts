import { DEFAULT_GRADE_BANDS } from './constants.js';
import type { PresetRubric } from './presetRubric.js';

/**
 * The enhanced "Online learner induction (South London College)" preset.
 *
 * Designed from the college's own mentor guidelines (v12.08.2026), the current
 * evaluation form and induction deck, the profile of the learners the college
 * enrols, and published UK practice (Ofsted, ETF, QAA, OfS, Jisc, CMA, ICO,
 * awarding organisations and named UK colleges and universities). Each
 * criterion is scored only from what the learner heard and saw in the
 * recording. Pre- and post-session administration and commercial messaging are
 * deliberately excluded from the quality score.
 *
 * The rationale, the concerns found in the current materials and the sources
 * are in docs/induction-criteria-review.md. Weights and essential flags are a
 * proposal for the academic team to review in the Criteria screen.
 *
 * This file is generated from the reviewed JSON draft; keep edits here in sync
 * with that document.
 */
export const SLC_INDUCTION_PRESET_RUBRIC: PresetRubric = {
  name: 'South London College online academic induction (Mentor-led, group or one-to-one)',
  description:
    'Criteria for reviewing a recorded online academic induction delivered by a Mentor over Teams, Zoom or Google Meet to new learners on South London College\'s self-paced vocational diplomas (also usable for the GEL, 1 Training and Study 365 brands). Scored only from what the learner heard and saw in the recording: the opening and recording notice; the learner\'s starting points, fit and goals; accurate programme, assessment and progression information; online study readiness and support; safeguarding, wellbeing and learner rights; engagement and communication; and the close. Pre- and post-session administration and commercial messaging are deliberately excluded from the quality score and listed as out of scope.',
  meetingType: 'INDUCTION',
  isDefault: true,
  gradeBands: [...DEFAULT_GRADE_BANDS],
  categories: [
    {
      name: 'A. Opening, recording notice and belonging',
      description: 'The first minutes: does the session start lawfully and safely, and does every learner feel welcomed, known by name and able to take part online?',
      criteria: [
        {
          code: 'A1',
          title: 'Technical check, recording notice and data use',
          description:
            'Before the formal induction starts the Mentor confirms learners can hear and see the shared screen, states that the session is recorded, explains why (quality review, including AI-assisted evaluation), who will see the recording, roughly how long it is kept, how to object or ask questions, and where the privacy notice is. Also explains briefly why the Pre-Course Learner Profile asks for support-need information and how it is used.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'No recording notice in the opening minutes, or recording mentioned only as \'for quality purposes\' with no reason, audience or way to object; audio and shared screen never checked with learners.',
            '3': 'Mentor checks audio and screen and says the session is recorded for quality purposes, but does not say who sees it, how long it is kept or how to object; data use of the Pre-Course Learner Profile not mentioned.',
            '5': 'Audio and shared screen confirmed; recording notice states purpose (including AI-assisted review), who sees it, retention, how to object and where the privacy notice is; purpose of Pre-Course Learner Profile data explained in plain words; learners given a moment to respond.',
          },
          frameworkRefs: [
            { framework: 'ICO, Right to be informed (UK GDPR Article 13 guidance)', note: 'Privacy information must include who you are, the purposes and lawful basis, recipients, retention periods and individuals’ rights; the ICO’s companion pages on when and how to provide it recommend giving it at the point of collection in clear, plain language.', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.1', note: 'Confirm learners can hear and see you; inform learners at the start that the session will be recorded for quality purposes.' },
            { framework: 'University of Westminster, Policy on the Use of Recording for Educational Purposes, s.5.5', note: 'Students have the right to object to being recorded and should be able to make this known at the start of a session.', url: 'https://www.westminster.ac.uk/sites/default/public-files/general-documents/Policy-on-the-use-of-recording-for-educational-purposes.pdf' },
          ],
        },
        {
          code: 'A2',
          title: 'Welcome, introductions and getting to know each learner',
          description:
            'The Mentor introduces themselves, their role and how they will support learners during the course, checks how each learner\'s name is pronounced, and invites every learner to introduce themselves: current role or setting, relevant experience and what they hope to achieve from the qualification. Sets a warm, professional tone that builds belonging from the start.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Mentor launches into slides with no personal introduction, or learners are not invited to speak; names mispronounced without checking; cameras and chat silent throughout the opening.',
            '3': 'Mentor introduces themselves and their role; learners asked to introduce themselves but briefly or only some speak; little use is made of what they say; hopes and goals not asked for.',
            '5': 'Mentor explains role, experience and how they will support learners; asks how to say names; each learner shares role, experience and goals and the Mentor acknowledges and links these to the course; in groups, quiet learners are gently included by name or via chat.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.1 and s.2.4', note: 'Introduce yourself including role, experience and how you will support learners; invite learners to introduce themselves with background, experience and what they hope to achieve; ask how to pronounce a name rather than guessing.' },
            { framework: 'Paul Hamlyn Foundation / HEA, What Works? Student Retention and Success (Thomas, 2012)', note: 'Belonging is critical to retention; an effective induction actively engages students and lets them get to know staff and each other rather than passively receiving information.', url: 'https://s3.eu-west-2.amazonaws.com/assets.creode.advancehe-document-manager/documents/hea/private/what_works_final_report_1568036657.pdf' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 6', note: 'Develop collaborative and respectful relationships with learners.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
          ],
        },
        {
          code: 'A3',
          title: 'Purpose, agenda and how to take part online',
          description:
            'The Mentor explains what the induction is for, what will be covered and roughly how long it will take, and how learners can take part online: using chat or raise-hand, when to mute, that questions are welcome throughout, and that learners do not need to remember everything because the information lives in the Learner Portal.',
          weight: 0.5,
          isMandatory: false,
          descriptors: {
            '1': 'Purpose never stated; no indication of what will be covered or how long; learners not told how to ask questions or use chat and raise-hand.',
            '3': 'Purpose stated briefly; agenda or duration missing, or learners only told how to ask questions after the first question arises.',
            '5': 'Purpose, agenda and expected duration stated at the start; learners shown how to use chat, raise-hand and mute; reassured that questions are welcome throughout and that everything covered is in the Learner Portal afterwards; invited to add their own questions to the agenda.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.1, s.4.1 and s.4.3', note: 'Explain the purpose and objectives of the induction; learners do not need to remember every detail; encourage use of chat or raise-hand for questions.' },
            { framework: 'Liverpool John Moores University, Guidance for online inductions (September 2020)', note: 'Induction should set expectations about how the institution will support students and the commitment required; students need guidance on how to use the technology to engage with tutors and peers.', url: 'https://cd-prod.ljmu.ac.uk/-/media/files/ljmu/microsites/teaching-and-learning-academy/guidance-for-induction--september-2020.pdf' },
          ],
        },
      ],
    },
    {
      name: 'B. Learner starting points, fit and goals',
      description: 'Was each learner treated as an individual: the right course for their role, prior learning, English, maths and digital skills, support needs, circumstances and goals, with a realistic study plan?',
      criteria: [
        {
          code: 'B1',
          title: 'Course choice, workplace role and evidence arrangements confirmed',
          description:
            'The Mentor checks that the learner has chosen the right qualification and pathway for their goals and, where the qualification requires workplace evidence (care, childcare, early years, education and training), confirms that the learner\'s current role and setting meet the entry rule (for example deputy manager or manager), that a line manager or expert witness can support observations, and how placement hours or observations will be arranged. Doubts are referred on rather than glossed over.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Entry requirements read from the slide; nobody asked about their actual role, setting or employer support; no check that the course fits the learner\'s goal.',
            '3': 'Mentor asks whether learners meet the entry rule (yes/no) but does not explore the setting, manager support or how observations and evidence will be gathered; fit with goals assumed.',
            '5': 'Each learner\'s role, setting and manager or expert-witness support discussed; observation or placement-hour arrangements and timing explained; Mentor checks the qualification and pathway fit the learner\'s goal and names who to contact if a course change is needed. On knowledge-only routes, fit and goal still checked.',
          },
          frameworkRefs: [
            { framework: 'NCFE, Qualification specification: NCFE CACHE Level 5 Diploma in Leadership for Health and Social Care and CYP Services (601/4312/5)', note: 'Learners need to be working in the role of Deputy or Manager in an appropriate setting, or have the opportunity to carry out responsibilities associated with these roles; minimum age 19.', url: 'https://www.ncfe.org.uk/media/d0yhup5q/601-4312-5-qualification-specification.pdf' },
            { framework: 'OTHM, Reasonable Adjustments and Special Consideration Policy v6.0, s.7 \'Recruiting with integrity\'', note: 'Centres must make justifiable judgements about each learner\'s potential to complete and ensure qualifications meet the learner\'s needs.', url: 'https://othm.org.uk/doc/policies_procedure/OTHM-Reasonable-Adjustments-and-Special-Consideration-Policy-v6.0.pdf' },
            { framework: 'UHI Moray, Student Induction Policy (2023)', note: 'Check that students have made the right choice of course and, where concerns are raised, refer them to guidance.', url: 'https://www.moray.uhi.ac.uk/t4-media/one-web/moray/about-us/publications/students/Student-Induction-Policy.pdf' },
          ],
        },
        {
          code: 'B2',
          title: 'Prior learning, experience and the Initial Assessment',
          description:
            'The Mentor asks about previous qualifications and relevant experience, explains that the Initial Assessment (due within 14 days) is used to understand starting points and plan support, and where relevant explains recognition of prior learning or credit transfer honestly, including advantages, limits and who decides.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Prior qualifications and experience not asked about; Initial Assessment mentioned only as a form to upload; recognition of prior learning never mentioned.',
            '3': 'Qualifications confirmed and the Initial Assessment named, but its purpose is not explained; experience not linked to the units; RPL not raised even where a learner describes substantial relevant study or practice.',
            '5': 'Qualifications and experience explored and linked to how the course will feel for the learner; purpose and use of the Initial Assessment explained; RPL or credit transfer raised where relevant with advantages, limits and the referral route to the quality team or awarding body.',
          },
          frameworkRefs: [
            { framework: 'NCFE, Qualification specification 601/4312/5 (RPL section)', note: 'Centres may recognise prior learning at their discretion; where RPL is used for a whole unit or more, External Quality Advisor advice must be sought.', url: 'https://www.ncfe.org.uk/media/d0yhup5q/601-4312-5-qualification-specification.pdf' },
            { framework: 'OTHM, Recognition of Prior Learning Policy v2.0 (March 2025)', note: 'The potential to claim credit through RPL should be identified within initial assessment, and the learner made aware of the advantages and disadvantages.', url: 'https://othm.org.uk/doc/policies_procedure/OTHM-Recognition-of-Prior-Learning-Policy_v2.0.pdf' },
            { framework: 'Qualifi, Level 3 Award in Education and Training Specification (June 2024)', note: 'Initial assessment must take account of available support and the learner\'s prior learning and qualifications.', url: 'https://qualifi.net/wp-content/uploads/2024/06/Qualifi-Level-3-Award-in-Education-and-Training-Specification-June-2024.pdf' },
          ],
        },
        {
          code: 'B3',
          title: 'English, maths and digital starting points',
          description:
            'The Mentor asks, rather than assumes, how confident each learner feels about academic writing in English, maths where the course needs it, and using the Learner Portal and Word, and signposts specific help: Learner Preparation for Academic Study, the Harvard Referencing Guide, Level 2 functional skills support or technical support. Entry rules on English and maths are explained as college requirements, with what to do if they are not yet met.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'No question about confidence with writing, English, maths or digital skills; Level 2 English and maths entry rule read out with no explanation of what to do if a learner does not hold it.',
            '3': 'Mentor asks a general \'any concerns?\' question and signposts study resources in general terms without naming where they are in the Learner Portal or who to contact.',
            '5': 'Each learner asked about confidence with academic writing, English, maths and digital tools; what Level 2 means and the route if not held explained; Learner Preparation for Academic Study, Harvard guide and technical support named and located; any follow-up need noted aloud.',
          },
          frameworkRefs: [
            { framework: 'Ofsted, Further education and skills inspection toolkit (June 2026, v2.0)', note: 'Progress recorded from learners\' starting points; development of English, mathematical and digital skills; high expectations for adults without level 2 English and maths.', url: 'https://assets.publishing.service.gov.uk/media/6a917f155a0c25165ae46694/Further_education_and_skills_inspection_toolkit.pdf' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 17', note: 'Develop learners\' mathematics, English, digital and wider employability skills.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'Jisc, 2024/25 UK FE learners digital experience insights survey', note: 'Only half of learners said they received guidance on the digital skills needed for their course.', url: 'https://digitalinsights.jisc.ac.uk/reports-and-briefings/our-reports/2024-25-uk-further-education-learners-digital-experience-insights-survey-findings/' },
          ],
        },
        {
          code: 'B4',
          title: 'Support needs and reasonable adjustments',
          description:
            'The Mentor invites learners, sensitively and without judgement, to share any disability, health condition, learning difference or access need; explains the kinds of adjustment available (for example extra time, alternative formats, assistive software, adjusted assessment arrangements); explains the reasonable adjustments and special consideration process and that it can be requested privately via the Mentor and the Pre-Course Learner Profile; and refers to anything already disclosed without exposing it in a group.',
          weight: 1.5,
          isMandatory: true,
          descriptors: {
            '1': 'Support needs not asked about, or the Diversity, Access and Inclusion slide read aloud with no invitation to disclose and no explanation of adjustments.',
            '3': 'A closed \'does anyone need any adjustments?\' question to the group with no examples, no private route offered and no mention of the process or the Pre-Course Learner Profile.',
            '5': 'Needs invited sensitively with examples of adjustments; a private route (message or one-to-one) offered; reasonable adjustments and special consideration process and timing explained; previously disclosed needs acknowledged privately and next steps agreed.',
          },
          frameworkRefs: [
            { framework: 'NCFE, Access Arrangements and Reasonable Adjustments for Internally Assessed Qualifications Policy (EQA-006 v1.1, November 2025)', note: 'Centres must make reasonable adjustments that reflect a learner\'s normal way of working, in line with the Equality Act 2010, so that no learner is disadvantaged.', url: 'https://www.ncfe.org.uk/media/hlbbiiwb/access-arrangements-reasonable-adjustments-policy.pdf' },
            { framework: 'OTHM, Reasonable Adjustments and Special Consideration Policy v6.0 (April 2025)', note: 'Centres should ensure learners are aware of the range of options available, including any reasonable adjustments that may be necessary.', url: 'https://othm.org.uk/doc/policies_procedure/OTHM-Reasonable-Adjustments-and-Special-Consideration-Policy-v6.0.pdf' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.2.4 and s.4.5', note: 'Be aware of support needs already identified; make reasonable adjustments where required and follow the appropriate process for reasonable adjustments or special consideration.' },
          ],
        },
        {
          code: 'B5',
          title: 'Personal circumstances, goals and a realistic weekly study plan',
          description:
            'The Mentor explores how study will fit around work, shifts, caring and other commitments (and time zone if abroad), captures what the learner wants from the qualification, and turns this into a realistic weekly study commitment for the learner\'s chosen plan (Standard or Fast-track) against the published Total Qualification Time and the 12-month access window, with a first target (for example first assignment date) and a review point.',
          weight: 1.5,
          isMandatory: true,
          descriptors: {
            '1': 'Goals and circumstances not discussed; \'plan your study time\' stated as a slogan with no hours, no reference to TQT or the 12-month access window and no first target.',
            '3': 'Learner\'s goal or circumstances touched on; study hours mentioned in general terms (\'a few hours a week\') but not derived from TQT and plan length; no first target or review date agreed.',
            '5': 'Work, caring and other commitments discussed respectfully; goal captured; weekly hours worked out from TQT and the learner\'s plan length with the 12-month window explained; a first target and a check-in date agreed and repeated at the close.',
          },
          frameworkRefs: [
            { framework: 'QAA, UK Quality Code Advice and Guidance: Admissions, Recruitment and Widening Access (2018)', note: 'Prospective part-time students with outside commitments may find it useful to know about indicative attendance requirements; distance-learning students may need to know about online enrolment and registration processes and any technology they will need.', url: 'https://www.qaa.ac.uk/docs/qaa/quality-code/advice-and-guidance-admissions-recruitment-and-widening-access.pdf' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 4', note: 'Support and develop learners\' confidence, autonomy and thinking skills, taking account of their needs and starting points.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'Barking & Dagenham College, Student Induction Policy and Procedures (November 2025)', note: 'Complete an individual learning plan with appropriate targets at the end of induction, based on prior attainment and initial assessment.', url: 'https://barkingdagenhamcollege.ac.uk/assets/files/StudentInductionPolicyNOV25.pdf' },
          ],
        },
      ],
    },
    {
      name: 'C. Programme, assessment and progression information',
      description: 'Does the learner leave with accurate, course-specific information on what the qualification is, how it is assessed, how to write and submit work with integrity, and where it can realistically lead?',
      criteria: [
        {
          code: 'C1',
          title: 'Course facts stated accurately',
          description:
            'Everything the Mentor states or shows about the qualification matches the awarding organisation\'s current specification and the college\'s published terms: title and pathway, awarding body and approved centre, level and Ofqual status, TQT, GLH and credits, access duration and plan, entry requirements (labelled as awarding-body or college rules), unit titles with mandatory and optional status, assessment method and progression. No generic or previous-course content is presented as current.',
          weight: 2,
          isMandatory: true,
          descriptors: {
            '1': 'One or more material errors stated as fact (wrong GLH or TQT, wrong units or pathway, progression for a different qualification), or slides for another course used without correction.',
            '3': 'Core facts (title, awarding body, level, TQT, credits, access duration) correct, but pathway not named, mandatory and optional units not distinguished, or a minor figure or progression detail does not match the specification.',
            '5': 'Title, pathway, awarding body and centre, level, TQT, GLH, credits, access duration, entry rules with their source, unit groups and assessment method all match the specification and SLC\'s published terms; any out-of-date slide corrected live; learners told where the specification is in the Learner Portal.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.2.3 \'Mandatory course-specific update check\' and Accuracy principle', note: 'Update title and pathway, overview (awarding body, level, TQT/GLH/credits/access), entry requirements, units, assessment, submission and progression; do not present generic or previous-course information as current.' },
            { framework: 'NCFE, Qualification specification 601/4312/5 (v9.0/v10.0, August 2022)', note: 'TQT 900; guided learning minimum 515, maximum 709; credit value 90 with at least 66 at Level 5; minimum age 19.', url: 'https://www.ncfe.org.uk/media/d0yhup5q/601-4312-5-qualification-specification.pdf' },
            { framework: 'CMA, UK higher education providers: advice on consumer protection law (CMA182, May 2023)', note: 'Provide clear, accurate, comprehensive, unambiguous and timely material information about courses, structure and costs, including information given verbally.', url: 'https://assets.publishing.service.gov.uk/media/64771faeb32b9e0012a95f30/Consumer_law_advice_for_higher_education_providers_.pdf' },
          ],
        },
        {
          code: 'C2',
          title: 'Course structure, units and how achievement works',
          description:
            'The Mentor explains how the qualification is built: shared core units, pathway mandatory units and how optional units will be chosen (the rule of combination in plain terms), what learning outcomes and assessment criteria are, how a unit is achieved (Achieved/Not yet achieved or Pass/Merit/Distinction as applicable), how materials and assignment briefs are organised in the Learner Portal, and the overall journey from first unit to certificate.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Unit list read out with no explanation of mandatory versus optional units, how a unit is passed, or how the course progresses to certification.',
            '3': 'Units and assessment criteria described but mandatory and optional units and the rule of combination not explained; the route from assignment to certificate is vague.',
            '5': 'Core, pathway and optional units distinguished and how optional units are agreed; grading or Achieved/Not yet explained; learning outcomes and criteria shown on a real assignment brief; journey to certification (internal quality assurance, awarding-body claim and timing) explained with understanding checked.',
          },
          frameworkRefs: [
            { framework: 'Pearson, Centre Guide: BTEC Quality Assurance 2026-2027, \'Inducting your students\'', note: 'Induction should cover as a minimum the content and structure of the course, what quality assurance is, and understanding how to achieve the qualification.', url: 'https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-quality-assurance.pdf' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.4 \'Mandatory areas to explain\'', note: 'Course or qualification overview and structure; learning outcomes and expectations; unit or module details.' },
            { framework: 'NCFE, Qualification factsheet 601/4312/5 (v2.0, June 2022)', note: 'Learners must achieve 90 credits (66 at Level 5 or above), all shared core units, the mandatory units for their pathway and optional units from the specified groups.', url: 'https://www.ncfe.org.uk/media/4kmjsfzq/601-4312-5-cypap-cypm-qualification-factsheet.pdf' },
          ],
        },
        {
          code: 'C3',
          title: 'Assessment methods, submission rules and feedback expectations',
          description:
            'How the learner will be assessed (written assignments, portfolio, workplace observation, expert witness testimony, professional discussion as applicable), the assignment structure and cover page, file naming (\'First Name Surname_Unit Number\') and no PDF submissions, how to submit via the Learner Portal, feedback turnaround and resubmission rules for the learner\'s plan (including any resubmission fee), deadlines on the assessment plan, and what happens at the internal quality assurance stage.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Assessment mentioned in a sentence; submission rules, feedback timescale and resubmission rules not covered.',
            '3': 'Methods and submission format explained but feedback turnaround, resubmission rules and fees, or the assessment plan deadlines are missing or stated for the wrong plan.',
            '5': 'Methods, structure, naming and format rules, how to submit, feedback turnaround and resubmission rules for the learner\'s own plan, assessment plan deadlines and the quality assurance step explained in order with an example brief on screen; understanding checked before moving on.',
          },
          frameworkRefs: [
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 19', note: 'Apply appropriate and fair methods of assessment and provide constructive and timely feedback to support learning and achievement.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'South London College, NCFE CACHE Level 5 Diploma course page (plan comparison table)', note: 'Standard plan: feedback within 14 days, resubmission fee applied; Fast-track: feedback within 5 days, free resubmission, two one-to-one sessions a month.', url: 'https://southlondoncollege.org/course/ncfe-cache-level-5-diploma-leadership-health-and-social-care-and-children-and-young-peoples-services/' },
            { framework: 'Pearson, Centre Guide: BTEC Quality Assurance 2026-2027, \'Inducting your students\'', note: 'Induction should cover understanding and interpreting assessments (command verbs).', url: 'https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-quality-assurance.pdf' },
          ],
        },
        {
          code: 'C4',
          title: 'Academic writing: PEEL, report structure and Harvard referencing',
          description:
            'The Mentor explains, with at least one worked example, how to build a paragraph with PEEL (Point, Extend, Example, Link), how a report is structured (cover page to appendices), what command verbs such as \'explain\', \'analyse\' and \'evaluate\' require, and how to cite and reference in Harvard style, and shows where the Harvard Referencing Guide and Assignment Guidelines live in the Learner Portal.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'PEEL, report structure and referencing not explained, or slides shown without comment; no example; guides not located.',
            '3': 'PEEL and structure explained from the slide but without an example or command verbs; Harvard referencing named but not demonstrated; location of guides mentioned only in passing.',
            '5': 'PEEL demonstrated with a short example relevant to the learner\'s sector; report structure walked through; command verbs explained; a Harvard in-text citation and reference shown; Harvard guide and Assignment Guidelines opened in the Learner Portal; a quick check question asked.',
          },
          frameworkRefs: [
            { framework: 'Pearson, Centre Guide: BTEC Quality Assurance 2026-2027, \'Inducting your students\'', note: 'Minimum induction content includes study skills (referencing, research skills, time management) and interpreting assessment command verbs.', url: 'https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-quality-assurance.pdf' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.4 and Quick Checklist', note: 'Academic standards, academic integrity and referencing expectations; PEEL and assignment structure explained.' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 17', note: 'Develop learners\' English and wider skills needed to succeed.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
          ],
        },
        {
          code: 'C5',
          title: 'Academic integrity, plagiarism and misuse of AI',
          description:
            'The Mentor explains in plain language what plagiarism, collusion, copying from the internet and misuse of generative AI mean in this course, how work is checked (including Turnitin where the plan includes it), what happens if malpractice is suspected (investigation, resubmission, possible withdrawal), where the academic integrity or malpractice policy is, and the acceptable way to use sources and AI tools.',
          weight: 1.5,
          isMandatory: true,
          descriptors: {
            '1': 'Integrity not mentioned, or the \'Academic Integrity Standards\' heading slide shown without explanation.',
            '3': 'Plagiarism defined and learners told to reference; AI misuse, collusion, how work is checked or the consequences not explained; policy location not given.',
            '5': 'Plagiarism, collusion and AI misuse explained with concrete examples; Turnitin or the checking process and consequences described; acceptable use of sources and AI tools stated; policy located in the Learner Portal; learners asked whether this is clear.',
          },
          frameworkRefs: [
            { framework: 'Pearson, Centre Guide: BTEC Quality Assurance 2026-2027, \'Inducting your students\'', note: 'Induction must cover what plagiarism and misuse of artificial intelligence are, and the investigation process.', url: 'https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-quality-assurance.pdf' },
            { framework: 'SLC, Evaluation of Online Learner Induction form, s.13 \'Compliance and Information Provided\'', note: 'Learners were informed about academic integrity requirements and about plagiarism and acceptable use of sources.' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.4', note: 'Academic standards, academic integrity and referencing expectations are mandatory areas to explain.' },
          ],
        },
        {
          code: 'C6',
          title: 'Progression and careers guidance: accurate, impartial and learner-focused',
          description:
            'Progression options match the awarding organisation\'s statement for this qualification and are related to each learner\'s stated goal (for example registered manager routes, degree entry, relevant Level 6 or 7 study), including honest limits (for example a qualification that is not \'full and relevant\' for a workforce role), and learners are told where to get impartial careers advice. Not a catalogue of the college\'s other courses.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'No discussion of where the course leads, or progression stated for a different qualification or a lower level.',
            '3': 'Progression listed generically from the slide; not related to learners\' goals; limits and impartial careers advice not mentioned.',
            '5': 'Progression options accurate for the qualification and pathway, linked to each learner\'s goal with honest limits; impartial careers or sector resources signposted; any next-course suggestion framed as an option rather than a sale.',
          },
          frameworkRefs: [
            { framework: 'DfE / ESFA, The matrix Standard: guidance notes (2021)', note: 'IAG follows pre-entry, on-programme and exit/next-step stages and must give learners access to quality-assured impartial information and advice.', url: 'https://www.gov.uk/government/publications/the-matrix-standard/the-matrix-standard-guidance-notes' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 18', note: 'Provide access to up-to-date information, advice and guidance so that learners can make informed progression choices.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'OTHM, Reasonable Adjustments and Special Consideration Policy v6.0, s.7', note: 'Learners should be made aware of any restrictions on progression routes resulting from not achieving certain outcomes.', url: 'https://othm.org.uk/doc/policies_procedure/OTHM-Reasonable-Adjustments-and-Special-Consideration-Policy-v6.0.pdf' },
          ],
        },
      ],
    },
    {
      name: 'D. Online study readiness and support',
      description: 'Can the learner actually get started: find and use the Learner Portal, submit the enrolment documents on time, study on their own device, reach the right person, and know what to do if they fall behind?',
      criteria: [
        {
          code: 'D1',
          title: 'Learner Portal demonstration and 14-day enrolment documents',
          description:
            'The Mentor shares the screen and walks through the live Learner Portal: logging in with the emailed credentials, Getting Started, Learner Handbook, assessment plan, course materials and assignment briefs, Harvard Referencing Guide, Learner Preparation for Academic Study, the submission area and forums. Explains that the Initial Assessment, Learner Enrolment Documents (LED) form and Learner Agreement must be uploaded within 14 days of access, and what to do if credentials have not arrived.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'No demonstration; Portal described from a slide or screenshot only; 14-day documents not mentioned or deadline unclear.',
            '3': 'Portal shown briefly or from an out-of-date screenshot with key areas skipped; 14-day documents named but not where to find or upload them, or what happens if the deadline is missed.',
            '5': 'Live Portal navigated at a steady pace through all key areas including submission and forums; Initial Assessment, LED form and Learner Agreement located with the 14-day deadline, upload route and consequences of delay; learners asked to confirm they can log in or told exactly how to get help if not.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.4, s.5 and Quick Checklist', note: 'Use of the LMS or Learner Portal; Learner Portal, Getting Started, enrolment documents, Learner Handbook and academic preparation demonstrated; remind learners of the 14-day enrolment-document requirement.' },
            { framework: 'QAA, UK Quality Code Advice and Guidance: Admissions, Recruitment and Widening Access (2018)', note: 'Distance-learning students may need to know about online enrolment and registration processes and the technology they will need.', url: 'https://www.qaa.ac.uk/docs/qaa/quality-code/advice-and-guidance-admissions-recruitment-and-widening-access.pdf' },
            { framework: 'The Open University, Help Centre: Induction - Get ready to start studying', note: 'Induction topics for distance learners include getting started, preparing for online study, study materials, studying on a screen and support.', url: 'https://help.open.ac.uk/browse/induction' },
          ],
        },
        {
          code: 'D2',
          title: 'Digital access and accessibility of the session',
          description:
            'The Mentor checks that each learner has what online study needs (a suitable device for producing Word documents, a reliable connection, somewhere to study) rather than assuming it, and makes the session itself accessible: live captions offered or turned on, slides or links shared in the chat or afterwards, the recording made available, and a route to technical support given (phone, live chat or email).',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'No question about device, connection or study space; no captions or slides offered; no technical support route given.',
            '3': 'Mentor states that a laptop is needed or that the recording will be shared, but does not ask about learners\' actual access, and captions and accessibility of the session are not addressed.',
            '5': 'Learners asked about device, connection and study space with practical alternatives (phone app limits, Word availability, library access); captions offered or enabled; slides and links shared; recording access explained; technical support contact named; follow-up noted for anyone with an access problem.',
          },
          frameworkRefs: [
            { framework: 'Jisc, 2024/25 UK FE learners digital experience insights survey', note: '45% of learners reported not having a suitable device for learning and 59% experienced wifi problems (campus-based sample; indicative).', url: 'https://digitalinsights.jisc.ac.uk/reports-and-briefings/our-reports/2024-25-uk-further-education-learners-digital-experience-insights-survey-findings/' },
            { framework: 'Jisc, Building digital capabilities framework: individual digital capabilities', note: 'What it means to be digitally capable varies for each person; learners should be able to self-assess their digital readiness rather than have it assumed.', url: 'https://digitalcapability.jisc.ac.uk/what-is-digital-capability/individual-digital-capabilities/' },
            { framework: 'University of Westminster, Policy on the Use of Recording for Educational Purposes, s.3.6', note: 'The availability of automatic captions does not guarantee accessibility; further measures may be needed where students require adjustments.', url: 'https://www.westminster.ac.uk/sites/default/public-files/general-documents/Policy-on-the-use-of-recording-for-educational-purposes.pdf' },
          ],
        },
        {
          code: 'D3',
          title: 'Support model, named contact and response expectations',
          description:
            'The Mentor explains precisely who supports the learner (named Mentor, tutor or assessor and the support team), the channels for different needs (phone, WhatsApp, email, forum, web chat), expected response times, what the learner\'s plan includes and does not include (for example one-to-one tutor sessions on Fast-track only), how progress is monitored, and how to connect with other learners through the forums or any cohort group.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Support described as \'contact us if you need anything\' with no named person, channel or response time.',
            '3': 'Mentor gives an email or phone number and mentions support, but response times, what the plan includes, how progress is monitored and peer forums are not explained.',
            '5': 'Named Mentor and support team with the right channel for each need; response times stated; plan inclusions and exclusions clear; progress monitoring explained; forums or peer contact introduced; contact details shown on screen or in chat and repeated at the close.',
          },
          frameworkRefs: [
            { framework: 'QAA, UK Quality Code Advice and Guidance: Enabling Student Achievement (2018), guiding principles 4 to 6', note: 'Clear, consistent and accessible communication about support available regardless of mode of study; belonging and a supportive community aid retention.', url: 'https://www.qaa.ac.uk/docs/qaa/quality-code/advice-and-guidance-enabling-student-achievement.pdf' },
            { framework: 'Wonkhe and Pearson, Building Belonging in Higher Education (October 2022)', note: 'Online social spaces were particularly valued by students who are not campus based or have other responsibilities; connection, inclusion, support and autonomy build belonging.', url: 'https://wonkhe.com/wp-content/wonkhe-uploads/2022/10/Building-Belonging-October-2022.pdf' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.5', note: 'Confirm where learners can access further support and the correct contact details or communication channels for the Mentor and support team.' },
          ],
        },
        {
          code: 'D4',
          title: 'Early warning: what to do when stuck or falling behind',
          description:
            'Learners are told, before problems arise, what happens if they miss an assessment-plan deadline, how to ask for an extension and what it costs, when the 12-month access ends and the fee for extending it, how the Mentor will follow up if a learner has not logged in or submitted, and that asking for help early is expected and welcomed.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Deadlines mentioned without any explanation of what to do if they are missed; extensions, access expiry and fees not mentioned.',
            '3': 'Mentor says \'contact me if you fall behind\' and mentions the 12-month window, but the extension process, fees and proactive follow-up are not explained.',
            '5': 'Missed-deadline route, extension process and fees, 12-month expiry and extension fee, and the Mentor\'s proactive follow-up (how and when) explained in a reassuring, non-punitive tone; learners given a concrete example of how to raise a problem early.',
          },
          frameworkRefs: [
            { framework: 'Paul Hamlyn Foundation / HEA, What Works? Student Retention and Success (Thomas, 2012)', note: 'Interventions should be proactive and monitored: students who most need support are least likely to come forward, and low engagement should trigger follow-up action.', url: 'https://s3.eu-west-2.amazonaws.com/assets.creode.advancehe-document-manager/documents/hea/private/what_works_final_report_1568036657.pdf' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 13', note: 'Promote and support positive learner behaviour, attitudes and wellbeing.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'South London College, FAQs and Course Extension Fee page', note: '12 months of access; an extension can be requested for an administrative fee (published extension fees £75 to £245 at diploma level).', url: 'https://southlondoncollege.org/faqs/' },
          ],
        },
      ],
    },
    {
      name: 'E. Safeguarding, wellbeing and learner rights',
      description: 'The protections every learner must hear about: who to go to about safety, wellbeing or unfair treatment, how to complain or appeal, and what the college has committed to.',
      criteria: [
        {
          code: 'E1',
          title: 'Safeguarding and Prevent explained in plain language',
          description:
            'The Mentor names the college\'s safeguarding lead or contact and how to reach them, explains in everyday language what kinds of concern to raise (about themselves, another learner, or people they support at work, including online abuse or exploitation), what happens after a concern is raised, and gives an accessible explanation of Prevent (radicalisation, including online) and British values as part of keeping safe. Framed for adult learners; adjusted where a brand enrols under-18s.',
          weight: 2,
          isMandatory: true,
          descriptors: {
            '1': 'Safeguarding not mentioned to learners, or a single policy-name reference with no contact or route.',
            '3': 'Safeguarding contact named or a route given, but what counts as a concern and what happens next are not explained; Prevent and British values not mentioned or read out as jargon.',
            '5': 'Named safeguarding contact and route shown on screen; examples of concerns relevant to adult learners and care or education workplaces; what happens next explained; Prevent and British values explained in plain language with an online-safety example; learners asked whether this is clear.',
          },
          frameworkRefs: [
            { framework: 'Home Office, Prevent duty guidance: England and Wales (2023)', note: 'Settings should make clear how learners or staff raise concerns about radicalisation and how referrals are made, treat Prevent as part of wider safeguarding and consider online risk; the guidance may inform best practice for non-specified sectors.', url: 'https://www.gov.uk/government/publications/prevent-duty-guidance/prevent-duty-guidance-for-england-and-wales-accessible' },
            { framework: 'Ofsted, Further education and skills inspection toolkit (June 2026, v2.0)', note: 'Safeguarding is a whole-provider evaluation area; the Prevent duty applies to learners of all ages; learners should know how to keep themselves safe online and from radicalisation.', url: 'https://assets.publishing.service.gov.uk/media/6a917f155a0c25165ae46694/Further_education_and_skills_inspection_toolkit.pdf' },
            { framework: 'Barking & Dagenham College, Student Induction Policy and Procedures (November 2025)', note: 'Even short-course and part-time inductions include headline Safeguarding, Prevent and British Values.', url: 'https://barkingdagenhamcollege.ac.uk/assets/files/StudentInductionPolicyNOV25.pdf' },
          ],
        },
        {
          code: 'E2',
          title: 'Wellbeing and mental health signposting',
          description:
            'The Mentor acknowledges that studying alongside demanding work and home lives can be stressful, names where learners can get wellbeing or mental-health support (a college contact and at least one external service appropriate to UK and overseas learners), explains how to tell the Mentor if circumstances change, and makes clear that asking for support will not disadvantage them.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Wellbeing and mental health not mentioned.',
            '3': 'Mentor says \'let us know if you are struggling\' without naming any wellbeing resource or explaining what support is possible.',
            '5': 'Wellbeing raised naturally with the realities of care or management roles acknowledged; a specific internal contact and external services named and shown on screen or in chat; link made to special consideration and extensions; tone normalising and non-judgemental.',
          },
          frameworkRefs: [
            { framework: 'Wonkhe and Pearson, Building Belonging in Higher Education (October 2022)', note: 'Well-defined, clearly articulated, inclusive support systems are fundamental to belonging; 35% of students felt lonely, rising to 50% for students with a disability.', url: 'https://wonkhe.com/wp-content/wonkhe-uploads/2022/10/Building-Belonging-October-2022.pdf' },
            { framework: 'Office for Students, Equality of Opportunity Risk Register: mature students', note: 'Mature students are likely to experience Risk 7 (insufficient personal support) and Risk 8 (mental health).', url: 'https://www.officeforstudents.org.uk/for-providers/equality-of-opportunity/equality-of-opportunity-risk-register-eorr/student-characteristics/mature-students/' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 13', note: 'Promote and support positive learner behaviour, attitudes and wellbeing.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
          ],
        },
        {
          code: 'E3',
          title: 'Equality, diversity, inclusion and respectful online conduct',
          description:
            'EDI is explained in practical terms rather than read as policy text: what respectful behaviour looks like in a group session, in chat and in forums; that discrimination, bullying and harassment are not tolerated; how to report unfair treatment; confidentiality of other learners\' disclosures in a group; not sharing recordings or login credentials; and the inclusive language expected in assignments about service users or learners.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'EDI slides read aloud or skipped; no reporting route; no expectations set for online conduct.',
            '3': 'EDI commitment stated and a reporting route given, but expectations for online conduct, confidentiality and inclusive language in assessed work are not covered.',
            '5': 'EDI explained with examples relevant to care or education practice; reporting route named; online conduct expectations (chat, forums, confidentiality, recordings, credentials) agreed with learners; link made to inclusive language in assignments.',
          },
          frameworkRefs: [
            { framework: 'Qualifi, Equality, Diversity and Inclusion Policy (September 2025)', note: 'Centres must operate an effective EDI policy that applies to all learners and ensure learners are familiar with it.', url: 'https://qualifi.net/wp-content/uploads/2025/10/EDI.pdf' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standards 5 and 16', note: 'Value and champion diversity, equality of opportunity, inclusion and social equity; select and use digital technologies safely.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'Ofsted, Further education and skills inspection toolkit (June 2026, v2.0)', note: 'Learners develop understanding of online safety, healthy relationships, fundamental British values, diversity and respect for all.', url: 'https://assets.publishing.service.gov.uk/media/6a917f155a0c25165ae46694/Further_education_and_skills_inspection_toolkit.pdf' },
          ],
        },
        {
          code: 'E4',
          title: 'Complaints, appeals, Learner Agreement and who the centre is',
          description:
            'The Mentor explains how to raise a complaint (first to the Mentor, then the formal college route), how to appeal an assessment decision including the awarding organisation\'s stage, who the approved centre and awarding body are for this qualification, what the Learner Agreement commits both sides to, and where these policies live. Also states in plain words the service terms that matter after today: the refund window, resubmission fees and extension fees.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Complaints, appeals and the Learner Agreement not mentioned.',
            '3': 'Complaints route given as \'email us\' only; appeals, the awarding body and centre identity or the Learner Agreement content not explained; later fees not mentioned.',
            '5': 'Complaints and appeals routes explained step by step with timescales and the awarding-body stage; centre and awarding body named; Learner Agreement summarised; refund window, resubmission and extension fees stated plainly; policy locations shown; learners invited to ask about terms.',
          },
          frameworkRefs: [
            { framework: 'CMA, UK higher education providers: advice on consumer protection law (CMA182, May 2023)', note: 'Complaint handling must be accessible, clear and fair; where a course is awarded by another body it should be clear where responsibility for complaints lies; material information includes fees and costs.', url: 'https://assets.publishing.service.gov.uk/media/64771faeb32b9e0012a95f30/Consumer_law_advice_for_higher_education_providers_.pdf' },
            { framework: 'Office for Students, How we regulate students\' consumer rights (July 2024)', note: 'Students should receive clear, accurate and timely information, fair terms and fair, accessible mechanisms for complaints, refunds and compensation.', url: 'https://www.officeforstudents.org.uk/for-providers/student-protection-and-choice/students-as-consumers/how-we-regulate-students-consumer-rights/' },
            { framework: 'Qualifi, Equality, Diversity and Inclusion Policy (September 2025)', note: 'Centres must operate an effective and accessible appeals procedure that applies to all learners and ensure learners are familiar with it.', url: 'https://qualifi.net/wp-content/uploads/2025/10/EDI.pdf' },
          ],
        },
      ],
    },
    {
      name: 'F. Engagement, communication and personalisation',
      description: 'How the Mentor delivered: two-way interaction, checking understanding, plain language, personal relevance, good use of slides and demonstrations, structure, and professional online conduct.',
      criteria: [
        {
          code: 'F1',
          title: 'Active listening and checking understanding',
          description:
            'The Mentor asks open questions, waits for answers (including from chat), listens without interrupting, reflects back what learners say, and deliberately pauses to check understanding at key transitions, especially after the course overview and before the assessment and technical sections, using specific check questions rather than only \'any questions?\'.',
          weight: 1.5,
          isMandatory: false,
          descriptors: {
            '1': 'Mentor talks throughout; questions are closed or rhetorical; chat ignored; no pause before assessment or technical content.',
            '3': 'Some open questions and \'any questions?\' at section ends; chat read occasionally; understanding assumed from silence.',
            '5': 'Regular open questions with real waiting time; chat and raise-hand monitored and answered; learners\' points reflected back; specific checks (for example \'what file type will you submit?\') before and after assessment and Portal sections; answers summarised for everyone.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.6', note: 'Listen carefully before responding; summarise important questions and answers; pause after general course information and before technical or assessment sections to check understanding.' },
            { framework: 'Paul Hamlyn Foundation / HEA, What Works? Student Retention and Success (Thomas, 2012)', note: 'An effective induction actively engages students rather than being a passive process of providing information.', url: 'https://s3.eu-west-2.amazonaws.com/assets.creode.advancehe-document-manager/documents/hea/private/what_works_final_report_1568036657.pdf' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 6', note: 'Develop collaborative and respectful relationships with learners.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
          ],
        },
        {
          code: 'F2',
          title: 'Plain language, acronyms and pace',
          description:
            'Explanations use plain English suited to adult learners who may have English as an additional language; acronyms (RQF, TQT, GLH, LED, IQA, EQA, RPL, PEEL, CQC, EYFS) are spelt out when first used; the pace allows processing; important points are repeated or typed into the chat; specialist terms are explained with an example.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Heavy jargon and unexplained acronyms; rushed delivery; learners visibly or audibly lost.',
            '3': 'Mostly clear; some acronyms unexplained; pace sometimes too fast for note-taking or for learners with English as an additional language.',
            '5': 'Consistently plain language; every acronym spelt out on first use; steady pace with key points repeated and typed into chat; checks that terms landed; wording adapted when a learner looks puzzled or asks.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.2', note: 'Use clear, simple and professional language; speak at an appropriate pace; avoid unnecessary technical terms and explain specialist terms clearly.' },
            { framework: 'ICO, Right to be informed: how should we draft our privacy information?', note: 'Use clear and plain language that is straightforward and familiar for the intended audience, especially where individuals may be vulnerable.', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/' },
            { framework: 'QAA, UK Quality Code Advice and Guidance: Enabling Student Achievement (2018), guiding principle 4', note: 'Effective communication recognises different modes of study, individual learning styles and preferences.', url: 'https://www.qaa.ac.uk/docs/qaa/quality-code/advice-and-guidance-enabling-student-achievement.pdf' },
          ],
        },
        {
          code: 'F3',
          title: 'Personalisation across the group',
          description:
            'The Mentor uses what is known from the Pre-Course Learner Profile and the introductions to tailor the session: names each learner\'s qualification, pathway, plan and awarding body where a group is mixed, relates examples to learners\' sectors and roles, adapts depth to experience, and avoids a generic read-through of a single deck.',
          weight: 1.5,
          isMandatory: false,
          descriptors: {
            '1': 'Generic script; no use of names, roles or profiles; a single deck presented to learners on different courses without acknowledgement.',
            '3': 'Learners addressed by name and some references to their roles; course-specific differences in a mixed group only partly handled.',
            '5': 'Consistently tailored: each learner\'s course, plan and role referenced; examples drawn from their settings; depth adjusted to experience; in a mixed group the differences in units, assessment and fees stated explicitly for each course.',
          },
          frameworkRefs: [
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 4', note: 'Take account of learners\' needs and starting points.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'QAA, UK Quality Code Advice and Guidance: Enabling Student Achievement (2018)', note: 'Transition support has the greatest benefit when it is relevant to students; communication recognises different modes of study and preferences.', url: 'https://www.qaa.ac.uk/docs/qaa/quality-code/advice-and-guidance-enabling-student-achievement.pdf' },
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, Consistency standard and s.2.4', note: 'Every learner receives the same core information while course-specific facts are tailored accurately to the qualification and individual support needs; review the Pre-Course Learner Profile before the session.' },
          ],
        },
        {
          code: 'F4',
          title: 'Use of slides, demonstrations and online tools',
          description:
            'Slides prompt a conversation rather than being read aloud; heading-only slides (Learner Handbook, Academic Integrity Standards, Assessment Process Overview) are brought to life with a live demonstration or explanation; screen share stays focused on the slide, Learner Portal or document being discussed; chat, raise-hand, annotation or polls are used where they help; technical glitches are handled calmly without losing the thread.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Slides read word for word or clicked past; heading slides skipped; screen share shows the wrong window or is lost for long periods; technical problems derail the session.',
            '3': 'Slides used as a script with limited interaction; a single demonstration; chat used only reactively.',
            '5': 'Slides used as prompts; heading slides turned into live Portal or document demonstrations; screen share focused and visible; chat and raise-hand used proactively; links and key points posted in chat; technical hitches handled calmly with a quick recap.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.3', note: 'Keep the screen share focused on the presentation, Learner Portal or resource being explained; encourage chat and raise-hand; respond to technical difficulties promptly.' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 16', note: 'Select and use digital technologies safely and effectively to promote learning.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
            { framework: 'Liverpool John Moores University, Guidance for online inductions (September 2020)', note: 'Include exemplar learning activities typical of how students will engage online rather than information alone.', url: 'https://cd-prod.ljmu.ac.uk/-/media/files/ljmu/microsites/teaching-and-learning-academy/guidance-for-induction--september-2020.pdf' },
          ],
        },
        {
          code: 'F5',
          title: 'Structure, pacing and time management',
          description:
            'The session follows a clear agenda, transitions are signposted, important sections are not rushed, enough time is kept for the Learner Portal demonstration and for questions, and the session ends within the stated time or any overrun is agreed with learners.',
          weight: 0.5,
          isMandatory: false,
          descriptors: {
            '1': 'No discernible structure; key sections rushed or dropped for time; demonstration or questions squeezed out; large unexplained overrun.',
            '3': 'Agenda broadly followed but transitions unsignposted; some sections rushed; questions mainly left to the end.',
            '5': 'Transitions signposted (\'we are now moving to assessment\'); time balanced across content, demonstration and questions; pace adjusted to the group; finishes on time or any overrun agreed with learners.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.4.7', note: 'Follow the planned agenda and timings; allocate sufficient time for questions, demonstrations and Learner Portal navigation; avoid rushing; signpost transitions.' },
            { framework: 'Liverpool John Moores University, Guidance for online inductions (September 2020)', note: 'Extended induction activity avoids overloading students with information from the outset.', url: 'https://cd-prod.ljmu.ac.uk/-/media/files/ljmu/microsites/teaching-and-learning-academy/guidance-for-induction--september-2020.pdf' },
          ],
        },
        {
          code: 'F6',
          title: 'Inclusive facilitation and professional online conduct',
          description:
            'The Mentor models professional online behaviour: a quiet, well-lit space with camera on and face visible, no multitasking or eating, patient and respectful responses, equal airtime in a group without pressuring individuals, professional boundaries, and no disclosure of confidential information about any learner.',
          weight: 0.5,
          isMandatory: false,
          descriptors: {
            '1': 'Mentor off camera or distracted; interrupts or talks over learners; one learner dominates unmanaged or an individual is pressed to answer; confidential details about a learner shared in the group.',
            '3': 'Professional environment and manner, but participation uneven and not managed; occasional multitasking or notifications.',
            '5': 'Professional, focused presence throughout; all learners invited in without pressure; respectful, patient responses; boundaries maintained; any disclosure handled privately.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.3.1, s.3.4 and s.4.5', note: 'Quiet, well-lit space; camera at eye level; no eating or multitasking; encourage participation without unnecessary pressure; maintain boundaries; do not share confidential information about individuals.' },
            { framework: 'ETF Professional Standards for Teachers and Trainers (2022), standard 6', note: 'Develop collaborative and respectful relationships with learners.', url: 'https://etfoundation.co.uk/professional-standards/teachers/' },
          ],
        },
      ],
    },
    {
      name: 'G. Closing and follow-up',
      description: 'Does the learner leave knowing exactly what to do next, who to contact, and how to say what they thought of the induction?',
      criteria: [
        {
          code: 'G1',
          title: 'Closing summary, first actions and next contact',
          description:
            'The Mentor summarises the key points, restates the 14-day enrolment documents and the first agreed target, confirms the next contact or check-in date, repeats the Mentor\'s and support team\'s contact details, explains how the recording and resources will be shared, notes any unanswered questions and says how and when they will be answered, and invites final questions.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Session ends abruptly after Q&A or the \'Thank You\' slide with no summary, next steps or contact details.',
            '3': 'Brief summary and contact details given, but no first target or check-in date, no mention of the 14-day documents, and unanswered questions not captured.',
            '5': 'Clear summary; 14-day documents and first target restated; check-in date agreed; contact details on screen or in chat; recording and resource sharing explained; unanswered questions listed with a response route and time; final questions invited and learners thanked.',
          },
          frameworkRefs: [
            { framework: 'SLC, Online Academic Induction Guidelines for Mentors v12.08.2026, s.5 and s.6', note: 'Summarise key points; remind learners of dates, deadlines and the 14-day enrolment-document requirement; confirm support and contact details; note unanswered questions; check the learner has a clear next action.' },
            { framework: 'DfE / ESFA, The matrix Standard: guidance notes (2021)', note: 'IAG delivery should lead to agreed outcomes and follow-up for the individual.', url: 'https://www.gov.uk/government/publications/the-matrix-standard/the-matrix-standard-guidance-notes' },
            { framework: 'Paul Hamlyn Foundation / HEA, What Works? Student Retention and Success (Thomas, 2012)', note: 'Effective induction extends over a longer period than a few days; early engagement and follow-up matter.', url: 'https://s3.eu-west-2.amazonaws.com/assets.creode.advancehe-document-manager/documents/hea/private/what_works_final_report_1568036657.pdf' },
          ],
        },
        {
          code: 'G2',
          title: 'Learner feedback and learner voice invited neutrally',
          description:
            'The Mentor invites all learners to give honest feedback on the induction through the college\'s survey or feedback route, explains how feedback is used to improve inductions, and how learners\' views are heard during the course (forums, surveys, speaking to the Mentor or quality team). The request is neutral: no reference to star ratings, no request directed only at satisfied learners, and no incentive or pressure.',
          weight: 0.5,
          isMandatory: false,
          descriptors: {
            '1': 'No invitation for feedback, or learners asked specifically for a 5-star rating or a review \'if you are happy with the session\'.',
            '3': 'Feedback link mentioned but without saying how it is used or how views are heard later; wording leans towards positive ratings.',
            '5': 'All learners invited to give honest feedback via the quality team\'s route; how it is used explained; ongoing learner-voice channels named; wording neutral with no incentive or pressure.',
          },
          frameworkRefs: [
            { framework: 'CMA, Fake reviews guidance (CMA208, April 2025), paras 3.6 and 4.5', note: 'Encouraging only those who are satisfied to leave reviews is cherry-picking; a general, neutral invitation to review without predetermining sentiment is not prohibited.', url: 'https://assets.publishing.service.gov.uk/media/67eeb64fe9c76fa33048c790/CMA208_-_Fake_reviews_guidance.pdf' },
            { framework: 'Wonkhe and Pearson, Building Belonging in Higher Education (October 2022)', note: 'A timely post-induction student survey offers a further chance to close gaps in knowledge or understanding.', url: 'https://wonkhe.com/wp-content/wonkhe-uploads/2022/10/Building-Belonging-October-2022.pdf' },
            { framework: 'UHI Moray, Student Induction Policy (2023)', note: 'Students should be aware of the arrangements for them to be represented and for their views to be heard.', url: 'https://www.moray.uhi.ac.uk/t4-media/one-web/moray/about-us/publications/students/Student-Induction-Policy.pdf' },
          ],
        },
      ],
    },
  ],
};

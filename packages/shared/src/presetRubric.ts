import { DEFAULT_GRADE_BANDS } from './constants.js';
import type { MeetingType } from './enums.js';
import { SLC_INDUCTION_PRESET_RUBRIC } from './presetRubricSlc.js';

/**
 * The preset "Learner induction meeting" rubric.
 *
 * Each criterion is mapped to the publicly available UK frameworks it draws on.
 * The mapping explains *why* a criterion is there; it is not a claim that any
 * body has endorsed this rubric. The college's quality team should review and
 * adjust weights, wording and mandatory flags in the Criteria screen.
 *
 * Frameworks referenced:
 *  - Ofsted Education Inspection Framework (further education and skills)
 *  - Education and Training Foundation (ETF) Professional Standards for Teachers and Trainers (2022)
 *  - Matrix Standard for information, advice and guidance (IAG)
 *  - Keeping Children Safe in Education (DfE) and the Prevent duty
 *  - Equality Act 2010
 *  - UK GDPR / Data Protection Act 2018
 *  - Department for Education apprenticeship funding rules (initial assessment and prior learning)
 */

export interface PresetCriterion {
  code: string;
  title: string;
  description: string;
  weight: number;
  isMandatory: boolean;
  descriptors: Record<'1' | '3' | '5', string>;
  frameworkRefs: { framework: string; note: string; url?: string }[];
}

export interface PresetCategory {
  name: string;
  description: string;
  criteria: PresetCriterion[];
}

export interface PresetRubric {
  name: string;
  description: string;
  meetingType: MeetingType;
  /**
   * When true this preset becomes the default for its meeting type the first
   * time it is installed, unless an administrator has already chosen a
   * custom (non-preset) rubric as the default.
   */
  isDefault?: boolean;
  gradeBands: { min: number; label: string; colour: string; description: string }[];
  categories: PresetCategory[];
}

const OFSTED = 'Ofsted Education Inspection Framework';
const ETF = 'ETF Professional Standards (2022)';
const MATRIX = 'Matrix Standard (IAG)';
const KCSIE = 'Keeping Children Safe in Education / Prevent duty';
const EQUALITY = 'Equality Act 2010';
const GDPR = 'UK GDPR / Data Protection Act 2018';
const FUNDING = 'DfE apprenticeship funding rules';

export const INDUCTION_PRESET_RUBRIC: PresetRubric = {
  name: 'Learner induction meeting (UK further education)',
  description:
    'Preset criteria for a one-to-one induction meeting between a tutor and a new learner. Covers welcome and rapport, programme information, learner needs and support, safeguarding and compliance, information, advice and guidance, and communication quality.',
  meetingType: 'INDUCTION',
  gradeBands: [...DEFAULT_GRADE_BANDS],
  categories: [
    {
      name: 'Welcome and rapport',
      description: 'Did the meeting start well and did the learner feel heard?',
      criteria: [
        {
          code: 'A1',
          title: 'Professional welcome and introductions',
          description:
            'The tutor introduces themselves and their role, checks the learner’s name and how they like to be addressed, and sets a friendly, professional tone.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'No real introduction; the meeting starts abruptly or the learner is not greeted by name.',
            '3': 'Tutor introduces themselves and greets the learner, but little effort to put the learner at ease.',
            '5': 'Warm, professional welcome; tutor explains their role, checks the learner’s preferred name and clearly puts the learner at ease.',
          },
          frameworkRefs: [{ framework: ETF, note: 'Professional values and attributes' }],
        },
        {
          code: 'A2',
          title: 'Purpose and agenda explained',
          description:
            'The tutor explains what the meeting is for, what will be covered and roughly how long it will take.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Purpose of the meeting is never stated.',
            '3': 'Purpose is stated briefly but no outline of what will be covered.',
            '5': 'Purpose, agenda and expected duration are stated clearly at the start and the learner is invited to add anything they want to discuss.',
          },
          frameworkRefs: [{ framework: MATRIX, note: 'Service is clearly explained to the individual' }],
        },
        {
          code: 'A3',
          title: 'Active listening and learner voice',
          description:
            'The tutor asks open questions, gives the learner time to speak, listens without interrupting and checks understanding.',
          weight: 1.5,
          isMandatory: false,
          descriptors: {
            '1': 'Tutor dominates; closed questions only; learner contributions are cut off or ignored.',
            '3': 'Some open questions; learner speaks, but understanding is rarely checked.',
            '5': 'Regular open questions, genuine pauses for the learner, reflects back what the learner says and checks understanding throughout.',
          },
          frameworkRefs: [
            { framework: ETF, note: 'Communicate effectively with learners' },
            { framework: OFSTED, note: 'Learners’ views and needs inform the programme' },
          ],
        },
      ],
    },
    {
      name: 'Programme information',
      description: 'Does the learner leave knowing what the course is, how it is assessed and what is expected?',
      criteria: [
        {
          code: 'B1',
          title: 'Course structure, content and timetable',
          description:
            'Units or modules, delivery mode (in person, online, blended), weekly hours, key dates and where to find the timetable.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Course content and timetable are not explained.',
            '3': 'Outline of the course given; timetable or key dates only partly covered.',
            '5': 'Clear explanation of units, delivery mode, hours, key dates and where the learner can find the timetable, with understanding checked.',
          },
          frameworkRefs: [{ framework: OFSTED, note: 'Quality of education - intent and implementation' }],
        },
        {
          code: 'B2',
          title: 'Assessment and progression',
          description:
            'How the learner will be assessed, deadlines, grading, what support is available, and what the course can lead to.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Assessment is not mentioned.',
            '3': 'Assessment methods mentioned but deadlines, grading or progression routes are unclear.',
            '5': 'Assessment methods, deadlines, grading and realistic next steps after the course are all explained in plain language.',
          },
          frameworkRefs: [{ framework: OFSTED, note: 'Quality of education - impact and progression' }],
        },
        {
          code: 'B3',
          title: 'Expectations and ground rules',
          description:
            'Attendance and punctuality, behaviour and respect, how to communicate with the tutor, and any equipment or dress requirements.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'No expectations are set.',
            '3': 'Attendance or behaviour mentioned but incomplete; no explanation of consequences or support.',
            '5': 'Attendance, punctuality, behaviour, communication channels and practical requirements are explained and framed positively.',
          },
          frameworkRefs: [{ framework: OFSTED, note: 'Behaviour and attitudes' }],
        },
      ],
    },
    {
      name: 'Learner needs and support',
      description: 'Was the learner treated as an individual, with their starting point, needs and goals explored?',
      criteria: [
        {
          code: 'C1',
          title: 'Prior learning and initial assessment',
          description:
            'Previous qualifications, relevant experience, recognition of prior learning, and English and maths starting points.',
          weight: 1.5,
          isMandatory: true,
          descriptors: {
            '1': 'Prior learning and starting points are not discussed.',
            '3': 'Qualifications are confirmed but experience, prior learning and English and maths are not explored.',
            '5': 'Qualifications, experience, prior learning and English and maths starting points are explored and linked to how the programme will be tailored.',
          },
          frameworkRefs: [
            { framework: FUNDING, note: 'Initial assessment and recognition of prior learning' },
            { framework: OFSTED, note: 'Teachers use assessment to identify starting points' },
          ],
        },
        {
          code: 'C2',
          title: 'Learning support needs and reasonable adjustments',
          description:
            'Sensitively explores learning difficulties, disabilities, health conditions or an EHCP, and explains the support and adjustments available.',
          weight: 1.5,
          isMandatory: true,
          descriptors: {
            '1': 'Support needs are not asked about.',
            '3': 'Asked as a closed yes/no question with no explanation of available support.',
            '5': 'Asked sensitively and without judgement; the support available is explained and next steps agreed where a need is identified.',
          },
          frameworkRefs: [
            { framework: EQUALITY, note: 'Duty to make reasonable adjustments' },
            { framework: OFSTED, note: 'Learners with SEND and high needs' },
          ],
        },
        {
          code: 'C3',
          title: 'Personal circumstances and barriers',
          description:
            'Work, caring responsibilities, finances, travel and digital access, with signposting to bursary, wellbeing and other services.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Personal circumstances are not considered.',
            '3': 'Some circumstances discussed but no signposting to support.',
            '5': 'Barriers are explored respectfully and the learner is signposted to specific support, with actions noted.',
          },
          frameworkRefs: [{ framework: MATRIX, note: 'Service meets the individual’s needs' }],
        },
        {
          code: 'C4',
          title: 'Goals and targets agreed',
          description:
            'The learner’s career and personal goals are captured and turned into specific, measurable targets with a review date.',
          weight: 1.5,
          isMandatory: true,
          descriptors: {
            '1': 'Goals are not discussed.',
            '3': 'Goals are discussed in general terms but no specific targets or review date.',
            '5': 'Goals are explored in depth and turned into specific, measurable targets with a review date, agreed with the learner.',
          },
          frameworkRefs: [
            { framework: OFSTED, note: 'Personal development and ambitious intent' },
            { framework: ETF, note: 'Plan and deliver learning that meets individual needs' },
          ],
        },
      ],
    },
    {
      name: 'Safeguarding, wellbeing and compliance',
      description: 'The essentials the college must cover with every learner.',
      criteria: [
        {
          code: 'D1',
          title: 'Safeguarding and Prevent explained',
          description:
            'Who the safeguarding contact is, how to raise a concern, and an accessible explanation of the Prevent duty and British values.',
          weight: 2,
          isMandatory: true,
          descriptors: {
            '1': 'Safeguarding is not mentioned.',
            '3': 'Safeguarding mentioned briefly without contact details or how to report; Prevent not explained.',
            '5': 'Named safeguarding contact, how to report a concern, and Prevent and British values explained in accessible language, with understanding checked.',
          },
          frameworkRefs: [
            { framework: KCSIE, note: 'Safeguarding information for learners; Prevent duty' },
            { framework: OFSTED, note: 'Leadership and management - safeguarding' },
          ],
        },
        {
          code: 'D2',
          title: 'Equality, diversity and inclusion',
          description:
            'Expectations of respect, zero tolerance of bullying or discrimination, and how to report concerns.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Not mentioned.',
            '3': 'Mentioned as a policy name only.',
            '5': 'Explained in practical terms with examples and clear reporting routes.',
          },
          frameworkRefs: [{ framework: EQUALITY, note: 'Protected characteristics' }],
        },
        {
          code: 'D3',
          title: 'Health, safety and online safety',
          description:
            'Physical safety on site or in the workplace, and safe, respectful conduct online including use of college systems.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Not mentioned.',
            '3': 'Covered partially (for example physical safety only).',
            '5': 'Both physical and online safety covered with practical guidance relevant to the programme.',
          },
          frameworkRefs: [{ framework: OFSTED, note: 'Learners know how to keep themselves safe' }],
        },
        {
          code: 'D4',
          title: 'Policies, consent and learner agreement',
          description:
            'Complaints and appeals process, how learner data is used (privacy notice and consent), and the learner agreement or commitment statement.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'None of these are mentioned.',
            '3': 'Some policies mentioned; data use or complaints route unclear.',
            '5': 'Complaints route, data use and the learner agreement are explained in plain language and the learner confirms understanding.',
          },
          frameworkRefs: [
            { framework: GDPR, note: 'Transparency and lawful basis for processing' },
            { framework: FUNDING, note: 'Commitment statement / learner agreement' },
          ],
        },
      ],
    },
    {
      name: 'Information, advice and guidance',
      description: 'Does the learner know what is available to them and where this course can lead?',
      criteria: [
        {
          code: 'E1',
          title: 'Careers and progression guidance',
          description:
            'Progression pathways from the course, employer or higher education links, and how to access careers advice.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'No discussion of where the course leads.',
            '3': 'Progression mentioned generally; no signposting to careers advice.',
            '5': 'Specific progression routes discussed in relation to the learner’s goals, and careers services signposted.',
          },
          frameworkRefs: [
            { framework: MATRIX, note: 'Information, advice and guidance quality' },
            { framework: OFSTED, note: 'Careers guidance and personal development' },
          ],
        },
        {
          code: 'E2',
          title: 'Resources and services',
          description:
            'Library, IT and virtual learning environment logins, student services, enrichment and how to get help.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Services and resources are not mentioned.',
            '3': 'A few services listed without explaining how to access them.',
            '5': 'Key services and resources explained with how to access each, tailored to what the learner needs.',
          },
          frameworkRefs: [{ framework: MATRIX, note: 'Access to resources and services' }],
        },
      ],
    },
    {
      name: 'Communication quality',
      description: 'How clearly and personally was the meeting delivered?',
      criteria: [
        {
          code: 'F1',
          title: 'Clarity, pace and plain language',
          description:
            'Avoids jargon and acronyms, speaks at an appropriate pace, and checks understanding at key points.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Heavy jargon or acronyms; rushed; understanding never checked.',
            '3': 'Mostly clear but some unexplained jargon; understanding checked occasionally.',
            '5': 'Consistently plain language, good pace, acronyms explained and understanding checked at each key point.',
          },
          frameworkRefs: [{ framework: ETF, note: 'Communicate effectively with learners' }],
        },
        {
          code: 'F2',
          title: 'Use of presentation and materials',
          description:
            'Where a presentation or booklet is used, it supports the conversation rather than being read aloud, and key slides are covered.',
          weight: 1,
          isMandatory: false,
          descriptors: {
            '1': 'Materials read aloud word for word, or key slides skipped entirely.',
            '3': 'Materials used but with limited explanation or interaction.',
            '5': 'Materials used as a prompt for a two-way conversation; key slides covered and linked to the learner’s situation.',
          },
          frameworkRefs: [{ framework: ETF, note: 'Select and use appropriate resources' }],
        },
        {
          code: 'F3',
          title: 'Personalisation',
          description:
            'The tutor uses what is known about the learner (from the booklet or profile) and tailors the conversation to them.',
          weight: 1.5,
          isMandatory: false,
          descriptors: {
            '1': 'Generic script; nothing specific to this learner.',
            '3': 'Some references to the learner’s situation.',
            '5': 'Consistently tailored: refers to the learner’s background, goals and needs and adapts explanations accordingly.',
          },
          frameworkRefs: [{ framework: ETF, note: 'Plan learning that meets individual needs' }],
        },
        {
          code: 'F4',
          title: 'Closing, actions and next steps',
          description:
            'Summarises what was agreed, confirms next steps and dates, explains how to get in touch and invites final questions.',
          weight: 1,
          isMandatory: true,
          descriptors: {
            '1': 'Meeting ends without a summary or next steps.',
            '3': 'Next steps mentioned but not summarised or confirmed with the learner.',
            '5': 'Clear summary of agreed actions, confirmed next steps and dates, contact details given and the learner invited to ask final questions.',
          },
          frameworkRefs: [{ framework: MATRIX, note: 'Agreed outcomes and follow-up' }],
        },
      ],
    },
  ],
};

/**
 * All presets installed by the API on start-up. The South London College
 * preset is flagged as the default for induction meetings; the generic UK
 * further-education preset is kept for comparison and for colleges with
 * campus-based, timetabled provision.
 */
export const PRESET_RUBRICS: PresetRubric[] = [SLC_INDUCTION_PRESET_RUBRIC, INDUCTION_PRESET_RUBRIC];

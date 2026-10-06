/**
 * Seed: creates the first system admin (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD),
 * the preset criteria, and - when SEED_DEMO_DATA=true - a set of demo departments,
 * staff, meetings and completed reports so the system can be evaluated immediately.
 *
 * Safe to run repeatedly: existing records are left alone.
 */
import { computeOverallScore, computeTranscriptMetrics, gradeFor, type GradeBand, type TranscriptSegment } from '@slc/shared';
import { loadConfig } from '../config.js';
import { prisma } from '../db.js';
import { hashPassword } from '../lib/password.js';
import { logger } from '../logger.js';
import { ensurePresetRubrics } from '../services/rubrics.service.js';
import { SAMPLE_TRANSCRIPT_SEGMENTS } from './sampleTranscript.js';

const cfg = loadConfig();

async function upsertUser(data: { email: string; firstName: string; lastName: string; role: 'TUTOR' | 'ACADEMIC_ADMIN' | 'ACADEMIC_MANAGER' | 'HR' | 'DIRECTOR' | 'SYSTEM_ADMIN'; jobTitle: string; departmentId?: string | null; password: string; bio?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email: data.email, firstName: data.firstName, lastName: data.lastName, role: data.role, jobTitle: data.jobTitle, departmentId: data.departmentId ?? null, passwordHash: await hashPassword(data.password), bio: data.bio ?? null },
  });
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function main() {
  logger.info('seeding: admin account');
  const admin = await upsertUser({ email: cfg.SEED_ADMIN_EMAIL.toLowerCase(), firstName: 'System', lastName: 'Admin', role: 'SYSTEM_ADMIN', jobTitle: 'System administrator', password: cfg.SEED_ADMIN_PASSWORD });

  logger.info('seeding: preset criteria');
  await ensurePresetRubrics(admin.id);
  const rubric = await prisma.rubric.findFirstOrThrow({ where: { isPreset: true }, include: { criteria: { where: { isArchived: false } } } });

  if (!cfg.SEED_DEMO_DATA) {
    logger.info('seeding complete (no demo data)');
    return;
  }

  const alreadySeeded = await prisma.user.findUnique({ where: { email: 'daniel.okafor@demo.slc.ac.uk' } });
  if (alreadySeeded) {
    logger.info('demo data already present - skipping');
    return;
  }

  logger.info('seeding: demo departments and staff');
  const depts = await Promise.all(['Health and Social Care', 'Business and Professional', 'Construction and Engineering', 'English and Maths'].map((name) => prisma.department.upsert({ where: { name }, create: { name }, update: {} })));
  const pw = 'Demo-Pass-2026';
  const manager = await upsertUser({ email: 'amira.hassan@demo.slc.ac.uk', firstName: 'Amira', lastName: 'Hassan', role: 'ACADEMIC_MANAGER', jobTitle: 'Head of Quality', departmentId: depts[0].id, password: pw });
  await upsertUser({ email: 'tom.bennett@demo.slc.ac.uk', firstName: 'Tom', lastName: 'Bennett', role: 'ACADEMIC_ADMIN', jobTitle: 'Academic administrator', departmentId: depts[1].id, password: pw });
  await upsertUser({ email: 'grace.whitfield@demo.slc.ac.uk', firstName: 'Grace', lastName: 'Whitfield', role: 'HR', jobTitle: 'HR business partner', password: pw });
  await upsertUser({ email: 'james.oconnor@demo.slc.ac.uk', firstName: 'James', lastName: "O'Connor", role: 'DIRECTOR', jobTitle: 'Director of Curriculum', password: pw });
  const tutors = await Promise.all([
    upsertUser({ email: 'daniel.okafor@demo.slc.ac.uk', firstName: 'Daniel', lastName: 'Okafor', role: 'TUTOR', jobTitle: 'Lecturer, Health and Social Care', departmentId: depts[0].id, password: pw, bio: 'Teaching Level 2 and 3 Health and Social Care since 2019.' }),
    upsertUser({ email: 'sophie.clarke@demo.slc.ac.uk', firstName: 'Sophie', lastName: 'Clarke', role: 'TUTOR', jobTitle: 'Lecturer, Business', departmentId: depts[1].id, password: pw }),
    upsertUser({ email: 'ravi.patel@demo.slc.ac.uk', firstName: 'Ravi', lastName: 'Patel', role: 'TUTOR', jobTitle: 'Lecturer, Engineering', departmentId: depts[2].id, password: pw }),
    upsertUser({ email: 'chloe.adams@demo.slc.ac.uk', firstName: 'Chloe', lastName: 'Adams', role: 'TUTOR', jobTitle: 'Lecturer, Health and Social Care', departmentId: depts[0].id, password: pw }),
    upsertUser({ email: 'marcus.reid@demo.slc.ac.uk', firstName: 'Marcus', lastName: 'Reid', role: 'TUTOR', jobTitle: 'Lecturer, Maths', departmentId: depts[3].id, password: pw }),
  ]);

  logger.info('seeding: demo meetings and reports');
  const rand = seededRandom(42);
  const programmes = ['Level 3 Diploma in Health and Social Care', 'Level 2 Business Administration', 'Level 3 Engineering', 'GCSE Maths resit', 'Level 2 Health and Social Care'];
  const bands = rubric.gradeBands as GradeBand[];
  const criteria = rubric.criteria;
  let meetingIndex = 0;
  for (const [ti, tutor] of tutors.entries()) {
    const count = 4 + Math.floor(rand() * 4);
    const skill = 0.55 + ti * 0.08 + rand() * 0.15; // each tutor has a different baseline
    for (let i = 0; i < count; i++) {
      meetingIndex++;
      const daysAgo = Math.floor(rand() * 150) + 2;
      const meetingDate = new Date(Date.now() - daysAgo * 86_400_000);
      const learnerRef = `L${String(10000 + meetingIndex * 37).padStart(5, '0')}`;
      const segments: TranscriptSegment[] = SAMPLE_TRANSCRIPT_SEGMENTS.map((s) => ({ ...s }));
      const speakerMap = { spk_0: 'TUTOR' as const, spk_1: 'LEARNER' as const };
      const metrics = computeTranscriptMetrics(segments, speakerMap);
      const meeting = await prisma.meeting.create({
        data: {
          title: `Induction - ${learnerRef}`,
          meetingType: 'INDUCTION',
          status: 'READY',
          tutorId: tutor.id,
          createdById: ti % 2 === 0 ? tutor.id : manager.id,
          learnerReference: learnerRef,
          learnerFirstName: ['Priya', 'Jordan', 'Fatima', 'Leon', 'Amelia', 'Kai'][meetingIndex % 6],
          programme: programmes[ti % programmes.length],
          meetingDate,
          durationSeconds: Math.round(metrics.durationSeconds),
          rubricId: rubric.id,
          submittedAt: meetingDate,
          completedAt: new Date(meetingDate.getTime() + 20 * 60_000),
          processingLog: [
            { step: 'transcript', state: 'done', detail: `${segments.length} lines, 2 speaker labels (demo data)`, at: meetingDate.toISOString() },
            { step: 'analysis', state: 'done', detail: `Scored ${criteria.length} criteria (demo data)`, at: new Date(meetingDate.getTime() + 20 * 60_000).toISOString() },
          ],
          transcript: { create: { source: 'MOCK', language: 'en-GB', segments: segments as never, speakerMap: speakerMap as never, wordCount: metrics.totalWords } },
        },
      });

      const scored = criteria.map((c) => {
        const base = skill * 5 + (rand() - 0.5) * 2.2;
        const score = Math.max(1, Math.min(5, Math.round(base)));
        const notApplicable = c.code === 'F2';
        return { c, score: notApplicable ? null : score, notApplicable };
      });
      const result = computeOverallScore(scored.map((s) => ({ criterionId: s.c.id, weight: s.c.weight, isMandatory: s.c.isMandatory, score: s.score, notApplicable: s.notApplicable })));
      const grade = gradeFor(result.overallScore, bands).label;
      const strong = scored.filter((s) => s.score === 5).slice(0, 3);
      const weak = scored.filter((s) => s.score !== null && s.score <= 3).slice(0, 3);
      await prisma.analysis.create({
        data: {
          meetingId: meeting.id,
          rubricId: rubric.id,
          rubricVersion: rubric.version,
          status: 'COMPLETE',
          isCurrent: true,
          provider: 'mock',
          model: 'demo-data',
          promptVersion: 'demo',
          overallScore: result.overallScore,
          grade,
          mandatoryCoverage: result.mandatoryCoverage,
          summary: `Demo report. ${tutor.firstName} led a ${Math.round(metrics.durationSeconds / 60)}-minute induction with ${meeting.learnerFirstName}. ${strong.length ? `Strong on ${strong.map((s) => s.c.title.toLowerCase()).join(', ')}.` : ''} ${weak.length ? `Room to improve on ${weak.map((s) => s.c.title.toLowerCase()).join(', ')}.` : ''}`,
          learnerExperience: 'The learner was given space to talk and left with clear next steps.',
          strengths: strong.map((s) => `${s.c.title}: clearly covered and checked with the learner.`),
          improvements: weak.map((s) => `${s.c.title}: ${s.c.descriptors && (s.c.descriptors as Record<string, string>)['5'] ? `aim for - ${(s.c.descriptors as Record<string, string>)['5']}` : 'cover this more fully.'}`),
          actionPlan: weak.map((s, idx) => ({ action: `Add "${s.c.title.toLowerCase()}" to your induction checklist`, why: 'Closes a gap against the college criteria', priority: idx === 0 ? 'HIGH' : 'MEDIUM' })),
          risks: [],
          materialsCoverage: [],
          metrics: metrics as never,
          scoreBreakdown: { ...result, speakerMap } as never,
          confidence: 'MEDIUM',
          confidenceReason: 'Demo data generated by the seed script.',
          inputsUsed: ['Demo transcript'],
          startedAt: meetingDate,
          completedAt: new Date(meetingDate.getTime() + 20 * 60_000),
          criteria: {
            create: scored.map((s) => {
              const evidence = segments.filter((seg) => seg.speaker === 'spk_0').slice(Math.floor(rand() * 20), Math.floor(rand() * 20) + 1).map((seg) => ({ quote: seg.text.split(' ').slice(0, 30).join(' '), startSeconds: seg.start, speaker: seg.speaker }));
              return {
                criterionId: s.c.id,
                score: s.score,
                notApplicable: s.notApplicable,
                rationale: s.notApplicable ? 'No presentation was provided for this meeting.' : `${(s.c.descriptors as Record<string, string>)[String(s.score)] ?? (s.c.descriptors as Record<string, string>)[s.score! >= 4 ? '5' : s.score! >= 2 ? '3' : '1']} (demo data)`,
                evidence: s.notApplicable ? [] : evidence,
                suggestion: s.score !== null && s.score < 5 ? `Check the learner's understanding after covering ${s.c.title.toLowerCase()}.` : null,
              };
            }),
          },
        },
      });
    }
  }

  // A manager comment and a moderation on one meeting, a KPI, a competition and an appraisal.
  const firstMeeting = await prisma.meeting.findFirstOrThrow({ where: { tutorId: tutors[0].id }, include: { analyses: true } });
  await prisma.comment.create({ data: { meetingId: firstMeeting.id, authorId: manager.id, body: 'Really good rapport in this one. Can we make sure the Prevent duty is covered explicitly next time?' } });
  await prisma.comment.create({ data: { meetingId: firstMeeting.id, authorId: tutors[0].id, body: 'Thanks Amira - I have added it to my checklist.' } });

  const termStart = new Date(Date.now() - 120 * 86_400_000);
  const termEnd = new Date(Date.now() + 60 * 86_400_000);
  await prisma.kpi.createMany({
    data: [
      { name: 'Induction quality - all tutors', description: 'Average induction meeting score of at least 75 this term.', metric: 'AVERAGE_SCORE', target: 75, comparison: 'AT_LEAST', periodStart: termStart, periodEnd: termEnd, createdById: manager.id },
      { name: 'Essential items covered', description: 'Safeguarding, support needs, targets and the other essentials covered in at least 90% of meetings.', metric: 'MANDATORY_COVERAGE', target: 90, comparison: 'AT_LEAST', periodStart: termStart, periodEnd: termEnd, createdById: manager.id },
      { name: 'Reviewed meetings per tutor', description: 'At least 4 meetings reviewed per tutor this term.', metric: 'MEETINGS_REVIEWED', target: 4, comparison: 'AT_LEAST', periodStart: termStart, periodEnd: termEnd, createdById: manager.id },
    ],
  });
  const comp = await prisma.competition.create({
    data: {
      name: 'Autumn induction challenge',
      description: 'Highest average induction score this term wins. Minimum three reviewed meetings to qualify.',
      metric: 'AVERAGE_SCORE',
      rubricId: rubric.id,
      startDate: termStart,
      endDate: termEnd,
      minMeetings: 3,
      prize: 'Recognition at the staff awards and a CPD day of your choice',
      autoEnrol: true,
      createdById: manager.id,
      participants: { create: tutors.map((t) => ({ userId: t.id })) },
    },
  });
  await prisma.appraisal.create({
    data: { title: 'Mid-year review 2026', tutorId: tutors[0].id, createdById: manager.id, periodStart: termStart, periodEnd: new Date(), status: 'DRAFT', managerNotes: 'Daniel has taken on two extra induction groups this year.' },
  });
  await prisma.notification.create({ data: { userId: tutors[0].id, type: 'COMPETITION_STARTED', title: `You have been entered into "${comp.name}"`, body: comp.description, link: `/competitions/${comp.id}` } });

  logger.info({ admin: cfg.SEED_ADMIN_EMAIL, demoPassword: pw }, 'seeding complete');
  console.log(`
  Demo accounts (password: ${pw}):
    Academic manager : amira.hassan@demo.slc.ac.uk
    Academic admin   : tom.bennett@demo.slc.ac.uk
    HR               : grace.whitfield@demo.slc.ac.uk
    Director         : james.oconnor@demo.slc.ac.uk
    Tutors           : daniel.okafor@, sophie.clarke@, ravi.patel@, chloe.adams@, marcus.reid@  (all @demo.slc.ac.uk)
  System admin: ${cfg.SEED_ADMIN_EMAIL} / ${cfg.SEED_ADMIN_PASSWORD}
`);
}

main()
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

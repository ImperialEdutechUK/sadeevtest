import type { TranscriptSegment } from '@slc/shared';

/**
 * A realistic (fictional) induction meeting used by the mock transcription
 * provider and the demo seed. spk_0 is the tutor, spk_1 is the learner.
 * It deliberately covers most criteria well and misses a few (Prevent duty,
 * measurable targets, complaints process) so demo reports show both
 * strengths and improvements.
 */
const T = 'spk_0';
const L = 'spk_1';

const script: [string, number, string][] = [
  [T, 0, 'Hi Priya, come in, have a seat. I am Daniel, I will be your course tutor for the Level 3 Health and Social Care diploma this year. Is it Priya, have I said that right?'],
  [L, 9, 'Yes, Priya is right. Nice to meet you.'],
  [T, 12, 'Lovely. So this is your induction meeting. It should take about thirty minutes. I want to go through what the course looks like, how you will be assessed, the support we offer, and most importantly find out a bit about you and what you want to get out of it. Is there anything you particularly want to make sure we cover today?'],
  [L, 30, 'Mainly I want to know how much time I need to put in each week, because I work part time at a care home.'],
  [T, 38, 'That is a really good question and we will definitely cover it. Tell me a bit about the care home work first, what do you do there?'],
  [L, 45, 'I am a care assistant, mostly evenings and weekends, about sixteen hours a week. I have been there just over a year.'],
  [T, 54, 'That experience is going to be really valuable on this course, a lot of the units link directly to what you are already doing. Can I ask what you did before that, in terms of school or college?'],
  [L, 65, 'I finished my GCSEs two years ago. I got a 4 in English and a 3 in maths. Then I did a Level 2 in health and social care at another college.'],
  [T, 78, 'Great, so you have the Level 2 already, that is the normal entry route. Because your maths GCSE is a grade 3, you will need to continue with maths alongside the diploma. That is a government requirement, not just ours. We will do an initial assessment in the first week so we can see exactly where you are and put you in the right group. How do you feel about maths?'],
  [L, 100, 'Honestly I find it stressful. I am worried it will take time away from the main course.'],
  [T, 107, 'I understand, and you are not alone in that. The maths sessions are two hours a week and the tutors are used to working with people who had a tough time with it at school. We can also look at whether the care home can support you with any of it. Let us keep an eye on it together and if it is getting on top of you, you tell me early. Does that sound fair?'],
  [L, 128, 'Yes, that sounds okay.'],
  [T, 131, 'Right, let me explain the course itself. The diploma has twelve units over the year. Some are mandatory, like safeguarding, communication, and person-centred care, and then you pick two optional units later in the year. You are in college three days a week, Monday, Tuesday and Thursday, nine thirty to three thirty. The timetable is on the student portal, which I will show you how to log into in a moment.'],
  [L, 158, 'Three days. And is there work to do at home as well?'],
  [T, 162, 'Yes, you should expect around six hours a week of independent study, reading and writing up assignments. Thinking about your sixteen hours at the care home, that is going to be a full week. How do you think that will work with your shifts?'],
  [L, 176, 'I think it is doable if I keep my shifts to Friday, Saturday and Sunday. I would need to speak to my manager.'],
  [T, 184, 'That sounds sensible. Shall we make that one of your actions, to speak to your manager about fixing your shift pattern before the course starts?'],
  [L, 193, 'Yes, I will do that.'],
  [T, 196, 'In terms of assessment there are no exams on this course. Each unit is assessed through assignments, some observations of your practice, and a reflective journal. Every assignment has a deadline and we give you those at the start of each unit. If you miss a deadline without talking to us first it can affect your grade, so the key thing is to talk to me early if something is going wrong. Grades are pass, merit and distinction. At the end you can progress to university, for example nursing or social work degrees, or into a senior care role or an apprenticeship.'],
  [L, 232, 'University is what I am hoping for. I want to do adult nursing.'],
  [T, 238, 'That is a great goal and this is exactly the right course for it. Most universities ask for merit or distinction grades for nursing, plus maths and English at grade 4, so the maths we talked about is really important for that route. We have a careers adviser, Sarah, who runs university application workshops from January. I would like you to book a session with her in the first term. We can put that down as an action as well.'],
  [L, 262, 'Okay, I will.'],
  [T, 265, 'Now, a few things about expectations. We ask for a minimum of ninety percent attendance. If you are going to be absent you need to let us know by nine o clock on the day, there is a number on the portal. We want everyone to be on time and to treat each other with respect, that is really the main rule. You will need a laptop or tablet for sessions, do you have access to one?'],
  [L, 288, 'I have an old laptop but it is quite slow. I mostly use my phone.'],
  [T, 293, 'We have a laptop loan scheme through the library, so I will note that down and we can sort one out for you at enrolment. You may also be eligible for the bursary fund for travel and equipment because of your household income, so I will refer you to student services to check. Is travel going to be an issue for you?'],
  [L, 312, 'It is two buses but it is fine. The bursary would help a lot actually.'],
  [T, 318, 'Good, I will make the referral today. Is there anything else going on at home that might affect your studies, caring responsibilities or anything like that? You do not have to tell me, but it helps us support you.'],
  [L, 332, 'Not really. I help my mum sometimes but nothing major.'],
  [T, 337, 'Okay. And do you have any learning needs or health conditions we should know about, anything you had extra support for at school, or anything that would make the classroom harder for you?'],
  [L, 348, 'I had extra time in my GCSE exams because I am dyslexic. I never had a formal plan though.'],
  [T, 355, 'Thank you for telling me, that is really helpful. We have a learning support team who can put the same adjustments in place here, extra time, assistive software, that sort of thing. I will refer you and they will contact you in the first two weeks to meet and agree what works best. There is no stigma to it at all, a lot of students use the service.'],
  [L, 378, 'That is a relief actually.'],
  [T, 381, 'Now, safeguarding. This is important so bear with me. If you ever feel unsafe, or worried about yourself or another student, in college or outside, the person to speak to is our safeguarding lead, Marcus Reid. His office is in the student hub and his email is on the portal. You can also talk to me or any member of staff and we will make sure it gets to the right person. Does that make sense?'],
  [L, 406, 'Yes. Is that the same for things at work, at the care home?'],
  [T, 410, 'Yes, absolutely, if something at a placement or your workplace worries you, you can come to us. We also have a zero tolerance approach to bullying, harassment and discrimination of any kind. Everyone here is treated equally regardless of background, religion, disability, sexuality, anything. If you ever see or experience something like that, report it to me or to Marcus.'],
  [L, 430, 'Okay.'],
  [T, 432, 'Online safety too, because a lot of the course uses the college systems. Keep your login private, be respectful in the online forums, and do not share any photos or information about residents from your care home anywhere, that is a confidentiality issue.'],
  [L, 447, 'I would never do that.'],
  [T, 450, 'I know, but we have to say it. One more admin thing, you will have signed a learner agreement at enrolment. That covers how we use your data, which is mainly for your learning record and for reporting to the funding agency. If you want to see the privacy notice it is on the website.'],
  [L, 466, 'Fine.'],
  [T, 468, 'So let us talk about you and what you want to achieve. You said adult nursing. What is it about nursing that appeals?'],
  [L, 476, 'At the care home I like the hands-on care but I want to be able to do more, like the clinical side. I want to work in a hospital eventually.'],
  [T, 487, 'That is a really clear motivation and it comes through. So your long term goal is a nursing degree. For this year, what would make it a success for you?'],
  [L, 497, 'Passing everything, and getting my maths.'],
  [T, 502, 'Let us be a bit more ambitious. Given the grades universities want, I think aiming for merit or above across the units is realistic for you, with your experience. And we want the maths grade 4 by the summer. We will review those at your first progress review in about eight weeks.'],
  [L, 519, 'Okay, I can go for that.'],
  [T, 522, 'Brilliant. Let me show you the portal quickly. Your login is your student number and the password you set at enrolment. On here you will find the timetable, assignment deadlines, the library, and the student services pages where the bursary form is. There is also a counselling and wellbeing service if things ever feel too much, you can self refer. The library runs study skills sessions which I would recommend given the dyslexia, they are really good for assignment structure.'],
  [L, 552, 'That is useful. Do I have to book those?'],
  [T, 555, 'You just turn up, the times are on the portal. Right, let me just summarise what we have agreed. You are going to speak to your manager about fixing your shifts to the weekend. I am going to refer you to learning support for the dyslexia, to student services for the bursary and laptop loan, and you are going to book a session with Sarah in careers in the first term. We will look at the maths after the initial assessment, and your targets for the year are merit or above and the maths grade 4. Have I missed anything?'],
  [L, 590, 'No, that is everything. Thank you.'],
  [T, 593, 'If you need me, my email is on the portal and I am in room B12 most days. You can also message me through the portal and I reply within a working day. Any last questions before we finish?'],
  [L, 606, 'No, I think I am good. Thanks Daniel.'],
  [T, 610, 'Great, welcome to the college Priya, I will see you on Monday.'],
];

export const SAMPLE_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = script.map(([speaker, start, text], i) => {
  const next = script[i + 1];
  const end = next ? next[1] : start + 6;
  return { speaker, start, end, text };
});

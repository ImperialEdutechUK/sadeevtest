import type { TranscriptSegment } from '@slc/shared';

/**
 * A realistic (fictional) ONLINE group induction used by the mock
 * transcription provider and the demo seed when the South London College
 * preset is the default. spk_0 is the Mentor, spk_1 and spk_2 are learners
 * joining over Teams. The qualification facts quoted are those published for
 * the NCFE CACHE Level 5 Diploma in Leadership for Health and Social Care and
 * Children and Young People's Services (TQT 900, GLH 515 to 709, 90 credits).
 *
 * It deliberately covers most criteria well and misses a few (Prevent and
 * British values, wellbeing signposting, the complaints route, careers detail)
 * so demo reports show both strengths and improvements. All people, settings
 * and contact details are invented.
 */
const M = 'spk_0';
const L1 = 'spk_1';
const L2 = 'spk_2';

const script: [string, number, string][] = [
  [M, 0, 'Good evening everyone, welcome. Before we start properly, can you both hear me clearly and see the shared screen with the title slide? Just unmute or pop a yes in the chat.'],
  [L1, 12, 'Yes, I can hear you and see the slide.'],
  [L2, 16, 'Yes, all good here.'],
  [M, 19, 'Lovely. I need to let you know that this session is being recorded. We record inductions for quality purposes, that includes review by our academic team and by an AI-assisted review tool, and the recording is kept for ninety days and then deleted. Only the academic quality team and I can see it. If you would rather not be recorded, say so now or message me privately and we will arrange a one-to-one instead, and the privacy notice is on the Learner Portal under Policies.'],
  [L1, 52, 'That is fine with me.'],
  [L2, 54, 'Fine, thanks for explaining.'],
  [M, 57, 'Thank you. I am Amara and I will be your Mentor for the NCFE CACHE Level 5 Diploma in Leadership for Health and Social Care and Children and Young People\'s Services. Let us do quick introductions. Tomasz, could you tell us your role, where you work and what you hope to achieve? And tell me if I have pronounced your name right.'],
  [L1, 78, 'It is Tomasz, yes, close enough. I am deputy manager at a residential care home in Leeds, about forty residents. I want to become the registered manager when our current one retires next year.'],
  [M, 95, 'That is a clear goal, and the Adult Management pathway is exactly the route for a registered manager role. Grace, how about you?'],
  [L2, 104, 'I am Grace, I am a deputy manager in a residential children\'s home in Croydon. I have been there six years. I want the qualification so I can apply for manager posts, and honestly I am nervous about the written work, I have not studied since school.'],
  [M, 122, 'Thank you for saying that Grace, a lot of people feel the same and we will spend time on the writing side today. So the purpose of today is to get you confident about starting, to make sure you know how the course works and where to find help. It will take about forty five minutes. We will cover the qualification itself, how you are assessed, the Learner Portal, the documents you need to send back within fourteen days, and support. Please interrupt me at any time, use the raise hand button or just unmute.'],
  [M, 152, 'First, a quick check that you are each on the right course. Tomasz, you are working as a deputy manager in adult residential care, so the Adult Management pathway. Grace, yours is children and young people residential, so the Children and Young People\'s Management pathway. Both pathways need you to be working as, or able to act as, a deputy manager or manager in your setting, which you both are. Is that right?'],
  [L1, 178, 'Yes, that is right.'],
  [L2, 180, 'Yes.'],
  [M, 182, 'Good. The other thing to confirm now is workplace evidence. Some units are assessed through direct observation of your practice and expert witness testimony from your manager. So you will need your manager to agree to act as an expert witness and to allow an assessor to observe you. Have you spoken to your managers about that?'],
  [L1, 203, 'My manager knows I am doing it and is supportive. I have not asked about observations specifically.'],
  [M, 210, 'Then that is a good first action, Tomasz, to ask your manager this week whether they will be your expert witness. Grace?'],
  [L2, 218, 'Mine has already said yes, she did the same qualification.'],
  [M, 222, 'Excellent. Now, your starting points. You both completed the Pre-Course Learner Profile, thank you. Tomasz, you have a Level 3 in health and social care, so a lot of the Level 5 content will build on that. Grace, you mentioned no formal qualification since school but six years as a deputy. That experience counts. Some of your existing knowledge may be recognised as prior learning for parts of units, and we will look at that after your Initial Assessment. The Initial Assessment is one of the documents due within fourteen days, it is not a test you pass or fail, it tells us about your English, maths and digital skills so we can give you the right support.'],
  [L2, 268, 'What happens if my English is not good enough?'],
  [M, 273, 'Then we put support in place, we do not take the course away. We have writing guides on the Learner Portal and I can go through your first draft with you before you submit. Which brings me to the next question, do either of you have any disability, health condition or anything else where adjustments would help, such as extra time, different formats or captions? You can tell me now or privately afterwards, and it stays within the academic team.'],
  [L1, 300, 'I am dyslexic. At work I use the read aloud tool.'],
  [M, 305, 'Thank you Tomasz. We can arrange reasonable adjustments, for example extra time on submissions and permission to use assistive software, and I will record it on your learner profile and start the reasonable adjustments process with the awarding organisation where needed. Grace, anything from you?'],
  [L2, 323, 'No, nothing like that.'],
  [M, 326, 'Okay. Let me put the course facts on screen. The qualification is the NCFE CACHE Level 5 Diploma, regulated by Ofqual. Total qualification time is nine hundred hours, guided learning is between five hundred and fifteen and seven hundred and nine hours depending on your optional units, and you need ninety credits with at least sixty six at Level 5. You have twelve months of access on the Standard plan. Nine hundred hours over twelve months is roughly seventeen hours a week, so be honest with yourselves about time.'],
  [L1, 362, 'Seventeen hours is a lot alongside full time work.'],
  [M, 366, 'It is, which is why we plan it. Tomasz, what does a realistic week look like for you?'],
  [L1, 372, 'Probably two evenings and most of a Sunday. Maybe twelve hours.'],
  [M, 377, 'Then let us plan for twelve hours and review it at our first check-in. If you fall behind the twelve months, extensions are possible but there is an administrative fee, so it is better to know early. Grace, you said you have children at home?'],
  [L2, 393, 'Two, yes. Evenings after eight are mine, and I can do a few hours on Saturday.'],
  [M, 399, 'That works. We will write both of these into your assessment plans. Now the structure. There are six shared core units that everyone does, for example safeguarding, leading person-centred practice and professional development. Then there are mandatory units for your pathway, and finally optional units that we agree together to reach ninety credits. Each unit has learning outcomes and assessment criteria, and you achieve a unit when every criterion is met. It is achieved or not yet achieved, there are no percentages.'],
  [L2, 436, 'So there are no exams at all?'],
  [M, 439, 'No exams. Assessment is through written assignments, a portfolio of workplace evidence, professional discussions with your assessor, direct observation and the expert witness testimony we talked about. Every assignment has a brief in the Learner Portal. You submit through the portal as a Word document, not a PDF, and the file name must be your first name, surname and the unit number. On the Standard plan you get written feedback within fourteen days. If something is not yet achieved you can resubmit, and on the Standard plan a resubmission fee applies after the first resubmission, so read the brief carefully.'],
  [L1, 482, 'How long should an assignment be?'],
  [M, 486, 'Each brief gives a word guide. Most are between two and three thousand words. Let me show you the structure we expect. On screen is the report structure, a cover page, contents, an introduction, the main tasks, a conclusion, a reference list and appendices if you need them. For paragraphs we use PEEL, point, evidence, explain, link. You make your point, you give evidence from your reading or your practice, you explain what it shows, and you link back to the question. Grace, this is the part that helps most if writing feels daunting, every paragraph follows the same shape.'],
  [L2, 522, 'That does make it feel more manageable.'],
  [M, 526, 'And referencing. We use Harvard referencing. There is a Harvard guide on the Learner Portal and I will send a one page summary after this call. Which leads to academic integrity. Everything you submit must be your own work. Copying from a source without citing it is plagiarism, submitting work written by someone else or by an AI tool such as ChatGPT as if it were yours is malpractice, and sharing your work with another learner is collusion. We check submissions, and the consequences range from a resubmission to being withdrawn from the course and reported to the awarding organisation. Using AI to check your grammar is fine. Using it to write your answer is not. Does that distinction make sense?'],
  [L1, 573, 'Yes. Can I use it to help me understand a topic?'],
  [M, 577, 'Yes, as a study aid, as long as the words you submit are yours and your evidence comes from real sources and your practice. Good question. Now let me share the Learner Portal itself rather than just talk about it.'],
  [M, 590, 'This is your dashboard. Here is Getting Started, which has the Learner Handbook, the Harvard guide and the writing guides. Here are your units with the assignment briefs. Here is the assessment plan, which we will fill in together. And here under Documents are the three forms due within fourteen days of today: the Initial Assessment, the Learner Enrolment Details form, the LED form, and the Learner Agreement. Please upload them here, not by email. Tomasz, can you see the Documents tab on your screen?'],
  [L1, 630, 'Yes, I can see it.'],
  [M, 633, 'Grace, are you on a laptop or a phone at the moment?'],
  [L2, 637, 'Phone. My laptop is quite old.'],
  [M, 640, 'The portal works on a phone but writing assignments on one is hard. If the laptop struggles with Word, let me know and I will point you to the free online version of Word that works in a browser. You also need a reliable internet connection for uploads. If anything technical fails, the technical support line and live chat are listed under Help.'],
  [L2, 663, 'Okay, I will try the laptop first.'],
  [M, 667, 'Now support. I am your named Mentor. You can reach me by email, by WhatsApp on the number in your welcome email, or by booking a call through the portal. I reply within two working days, usually sooner. For anything about your assignments, come to me first. There is also a learner forum on the portal where you can talk to other learners on the same qualification. If you get stuck, or you are falling behind, tell me early. The worst thing you can do is go quiet. If I have not heard from you for three weeks I will contact you, because silence usually means someone is stuck, not that they have given up.'],
  [L1, 714, 'That is reassuring.'],
  [M, 717, 'Safeguarding. Because you both work with people who may be vulnerable, you know this well, but it applies to you as learners too. If you ever have a concern about your own safety or wellbeing, about another learner, or something you see at work that you cannot raise there, our designated safeguarding lead is Helen Ward, her email is on the Learner Portal under Safeguarding, and you can also raise it with me and I will pass it on the same day. It is then logged and followed up with you within two working days. That includes anything online, such as someone contacting you inappropriately through the forum.'],
  [L2, 760, 'Good to know.'],
  [M, 763, 'Equality and respect. The college has an equality, diversity and inclusion policy, it is on the portal. In practice it means everyone is treated fairly, and on the forum and in sessions we expect respectful language. If you ever feel you have been treated unfairly, tell me or the safeguarding lead. If you disagree with an assessment decision there is an appeals procedure, also on the portal, and your first step is to talk to me within ten working days of the decision.'],
  [L1, 795, 'Who actually awards the certificate at the end?'],
  [M, 799, 'NCFE CACHE is the awarding organisation. South London College is the approved centre that delivers and assesses the course, and NCFE quality assures our assessment decisions and issues your certificate. Your learner agreement sets out what we provide and what we ask of you.'],
  [M, 820, 'A quick word on progression. When you complete, the Level 5 diploma is the recognised qualification for registered manager roles in your sectors. If you want to go further, a Level 6 or a degree top-up in a related subject is the next academic step, and we can talk about options nearer the time based on what you each want. Tomasz, for you the registered manager route is the immediate goal, so we will keep that in view.'],
  [L1, 848, 'Yes, that is the plan.'],
  [M, 851, 'Let me summarise what we have agreed before I check for questions. Tomasz, you will ask your manager this week about being your expert witness, you will upload the three documents within fourteen days, and you are planning twelve hours a week. I will record your dyslexia adjustments and send you the Harvard summary. Grace, you will upload the documents, try the laptop with Word, and plan your evenings after eight plus Saturday. Both of you, I will book a thirty minute check-in call with each of you in two weeks to agree your first assessment plan. Have I missed anything?'],
  [L2, 895, 'No, that is everything I had.'],
  [L1, 898, 'Nothing from me.'],
  [M, 900, 'One last thing. After this call you will receive a short feedback survey from the quality team about this induction. Please complete it honestly, good or bad, it genuinely changes how we run these sessions. And remember you can raise anything about the course with me at any point. Thank you both, welcome to South London College, and I will see you at your check-in calls.'],
  [L2, 927, 'Thank you Amara.'],
  [L1, 929, 'Thanks, bye.'],
];

export const SAMPLE_ONLINE_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = script.map(([speaker, start, text], i) => {
  const next = script[i + 1];
  const end = next ? next[1] : start + 6;
  return { speaker, start, end, text };
});

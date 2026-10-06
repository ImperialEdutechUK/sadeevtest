import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/Misc';
import { DEFAULT_GRADE_BANDS } from '@slc/shared';

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What do I need to upload?',
    a: (
      <>
        Either a <strong>recording</strong> of the meeting (MP4, M4A, MP3, WAV, WebM or MOV) or a <strong>transcript</strong> (the .vtt or .docx file Microsoft Teams produces, a .srt, or a plain text file). Optionally add the <strong>learner information booklet</strong> (PDF or Word) and the <strong>presentation</strong> used (PowerPoint or PDF) so the review can check personalisation and whether key slides were covered.
      </>
    ),
  },
  {
    q: 'How long does a review take?',
    a: 'A transcript is reviewed in one to three minutes. A recording is transcribed first, which usually takes a few minutes for every ten minutes of audio. You can close the page; you will get a notification (and an email if enabled) when the report is ready.',
  },
  {
    q: 'How is the score calculated?',
    a: (
      <>
        Each criterion is scored 1 to 5 against written descriptors. Criteria have weights (essential items count more). The overall score is the weighted total as a percentage of the maximum possible: <em>sum(score &times; weight) &divide; sum(5 &times; weight) &times; 100</em>. Criteria marked &ldquo;not applicable&rdquo; are left out. The &ldquo;How this was scored&rdquo; tab on every report shows the exact numbers.
      </>
    ),
  },
  {
    q: 'What do the grades mean?',
    a: (
      <ul className="list-disc space-y-1 pl-5">
        {DEFAULT_GRADE_BANDS.map((b) => (
          <li key={b.label}>
            <strong>{b.label}</strong> ({b.min}+): {b.description}
          </li>
        ))}
        <li className="text-slate-500">Your quality team can rename the bands and change the thresholds in the Criteria screen.</li>
      </ul>
    ),
  },
  {
    q: 'Where do the criteria come from?',
    a: 'The preset induction criteria were written with reference to publicly available UK frameworks: the Ofsted Education Inspection Framework, the Education and Training Foundation Professional Standards (2022), the Matrix Standard for information, advice and guidance, Keeping Children Safe in Education and the Prevent duty, the Equality Act 2010, UK GDPR, and the Department for Education apprenticeship funding rules on initial assessment. Each criterion lists the framework it draws on. Your academic managers can edit any of it.',
  },
  {
    q: 'Can the AI be wrong?',
    a: 'Yes. It is a reviewing assistant, not a judge. Every score shows the quotes it is based on, and each report carries a confidence level. Academic managers can moderate any score with a written reason, which is recorded and shown on the report. Appraisal and performance decisions are always made by people.',
  },
  {
    q: 'What is "learner talk share"?',
    a: 'The percentage of words in the transcript spoken by the learner, counted directly, without AI. It is shown alongside questions asked and the longest stretch the tutor spoke without a pause, as objective pointers to how two-way the meeting was.',
  },
  {
    q: 'What happens to the recording?',
    a: 'Recordings are stored encrypted and deleted automatically after the retention period set by your administrator (90 days by default). Transcripts and reports are kept for longer so progress can be tracked. Learner first names can be redacted from transcripts in Settings.',
  },
  {
    q: 'Who can see my reports?',
    a: 'You can see your own. Academic admins, academic managers, HR and directors can see everyone’s, according to their role. Every view of sensitive data is written to the audit log.',
  },
  {
    q: 'How do competitions and KPIs work?',
    a: 'A manager sets a KPI (for example, an average score of at least 75 this term) or a competition (for example, highest average induction score, minimum three reviewed meetings). Progress is calculated from completed, moderated reports and updates automatically.',
  },
];

export function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help and guide" description="Plain-language answers to the questions staff ask most." />
      <Card>
        <CardHeader title="Uploading a meeting in three steps" />
        <CardBody>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              ['1. About the meeting', 'Give it a title, enter the learner reference and the date. Pick the tutor if you are uploading for someone else.'],
              ['2. Add the files', 'Drag in the recording or transcript. Add the learner booklet and presentation if you have them.'],
              ['3. Check and submit', 'Confirm the details. We transcribe, read the documents and review against the criteria. You will be notified when the report is ready.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{t}</p>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      <div className="mt-6 space-y-3">
        {FAQ.map((f) => (
          <details key={f.q} className="card group px-5 py-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 marker:content-none">
              <span className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90">&#9656;</span>
              {f.q}
            </summary>
            <div className="mt-3 pl-5 text-sm leading-relaxed text-slate-700">{f.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

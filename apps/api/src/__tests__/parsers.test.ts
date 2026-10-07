import { describe, expect, it } from 'vitest';
import { parseAmazonTranscribeJson, parseSrt, parseTimestamp, parseTranscriptText, parseVtt } from '../providers/transcription/parsers.js';

describe('parseTimestamp', () => {
  it('reads the common formats', () => {
    expect(parseTimestamp('00:01:05.500')).toBeCloseTo(65.5);
    expect(parseTimestamp('01:05')).toBe(65);
    expect(parseTimestamp('00:00:02,250')).toBeCloseTo(2.25);
  });
});

describe('parseVtt (Microsoft Teams export)', () => {
  it('reads voice tags as speakers and keeps timings', () => {
    const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Jane Smith>Hello and welcome.</v>\n\n2\n00:00:04.500 --> 00:00:06.000\n<v Sam Jones>Thanks.</v>\n\n3\n00:00:06.500 --> 00:00:09.000\n<v Jane Smith>Let us begin.</v>`;
    const r = parseVtt(vtt);
    expect(r.speakers).toEqual(['Jane Smith', 'Sam Jones']);
    expect(r.segments).toHaveLength(3);
    expect(r.segments[0]).toMatchObject({ start: 1, end: 4, speaker: 'Jane Smith', text: 'Hello and welcome.' });
    expect(r.warnings).toEqual([]);
  });
  it('merges consecutive cues from the same speaker', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v A>One.\n\n00:00:02.000 --> 00:00:03.000\n<v A>Two.\n\n00:00:03.000 --> 00:00:04.000\n<v B>Three.`;
    const r = parseVtt(vtt);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0].text).toBe('One. Two.');
    expect(r.segments[0].end).toBe(3);
  });
});

describe('parseSrt', () => {
  it('reads "Name: text" lines', () => {
    const srt = `1\n00:00:01,000 --> 00:00:03,000\nTutor: Welcome.\n\n2\n00:00:03,500 --> 00:00:05,000\nLearner: Hi.`;
    const r = parseSrt(srt);
    expect(r.speakers).toEqual(['Tutor', 'Learner']);
    expect(r.segments[1].start).toBeCloseTo(3.5);
  });
});

describe('parseTranscriptText', () => {
  it('reads [hh:mm:ss] Name: text lines', () => {
    const r = parseTranscriptText(`[00:00:05] Daniel Okafor: Hi there.\n[00:00:10] Priya Sharma: Hello.\n[00:00:12] Daniel Okafor: How are you?`);
    expect(r.speakers).toEqual(['Daniel Okafor', 'Priya Sharma']);
    expect(r.segments[0].start).toBe(5);
    expect(r.segments[1].end).toBeLessThanOrEqual(12);
    expect(r.warnings).toEqual([]);
  });
  it('estimates timings when there are none and warns', () => {
    const r = parseTranscriptText(`Tutor: Welcome to the college, this is your induction.\nLearner: Thank you.`);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0].end).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/No timestamps/);
  });
  it('continues a segment when a line has no speaker', () => {
    const r = parseTranscriptText(`Tutor: First line.\nsecond line continues.\nLearner: Reply.`);
    expect(r.segments[0].text).toBe('First line. second line continues.');
  });
});

describe('parseAmazonTranscribeJson', () => {
  it('attributes words to speaker segments', () => {
    const json = {
      results: {
        transcripts: [{ transcript: 'Hello there. Hi.' }],
        speaker_labels: { segments: [{ speaker_label: 'spk_0', start_time: '0.0', end_time: '1.5' }, { speaker_label: 'spk_1', start_time: '1.6', end_time: '2.5' }] },
        items: [
          { type: 'pronunciation', start_time: '0.1', end_time: '0.5', alternatives: [{ content: 'Hello' }] },
          { type: 'pronunciation', start_time: '0.6', end_time: '1.0', alternatives: [{ content: 'there' }] },
          { type: 'punctuation', alternatives: [{ content: '.' }] },
          { type: 'pronunciation', start_time: '1.7', end_time: '2.0', alternatives: [{ content: 'Hi' }] },
          { type: 'punctuation', alternatives: [{ content: '.' }] },
        ],
      },
    };
    const r = parseAmazonTranscribeJson(json);
    expect(r.segments).toEqual([
      { start: 0, end: 1.5, speaker: 'spk_0', text: 'Hello there.' },
      { start: 1.6, end: 2.5, speaker: 'spk_1', text: 'Hi.' },
    ]);
  });
});

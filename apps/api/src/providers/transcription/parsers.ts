import type { TranscriptSegment } from '@slc/shared';
import { extensionOf } from '@slc/shared';
import mammoth from 'mammoth';

/**
 * Parsers for transcripts that staff already have:
 *  - WebVTT (.vtt) incl. Microsoft Teams "<v Speaker Name>" voice tags
 *  - SubRip (.srt)
 *  - Plain text with "[00:01:23] Name: text", "00:01:23 Name: text", "Name: text" lines
 *    (covers Zoom, Teams and Google Meet text exports)
 *  - .docx containing one of the text formats above
 *  - JSON produced by Amazon Transcribe
 */
export interface ParsedTranscript {
  segments: TranscriptSegment[];
  speakers: string[];
  warnings: string[];
}

export async function parseTranscriptFile(fileName: string, buffer: Buffer): Promise<ParsedTranscript> {
  const ext = extensionOf(fileName);
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return parseTranscriptText(value);
  }
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  if (ext === '.json') return parseAmazonTranscribeJson(JSON.parse(text));
  if (ext === '.vtt' || /^WEBVTT/m.test(text)) return parseVtt(text);
  if (ext === '.srt' || /^\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s+-->/m.test(text)) return parseSrt(text);
  return parseTranscriptText(text);
}

export function parseTimestamp(ts: string): number {
  // Accepts HH:MM:SS.mmm, MM:SS.mmm, HH:MM:SS,mmm, H:MM:SS, MM:SS
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

function finalize(segments: TranscriptSegment[], warnings: string[]): ParsedTranscript {
  const merged = mergeAdjacent(segments.filter((s) => s.text.trim().length > 0));
  const speakers = [...new Set(merged.map((s) => s.speaker))];
  if (!merged.length) warnings.push('No transcript lines could be read from this file.');
  if (speakers.length === 1) warnings.push('Only one speaker label was found; talk-share metrics will be limited.');
  return { segments: merged, speakers, warnings };
}

/** Merge consecutive segments by the same speaker when they are close together (keeps evidence quotes readable). */
function mergeAdjacent(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.speaker === seg.speaker && seg.start - last.end <= 2 && (last.text.length + seg.text.length) < 900) {
      last.text = `${last.text} ${seg.text}`.trim();
      last.end = Math.max(last.end, seg.end);
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

export function parseVtt(text: string): ParsedTranscript {
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  const segments: TranscriptSegment[] = [];
  let anonymous = 0;
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeIdx].split('-->');
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp((endRaw ?? '').trim().split(/\s+/)[0] ?? '');
    const body = lines.slice(timeIdx + 1).join(' ');
    const voice = body.match(/<v\s+([^>]+)>/);
    let speaker = voice ? voice[1].trim() : '';
    let content = body.replace(/<v\s+[^>]+>/g, '').replace(/<\/v>/g, '').replace(/<[^>]+>/g, '').trim();
    if (!speaker) {
      const m = content.match(/^([A-Za-z][A-Za-z .'\-]{0,40}):\s+(.*)$/);
      if (m) {
        speaker = m[1].trim();
        content = m[2];
      } else {
        speaker = 'Speaker';
        anonymous++;
      }
    }
    segments.push({ start, end, speaker, text: content });
  }
  const warnings: string[] = [];
  if (anonymous > 0 && anonymous === segments.length) warnings.push('The VTT file has no speaker names; everything is attributed to one speaker.');
  return finalize(segments, warnings);
}

export function parseSrt(text: string): ParsedTranscript {
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeIdx].split('-->');
    const end = parseTimestamp((endRaw ?? '').trim().split(/\s+/)[0] ?? '');
    let content = lines.slice(timeIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    let speaker = 'Speaker';
    const m = content.match(/^([A-Za-z][A-Za-z .'\-]{0,40}):\s+(.*)$/);
    if (m) {
      speaker = m[1].trim();
      content = m[2];
    }
    segments.push({ start: parseTimestamp(startRaw), end, speaker, text: content });
  }
  return finalize(segments, []);
}

/**
 * Plain-text transcripts. Each line may look like:
 *   [00:12:03] Jane Smith: text
 *   00:12:03 Jane Smith: text
 *   Jane Smith (00:12): text
 *   Jane Smith: text
 * Lines without a speaker continue the previous segment.
 */
export function parseTranscriptText(text: string): ParsedTranscript {
  const lines = text.replace(/\r/g, '').split('\n');
  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  const line1 = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\]?\s+([^:]{1,60}):\s*(.*)$/; // [ts] Name: text
  const line2 = /^\s*([^:\[\]]{1,60})\s*\((\d{1,2}:\d{2}(?::\d{2})?)\)\s*:\s*(.*)$/; // Name (ts): text
  const line3 = /^\s*([A-Za-z][^:]{0,60}):\s+(.*)$/; // Name: text
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(line1);
    if (m) {
      const start = parseTimestamp(m[1]);
      cursor = Math.max(cursor, start);
      segments.push({ start, end: start, speaker: m[2].trim(), text: m[3].trim() });
      continue;
    }
    m = line.match(line2);
    if (m) {
      const start = parseTimestamp(m[2]);
      cursor = Math.max(cursor, start);
      segments.push({ start, end: start, speaker: m[1].trim(), text: m[3].trim() });
      continue;
    }
    m = line.match(line3);
    if (m && m[1].split(' ').length <= 4) {
      segments.push({ start: cursor, end: cursor, speaker: m[1].trim(), text: m[2].trim() });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last) last.text = `${last.text} ${line}`.trim();
    else segments.push({ start: 0, end: 0, speaker: 'Speaker', text: line });
  }
  // Estimate end times from word counts when the format has no end timestamps (about 150 words per minute).
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    const words = seg.text.split(/\s+/).length;
    const estimated = seg.start + Math.max(2, (words / 150) * 60);
    seg.end = next && next.start > seg.start ? Math.min(next.start, estimated) : estimated;
  }
  const warnings: string[] = [];
  const hasTimestamps = segments.some((s) => s.start > 0);
  if (!hasTimestamps) warnings.push('No timestamps were found; timings are estimated from the amount of speech.');
  return finalize(segments, warnings);
}

/** Amazon Transcribe output JSON (with speaker labels) -> segments. */
export function parseAmazonTranscribeJson(json: unknown): ParsedTranscript {
  const results = (json as { results?: Record<string, unknown> }).results ?? {};
  const items = (results.items ?? []) as {
    start_time?: string;
    end_time?: string;
    type: 'pronunciation' | 'punctuation';
    speaker_label?: string;
    alternatives: { content: string }[];
  }[];
  const segmentsRaw = ((results.speaker_labels as { segments?: { speaker_label: string; start_time: string; end_time: string }[] } | undefined)?.segments ?? []);

  const segments: TranscriptSegment[] = [];
  if (segmentsRaw.length) {
    // Attribute each word to the speaker segment it falls within.
    let itemIdx = 0;
    for (const sl of segmentsRaw) {
      const start = Number(sl.start_time);
      const end = Number(sl.end_time);
      const words: string[] = [];
      while (itemIdx < items.length) {
        const it = items[itemIdx];
        if (it.type === 'punctuation') {
          if (words.length) words[words.length - 1] += it.alternatives[0]?.content ?? '';
          itemIdx++;
          continue;
        }
        const t = Number(it.start_time);
        if (t > end + 0.01) break;
        words.push(it.alternatives[0]?.content ?? '');
        itemIdx++;
      }
      if (words.length) segments.push({ start, end, speaker: sl.speaker_label, text: words.join(' ') });
    }
  } else {
    const transcripts = (results.transcripts ?? []) as { transcript: string }[];
    const text = transcripts.map((t) => t.transcript).join(' ');
    const end = items.length ? Number(items[items.length - 1].end_time ?? 0) : 0;
    segments.push({ start: 0, end, speaker: 'spk_0', text });
  }
  return finalize(segments, segmentsRaw.length ? [] : ['Speaker labels were not available; the whole transcript is attributed to one speaker.']);
}

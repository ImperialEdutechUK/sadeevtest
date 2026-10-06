import type { FileKind } from './enums.js';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB (recordings)
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50 MB (documents)

/** Accepted file extensions per kind. Kept simple and spelled out for the upload UI. */
export const ACCEPTED_EXTENSIONS: Record<FileKind, string[]> = {
  RECORDING: ['.mp4', '.m4a', '.mp3', '.wav', '.webm', '.mov', '.ogg', '.flac', '.amr'],
  TRANSCRIPT: ['.vtt', '.srt', '.txt', '.docx', '.json'],
  LEARNER_BOOKLET: ['.pdf', '.docx', '.txt', '.md'],
  PRESENTATION: ['.pptx', '.pdf'],
  OTHER: ['.pdf', '.docx', '.txt', '.md', '.pptx'],
};

export const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.amr': 'audio/amr',
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i === -1 ? '' : fileName.slice(i).toLowerCase();
}

export function isAcceptedFile(kind: FileKind, fileName: string): boolean {
  return ACCEPTED_EXTENSIONS[kind].includes(extensionOf(fileName));
}

/** The scale every rubric uses: 1 (not evident) to 5 (excellent). */
export const SCORE_SCALE_MAX = 5;

export const DEFAULT_GRADE_BANDS = [
  { min: 85, label: 'Excellent', colour: 'emerald', description: 'Consistently strong practice. Share as an example for others.' },
  { min: 70, label: 'Good', colour: 'teal', description: 'Secure practice with a small number of improvements to make.' },
  { min: 55, label: 'Developing', colour: 'amber', description: 'Several areas need attention. Agree actions and review again.' },
  { min: 0, label: 'Needs support', colour: 'rose', description: 'Significant gaps. Prioritise support and a follow-up review.' },
] as const;

export type GradeBand = { min: number; label: string; colour: string; description: string };

export const PROMPT_VERSION = '2026-10-v1';

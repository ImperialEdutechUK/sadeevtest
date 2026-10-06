import JSZip from 'jszip';
import mammoth from 'mammoth';
import { extensionOf } from '@slc/shared';

export interface ExtractedDocument {
  text: string;
  pages?: number;
  slides?: number;
  warnings: string[];
}

const MAX_CHARS = 60_000;

/** Extract readable text from PDF, DOCX, PPTX, TXT and Markdown files. */
export async function extractDocumentText(fileName: string, buffer: Buffer): Promise<ExtractedDocument> {
  const ext = extensionOf(fileName);
  switch (ext) {
    case '.pdf':
      return extractPdf(buffer);
    case '.docx':
      return extractDocx(buffer);
    case '.pptx':
      return extractPptx(buffer);
    case '.txt':
    case '.md':
    case '.vtt':
    case '.srt':
    case '.json':
      return { text: truncate(buffer.toString('utf8')), warnings: [] };
    default:
      return { text: '', warnings: [`Unsupported document type: ${ext || 'unknown'}`] };
  }
}

function truncate(text: string): string {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned.length > MAX_CHARS ? `${cleaned.slice(0, MAX_CHARS)}\n\n[... truncated ...]` : cleaned;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const result = await parser.getText();
    const warnings: string[] = [];
    if (!result.text.trim()) warnings.push('No text layer found in the PDF (it may be a scanned image).');
    return { text: truncate(result.text), pages: result.pages?.length, warnings };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: truncate(result.value), warnings: result.messages.map((m) => m.message).slice(0, 5) };
}

/** PPTX is a zip of XML; slide text lives in <a:t> runs of ppt/slides/slideN.xml (plus notes). */
async function extractPptx(buffer: Buffer): Promise<ExtractedDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const parts: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string');
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    const notesName = name.replace('slides/slide', 'notesSlides/notesSlide');
    let notes = '';
    if (zip.files[notesName]) {
      const nx = await zip.files[notesName].async('string');
      notes = [...nx.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(' ').trim();
    }
    parts.push(`--- Slide ${slideNumber(name)} ---\n${texts.join('\n')}${notes ? `\n[Speaker notes: ${notes}]` : ''}`);
  }
  return { text: truncate(parts.join('\n\n')), slides: slideFiles.length, warnings: slideFiles.length ? [] : ['No slides found in the presentation.'] };
}

function slideNumber(name: string): number {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}
function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

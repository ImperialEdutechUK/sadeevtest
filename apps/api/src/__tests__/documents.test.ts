import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractDocumentText } from '../providers/documents/extract.js';

describe('extractDocumentText', () => {
  it('reads slide text and notes from a PPTX', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Second slide</a:t></p:sld>');
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Welcome &amp; induction</a:t><a:t>Safeguarding</a:t></p:sld>');
    zip.file('ppt/notesSlides/notesSlide1.xml', '<p:notes><a:t>Mention the DSL</a:t></p:notes>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const r = await extractDocumentText('deck.pptx', buf);
    expect(r.slides).toBe(2);
    expect(r.text).toContain('--- Slide 1 ---\nWelcome & induction\nSafeguarding\n[Speaker notes: Mention the DSL]');
    expect(r.text.indexOf('Slide 1')).toBeLessThan(r.text.indexOf('Slide 2'));
  });
  it('reads plain text and flags unsupported types', async () => {
    expect((await extractDocumentText('notes.txt', Buffer.from('hello\n\n\n\nworld'))).text).toBe('hello\n\nworld');
    expect((await extractDocumentText('image.png', Buffer.from(''))).warnings[0]).toMatch(/Unsupported/);
  });
});

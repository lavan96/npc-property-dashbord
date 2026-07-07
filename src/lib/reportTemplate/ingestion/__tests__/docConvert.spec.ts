import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  DOCUMENT_MAX_BYTES,
  convertDocumentToHtml,
  convertPlainTextToHtml,
  documentKindForFile,
  rtfToPlainText,
} from '../docConvert';

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docxXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>`;
}

async function makeDocxFile(
  bodyXml: string,
  name = 'sample.docx',
  extras: Record<string, string> = {},
): Promise<File> {
  const zip = new JSZip();
  zip.file('word/document.xml', docxXml(bodyXml));
  for (const [path, content] of Object.entries(extras)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/detail" TargetMode="External"/>
</Relationships>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_NS}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:num w:numId="10"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="11"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

describe('documentKindForFile', () => {
  it('classifies by extension and mime', () => {
    expect(documentKindForFile({ name: 'report.docx' })).toBe('docx');
    expect(documentKindForFile({ name: 'x', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe('docx');
    expect(documentKindForFile({ name: 'legacy.doc' })).toBe('doc');
    expect(documentKindForFile({ name: 'notes.txt' })).toBe('txt');
    expect(documentKindForFile({ name: 'letter.rtf' })).toBe('rtf');
    expect(documentKindForFile({ name: 'style.css' })).toBeNull();
    expect(documentKindForFile({ name: 'page.pdf', type: 'application/pdf' })).toBeNull();
  });
});

describe('convertDocumentToHtml (docx)', () => {
  it('converts headings, formatted runs, lists, and tables to semantic HTML', async () => {
    const file = await makeDocxFile(`
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Executive Summary</w:t></w:r></w:p>
      <w:p><w:r><w:t>Plain intro with </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold text</w:t></w:r><w:r><w:t xml:space="preserve"> &amp; more.</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First bullet</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Second bullet</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    `);
    const { html, filename } = await convertDocumentToHtml(file);
    expect(filename).toBe('sample.html');
    expect(html).toContain('<h1>Executive Summary</h1>');
    expect(html).toContain('<strong>bold text</strong>');
    expect(html).toContain('&amp; more.');
    expect(html).toContain('<ul><li>First bullet</li><li>Second bullet</li></ul>');
    expect(html).toContain('<td>Metric</td>');
    expect(html).toContain('<td>Value</td>');
  });

  it('renders ordered vs bullet lists from numbering.xml', async () => {
    const li = (numId: string, text: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const file = await makeDocxFile(
      `${li('10', 'Step one')}${li('10', 'Step two')}${li('11', 'Loose point')}`,
      'lists.docx',
      { 'word/numbering.xml': NUMBERING_XML },
    );
    const { html } = await convertDocumentToHtml(file);
    expect(html).toContain('<ol><li>Step one</li><li>Step two</li></ol>');
    expect(html).toContain('<ul><li>Loose point</li></ul>');
  });

  it('resolves hyperlinks, alignment, and outline-level headings', async () => {
    const file = await makeDocxFile(`
      <w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Outline Heading</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Centered line</w:t></w:r></w:p>
      <w:p><w:hyperlink r:id="rId7" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:t>Read more</w:t></w:r></w:hyperlink></w:p>
    `, 'rich.docx', { 'word/_rels/document.xml.rels': RELS_XML });
    const { html } = await convertDocumentToHtml(file);
    expect(html).toContain('<h2>Outline Heading</h2>');
    expect(html).toContain('<p style="text-align:center">Centered line</p>');
    expect(html).toContain('<a href="https://example.com/detail">Read more</a>');
  });

  it('rejects an empty or bodyless docx with an actionable error', async () => {
    const file = await makeDocxFile('');
    await expect(convertDocumentToHtml(file)).rejects.toThrow(/empty/i);

    const zip = new JSZip();
    zip.file('readme.txt', 'not a docx');
    const notDocx = new File([await zip.generateAsync({ type: 'blob' })], 'broken.docx');
    await expect(convertDocumentToHtml(notDocx)).rejects.toThrow(/document\.xml/i);
  });

  it('rejects legacy .doc with guidance', async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], 'legacy.doc', { type: 'application/msword' });
    await expect(convertDocumentToHtml(file)).rejects.toThrow(/\.docx/);
  });

  it('enforces the size cap', async () => {
    const file = new File([new Uint8Array(8)], 'big.docx');
    Object.defineProperty(file, 'size', { value: DOCUMENT_MAX_BYTES + 1 });
    await expect(convertDocumentToHtml(file)).rejects.toThrow(/too large/i);
  });
});

describe('plain text and RTF conversion', () => {
  it('converts text paragraphs and escapes markup', () => {
    const html = convertPlainTextToHtml('First para\nsecond line\n\n<script>alert(1)</script>', 'notes');
    expect(html).toContain('<p>First para<br />second line</p>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('converts a txt file end-to-end', async () => {
    const file = new File(['Hello world\n\nSecond paragraph'], 'notes.txt', { type: 'text/plain' });
    const { html, filename } = await convertDocumentToHtml(file);
    expect(filename).toBe('notes.html');
    expect(html).toContain('<p>Hello world</p>');
    expect(html).toContain('<p>Second paragraph</p>');
  });

  it('strips RTF control words and honours \\par', () => {
    const text = rtfToPlainText(String.raw`{\rtf1\ansi\deff0 {\fonttbl{\f0 Calibri;}}Hello \b world\b0.\par Second line.}`);
    expect(text).toContain('Hello world.');
    expect(text).toContain('Second line.');
    expect(text).not.toContain('\\b');
    expect(text).not.toContain('{');
  });
});

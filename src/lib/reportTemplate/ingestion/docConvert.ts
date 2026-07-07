/**
 * Office/document → HTML conversion for the "Start from a reference" import.
 *
 * Lets users drop a Word document (or plain-text/RTF file) and have it
 * replicated onto the Template Builder canvas: the document is converted to
 * semantic HTML here, then routed through the existing C1 code-import
 * pipeline (render → measure DOM → CDIR editable pages), so everything
 * downstream — grounding, fidelity checks, trace rasters — works unchanged.
 *
 * DOCX parsing is dependency-free: JSZip (already a dependency) unpacks the
 * archive and DOMParser reads `word/document.xml`. Coverage is deliberately
 * pragmatic — paragraphs, heading styles, bold/italic/underline runs, lists,
 * tables, hyperlinks, and embedded images (inlined as data: URLs).
 */
import JSZip from 'jszip';

export type DocumentKind = 'docx' | 'doc' | 'txt' | 'rtf';

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

const DOCX_MIME = /officedocument\.wordprocessingml\.document/i;
const DOC_MIME = /^application\/msword$/i;
const RTF_MIME = /^(application|text)\/rtf$/i;
const TXT_MIME = /^text\/plain$/i;

/** Classify a document file the reference import can convert (null = not a document). */
export function documentKindForFile(file: { name?: string; type?: string } | null | undefined): DocumentKind | null {
  if (!file) return null;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (/\.docx$/.test(name) || DOCX_MIME.test(type)) return 'docx';
  if (/\.doc$/.test(name) || DOC_MIME.test(type)) return 'doc';
  if (/\.rtf$/.test(name) || RTF_MIME.test(type)) return 'rtf';
  if (/\.txt$/.test(name) || (TXT_MIME.test(type) && /\.txt$/.test(name))) return 'txt';
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PAGE_STYLE = 'margin:0;background:#fff;color:#1a1a1a;font-family:Calibri,Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5;padding:56px 64px;max-width:794px';

function wrapDocumentHtml(bodyHtml: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{${PAGE_STYLE}}h1{font-size:28px;margin:0 0 14px}h2{font-size:22px;margin:22px 0 10px}h3{font-size:18px;margin:18px 0 8px}h4{font-size:16px;margin:16px 0 8px}p{font-size:14px;margin:0 0 10px}li{font-size:14px;margin:0 0 4px}table{border-collapse:collapse;margin:0 0 12px;width:100%}td,th{border:1px solid #cbd5e1;padding:6px 8px;font-size:13px;text-align:left;vertical-align:top}img{max-width:100%;height:auto}</style></head><body>${bodyHtml}</body></html>`;
}

// ─── DOCX ──────────────────────────────────────────────────────────────────────

function childrenByLocalName(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((el) => el.localName === name);
}

function firstByLocalName(parent: Element, name: string): Element | null {
  return childrenByLocalName(parent, name)[0] ?? null;
}

function descendantsByLocalName(parent: Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName('*')).filter((el) => el.localName === name);
}

function attrByLocalName(el: Element, name: string): string | null {
  for (const attr of Array.from(el.attributes)) {
    if (attr.localName === name) return attr.value;
  }
  return null;
}

function mimeForImagePath(path: string): string {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.') + 1);
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'emf' || ext === 'wmf') return '';
  return 'image/png';
}

interface DocxContext {
  /** relationship id → data: URL for embedded media (empty when unresolvable). */
  media: Map<string, string>;
}

function headingTagForStyle(styleVal: string | null): string | null {
  if (!styleVal) return null;
  if (/^title$/i.test(styleVal)) return 'h1';
  const m = /^heading\s*(\d)/i.exec(styleVal) ?? /^berschrift(\d)/i.exec(styleVal);
  if (m) return `h${Math.min(4, Math.max(1, Number(m[1])))}`;
  return null;
}

function renderDocxRuns(container: Element, ctx: DocxContext): string {
  let html = '';
  for (const child of Array.from(container.children)) {
    if (child.localName === 'hyperlink') {
      html += renderDocxRuns(child, ctx);
      continue;
    }
    if (child.localName !== 'r') continue;
    const rPr = firstByLocalName(child, 'rPr');
    const bold = !!(rPr && firstByLocalName(rPr, 'b') && attrByLocalName(firstByLocalName(rPr, 'b')!, 'val') !== 'false' && attrByLocalName(firstByLocalName(rPr, 'b')!, 'val') !== '0');
    const italic = !!(rPr && firstByLocalName(rPr, 'i') && attrByLocalName(firstByLocalName(rPr, 'i')!, 'val') !== 'false' && attrByLocalName(firstByLocalName(rPr, 'i')!, 'val') !== '0');
    const underline = !!(rPr && firstByLocalName(rPr, 'u') && attrByLocalName(firstByLocalName(rPr, 'u')!, 'val') !== 'none');
    let runHtml = '';
    for (const part of Array.from(child.children)) {
      if (part.localName === 't') runHtml += escapeHtml(part.textContent ?? '');
      else if (part.localName === 'br' || part.localName === 'cr') runHtml += '<br />';
      else if (part.localName === 'tab') runHtml += '&emsp;';
      else if (part.localName === 'drawing' || part.localName === 'pict') {
        for (const blip of descendantsByLocalName(part, 'blip')) {
          const rel = attrByLocalName(blip, 'embed') ?? attrByLocalName(blip, 'link');
          const src = rel ? ctx.media.get(rel) : undefined;
          if (src) runHtml += `<img src="${src}" alt="" />`;
        }
      }
    }
    if (!runHtml) continue;
    if (bold) runHtml = `<strong>${runHtml}</strong>`;
    if (italic) runHtml = `<em>${runHtml}</em>`;
    if (underline) runHtml = `<u>${runHtml}</u>`;
    html += runHtml;
  }
  return html;
}

interface DocxBlock {
  kind: 'paragraph' | 'list-item' | 'heading' | 'table';
  tag?: string;
  html: string;
}

function renderDocxParagraph(p: Element, ctx: DocxContext): DocxBlock | null {
  const pPr = firstByLocalName(p, 'pPr');
  const styleVal = pPr ? attrByLocalName(firstByLocalName(pPr, 'pStyle') ?? p, 'val') : null;
  const headingTag = headingTagForStyle(styleVal);
  const isListItem = !!(pPr && firstByLocalName(pPr, 'numPr'));
  const inner = renderDocxRuns(p, ctx).trim();
  if (!inner) return null;
  if (headingTag) return { kind: 'heading', tag: headingTag, html: inner };
  if (isListItem) return { kind: 'list-item', html: inner };
  return { kind: 'paragraph', html: inner };
}

function renderDocxTable(tbl: Element, ctx: DocxContext): DocxBlock {
  const rows = childrenByLocalName(tbl, 'tr').map((tr) => {
    const cells = childrenByLocalName(tr, 'tc').map((tc) => {
      const parts = childrenByLocalName(tc, 'p')
        .map((p) => renderDocxRuns(p, ctx).trim())
        .filter(Boolean);
      return `<td>${parts.join('<br />') || '&nbsp;'}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });
  return { kind: 'table', html: `<table><tbody>${rows.join('')}</tbody></table>` };
}

function blocksToHtml(blocks: DocxBlock[]): string {
  const out: string[] = [];
  let listBuffer: string[] = [];
  const flushList = () => {
    if (listBuffer.length) {
      out.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      listBuffer = [];
    }
  };
  for (const block of blocks) {
    if (block.kind === 'list-item') { listBuffer.push(block.html); continue; }
    flushList();
    if (block.kind === 'heading') out.push(`<${block.tag}>${block.html}</${block.tag}>`);
    else if (block.kind === 'table') out.push(block.html);
    else out.push(`<p>${block.html}</p>`);
  }
  flushList();
  return out.join('');
}

async function loadDocxMedia(zip: JSZip): Promise<Map<string, string>> {
  const media = new Map<string, string>();
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (!relsFile) return media;
  try {
    const relsXml = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml');
    for (const rel of Array.from(relsXml.getElementsByTagName('*')).filter((el) => el.localName === 'Relationship')) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (!id || !target || !/media\//i.test(target)) continue;
      const path = `word/${target.replace(/^\//, '').replace(/^word\//, '')}`;
      const mime = mimeForImagePath(path);
      const entry = zip.file(path);
      if (!entry || !mime) continue;
      media.set(id, `data:${mime};base64,${await entry.async('base64')}`);
    }
  } catch { /* embedded images are best-effort */ }
  return media;
}

export async function convertDocxToHtml(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('This .docx has no readable document body (word/document.xml missing).');
  const xml = new DOMParser().parseFromString(await docFile.async('text'), 'application/xml');
  const body = Array.from(xml.getElementsByTagName('*')).find((el) => el.localName === 'body');
  if (!body) throw new Error('Could not read the Word document structure.');

  const ctx: DocxContext = { media: await loadDocxMedia(zip) };
  const blocks: DocxBlock[] = [];
  for (const child of Array.from(body.children)) {
    if (child.localName === 'p') {
      const block = renderDocxParagraph(child, ctx);
      if (block) blocks.push(block);
    } else if (child.localName === 'tbl') {
      blocks.push(renderDocxTable(child, ctx));
    }
  }
  if (!blocks.length) throw new Error('The Word document appears to be empty.');
  return wrapDocumentHtml(blocksToHtml(blocks), file.name.replace(/\.docx$/i, ''));
}

// ─── plain text / RTF ─────────────────────────────────────────────────────────

export function convertPlainTextToHtml(text: string, title: string): string {
  const paragraphs = String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\r?\n/g, '<br />')}</p>`);
  if (!paragraphs.length) throw new Error('The document appears to be empty.');
  return wrapDocumentHtml(paragraphs.join(''), title);
}

/** Minimal RTF → text: drops control words/groups, honours \par as newline. */
export function rtfToPlainText(rtf: string): string {
  let text = String(rtf || '');
  text = text.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|\*)[^{}]*(?:\{[^{}]*\})*[^{}]*\}/gi, '');
  text = text.replace(/\\par[d]?\b/gi, '\n');
  text = text.replace(/\\tab\b/gi, '\t');
  text = text.replace(/\\'([0-9a-f]{2})/gi, (_m, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
  });
  text = text.replace(/\\u(-?\d+)\s?\??/g, (_m, code) => {
    const n = Number(code);
    return String.fromCharCode(n < 0 ? n + 65536 : n);
  });
  text = text.replace(/\\[a-z]+-?\d*\s?/gi, '');
  text = text.replace(/[{}]/g, '');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export interface ConvertedDocument {
  html: string;
  filename: string;
}

/** Convert any supported document file to renderable HTML for the C1 pipeline. */
export async function convertDocumentToHtml(file: File): Promise<ConvertedDocument> {
  const kind = documentKindForFile(file);
  if (!kind) throw new Error('Not a supported document file.');
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new Error(`Document too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${DOCUMENT_MAX_BYTES / 1024 / 1024} MB).`);
  }
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'document';
  const filename = `${baseName}.html`;
  if (kind === 'doc') {
    throw new Error('Legacy .doc files are not supported — save the document as .docx (or export to PDF) and try again.');
  }
  if (kind === 'docx') {
    return { html: await convertDocxToHtml(file), filename };
  }
  const raw = await file.text();
  const text = kind === 'rtf' ? rtfToPlainText(raw) : raw;
  return { html: convertPlainTextToHtml(text, baseName), filename };
}

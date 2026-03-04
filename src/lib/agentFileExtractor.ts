/**
 * Client-side file content extraction for the Oryxa Agent.
 * Supports PDF, XLSX, XLS, CSV, TXT, MD, JSON, XML, DOCX, and images.
 */
import { extractPdfTextClientSide } from '@/lib/pdfClientExtractor';
import * as XLSX from 'xlsx';

export interface ExtractedFile {
  filename: string;
  mimeType: string;
  size: number;
  extractedText: string | null;
  base64Data: string | null; // For images - base64 encoded
  isImage: boolean;
  category: 'document' | 'spreadsheet' | 'image' | 'data' | 'text';
}

export type ExtractionProgress = {
  filename: string;
  stage: 'reading' | 'extracting' | 'done' | 'error';
  message?: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const TEXT_MIME_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values',
  'text/xml', 'application/xml', 'application/json', 'text/html',
  'application/x-yaml', 'text/yaml', 'text/x-markdown',
];

const IMAGE_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
];

const SPREADSHEET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
];

const PDF_MIME_TYPES = ['application/pdf'];

const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** All supported MIME types */
export const SUPPORTED_MIME_TYPES = [
  ...TEXT_MIME_TYPES,
  ...IMAGE_MIME_TYPES,
  ...SPREADSHEET_MIME_TYPES,
  ...PDF_MIME_TYPES,
  ...DOCX_MIME_TYPES,
];

/** File extensions for the file input accept attribute */
export const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.xls,.csv,.tsv,.txt,.md,.json,.xml,.yaml,.yml,.html,.png,.jpg,.jpeg,.webp,.gif';

/** Max extracted text length to send to the agent (chars) */
const MAX_EXTRACTED_TEXT = 80_000;

function categorizeFile(mimeType: string): ExtractedFile['category'] {
  if (IMAGE_MIME_TYPES.includes(mimeType)) return 'image';
  if (SPREADSHEET_MIME_TYPES.includes(mimeType)) return 'spreadsheet';
  if (PDF_MIME_TYPES.includes(mimeType) || DOCX_MIME_TYPES.includes(mimeType)) return 'document';
  if (mimeType === 'application/json' || mimeType === 'text/csv' || mimeType === 'text/tab-separated-values' || mimeType.includes('xml') || mimeType.includes('yaml')) return 'data';
  return 'text';
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    html: 'text/html',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[ext || ''] || 'application/octet-stream';
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractSpreadsheet(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const parts: string[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }
  
  return parts.join('\n\n');
}

async function extractDocxText(file: File): Promise<string> {
  // DOCX files are ZIP archives containing XML
  // We extract the main document.xml for text content
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const docXml = zip.file('word/document.xml');
  if (!docXml) return '[Could not extract text from DOCX]';
  
  const xmlContent = await docXml.async('string');
  // Strip XML tags to get plain text
  const text = xmlContent
    .replace(/<w:p[^>]*>/g, '\n') // paragraphs become newlines
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '') // strip all XML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n') // collapse multiple newlines
    .trim();
  
  return text;
}

/**
 * Extract content from a file for agent context.
 */
export async function extractFileContent(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<ExtractedFile> {
  const mimeType = file.type || guessMimeType(file.name);
  const isImage = IMAGE_MIME_TYPES.includes(mimeType);
  const category = categorizeFile(mimeType);
  
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name}" exceeds 50MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }
  
  onProgress?.({ filename: file.name, stage: 'extracting', message: 'Processing...' });
  
  let extractedText: string | null = null;
  let base64Data: string | null = null;
  
  try {
    if (isImage) {
      // Images: convert to base64 for vision analysis
      base64Data = await readAsBase64(file);
      extractedText = null; // no text extraction for images
    } else if (PDF_MIME_TYPES.includes(mimeType)) {
      // PDFs: use existing client-side extractor
      const result = await extractPdfTextClientSide(file);
      extractedText = result.text;
    } else if (SPREADSHEET_MIME_TYPES.includes(mimeType)) {
      extractedText = await extractSpreadsheet(file);
    } else if (DOCX_MIME_TYPES.includes(mimeType)) {
      extractedText = await extractDocxText(file);
    } else if (TEXT_MIME_TYPES.includes(mimeType) || mimeType.startsWith('text/')) {
      extractedText = await readAsText(file);
    } else {
      // Unknown type - try reading as text
      try {
        extractedText = await readAsText(file);
      } catch {
        extractedText = '[Binary file - content could not be extracted as text]';
      }
    }
    
    // Truncate very long extracted text
    if (extractedText && extractedText.length > MAX_EXTRACTED_TEXT) {
      extractedText = extractedText.substring(0, MAX_EXTRACTED_TEXT) + `\n\n[...truncated at ${MAX_EXTRACTED_TEXT.toLocaleString()} chars, original: ${extractedText.length.toLocaleString()} chars]`;
    }
    
    onProgress?.({ filename: file.name, stage: 'done' });
  } catch (err: any) {
    onProgress?.({ filename: file.name, stage: 'error', message: err.message });
    throw err;
  }
  
  return {
    filename: file.name,
    mimeType,
    size: file.size,
    extractedText,
    base64Data,
    isImage,
    category,
  };
}

/**
 * Format extracted files into context blocks for the agent message.
 */
export function formatFilesForAgent(files: ExtractedFile[]): string {
  if (files.length === 0) return '';
  
  const blocks = files
    .filter(f => !f.isImage && f.extractedText)
    .map(f => {
      const sizeStr = f.size < 1024 ? `${f.size}B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / 1048576).toFixed(1)}MB`;
      return `[FILE: ${f.filename} (${f.mimeType}, ${sizeStr})]\n${f.extractedText}\n[/FILE]`;
    });
  
  return blocks.join('\n\n');
}

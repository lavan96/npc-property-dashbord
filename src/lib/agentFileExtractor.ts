/**
 * Client-side file content extraction for the Oryxa Agent.
 * Supports PDF, XLSX, XLS, CSV, TXT, MD, JSON, XML, DOCX, and images.
 */
import { extractPdfTextClientSide } from '@/lib/pdfClientExtractor';
import { convertPdfToImages } from '@/utils/pdfToImages';
import * as XLSX from 'xlsx';

export interface ExtractedFile {
  filename: string;
  mimeType: string;
  size: number;
  extractedText: string | null;
  base64Data: string | null; // For images - base64 encoded
  isImage: boolean;
  category: 'document' | 'spreadsheet' | 'image' | 'data' | 'text';
  /** For scanned PDFs converted to images for vision analysis */
  pdfPageImages?: Array<{ pageNumber: number; base64: string }>;
}

export type ExtractionProgress = {
  filename: string;
  stage: 'reading' | 'extracting' | 'done' | 'error';
  message?: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** Minimum chars from PDF text extraction to consider it text-readable (not scanned) */
const MIN_PDF_TEXT_THRESHOLD = 100;

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

/** Known binary MIME types that should never be read as text */
const BINARY_MIME_TYPES = [
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/wasm',
  'application/x-executable',
  'application/x-mach-binary',
  'application/x-sharedlib',
  'video/', 'audio/', // prefix matches handled below
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

/** Check if a MIME type is known binary (not text-readable) */
function isKnownBinaryType(mimeType: string): boolean {
  if (BINARY_MIME_TYPES.includes(mimeType)) return true;
  // Check prefix matches for video/ and audio/
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return true;
  return false;
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
 * Never throws — returns an error result instead so callers can safely use Promise.allSettled-style logic.
 */
export async function extractFileContent(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<ExtractedFile> {
  const mimeType = file.type || guessMimeType(file.name);
  const isImage = IMAGE_MIME_TYPES.includes(mimeType);
  const category = categorizeFile(mimeType);
  
  if (file.size > MAX_FILE_SIZE) {
    // Return an error result instead of throwing
    onProgress?.({ filename: file.name, stage: 'error', message: `File exceeds 50MB limit` });
    return {
      filename: file.name,
      mimeType,
      size: file.size,
      extractedText: `[Error: File "${file.name}" exceeds 50MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)]`,
      base64Data: null,
      isImage: false,
      category,
    };
  }
  
  onProgress?.({ filename: file.name, stage: 'extracting', message: 'Processing...' });
  
  let extractedText: string | null = null;
  let base64Data: string | null = null;
  let pdfPageImages: Array<{ pageNumber: number; base64: string }> | undefined;
  
  try {
    if (isImage) {
      // Images: convert to base64 for vision analysis
      base64Data = await readAsBase64(file);
      extractedText = null; // no text extraction for images
    } else if (PDF_MIME_TYPES.includes(mimeType)) {
      // PDFs: try text extraction first
      try {
        const result = await extractPdfTextClientSide(file);
        const textContent = result.text?.trim() || '';
        
        if (textContent.length >= MIN_PDF_TEXT_THRESHOLD) {
          // Text-readable PDF — use extracted text
          extractedText = result.text;
        } else {
          // Scanned/image-based PDF — fall back to image conversion for vision
          console.log(`[agentFileExtractor] PDF "${file.name}" has only ${textContent.length} chars of text, falling back to image extraction`);
          const imageResult = await convertPdfToImages(file);
          if (imageResult.success && imageResult.images.length > 0) {
            pdfPageImages = imageResult.images.map(img => ({
              pageNumber: img.pageNumber,
              base64: img.base64,
            }));
            extractedText = `[Scanned PDF: ${imageResult.totalPages} pages, ${imageResult.images.length} rendered as images for visual analysis]`;
          } else {
            extractedText = '[PDF appears to be scanned/image-based. Could not extract text or render pages.]';
          }
        }
      } catch (pdfErr) {
        console.warn(`[agentFileExtractor] PDF extraction failed for "${file.name}":`, pdfErr);
        // Try image fallback even on extraction error
        try {
          const imageResult = await convertPdfToImages(file);
          if (imageResult.success && imageResult.images.length > 0) {
            pdfPageImages = imageResult.images.map(img => ({
              pageNumber: img.pageNumber,
              base64: img.base64,
            }));
            extractedText = `[PDF text extraction failed, ${imageResult.images.length} pages rendered as images]`;
          } else {
            extractedText = `[PDF extraction failed: ${pdfErr instanceof Error ? pdfErr.message : 'Unknown error'}]`;
          }
        } catch {
          extractedText = `[PDF extraction failed: ${pdfErr instanceof Error ? pdfErr.message : 'Unknown error'}]`;
        }
      }
    } else if (SPREADSHEET_MIME_TYPES.includes(mimeType)) {
      extractedText = await extractSpreadsheet(file);
    } else if (DOCX_MIME_TYPES.includes(mimeType)) {
      extractedText = await extractDocxText(file);
    } else if (TEXT_MIME_TYPES.includes(mimeType) || mimeType.startsWith('text/')) {
      extractedText = await readAsText(file);
    } else if (isKnownBinaryType(mimeType)) {
      // Known binary type — don't attempt text read
      extractedText = `[Binary file "${file.name}" (${mimeType}) — content cannot be extracted as text]`;
    } else {
      // Unknown type — try reading as text, but validate the result
      try {
        const rawText = await readAsText(file);
        // Check if result looks like valid text (not garbled binary)
        const nullByteRatio = (rawText.match(/\0/g) || []).length / rawText.length;
        if (nullByteRatio > 0.01) {
          // More than 1% null bytes = likely binary
          extractedText = `[Binary file "${file.name}" (${mimeType}) — content cannot be extracted as text]`;
        } else {
          extractedText = rawText;
        }
      } catch {
        extractedText = `[Binary file "${file.name}" — content could not be extracted as text]`;
      }
    }
    
    // Truncate very long extracted text
    if (extractedText && extractedText.length > MAX_EXTRACTED_TEXT) {
      extractedText = extractedText.substring(0, MAX_EXTRACTED_TEXT) + `\n\n[...truncated at ${MAX_EXTRACTED_TEXT.toLocaleString()} chars, original: ${extractedText.length.toLocaleString()} chars]`;
    }
    
    onProgress?.({ filename: file.name, stage: 'done' });
  } catch (err: any) {
    console.error(`[agentFileExtractor] Extraction error for "${file.name}":`, err);
    onProgress?.({ filename: file.name, stage: 'error', message: err.message });
    // Return error result instead of throwing — prevents array sync issues
    return {
      filename: file.name,
      mimeType,
      size: file.size,
      extractedText: `[Extraction error for "${file.name}": ${err.message}]`,
      base64Data: null,
      isImage: false,
      category,
    };
  }
  
  return {
    filename: file.name,
    mimeType,
    size: file.size,
    extractedText,
    base64Data,
    isImage,
    category,
    pdfPageImages,
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

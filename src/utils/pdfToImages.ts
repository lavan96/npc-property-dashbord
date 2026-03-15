/**
 * PDF to Images Conversion Utility
 * Uses PDF.js to render PDF pages as PNG images for GPT-4o Vision analysis
 */

// NOTE: We intentionally load PDF.js from a CDN at runtime.
// Reason: pdfjs-dist includes an optional native dependency (canvas) that can
// cause bun installs in CI to timeout, preventing preview/publish.

const PDFJS_VERSION = '4.4.168';
const PDFJS_CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

let pdfjsPromise: Promise<any> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = await import(/* @vite-ignore */ `${PDFJS_CDN_BASE}/pdf.min.mjs`);
      // Set up the worker from the same CDN
      mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN_BASE}/pdf.worker.min.mjs`;
      return mod;
    })();
  }
  return pdfjsPromise;
}

export interface PdfPageImage {
  pageNumber: number;
  base64: string;
  width: number;
  height: number;
}

export interface PdfConversionResult {
  success: boolean;
  images: PdfPageImage[];
  totalPages: number;
  error?: string;
}

const MAX_PAGES_TO_RENDER = 30; // Increased limit for large documents
const MAX_PAGES_FOR_VISION_BATCH = 20; // Max images to send in a single vision API call
const RENDER_SCALE = 2.0; // Higher scale for better OCR quality
const LARGE_DOC_RENDER_SCALE = 1.5; // Lower scale for large documents to manage payload
const MAX_DIMENSION = 2048; // Max dimension to avoid memory issues
const LARGE_DOC_THRESHOLD = 15; // Pages above this use compressed rendering

/**
 * Convert a PDF file to an array of base64 PNG images
 */
export async function convertPdfToImages(
  pdfFile: File,
  onProgress?: (current: number, total: number) => void
): Promise<PdfConversionResult> {
  try {
    console.log('🔄 Starting PDF to image conversion:', pdfFile.name);
    
    // Read the file as ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    // Load PDF.js (from CDN)
    const pdfjs = await getPdfJs();

    // Load the PDF document
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    });
    
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;
    const pagesToRender = Math.min(totalPages, MAX_PAGES_TO_RENDER);
    
    console.log(`📄 PDF loaded: ${totalPages} pages, rendering ${pagesToRender}`);
    
    const images: PdfPageImage[] = [];
    
    // Render each page to an image
    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      try {
        onProgress?.(pageNum, pagesToRender);
        console.log(`🖼️ Rendering page ${pageNum}/${pagesToRender}`);
        
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        
        // Calculate dimensions (limit to max dimension)
        let width = Math.floor(viewport.width);
        let height = Math.floor(viewport.height);
        let scale = RENDER_SCALE;
        
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
          scale = RENDER_SCALE * ratio;
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Failed to get canvas context');
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Fill with white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        
        // Render the page
        const renderViewport = page.getViewport({ scale });
        await page.render({
          canvasContext: context,
          viewport: renderViewport,
        }).promise;
        
        // Convert to base64 PNG (use JPEG for smaller size if needed)
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        
        images.push({
          pageNumber: pageNum,
          base64,
          width,
          height,
        });
        
        console.log(`✅ Page ${pageNum} rendered: ${width}x${height}`);
        
      } catch (pageError) {
        console.error(`❌ Failed to render page ${pageNum}:`, pageError);
        // Continue with other pages
      }
    }
    
    if (images.length === 0) {
      return {
        success: false,
        images: [],
        totalPages,
        error: 'Failed to render any pages from the PDF',
      };
    }
    
    console.log(`✅ PDF conversion complete: ${images.length}/${totalPages} pages rendered`);
    
    return {
      success: true,
      images,
      totalPages,
    };
    
  } catch (error) {
    console.error('❌ PDF conversion failed:', error);
    return {
      success: false,
      images: [],
      totalPages: 0,
      error: error instanceof Error ? error.message : 'Unknown error during PDF conversion',
    };
  }
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
}

/**
 * Convert an image file to base64
 */
export async function imageFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get pure base64
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

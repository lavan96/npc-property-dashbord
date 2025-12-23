/**
 * PDF to Images Conversion Utility
 * Uses PDF.js to render PDF pages as PNG images for GPT-4o Vision analysis
 */

import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker - using CDN for compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

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

const MAX_PAGES_TO_RENDER = 6; // Limit pages to avoid token limits
const RENDER_SCALE = 2.0; // Higher scale for better OCR quality
const MAX_DIMENSION = 2048; // Max dimension to avoid memory issues

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
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
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

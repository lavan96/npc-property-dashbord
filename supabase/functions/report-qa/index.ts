import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import { verifyAuth, createUnauthorizedResponse } from '../_shared/auth.ts';
import { logApiUsage, extractOpenAIUsage } from '../_shared/logApiUsage.ts';

// ============= PDF TEXT EXTRACTION HELPER =============
// Optimized lightweight approach for Deno Edge Functions
// Uses streaming chunk processing to avoid CPU timeouts
// Supports OCR for scanned/image-based PDFs via OpenAI Vision API

const MAX_PDF_SIZE_FOR_FULL_PARSE = 500000; // 500KB - limit for full parsing
const MAX_TEXT_MATCHES = 2000; // Limit matches to prevent infinite loops
const MAX_IMAGES_TO_OCR = 5; // Limit number of page images to process for OCR
const MAX_IMAGE_SIZE_FOR_OCR = 2000000; // 2MB max per image

type PageImageInput = {
  pageNumber: number;
  base64: string; // base64 WITHOUT data url prefix
  mimeType?: string; // e.g. image/png
  width?: number;
  height?: number;
};

/**
 * Extract text content from a PDF - optimized for Edge Functions
 * Uses chunk-based processing to avoid CPU timeouts
 * Optionally performs OCR on embedded images
 */
async function extractPdfText(
  pdfBytes: Uint8Array, 
  openaiApiKey?: string,
  pageImages?: PageImageInput[]
): Promise<{ text: string; totalPages: number; imagesProcessed: number }> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { 
      ignoreEncryption: true,
      updateMetadata: false 
    });
    
    const pageCount = pdfDoc.getPageCount();
    console.log(`[PDF-Extract] Processing ${pageCount} pages, size: ${pdfBytes.length} bytes`);
    
    // For large PDFs, use simplified extraction to avoid CPU timeout
    const useSimplified = pdfBytes.length > MAX_PDF_SIZE_FOR_FULL_PARSE;
    
    if (useSimplified) {
      console.log(`[PDF-Extract] Using simplified extraction for large PDF`);
    }
    
    // Extract text from the PDF content in a single pass
    const extractedText = extractTextFromPdfBytes(pdfBytes, useSimplified);
    
    // If we got very little text, try OCR on provided page images (client-rendered)
    let ocrText = '';
    let imagesProcessed = 0;
    
    if (openaiApiKey && extractedText.length < 500) {
      if (pageImages && pageImages.length > 0) {
        console.log(
          `[PDF-Extract] Low text content (${extractedText.length} chars), attempting OCR on ${pageImages.length} provided page images...`
        );

        const ocrResult = await extractTextFromProvidedImages(pageImages, openaiApiKey);
        ocrText = ocrResult.text;
        imagesProcessed = ocrResult.imagesProcessed;

        if (ocrText) {
          console.log(`[PDF-Extract] OCR extracted ${ocrText.length} chars from ${imagesProcessed} images`);
        }
      } else {
        console.log(
          `[PDF-Extract] Low text content (${extractedText.length} chars) but no pageImages provided; skipping OCR.`
        );
      }
    }
    
    // Combine text and OCR results
    const combinedText = [extractedText, ocrText].filter(t => t.trim()).join('\n\n--- OCR FROM IMAGES ---\n\n');
    
    return {
      text: combinedText,
      totalPages: pageCount,
      imagesProcessed
    };
  } catch (error) {
    console.error('[PDF-Extract] Error loading PDF:', error);
    throw error;
  }
}

/**
 * OCR provided page images using OpenAI Vision API.
 * NOTE: OpenAI Vision only accepts image mime-types, not PDFs.
 */
function estimateBytesFromBase64Length(base64: string): number {
  // Base64 size ≈ (len * 3) / 4 - padding
  const len = base64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

async function extractTextFromProvidedImages(
  pageImages: PageImageInput[],
  openaiApiKey: string
): Promise<{ text: string; imagesProcessed: number }> {
  const start = Date.now();
  const ocrTexts: string[] = [];
  let processed = 0;

  const imagesToUse = pageImages
    .filter((img) => !!img?.base64)
    .slice(0, MAX_IMAGES_TO_OCR);

  console.log(`[PDF-OCR] OCR on provided images: ${imagesToUse.length} images`);

  for (const img of imagesToUse) {
    // Hard guard to avoid long executions (platform may kill ~150s)
    if (Date.now() - start > 90_000) {
      console.log('[PDF-OCR] Timeout guard hit; stopping OCR loop early');
      break;
    }

    const approxBytes = estimateBytesFromBase64Length(img.base64);
    if (approxBytes > MAX_IMAGE_SIZE_FOR_OCR) {
      console.log(
        `[PDF-OCR] Skipping page ${img.pageNumber} image (too large: ~${approxBytes} bytes)`
      );
      continue;
    }

    const mimeType = img.mimeType || 'image/png';
    const pageNumber = img.pageNumber || 0;

    const ocrResult = await performOcrOnImage(img.base64, mimeType, pageNumber, openaiApiKey);
    if (ocrResult && ocrResult.trim().length > 10) {
      ocrTexts.push(`[Page ${pageNumber}]\n${ocrResult}`);
      processed++;
    }
  }

  return { text: ocrTexts.join('\n\n'), imagesProcessed: processed };
}

async function performOcrOnImage(
  base64Image: string,
  mimeType: string,
  pageNumber: number,
  openaiApiKey: string
): Promise<string | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract ALL text visible on this page image (page ${pageNumber}). Include:
- All headings, titles, and labels
- All body text and paragraphs
- All numbers, prices, and data
- All table content (format as markdown tables)
- All bullet points and lists

Return plain text/markdown only (no JSON).`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PDF-OCR] Vision API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('[PDF-OCR] Vision API call failed:', error);
    return null;
  }
}


/**
 * Extract text from PDF bytes using optimized single-pass parsing
 * Processes in chunks to avoid CPU timeout
 */
function extractTextFromPdfBytes(pdfBytes: Uint8Array, simplified: boolean): string {
  const startTime = Date.now();
  const textParts: string[] = [];
  
  try {
    // Convert to string for parsing
    const pdfString = new TextDecoder('latin1').decode(pdfBytes);
    let matchCount = 0;
    
    // OPTIMIZATION: Use non-global regex and manual iteration for large files
    // This prevents catastrophic backtracking
    
    // Strategy 1: Extract text from parentheses with Tj/TJ operators (most common)
    // Use a simpler, faster regex pattern
    const simpleTextPattern = /\(([^\\)]{1,200})\)\s*T[jJ]/g;
    let match;
    
    while ((match = simpleTextPattern.exec(pdfString)) !== null && matchCount < MAX_TEXT_MATCHES) {
      const text = decodePdfStringFast(match[1]);
      if (text.length > 1) {
        textParts.push(text);
        matchCount++;
      }
      
      // Timeout protection - check every 100 matches
      if (matchCount % 100 === 0 && Date.now() - startTime > 3000) {
        console.log(`[PDF-Extract] Early exit after ${matchCount} matches (timeout protection)`);
        break;
      }
    }
    
    // Strategy 2: Only for smaller files, also check TJ arrays
    if (!simplified && matchCount < MAX_TEXT_MATCHES / 2) {
      const tjArrayPattern = /\[([^\]]{1,500})\]\s*TJ/g;
      while ((match = tjArrayPattern.exec(pdfString)) !== null && matchCount < MAX_TEXT_MATCHES) {
        const arrayContent = match[1];
        // Quick extraction of strings from array
        const strings = arrayContent.match(/\(([^)]{1,100})\)/g);
        if (strings) {
          for (const s of strings.slice(0, 20)) { // Limit per-array extraction
            const text = decodePdfStringFast(s.slice(1, -1));
            if (text.length > 1) {
              textParts.push(text);
              matchCount++;
            }
          }
        }
        
        if (Date.now() - startTime > 4000) {
          console.log(`[PDF-Extract] TJ array early exit (timeout protection)`);
          break;
        }
      }
    }
    
    console.log(`[PDF-Extract] Extracted ${matchCount} text segments in ${Date.now() - startTime}ms`);
    
    // Join and clean up the text
    const rawText = textParts.join(' ');
    
    // Basic cleanup: remove excessive whitespace
    const cleanedText = rawText
      .replace(/\s+/g, ' ')
      .replace(/([.!?])\s+/g, '$1\n')
      .trim();
    
    return cleanedText;
  } catch (error) {
    console.error(`[PDF-Extract] Extraction error:`, error);
    return '';
  }
}

/**
 * Fast PDF string decoder - minimal processing
 */
function decodePdfStringFast(str: string): string {
  // Quick decode - only handle most common escapes
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/\\(.)/g, '$1');
}
// Dynamic CORS headers for credentials support
function createCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'https://command-centre.npcservices.com.au',
    'https://npc-property-dashbord.lovable.app',
    'https://id-preview--7976d60b-c277-4851-889b-c170285f4be2.lovable.app',
    'http://localhost:5173',
    'http://localhost:8080',
  ];
  
  // Allow Lovable preview domains and custom domains dynamically
  const allowedOrigin = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.npcservices.com.au')
  ) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

/**
 * Decode base64 to Uint8Array - simple and reliable approach
 * Uses atob for the full string (works fine for audio files up to ~50MB)
 * IMPORTANT: Do NOT split base64 at arbitrary boundaries - base64 works in 4-char groups
 */
function decodeBase64ToUint8Array(base64String: string): Uint8Array {
  // Clean up the base64 string - remove any whitespace or newlines
  const cleanBase64 = base64String.replace(/\s/g, '');
  
  // Decode base64 to binary string
  const binaryString = atob(cleanBase64);
  
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

// ============= RAG HELPER FUNCTIONS =============

/**
 * Step 1: Chunk text into smaller overlapping segments
 * Uses sentence-aware chunking with overlap for better context preservation
 */
function chunkText(text: string, chunkSize = 800, overlapSize = 150): string[] {
  const chunks: string[] = [];
  
  // Clean and normalize text
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }
  
  // Split by paragraphs first for better semantic boundaries
  const paragraphs = cleanText.split(/\n\n+/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current and start new
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap from previous
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlapSize / 5)); // Approximate word count for overlap
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // If we still have very long chunks, split them further
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > chunkSize * 1.5) {
      // Split by sentences
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let subChunk = '';
      
      for (const sentence of sentences) {
        if (subChunk.length + sentence.length > chunkSize && subChunk.length > 0) {
          finalChunks.push(subChunk.trim());
          subChunk = sentence;
        } else {
          subChunk += (subChunk ? ' ' : '') + sentence;
        }
      }
      
      if (subChunk.trim()) {
        finalChunks.push(subChunk.trim());
      }
    } else {
      finalChunks.push(chunk);
    }
  }
  
  console.log(`[RAG] Chunked text into ${finalChunks.length} segments`);
  return finalChunks;
}

/**
 * Step 2: Generate embedding vector for a text chunk using OpenAI
 */
async function generateEmbedding(text: string, openaiApiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000), // Limit input to avoid token limits
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[RAG] Embedding API error: ${response.status} - ${errorText}`);
    throw new Error(`Failed to generate embedding: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Step 3: Store document chunks with embeddings in database
 */
async function storeDocumentChunks(
  supabase: any,
  documentName: string,
  chunks: string[],
  openaiApiKey: string,
  conversationId?: string
): Promise<void> {
  console.log(`[RAG] Storing ${chunks.length} chunks for document: ${documentName}`);
  
  // Delete existing chunks for this document to avoid duplicates
  if (conversationId) {
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_name', documentName)
      .eq('conversation_id', conversationId);
  }
  
  // Process chunks in batches to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    const chunksWithEmbeddings = await Promise.all(
      batch.map(async (chunkText, batchIndex) => {
        const chunkIndex = i + batchIndex;
        try {
          const embedding = await generateEmbedding(chunkText, openaiApiKey);
          return {
            document_name: documentName,
            chunk_index: chunkIndex,
            chunk_text: chunkText,
            embedding: JSON.stringify(embedding),
            conversation_id: conversationId || null,
            metadata: {
              char_count: chunkText.length,
              created_at: new Date().toISOString(),
            },
          };
        } catch (error) {
          console.error(`[RAG] Failed to embed chunk ${chunkIndex}:`, error);
          // Store without embedding if embedding fails
          return {
            document_name: documentName,
            chunk_index: chunkIndex,
            chunk_text: chunkText,
            embedding: null,
            conversation_id: conversationId || null,
            metadata: {
              char_count: chunkText.length,
              created_at: new Date().toISOString(),
              embedding_error: true,
            },
          };
        }
      })
    );
    
    const { error } = await supabase
      .from('document_chunks')
      .insert(chunksWithEmbeddings);
    
    if (error) {
      console.error(`[RAG] Error storing chunks batch ${i}:`, error);
      throw error;
    }
    
    console.log(`[RAG] Stored batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
  }
  
  console.log(`[RAG] Successfully stored all ${chunks.length} chunks with embeddings`);
}

/**
 * Step 4: Retrieve relevant chunks using similarity search
 */
async function retrieveRelevantChunks(
  supabase: any,
  query: string,
  openaiApiKey: string,
  conversationId?: string,
  matchThreshold = 0.7,
  matchCount = 5
): Promise<{ chunk_text: string; document_name: string; similarity: number }[]> {
  console.log(`[RAG] Retrieving relevant chunks for query: "${query.substring(0, 50)}..."`);
  
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, openaiApiKey);
    
    // Use the match_document_chunks function for similarity search
    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_conversation_id: conversationId || null,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });
    
    if (error) {
      console.error(`[RAG] Similarity search error:`, error);
      throw error;
    }
    
    console.log(`[RAG] Found ${data?.length || 0} relevant chunks`);
    return data || [];
  } catch (error) {
    console.error(`[RAG] Failed to retrieve chunks:`, error);
    return [];
  }
}

/**
 * Format retrieved chunks for context injection
 */
function formatRetrievedContext(chunks: { chunk_text: string; document_name: string; similarity: number }[]): string {
  if (!chunks || chunks.length === 0) {
    return '';
  }
  
  const contextParts = chunks.map((chunk, idx) => 
    `[Source: ${chunk.document_name} | Relevance: ${(chunk.similarity * 100).toFixed(1)}%]\n${chunk.chunk_text}`
  );
  
  return `\n\n## RETRIEVED CONTEXT FROM KNOWLEDGE BASE\nThe following excerpts from uploaded documents are most relevant to your question:\n\n${contextParts.join('\n\n---\n\n')}`;
}

// ============= END RAG HELPER FUNCTIONS =============

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Parse body with error handling - session token may be in headers/cookies
    let body: any = {};
    try {
      body = await req.json();
    } catch (err) {
      console.log('[report-qa] Body parsing failed (may be empty), continuing with empty body:', err);
      // Continue - session token should be in headers/cookies
    }
    
    // SECURITY: Verify authentication
    // IMPORTANT: verifyAuth checks headers/cookies first, then body
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[report-qa] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[report-qa] Authenticated user: ${userId}`);
    
    const { action } = body;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[report-qa] Action: ${action}`);

    // Handle voice-to-text transcription
    if (action === "transcribe") {
      const { audio } = body;
      
      if (!audio) {
        throw new Error("No audio data provided");
      }

      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured for voice transcription");
      }

      console.log(`[report-qa] Processing voice transcription...`);

      // Decode base64 audio to binary
      const binaryAudio = decodeBase64ToUint8Array(audio);
      console.log(`[report-qa] Decoded audio size: ${binaryAudio.length} bytes`);
      
      // Prepare form data
      const formData = new FormData();
      const blob = new Blob([binaryAudio], { type: 'audio/webm' });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');

      // Send to OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[report-qa] Whisper API error: ${response.status} - ${errorText}`);
        throw new Error(`Voice transcription failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[report-qa] Transcribed: ${result.text?.substring(0, 50)}...`);

      // Log Whisper API usage
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sbLog = createClient(supabaseUrl, supabaseKey);
      await logApiUsage(sbLog, {
        service_name: 'openai',
        endpoint: '/v1/audio/transcriptions',
        model_used: 'whisper-1',
        status: 'success',
        metadata: { function: 'report-qa', action: 'voice_transcribe' },
      });

      return new Response(
        JSON.stringify({ success: true, text: result.text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle PDF text extraction with RAG storage (Step 5)
    if (action === "extract") {
      const { fileData, fileName, conversationId, enableRAG = true, enableOCR = true, pageImages } = body;
      console.log(`[report-qa] Extracting text from: ${fileName}, RAG enabled: ${enableRAG}, OCR enabled: ${enableOCR}`);
      
      // Accept either a full data URL or raw base64.
      const base64Data = (typeof fileData === 'string' && fileData.includes(','))
        ? (fileData.split(',').pop() || '')
        : (fileData || '');
      
      let extractedText = "";
      let imagesProcessed = 0;
      let totalPages = 0;
      let fileSizeBytes = 0;
      
      try {
        // Convert base64 to Uint8Array for PDF parsing
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        fileSizeBytes = bytes.length;
        console.log(`[report-qa] PDF size: ${fileSizeBytes} bytes`);
        
        // Use our custom PDF text extraction function with optional OCR
        const ocrKey = enableOCR ? OPENAI_API_KEY : undefined;
        const result = await extractPdfText(bytes, ocrKey, Array.isArray(pageImages) ? pageImages : undefined);
        const { text, totalPages: pages, imagesProcessed: imgCount } = result;
        imagesProcessed = imgCount;
        totalPages = pages;
        
        console.log(`[report-qa] Extracted text from ${totalPages} pages, OCR'd ${imagesProcessed} images`);
        
        if (text && text.trim().length > 0) {
          extractedText = `[Document: ${fileName}]\n[Pages: ${totalPages}]${imagesProcessed > 0 ? `\n[Images OCR'd: ${imagesProcessed}]` : ''}\n\n${text}`;
          console.log(`[report-qa] Successfully extracted ${extractedText.length} characters`);
        } else {
          // PDF might be image-based (scanned), provide fallback message
          console.log(`[report-qa] No text extracted - PDF may be image-based or encrypted`);
          extractedText = `[Document: ${fileName}]\n[Pages: ${totalPages}]\n\nThis PDF appears to be image-based (scanned) or encrypted and text content could not be automatically extracted. The document has been uploaded but you may need to manually enter key details.`;
        }
      } catch (pdfError) {
        console.error(`[report-qa] PDF extraction error:`, pdfError);
        
        // Provide informative fallback
        extractedText = `[Document: ${fileName}]\n\nPDF text extraction encountered an error: ${pdfError.message}. The document has been uploaded but raw text could not be automatically extracted.`;
      }

      console.log(`[report-qa] Final extracted text length: ${extractedText.length} characters`);

      // Step 5: Store extracted text as chunks with embeddings for RAG
      let ragEnabled = false;
      if (enableRAG && OPENAI_API_KEY && extractedText.length > 100) {
        try {
          console.log(`[report-qa] Processing document for RAG storage...`);
          
          // Chunk the extracted text
          const chunks = chunkText(extractedText);
          
          // Store chunks with embeddings
          await storeDocumentChunks(supabase, fileName, chunks, OPENAI_API_KEY, conversationId);
          
          ragEnabled = true;
          console.log(`[report-qa] RAG storage complete for ${fileName}`);
        } catch (ragError) {
          console.error(`[report-qa] RAG storage failed (non-critical):`, ragError);
          // Continue without RAG - extraction still succeeded
        }
      } else if (!OPENAI_API_KEY) {
        console.log(`[report-qa] RAG storage skipped - OPENAI_API_KEY not configured`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          extractedText,
          ragEnabled,
          chunksStored: ragEnabled ? chunkText(extractedText).length : 0,
          imagesProcessed,
          totalPages,
          fileSizeBytes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle chat Q&A with RAG retrieval (Step 6)
    if (action === "chat") {
      const { reportContents, reportNames, question, chatHistory, conversationId, useRAG = true, modelProvider = 'openai' } = body;
      console.log(`[report-qa] Processing chat question: ${question?.substring(0, 50)}...`);
      console.log(`[report-qa] Reports count: ${reportContents?.length || 0}, RAG: ${useRAG}, Provider: ${modelProvider}`);

      const hasReports = reportContents && reportContents.length > 0;
      const isMultiReport = reportContents && reportContents.length > 1;
      
      // Step 6: Retrieve relevant chunks from knowledge base
      let ragContext = "";
      if (useRAG && OPENAI_API_KEY) {
        try {
          const relevantChunks = await retrieveRelevantChunks(
            supabase,
            question,
            OPENAI_API_KEY,
            conversationId,
            0.6, // Lower threshold for broader matches
            8    // Get more chunks for comprehensive context
          );
          
          if (relevantChunks.length > 0) {
            ragContext = formatRetrievedContext(relevantChunks);
            console.log(`[report-qa] Injecting ${relevantChunks.length} RAG chunks into context`);
          }
        } catch (ragError) {
          console.error(`[report-qa] RAG retrieval failed (continuing without):`, ragError);
        }
      }
      
      let contextSection = "";
      if (isMultiReport) {
        contextSection = reportContents.map((content: string, idx: number) => 
          `--- REPORT ${idx + 1}: ${reportNames?.[idx] || `Report ${idx + 1}`} ---\n${content}\n`
        ).join("\n\n");
      } else if (hasReports) {
        contextSection = reportContents?.[0] || body.reportContent || "";
      }

      let systemPrompt = "";
      
      if (isMultiReport) {
        systemPrompt = `You are an expert Australian investment property analyst and advisor for NPC Services. You have been provided with ${reportContents.length} investment reports for comparison analysis.

## YOUR EXPERTISE
- Deep knowledge of Australian property markets across all states and territories
- Understanding of property investment strategies (growth, yield, cash flow)
- Expertise in financial analysis, tax implications (including depreciation, negative gearing)
- Knowledge of demographic trends, infrastructure development, and economic indicators
- Familiarity with Australian lending practices, LVR requirements, and mortgage calculations

## YOUR ROLE
1. Compare and contrast properties across ALL metrics: financial, location, growth potential, risk
2. Provide data-driven recommendations with specific figures from the reports
3. Identify the best property for different investor profiles (first-time, growth-focused, yield-focused)
4. Highlight RED FLAGS and risks for each property
5. Use professional formatting suitable for client communication

## RESPONSE GUIDELINES
- Be thorough and detailed in your analysis
- Use tables or structured comparisons when appropriate
- Always include specific numbers and percentages from the reports
- Provide a clear recommendation with reasoning
- If data is missing, acknowledge it and explain what impact it has on the analysis
- Format for easy reading with headings, bullet points, and clear sections
- When citing information from the knowledge base, indicate the source

## REPORTS TO ANALYZE
${contextSection}${ragContext}`;
      } else if (hasReports) {
        systemPrompt = `You are an expert Australian investment property analyst and advisor for NPC Services. You have been provided with an investment property report to analyze.

## YOUR EXPERTISE
- Deep knowledge of Australian property markets across all states and territories
- Understanding of property investment strategies (growth, yield, cash flow)
- Expertise in financial analysis, tax implications (including depreciation, negative gearing)
- Knowledge of demographic trends, infrastructure development, and economic indicators
- Familiarity with Australian lending practices, LVR requirements, and mortgage calculations
- Understanding of stamp duty, council rates, strata fees, and ongoing costs

## YOUR ROLE
1. Answer questions accurately and thoroughly based on the report content
2. Provide investment insights and analysis beyond just reading data
3. Explain financial metrics in context (is 4% yield good? depends on location and growth)
4. Identify opportunities AND risks that may not be explicitly stated
5. Provide actionable advice suitable for investor decision-making

## RESPONSE GUIDELINES
- Be thorough and provide detailed explanations
- Include specific numbers and figures from the report
- Contextualize data (compare to market averages when possible)
- Structure responses with clear sections for complex questions
- When providing summaries (TLDR), include:
  • Property overview (type, location, price)
  • Key financial metrics (yield, cash flow, capital growth)
  • Top 3 strengths and top 3 concerns
  • Investor suitability rating
- If information is not in the report, clearly state that and explain what assumptions you're making
- When citing information from the knowledge base, indicate the source

## REPORT CONTENT
${contextSection}${ragContext}`;
      } else if (ragContext) {
        // No reports loaded but we have RAG context from knowledge base
        systemPrompt = `You are an expert Australian investment property analyst and advisor for NPC Services.

## YOUR EXPERTISE
- Deep knowledge of Australian property markets across all states and territories
- Understanding of property investment strategies (positive/negative gearing, growth vs yield, SMSF property)
- Expertise in financial analysis, ROI calculations, cash flow projections
- Knowledge of Australian tax implications (depreciation schedules, CGT, land tax, stamp duty by state)
- Understanding of demographic trends, infrastructure development, and economic indicators
- Familiarity with Australian lending practices, LVR requirements, and current interest rates

## YOUR ROLE
1. Answer property investment questions using information from the knowledge base
2. Provide market insights and trends for Australian property
3. Explain financial concepts clearly with examples
4. Help users understand investment strategies and their implications
5. Discuss risks and opportunities in the current market

## RESPONSE GUIDELINES
- Use information from the retrieved knowledge base documents when relevant
- Be conversational yet professional
- Provide detailed, actionable advice
- Use Australian context (AUD, local market references, Australian regulations)
- Include relevant data points when discussing markets
- When citing information from the knowledge base, indicate the source
- Structure longer responses with clear headings and bullet points
${ragContext}`;
      } else {
        // Open-ended conversation without document context
        systemPrompt = `You are an expert Australian investment property analyst and advisor for NPC Services, a property investment advisory firm.

## YOUR EXPERTISE
- Deep knowledge of Australian property markets across all states and territories (Sydney, Melbourne, Brisbane, Perth, Adelaide, Hobart, Darwin, Canberra, and regional areas)
- Understanding of property investment strategies (positive/negative gearing, growth vs yield, SMSF property)
- Expertise in financial analysis, ROI calculations, cash flow projections
- Knowledge of Australian tax implications (depreciation schedules, CGT, land tax, stamp duty by state)
- Understanding of demographic trends, infrastructure development, and economic indicators
- Familiarity with Australian lending practices, LVR requirements, and current interest rates
- Knowledge of property types (houses, units, townhouses, dual occupancy, commercial)

## YOUR ROLE
1. Answer property investment questions with expert-level detail
2. Provide market insights and trends for Australian property
3. Explain financial concepts clearly with examples
4. Help users understand investment strategies and their implications
5. Discuss risks and opportunities in the current market

## RESPONSE GUIDELINES
- Be conversational yet professional
- Provide detailed, actionable advice
- Use Australian context (AUD, local market references, Australian regulations)
- Include relevant data points when discussing markets
- Acknowledge when information may be outdated or when users should verify current rates/prices
- Structure longer responses with clear headings and bullet points
- If asked about specific properties without a report, encourage them to upload one

## CURRENT CONTEXT
No investment report has been uploaded. You are having an open conversation about property investment. If the user wants specific property analysis, encourage them to upload a report.`;
      }

      // Build messages ensuring strict alternation (required by Perplexity)
      const rawHistory = chatHistory || [];
      const sanitizedHistory: { role: string; content: string }[] = [];
      for (const msg of rawHistory) {
        // Skip if same role as previous (merge or drop to maintain alternation)
        if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === msg.role) {
          // Merge consecutive same-role messages
          sanitizedHistory[sanitizedHistory.length - 1].content += '\n\n' + msg.content;
        } else {
          sanitizedHistory.push({ role: msg.role, content: msg.content });
        }
      }
      // If last history message is 'user', merge it into the current question
      let finalQuestion = question;
      if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
        const lastUserMsg = sanitizedHistory.pop()!;
        finalQuestion = lastUserMsg.content + '\n\n' + question;
      }
      
      const messages = [
        { role: "system", content: systemPrompt },
        ...sanitizedHistory,
        { role: "user", content: finalQuestion },
      ];

      // Check if streaming is requested
      const streamingEnabled = body.stream === true;
      
      if (streamingEnabled) {
        console.log(`[report-qa] Streaming mode enabled, provider: ${modelProvider}`);
        
        let response: Response;
        let citations: string[] = [];
        
        if (modelProvider === 'perplexity') {
          // Use Perplexity API directly
          if (!PERPLEXITY_API_KEY) {
            throw new Error("PERPLEXITY_API_KEY is not configured");
          }
          
          response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar-pro",
              messages,
              max_tokens: 4096,
              stream: true,
            }),
          });
        } else if (modelProvider === 'openai-direct') {
          // Use OpenAI API directly (bypasses Lovable AI Gateway)
          if (!OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is not configured");
          }
          
          console.log(`[report-qa] Using direct OpenAI API`);
          response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4.1",
              messages,
              max_completion_tokens: 4096,
              stream: true,
            }),
          });
        } else if (modelProvider === 'gemini') {
          // Use Lovable AI Gateway with Gemini Pro (large context window)
          console.log(`[report-qa] Using Gemini Pro via Lovable AI Gateway`);
          response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages,
              max_tokens: 8192,
              stream: true,
            }),
          });
        } else {
          // Use Lovable AI Gateway with GPT-5.2 (OpenAI)
          response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-5.2",
              messages,
              max_completion_tokens: 4096,
              stream: true,
            }),
          });
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[report-qa] Chat error (${modelProvider}): ${response.status} - ${errorText}`);
          
          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (response.status === 402) {
            return new Response(
              JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          throw new Error(`AI API error: ${response.status}`);
        }

        // Log streaming LLM usage (fire-and-forget, no token counts available for streams)
        const streamModelName = modelProvider === 'perplexity' ? 'sonar-pro'
          : modelProvider === 'openai-direct' ? 'gpt-4.1'
          : modelProvider === 'gemini' ? 'gemini-2.5-pro' : 'gpt-5.2';
        const sbLogStream = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        logApiUsage(sbLogStream, {
          service_name: modelProvider === 'perplexity' ? 'perplexity' : modelProvider === 'gemini' ? 'gemini' : 'openai',
          endpoint: '/v1/chat/completions',
          model_used: streamModelName,
          status: 'success',
          user_id: userId || undefined,
          metadata: { function: 'report-qa', action: 'chat', streaming: true, modelProvider },
        }).catch(() => {}); // fire-and-forget

        // Return the streaming response directly
        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
      
      // Non-streaming mode (original behavior)
      let response: Response;
      let citations: string[] = [];
      
      if (modelProvider === 'perplexity') {
        // Use Perplexity API directly
        if (!PERPLEXITY_API_KEY) {
          throw new Error("PERPLEXITY_API_KEY is not configured");
        }
        
        response = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages,
            max_tokens: 4096,
          }),
        });
      } else if (modelProvider === 'openai-direct') {
        // Use OpenAI API directly (bypasses Lovable AI Gateway)
        if (!OPENAI_API_KEY) {
          throw new Error("OPENAI_API_KEY is not configured");
        }
        
        console.log(`[report-qa] Using direct OpenAI API (non-streaming)`);
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1",
            messages,
            max_completion_tokens: 4096,
          }),
        });
      } else if (modelProvider === 'gemini') {
        // Use Lovable AI Gateway with Gemini Pro (large context window)
        console.log(`[report-qa] Using Gemini Pro via Lovable AI Gateway (non-streaming)`);
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages,
            max_tokens: 8192,
          }),
        });
      } else {
        // Use Lovable AI Gateway with GPT-5.2 (OpenAI)
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5.2",
            messages,
            max_completion_tokens: 4096,
          }),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[report-qa] Chat error (${modelProvider}): ${response.status} - ${errorText}`);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      console.log(`[report-qa] AI Response structure (${modelProvider}):`, JSON.stringify(aiResponse, null, 2));
      
      // Extract citations from Perplexity response
      if (modelProvider === 'perplexity' && aiResponse.citations) {
        citations = aiResponse.citations;
        console.log(`[report-qa] Perplexity citations: ${citations.length}`);
      }
      
      // GPT-5 may return content in different paths
      let responseText = 
        aiResponse.choices?.[0]?.message?.content ||
        aiResponse.choices?.[0]?.text ||
        aiResponse.content ||
        aiResponse.message?.content ||
        "";
      
      if (!responseText || responseText.trim() === "") {
        console.error(`[report-qa] Empty response from AI. Full response:`, JSON.stringify(aiResponse));
        responseText = "I couldn't generate a response. Please try again.";
      }

      // Log chat API usage (non-streaming)
      const chatUsage = extractOpenAIUsage(aiResponse);
      const modelName = modelProvider === 'perplexity' ? 'sonar-pro' 
        : modelProvider === 'openai-direct' ? 'gpt-4.1'
        : modelProvider === 'gemini' ? 'gemini-2.5-pro' : 'gpt-5.2';
      const sbLogChat = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await logApiUsage(sbLogChat, {
        service_name: modelProvider === 'perplexity' ? 'perplexity' : modelProvider === 'gemini' ? 'gemini' : 'openai',
        endpoint: '/v1/chat/completions',
        model_used: modelName,
        prompt_tokens: chatUsage.prompt_tokens,
        completion_tokens: chatUsage.completion_tokens,
        tokens_used: chatUsage.total_tokens,
        status: 'success',
        metadata: { function: 'report-qa', action: 'chat', streaming: false, modelProvider },
      });

      // Save messages to database if conversationId provided
      if (conversationId) {
        await supabase.from("report_qa_messages").insert([
          { conversation_id: conversationId, role: "user", content: question },
          { conversation_id: conversationId, role: "assistant", content: responseText, model_provider: modelProvider },
        ]);

        // Check if this is the first message and generate a dynamic title
        const { count } = await supabase
          .from("report_qa_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conversationId);

        // Generate dynamic title after first exchange (2 messages = user + assistant)
        if (count && count <= 2) {
          console.log(`[report-qa] First exchange detected, generating dynamic title...`);
          
          try {
            const titleResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "system",
                    content: `Generate a short, descriptive title (max 6 words) for a property investment Q&A conversation. The title should capture the main topic being discussed. Return ONLY the title text, no quotes or punctuation at the end.`,
                  },
                  {
                    role: "user",
                    content: `User question: "${question}"\n\nAI response (first 200 chars): "${responseText.substring(0, 200)}..."`,
                  },
                ],
                max_tokens: 50,
              }),
            });

            if (titleResponse.ok) {
              const titleData = await titleResponse.json();
              const generatedTitle = (titleData.choices?.[0]?.message?.content || "").trim().replace(/['"]+/g, '');
              
              if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 60) {
                await supabase
                  .from("report_qa_conversations")
                  .update({ title: generatedTitle })
                  .eq("id", conversationId);
                
                console.log(`[report-qa] Updated conversation title to: ${generatedTitle}`);
              }
            }
          } catch (titleError) {
            console.error(`[report-qa] Failed to generate dynamic title:`, titleError);
            // Continue without failing - title generation is non-critical
          }
        }
      }

      console.log(`[report-qa] Generated response (${modelProvider}): ${responseText.length} characters`);

      return new Response(
        JSON.stringify({ 
          response: responseText,
          ragUsed: ragContext.length > 0,
          modelProvider,
          citations: citations.length > 0 ? citations : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle conversation creation
    if (action === "create-conversation") {
      const { reportNames, reportContents, title } = body;
      
      const { data, error } = await supabase
        .from("report_qa_conversations")
        .insert({
          report_names: reportNames,
          report_contents: reportContents,
          title: title || `Q&A: ${reportNames.join(", ")}`,
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[report-qa] Created conversation: ${data.id}`);

      return new Response(
        JSON.stringify({ success: true, conversation: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle fetching conversation history (no limit - return all)
    if (action === "get-conversations") {
      const { data, error } = await supabase
        .from("report_qa_conversations")
        .select("id, title, report_names, created_at, updated_at, structured_report")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, conversations: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle loading a specific conversation
    if (action === "load-conversation") {
      const { conversationId } = body;
      
      const { data: conversation, error: convError } = await supabase
        .from("report_qa_conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (convError) throw convError;

      const { data: messages, error: msgError } = await supabase
        .from("report_qa_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (msgError) throw msgError;

      return new Response(
        JSON.stringify({ success: true, conversation, messages }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle updating conversation (e.g., title)
    if (action === "update-conversation") {
      const { conversationId, title } = body;
      
      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: "conversationId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("report_qa_conversations")
        .update(updateData)
        .eq("id", conversationId)
        .select()
        .single();

      if (error) throw error;

      console.log(`[report-qa] Updated conversation: ${conversationId}`);

      return new Response(
        JSON.stringify({ success: true, conversation: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle summarize-conversation: AI processes raw chat into structured report
    if (action === "summarize-conversation") {
      const { messages: chatMessages, reportNames, title } = body;
      
      if (!chatMessages || chatMessages.length === 0) {
        return new Response(
          JSON.stringify({ error: "No messages provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[report-qa] Summarizing conversation: ${chatMessages.length} messages`);

      const transcript = chatMessages.map((m: any) => {
        const role = m.role === 'user' ? 'Advisor' : 'AI Analyst';
        return `**${role}:**\n${m.content}`;
      }).join('\n\n---\n\n');

      const summarizePrompt = `You are a professional report writer for NPC Services, an Australian property investment advisory firm.

You have been given a raw Q&A conversation transcript between a property advisor and an AI analyst about investment property reports. Your task is to transform this raw conversation into a polished, structured analytical report suitable for client presentation.

## INSTRUCTIONS
1. Extract ALL key insights, findings, data points, and recommendations from the conversation
2. Organize them into a professional report structure
3. Remove conversational artifacts (greetings, "thank you", repetition, back-and-forth)
4. Preserve ALL numerical data, statistics, and specific details mentioned
5. Write in a professional third-person analytical tone
6. Use proper markdown formatting with headings, bullet points, and tables where appropriate

## REQUIRED REPORT STRUCTURE
Use the following sections (skip any that have no relevant content):

# ${title || 'Investment Analysis Report'}

## Executive Summary
A concise 2-3 paragraph overview of the key findings and recommendations.

## Property Overview
Key details about the property/properties discussed.

## Financial Analysis
Any financial metrics, yields, cash flow projections, costs discussed.

## Market & Location Insights
Demographics, infrastructure, growth drivers, market trends.

## Risk Assessment
Identified risks, concerns, and mitigation strategies.

## Opportunities & Strengths
Positive factors and investment opportunities identified.

## Recommendations
Actionable recommendations and next steps.

## Additional Notes
Any other relevant information from the conversation.

---
*Reports analyzed: ${(reportNames || []).join(', ') || 'N/A'}*
*Generated: ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}*
*Prepared by: NPC Services*

## RAW CONVERSATION TRANSCRIPT
${transcript}`;

      const summarizeMessages = [
        { role: "system", content: "You are an expert report writer. Transform raw conversations into polished, structured reports. Output only the final markdown report, no preamble." },
        { role: "user", content: summarizePrompt },
      ];

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.2",
          messages: summarizeMessages,
          max_completion_tokens: 8192,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[report-qa] Summarize error: ${response.status} - ${errorText}`);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const structuredReport = aiResponse.choices?.[0]?.message?.content || "";

      console.log(`[report-qa] Generated structured report: ${structuredReport.length} chars`);

      return new Response(
        JSON.stringify({ success: true, structuredReport }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle deleting conversation
    if (action === "delete-conversation") {
      const { conversationId } = body;
      
      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: "conversationId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete messages first (foreign key constraint)
      await supabase
        .from("report_qa_messages")
        .delete()
        .eq("conversation_id", conversationId);

      // Delete the conversation
      const { error } = await supabase
        .from("report_qa_conversations")
        .delete()
        .eq("id", conversationId);

      if (error) throw error;

      console.log(`[report-qa] Deleted conversation: ${conversationId}`);

      return new Response(
        JSON.stringify({ success: true, deleted: conversationId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle fetching available mailboxes for email
    if (action === "get-mailboxes") {
      const { data, error } = await supabase
        .from("custom_users")
        .select("id, username, personal_mailbox")
        .eq("is_active", true)
        .not("personal_mailbox", "is", null);

      if (error) throw error;

      const mailboxes = (data || []).filter((u: any) => u.personal_mailbox);
      console.log(`[report-qa] Fetched ${mailboxes.length} mailboxes`);

      return new Response(
        JSON.stringify({ success: true, mailboxes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle email sending
    if (action === "send-email") {
      const { to, subject, content, reportNames } = body;

      if (!RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
      }

      const resend = new Resend(RESEND_API_KEY);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a365d; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .footer { padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e5e7eb; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Investment Report Summary</h1>
              ${reportNames?.length ? `<p>Reports: ${reportNames.join(", ")}</p>` : ""}
            </div>
            <div class="content">
              <pre>${content}</pre>
            </div>
            <div class="footer">
              <p>NPC Services</p>
              <p>Phone: 0433 005 110 | Email: admin@npcservices.com.au</p>
              <p>Website: npcservices.com.au</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailResponse = await resend.emails.send({
        from: "NPC Services <admin@npcservices.com.au>",
        to: [to],
        subject: subject || "Investment Report Summary",
        html: htmlContent,
      });

      console.log(`[report-qa] Email sent to: ${to}`);

      return new Response(
        JSON.stringify({ success: true, emailResponse }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle PDF export (basic)
    if (action === "export-pdf") {
      const { content, reportName } = body;
      console.log(`[report-qa] Generating PDF for: ${reportName}`);

      const cleanContent = content.replace(/[^\x00-\x7F]/g, "");
      const timestamp = new Date().toLocaleString();
      
      const pdfContent = `
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${cleanContent.length + 200} >>
stream
BT
/F1 16 Tf
50 750 Td
(Report Summary) Tj
/F1 10 Tf
0 -30 Td
(Generated: ${timestamp}) Tj
0 -20 Td
(Source: ${reportName || 'Investment Report'}) Tj
0 -30 Td
/F1 11 Tf
${cleanContent.split('\n').slice(0, 50).map((line: string, i: number) => `0 -14 Td (${line.replace(/[()\\]/g, '\\$&').substring(0, 80)}) Tj`).join('\n')}
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${cleanContent.length + 500}
%%EOF`;

      const base64Pdf = btoa(pdfContent);
      
      return new Response(
        JSON.stringify({
          success: true,
          pdfDataUrl: `data:application/pdf;base64,${base64Pdf}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle generate PDF and store to bucket for chat integration
    if (action === "generate-qa-pdf") {
      const { conversationId, messages, reportNames, title } = body;
      console.log(`[report-qa] Generating QA PDF for conversation: ${conversationId}`);

      if (!conversationId || !messages || messages.length === 0) {
        throw new Error("Missing required parameters: conversationId and messages");
      }

      // Fetch active QA export template from database
      const { data: activeTemplate, error: templateError } = await supabase
        .from('report_structure_templates')
        .select('*')
        .eq('template_type', 'qa_export')
        .eq('is_active', true)
        .single();

      let templatePdfBytes: Uint8Array | null = null;
      
      if (activeTemplate && !templateError) {
        console.log(`[report-qa] Using active template: ${activeTemplate.name}`);
        
        // Download template PDF from storage
        const { data: templateData, error: downloadError } = await supabase.storage
          .from('report-templates')
          .download(activeTemplate.file_path);
          
        if (templateData && !downloadError) {
          templatePdfBytes = new Uint8Array(await templateData.arrayBuffer());
          console.log(`[report-qa] Template loaded: ${templatePdfBytes.length} bytes`);
        } else {
          console.warn(`[report-qa] Failed to download template: ${downloadError?.message}`);
        }
      } else {
        console.log('[report-qa] No active template found, using default styling');
      }

      // Create PDF document
      let pdfDoc: PDFDocument;
      let startContentPage = 0;
      
      // NPC default colors
      const primaryColor = rgb(0.07, 0.2, 0.38); // Dark blue
      const accentColor = rgb(0.89, 0.71, 0.31); // Gold
      const textColor = rgb(0.2, 0.2, 0.2);
      const lightGray = rgb(0.95, 0.95, 0.95);
      
      if (templatePdfBytes) {
        // Load template PDF and use first page as cover
        const templateDoc = await PDFDocument.load(templatePdfBytes);
        pdfDoc = await PDFDocument.create();
        
        // Copy first page from template as cover
        const [coverPage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(coverPage);
        startContentPage = 1;
        
        console.log('[report-qa] Cover page copied from template');
      } else {
        // Create new PDF with default cover
        pdfDoc = await PDFDocument.create();
        
        // Create default cover page
        const coverPage = pdfDoc.addPage([612, 792]);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // Background header
        coverPage.drawRectangle({
          x: 0,
          y: 692,
          width: 612,
          height: 100,
          color: primaryColor,
        });
        
        // Gold accent line
        coverPage.drawRectangle({
          x: 0,
          y: 688,
          width: 612,
          height: 4,
          color: accentColor,
        });
        
        // Title
        coverPage.drawText('Q&A Conversation Export', {
          x: 50,
          y: 725,
          size: 24,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
        
        // Report info
        coverPage.drawText(title || 'Investment Report Analysis', {
          x: 50,
          y: 620,
          size: 18,
          font: helveticaBold,
          color: primaryColor,
        });
        
        if (reportNames?.length) {
          coverPage.drawText(`Reports: ${reportNames.join(', ')}`, {
            x: 50,
            y: 590,
            size: 12,
            font: helvetica,
            color: textColor,
          });
        }
        
        coverPage.drawText(`Generated: ${new Date().toLocaleString('en-AU', { 
          dateStyle: 'full', 
          timeStyle: 'short' 
        })}`, {
          x: 50,
          y: 560,
          size: 11,
          font: helvetica,
          color: textColor,
        });
        
        // Footer
        coverPage.drawRectangle({
          x: 0,
          y: 0,
          width: 612,
          height: 60,
          color: lightGray,
        });
        
        coverPage.drawText('NPC Services', {
          x: 50,
          y: 35,
          size: 10,
          font: helveticaBold,
          color: primaryColor,
        });
        
        coverPage.drawText('admin@npcservices.com.au | 0433 005 110', {
          x: 50,
          y: 20,
          size: 9,
          font: helvetica,
          color: textColor,
        });
        
        startContentPage = 1;
      }

      // Embed fonts for content pages
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

      // Page dimensions and margins (matching template layout)
      const pageWidth = 612;
      const pageHeight = 792;
      const marginLeft = 50;
      const marginRight = 50;
      const marginTop = 60;
      const marginBottom = 80;
      const contentWidth = pageWidth - marginLeft - marginRight;
      
      // Helper function to wrap text
      const wrapText = (text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const width = font.widthOfTextAtSize(testLine, fontSize);
          
          if (width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        return lines;
      };

      // Helper function to create a content page with header/footer
      const createContentPage = (pageNum: number): PDFPage => {
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        
        // Header bar
        page.drawRectangle({
          x: 0,
          y: pageHeight - 45,
          width: pageWidth,
          height: 45,
          color: primaryColor,
        });
        
        // Gold accent
        page.drawRectangle({
          x: 0,
          y: pageHeight - 48,
          width: pageWidth,
          height: 3,
          color: accentColor,
        });
        
        // Header text
        page.drawText('Q&A Conversation Export', {
          x: marginLeft,
          y: pageHeight - 30,
          size: 12,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
        
        // Footer line
        page.drawLine({
          start: { x: marginLeft, y: marginBottom - 10 },
          end: { x: pageWidth - marginRight, y: marginBottom - 10 },
          thickness: 1,
          color: lightGray,
        });
        
        // Page number
        page.drawText(`Page ${pageNum}`, {
          x: pageWidth - marginRight - 40,
          y: 30,
          size: 9,
          font: helvetica,
          color: textColor,
        });
        
        // Footer text
        page.drawText('NPC Services | admin@npcservices.com.au', {
          x: marginLeft,
          y: 30,
          size: 8,
          font: helvetica,
          color: textColor,
        });
        
        return page;
      };

      // Parse markdown-style formatting
      const parseFormatting = (text: string): Array<{text: string; bold: boolean; italic: boolean}> => {
        const segments: Array<{text: string; bold: boolean; italic: boolean}> = [];
        
        // Simple parsing for **bold** and *italic*
        let remaining = text;
        
        while (remaining.length > 0) {
          // Check for bold (**text**)
          const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
          if (boldMatch) {
            segments.push({ text: boldMatch[1], bold: true, italic: false });
            remaining = remaining.slice(boldMatch[0].length);
            continue;
          }
          
          // Check for italic (*text*)
          const italicMatch = remaining.match(/^\*(.+?)\*/);
          if (italicMatch) {
            segments.push({ text: italicMatch[1], bold: false, italic: true });
            remaining = remaining.slice(italicMatch[0].length);
            continue;
          }
          
          // Find next formatting marker
          const nextBold = remaining.indexOf('**');
          const nextItalic = remaining.indexOf('*');
          const nextMarker = Math.min(
            nextBold === -1 ? Infinity : nextBold,
            nextItalic === -1 ? Infinity : nextItalic
          );
          
          if (nextMarker === Infinity) {
            segments.push({ text: remaining, bold: false, italic: false });
            break;
          } else if (nextMarker > 0) {
            segments.push({ text: remaining.slice(0, nextMarker), bold: false, italic: false });
            remaining = remaining.slice(nextMarker);
          } else {
            // Edge case: marker at start but no closing marker
            segments.push({ text: remaining.charAt(0), bold: false, italic: false });
            remaining = remaining.slice(1);
          }
        }
        
        return segments;
      };

      // Process messages and create content pages
      let currentPage = createContentPage(1);
      let pageCount = 1;
      let yPosition = pageHeight - marginTop - 50;
      const lineHeight = 14;
      const paragraphSpacing = 20;

      for (const msg of messages as Array<{ role: string; content: string; timestamp?: string }>) {
        const isUser = msg.role === 'user';
        const roleLabel = isUser ? 'You' : 'Assistant';
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-AU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }) : '';
        
        // Check if we need a new page for the header
        if (yPosition < marginBottom + 100) {
          pageCount++;
          currentPage = createContentPage(pageCount);
          yPosition = pageHeight - marginTop - 50;
        }
        
        // Draw role header with colored background
        const headerBgColor = isUser ? rgb(0.93, 0.95, 0.98) : rgb(0.95, 0.98, 0.95);
        currentPage.drawRectangle({
          x: marginLeft - 5,
          y: yPosition - 5,
          width: contentWidth + 10,
          height: 22,
          color: headerBgColor,
        });
        
        // Role label
        currentPage.drawText(roleLabel, {
          x: marginLeft,
          y: yPosition,
          size: 11,
          font: helveticaBold,
          color: isUser ? rgb(0.2, 0.4, 0.6) : rgb(0.2, 0.5, 0.3),
        });
        
        // Timestamp
        if (timestamp) {
          const labelWidth = helveticaBold.widthOfTextAtSize(roleLabel, 11);
          currentPage.drawText(`  ${timestamp}`, {
            x: marginLeft + labelWidth + 5,
            y: yPosition,
            size: 9,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
        
        yPosition -= lineHeight + 10;
        
        // Process message content by lines
        const contentLines = msg.content.split('\n');
        
        for (const line of contentLines) {
          // Skip empty lines but add spacing
          if (!line.trim()) {
            yPosition -= lineHeight / 2;
            continue;
          }
          
          // Check for headers (## or ###)
          let font = helvetica;
          let fontSize = 10;
          let lineColor = textColor;
          let indent = 0;
          let processedLine = line;
          
          if (line.startsWith('### ')) {
            font = helveticaBold;
            fontSize = 11;
            processedLine = line.slice(4);
            lineColor = primaryColor;
          } else if (line.startsWith('## ')) {
            font = helveticaBold;
            fontSize = 12;
            processedLine = line.slice(3);
            lineColor = primaryColor;
          } else if (line.startsWith('# ')) {
            font = helveticaBold;
            fontSize = 14;
            processedLine = line.slice(2);
            lineColor = primaryColor;
          } else if (line.startsWith('- ') || line.startsWith('• ')) {
            // Bullet point
            processedLine = line.slice(2);
            indent = 15;
            
            // Check if we need new page
            if (yPosition < marginBottom + lineHeight) {
              pageCount++;
              currentPage = createContentPage(pageCount);
              yPosition = pageHeight - marginTop - 50;
            }
            
            // Draw bullet
            currentPage.drawText('•', {
              x: marginLeft,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: accentColor,
            });
          } else if (line.match(/^\d+\. /)) {
            // Numbered list
            const match = line.match(/^(\d+)\. (.*)$/);
            if (match) {
              indent = 20;
              
              // Check if we need new page
              if (yPosition < marginBottom + lineHeight) {
                pageCount++;
                currentPage = createContentPage(pageCount);
                yPosition = pageHeight - marginTop - 50;
              }
              
              // Draw number
              currentPage.drawText(`${match[1]}.`, {
                x: marginLeft,
                y: yPosition,
                size: 10,
                font: helveticaBold,
                color: accentColor,
              });
              
              processedLine = match[2];
            }
          }
          
          // Wrap and draw text
          const wrappedLines = wrapText(processedLine, font, fontSize, contentWidth - indent);
          
          for (const wrappedLine of wrappedLines) {
            // Check if we need a new page
            if (yPosition < marginBottom + lineHeight) {
              pageCount++;
              currentPage = createContentPage(pageCount);
              yPosition = pageHeight - marginTop - 50;
            }
            
            // Parse and draw formatted text
            const segments = parseFormatting(wrappedLine);
            let xPos = marginLeft + indent;
            
            for (const segment of segments) {
              const segmentFont = segment.bold ? helveticaBold : 
                                  segment.italic ? helveticaOblique : font;
              
              currentPage.drawText(segment.text, {
                x: xPos,
                y: yPosition,
                size: fontSize,
                font: segmentFont,
                color: lineColor,
              });
              
              xPos += segmentFont.widthOfTextAtSize(segment.text, fontSize);
            }
            
            yPosition -= lineHeight;
          }
        }
        
        // Add spacing between messages
        yPosition -= paragraphSpacing;
      }

      // Add final page with disclaimer
      if (yPosition > marginBottom + 100) {
        // Add disclaimer on current page
        yPosition -= 30;
        currentPage.drawLine({
          start: { x: marginLeft, y: yPosition },
          end: { x: pageWidth - marginRight, y: yPosition },
          thickness: 1,
          color: lightGray,
        });
        
        yPosition -= 20;
        
        currentPage.drawText('Disclaimer', {
          x: marginLeft,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: textColor,
        });
        
        yPosition -= 15;
        
        const disclaimer = 'This document is generated from an AI-powered conversation and is intended for informational purposes only. The analysis provided should not be considered as financial advice. Please consult with qualified professionals before making any investment decisions.';
        const disclaimerLines = wrapText(disclaimer, helvetica, 8, contentWidth);
        
        for (const line of disclaimerLines) {
          currentPage.drawText(line, {
            x: marginLeft,
            y: yPosition,
            size: 8,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
          yPosition -= 10;
        }
      }

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      const fileName = `qa-export-${conversationId}-${Date.now()}.pdf`;
      
      console.log(`[report-qa] PDF generated: ${pdfBytes.length} bytes, ${pageCount + 1} pages`);
      
      // Upload to qa_exports bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('qa_exports')
        .upload(fileName, pdfBytes, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('[report-qa] Upload error:', uploadError);
        throw new Error(`Failed to upload PDF: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('qa_exports')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      console.log(`[report-qa] PDF uploaded: ${publicUrl}`);

      // Create attachment object
      const attachment = {
        url: publicUrl,
        fileName: fileName,
        fileSize: pdfBytes.length,
        createdAt: new Date().toISOString(),
        conversationId: conversationId,
      };

      // Store the message with attachment in the conversation
      const { data: msgData, error: msgError } = await supabase
        .from('report_qa_messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: `📄 I've generated a PDF summary of our conversation using ${activeTemplate ? `the "${activeTemplate.name}" template` : 'default styling'}. You can download it or send it via email using the options below.`,
          attachments: [attachment],
        })
        .select()
        .single();

      if (msgError) {
        console.error('[report-qa] Message insert error:', msgError);
        // Don't fail - PDF was still generated
      }

      return new Response(
        JSON.stringify({
          success: true,
          attachment,
          messageId: msgData?.id || null,
          templateUsed: activeTemplate?.name || 'Default',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle knowledge base stats
    if (action === "get-knowledge-stats") {
      const { conversationId } = body;
      
      let query = supabase
        .from('document_chunks')
        .select('document_name, chunk_index', { count: 'exact' });
      
      if (conversationId) {
        query = query.eq('conversation_id', conversationId);
      }
      
      const { data, count, error } = await query;
      
      if (error) throw error;
      
      // Group by document
      const documents = data?.reduce((acc: any, chunk: any) => {
        if (!acc[chunk.document_name]) {
          acc[chunk.document_name] = 0;
        }
        acc[chunk.document_name]++;
        return acc;
      }, {}) || {};
      
      return new Response(
        JSON.stringify({
          success: true,
          totalChunks: count || 0,
          documents: Object.entries(documents).map(([name, chunks]) => ({ name, chunks })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[report-qa] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OPTIMIZED: Increased chunk size to reduce total chunks
const CHUNK_SIZE = 3000; // Characters per chunk
const CHUNK_OVERLAP = 300; // Overlap between chunks

// Parallel processing configuration
const EMBEDDING_BATCH_SIZE = 20; // Process 20 embeddings at once

interface TemplateParseRequest {
  templateId: string;
  filePath: string;
  templateType: 'ai_structure' | 'pdf_layout' | 'client_branding';
  reportTier?: 'compass' | 'executive' | 'snapshot';
  reportCategory?: 'investment' | 'comparison' | 'suburb_snapshot';
  useAIExtraction?: boolean; // Flag to use AI-powered extraction
}

// Company names, branding, and irrelevant content to filter out
const CONTENT_FILTERS = [
  // Company names - add more as needed
  /NPC\s*(Services?|Property|Consulting|Group)?/gi,
  /National\s*Property\s*Collective/gi,
  /npcservices\.com\.au/gi,
  
  // Generic company patterns
  /\b(ABN|ACN)\s*:?\s*\d[\d\s]+\d/gi,
  /©\s*\d{4}\s*[A-Za-z\s]+/g, // Copyright notices
  /All\s+rights?\s+reserved\.?/gi,
  
  // Contact details that should not affect embeddings
  /\b\d{2}\s*\d{4}\s*\d{4}\b/g, // Phone numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  /www\.[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/gi, // Website URLs
  
  // Page numbers and headers/footers
  /Page\s+\d+\s*(of\s*\d+)?/gi,
  /^\s*\d+\s*$/gm, // Standalone page numbers
  
  // Watermarks and confidentiality notices
  /CONFIDENTIAL/gi,
  /DRAFT/gi,
  /For\s+internal\s+use\s+only/gi,
  
  // Prepared by/for lines
  /Prepared\s+(by|for)\s*:?\s*[A-Za-z\s]+/gi,
  /Author\s*:?\s*[A-Za-z\s]+/gi,
  
  // Date formats that are template-specific
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
];

// Words/phrases to replace with generic placeholders
const CONTENT_REPLACEMENTS: [RegExp, string][] = [
  // Replace specific company references with generic terms
  [/NPC(\s+Services?)?/gi, '[Company]'],
  [/National\s*Property\s*Collective/gi, '[Company]'],
  
  // Normalize property address placeholders
  [/\{\{property_address\}\}/gi, '[PROPERTY_ADDRESS]'],
  [/\{\{suburb\}\}/gi, '[SUBURB]'],
  [/\{\{postcode\}\}/gi, '[POSTCODE]'],
  [/\{\{state\}\}/gi, '[STATE]'],
];

// Sanitize extracted text to remove company-specific content before embedding
function sanitizeForEmbedding(text: string): string {
  let sanitized = text;
  
  // Apply replacements first (preserve structure with placeholders)
  for (const [pattern, replacement] of CONTENT_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // Apply filters to remove irrelevant content
  for (const filter of CONTENT_FILTERS) {
    sanitized = sanitized.replace(filter, '');
  }
  
  // Clean up excessive whitespace
  sanitized = sanitized
    .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
    .replace(/[ \t]{2,}/g, ' ')   // Max 1 space
    .trim();
  
  return sanitized;
}

// Split text into overlapping chunks for better RAG retrieval
function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  // Sanitize the text before chunking
  const sanitizedText = sanitizeForEmbedding(text);
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < sanitizedText.length) {
    const end = Math.min(start + chunkSize, sanitizedText.length);
    chunks.push(sanitizedText.slice(start, end));
    start = end - overlap;
    
    if (start >= sanitizedText.length - overlap) break;
  }
  
  return chunks;
}

// OPTIMIZED: Generate embeddings for multiple texts in a single API call
async function generateEmbeddingsBatch(texts: string[], openAIKey: string): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding error: ${error}`);
  }

  const data = await response.json();
  return data.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((item: any) => item.embedding);
}

// Convert PDF to base64 for AI processing
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// NEW: Use Lovable AI with vision to extract text from PDF as Markdown
async function extractTextFromPDFWithAI(pdfBuffer: ArrayBuffer, lovableApiKey: string): Promise<string> {
  console.log('🤖 Using AI vision to extract PDF content as Markdown...');
  
  const base64PDF = arrayBufferToBase64(pdfBuffer);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a document structure extractor. Your job is to extract ALL text content from the provided document and convert it into well-structured Markdown format.

CRITICAL REQUIREMENTS:
1. Extract EVERY section heading, subheading, and paragraph
2. Preserve the exact hierarchical structure using # for headings
3. Keep all bullet points, numbered lists, and tables
4. Include ALL data sources, citations, and attribution requirements mentioned
5. Preserve any formatting instructions or guidelines
6. Extract any template placeholders (like {{property_address}})
7. DO NOT summarize - include the FULL content
8. If content spans multiple pages, extract everything

OUTPUT FORMAT:
- Use proper Markdown syntax
- # for main sections, ## for subsections, ### for sub-subsections
- Use bullet points (-) for lists
- Use tables where appropriate
- Preserve any special formatting notes`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the COMPLETE text content from this PDF document and convert it to well-structured Markdown. Include every section, heading, bullet point, and instruction. This is a report template - preserve all structure and formatting guidelines.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64PDF}`
              }
            }
          ]
        }
      ],
      max_tokens: 32000, // Large output for full document extraction
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI extraction error:', errorText);
    
    // Check for rate limits
    if (response.status === 429) {
      throw new Error('AI rate limit exceeded. Please try again in a few minutes.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add credits to continue.');
    }
    
    throw new Error(`AI extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const extractedText = data.choices?.[0]?.message?.content || '';
  
  if (!extractedText || extractedText.length < 100) {
    throw new Error('AI extraction returned insufficient content. The PDF may be image-only or corrupted.');
  }
  
  console.log(`✓ AI extracted ${extractedText.length} characters of Markdown`);
  return extractedText;
}

// Fallback: Basic text extraction for non-PDF files
async function extractTextBasic(content: string, fileName: string): Promise<string> {
  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return content;
  } else if (fileName.endsWith('.json')) {
    return JSON.stringify(JSON.parse(content), null, 2);
  } else if (fileName.endsWith('.html')) {
    // Remove HTML tags but preserve structure
    return content
      .replace(/<h1[^>]*>/gi, '# ')
      .replace(/<h2[^>]*>/gi, '## ')
      .replace(/<h3[^>]*>/gi, '### ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return content;
}

// Process chunks in parallel batches with embeddings
async function processChunksInBatches(
  chunks: string[],
  templateId: string,
  templateType: string,
  reportTier: string | undefined,
  reportCategory: string | undefined,
  openAIKey: string,
  supabase: any
): Promise<any[]> {
  const storedChunks: any[] = [];
  const totalBatches = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
  
  console.log(`📦 Processing ${chunks.length} chunks in ${totalBatches} batches of ${EMBEDDING_BATCH_SIZE}`);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * EMBEDDING_BATCH_SIZE;
    const endIdx = Math.min(startIdx + EMBEDDING_BATCH_SIZE, chunks.length);
    const batchChunks = chunks.slice(startIdx, endIdx);
    
    console.log(`🧠 Batch ${batchIndex + 1}/${totalBatches}: Generating embeddings for chunks ${startIdx + 1}-${endIdx}`);
    
    try {
      const embeddings = await generateEmbeddingsBatch(batchChunks, openAIKey);
      
      const insertRecords = batchChunks.map((chunk, i) => ({
        document_name: `template:${templateId}`,
        chunk_index: startIdx + i,
        chunk_text: chunk,
        embedding: `[${embeddings[i].join(',')}]`,
        metadata: {
          template_type: templateType,
          report_tier: reportTier,
          report_category: reportCategory,
          total_chunks: chunks.length,
        },
      }));
      
      const { data: insertedChunks, error: insertError } = await supabase
        .from('document_chunks')
        .insert(insertRecords)
        .select();
      
      if (insertError) {
        console.error(`❌ Failed to store batch ${batchIndex + 1}:`, insertError);
      } else {
        storedChunks.push(...(insertedChunks || []));
        console.log(`✓ Batch ${batchIndex + 1} complete: ${insertedChunks?.length || 0} chunks stored`);
      }
    } catch (batchError) {
      console.error(`❌ Embedding batch ${batchIndex + 1} error:`, batchError);
    }
  }
  
  return storedChunks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIKey = Deno.env.get('OPENAI_API_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { 
      templateId, 
      filePath, 
      templateType, 
      reportTier, 
      reportCategory,
      useAIExtraction = true // Default to AI extraction for better results
    }: TemplateParseRequest = await req.json();
    
    console.log(`📄 Parsing template: ${templateId}, file: ${filePath}, AI extraction: ${useAIExtraction}`);
    
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('report-templates')
      .download(filePath);
    
    if (downloadError) {
      throw new Error(`Failed to download template: ${downloadError.message}`);
    }
    
    let extractedText = '';
    const fileName = filePath.toLowerCase();
    
    if (fileName.endsWith('.pdf')) {
      if (useAIExtraction && lovableApiKey) {
        // Use AI vision to extract PDF content as structured Markdown
        const buffer = await fileData.arrayBuffer();
        extractedText = await extractTextFromPDFWithAI(buffer, lovableApiKey);
      } else {
        throw new Error('PDF extraction requires AI. Please enable AI extraction or upload a text-based file (.md, .txt).');
      }
    } else {
      // For non-PDF files, use basic extraction
      const textContent = await fileData.text();
      extractedText = await extractTextBasic(textContent, fileName);
    }
    
    if (!extractedText || extractedText.length < 50) {
      throw new Error('Insufficient text extracted from template. Please ensure the file contains readable content.');
    }
    
    console.log(`📝 Extracted ${extractedText.length} characters`);
    console.log(`📄 Preview: ${extractedText.substring(0, 300)}...`);
    
    // Update template with parsed Markdown content
    const { error: updateError } = await supabase
      .from('report_structure_templates')
      .update({
        parsed_content: extractedText,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId);
    
    if (updateError) {
      console.error('Failed to update template:', updateError);
    }
    
    // Chunk the text for RAG (chunking now includes sanitization)
    const chunks = chunkText(extractedText);
    console.log(`🔪 Split into ${chunks.length} sanitized chunks for embedding (chunk size: ${CHUNK_SIZE})`);
    console.log(`🧹 Content sanitized: company names, contact details, and irrelevant content filtered`);
    
    // Delete existing chunks for this template
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_name', `template:${templateId}`);
    
    if (deleteError) {
      console.error('Failed to delete existing chunks:', deleteError);
    }
    
    // Process all chunks in parallel batches
    const storedChunks = await processChunksInBatches(
      chunks,
      templateId,
      templateType,
      reportTier,
      reportCategory,
      openAIKey,
      supabase
    );
    
    console.log(`✅ Successfully stored ${storedChunks.length} chunks with embeddings`);
    
    return new Response(
      JSON.stringify({
        success: true,
        templateId,
        extractedLength: extractedText.length,
        chunksCreated: storedChunks.length,
        preview: extractedText.substring(0, 1000) + (extractedText.length > 1000 ? '...' : ''),
        isMarkdown: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error) {
    console.error('❌ Template parsing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

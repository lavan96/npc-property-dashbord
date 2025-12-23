import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OPTIMIZED: Increased chunk size to reduce total chunks (was 1500)
const CHUNK_SIZE = 3000; // Characters per chunk - larger chunks = fewer API calls
const CHUNK_OVERLAP = 300; // Overlap between chunks for context continuity

// Parallel processing configuration
const EMBEDDING_BATCH_SIZE = 20; // Process 20 embeddings at once (OpenAI supports up to 2048 inputs)

interface TemplateParseRequest {
  templateId: string;
  filePath: string;
  templateType: 'ai_structure' | 'pdf_layout' | 'client_branding';
  reportTier?: 'compass' | 'executive' | 'snapshot';
  reportCategory?: 'investment' | 'comparison' | 'suburb_snapshot';
}

// Split text into overlapping chunks for better RAG retrieval
function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    
    if (start >= text.length - overlap) break;
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
      input: texts, // OpenAI API accepts array of strings for batch processing
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding error: ${error}`);
  }

  const data = await response.json();
  // Return embeddings in the same order as input texts
  return data.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((item: any) => item.embedding);
}

// Extract text from PDF using pdf-parse approach
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(pdfBuffer);
  let text = '';
  
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const rawText = decoder.decode(uint8Array);
  
  // Extract text between BT (begin text) and ET (end text) markers
  const textMatches = rawText.match(/\(([^)]+)\)/g);
  if (textMatches) {
    text = textMatches
      .map(match => match.slice(1, -1))
      .filter(t => t.length > 2 && /[a-zA-Z]/.test(t))
      .join(' ');
  }
  
  // Also extract text from streams
  const streamMatches = rawText.match(/stream\s*([\s\S]*?)\s*endstream/g);
  if (streamMatches) {
    for (const stream of streamMatches) {
      const cleanStream = stream.replace(/stream|endstream/g, '').trim();
      const printable = cleanStream.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (printable.length > 10 && /[a-zA-Z]{3,}/.test(printable)) {
        text += ' ' + printable;
      }
    }
  }
  
  text = text
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();
  
  return text || 'Unable to extract text from PDF. Please provide a text-based template.';
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
      // Generate all embeddings for this batch in a single API call
      const embeddings = await generateEmbeddingsBatch(batchChunks, openAIKey);
      
      // Prepare all insert records for this batch
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
      
      // Insert all chunks from this batch at once
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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { templateId, filePath, templateType, reportTier, reportCategory }: TemplateParseRequest = await req.json();
    
    console.log(`📄 Parsing template: ${templateId}, file: ${filePath}`);
    
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
      const buffer = await fileData.arrayBuffer();
      extractedText = await extractTextFromPDF(buffer);
      console.log(`📝 Extracted ${extractedText.length} characters from PDF`);
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      extractedText = await fileData.text();
    } else if (fileName.endsWith('.json')) {
      const jsonContent = await fileData.text();
      extractedText = JSON.stringify(JSON.parse(jsonContent), null, 2);
    } else if (fileName.endsWith('.html')) {
      const htmlContent = await fileData.text();
      extractedText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      throw new Error(`Unsupported file type: ${fileName}`);
    }
    
    if (!extractedText || extractedText.length < 50) {
      throw new Error('Insufficient text extracted from template. Please ensure the file contains readable text.');
    }
    
    // Update template with parsed content
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
    
    // Chunk the text for RAG (with larger chunks now)
    const chunks = chunkText(extractedText);
    console.log(`🔪 Split into ${chunks.length} chunks for embedding (chunk size: ${CHUNK_SIZE})`);
    
    // Delete existing chunks for this template
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_name', `template:${templateId}`);
    
    if (deleteError) {
      console.error('Failed to delete existing chunks:', deleteError);
    }
    
    // OPTIMIZED: Process all chunks in parallel batches
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
        preview: extractedText.substring(0, 500) + '...',
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

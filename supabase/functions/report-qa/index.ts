import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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

      // Process audio in chunks
      const binaryAudio = processBase64Chunks(audio);
      
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

      return new Response(
        JSON.stringify({ success: true, text: result.text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle PDF text extraction with RAG storage (Step 5)
    if (action === "extract") {
      const { fileData, fileName, conversationId, enableRAG = true } = body;
      console.log(`[report-qa] Extracting text from: ${fileName}, RAG enabled: ${enableRAG}`);
      
      const base64Data = fileData.replace(/^data:application\/pdf;base64,/, "");
      
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5",
          messages: [
            {
              role: "system",
              content: `You are a document text extraction assistant. Extract ALL text content from the provided PDF document. 
Preserve the structure, headings, tables (as formatted text), and key data points.
Do not summarize - extract the complete text content for later querying.
If you cannot read the document, describe what you can see.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Please extract all text content from this investment report PDF named "${fileName}". Preserve all financial figures, property details, and analysis sections.`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${base64Data}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[report-qa] AI extraction error: ${response.status} - ${errorText}`);
        
        if (response.status === 400 || response.status === 422) {
          return new Response(
            JSON.stringify({
              success: true,
              extractedText: `[Document: ${fileName}]\n\nThis PDF document has been uploaded. Due to technical limitations, the raw text could not be automatically extracted. However, you can still ask questions about the document, and the AI will attempt to provide relevant responses based on typical investment report structures.\n\nPlease ask specific questions about:\n- Property details\n- Financial calculations\n- Investment metrics\n- Location analysis\n- Risk assessment`,
              ragEnabled: false,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const extractedText = aiResponse.choices?.[0]?.message?.content || "";

      console.log(`[report-qa] Extracted ${extractedText.length} characters`);

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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle chat Q&A with RAG retrieval (Step 6)
    if (action === "chat") {
      const { reportContents, reportNames, question, chatHistory, conversationId, useRAG = true } = body;
      console.log(`[report-qa] Processing chat question: ${question?.substring(0, 50)}...`);
      console.log(`[report-qa] Reports count: ${reportContents?.length || 0}, RAG: ${useRAG}`);

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

      const messages = [
        { role: "system", content: systemPrompt },
        ...(chatHistory || []),
        { role: "user", content: question },
      ];

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[report-qa] Chat error: ${response.status} - ${errorText}`);
        
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
      console.log(`[report-qa] AI Response structure:`, JSON.stringify(aiResponse, null, 2));
      
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

      // Save messages to database if conversationId provided
      if (conversationId) {
        await supabase.from("report_qa_messages").insert([
          { conversation_id: conversationId, role: "user", content: question },
          { conversation_id: conversationId, role: "assistant", content: responseText },
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

      console.log(`[report-qa] Generated response: ${responseText.length} characters`);

      return new Response(
        JSON.stringify({ 
          response: responseText,
          ragUsed: ragContext.length > 0,
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

    // Handle fetching conversation history
    if (action === "get-conversations") {
      const { data, error } = await supabase
        .from("report_qa_conversations")
        .select(`
          *,
          messages:report_qa_messages(*)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

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
        from: "NPC Services <onboarding@resend.dev>",
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

    // Handle PDF export
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, fileData, fileName, reportContent, question, chatHistory, content, reportName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[report-qa] Action: ${action}`);

    // Handle PDF text extraction
    if (action === "extract") {
      console.log(`[report-qa] Extracting text from: ${fileName}`);
      
      // Remove data URL prefix if present
      const base64Data = fileData.replace(/^data:application\/pdf;base64,/, "");
      
      // Use AI to extract and summarize the PDF content
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        
        // Fallback: return a placeholder for the content
        // The AI might not be able to process PDFs directly, so we'll handle this gracefully
        if (response.status === 400 || response.status === 422) {
          return new Response(
            JSON.stringify({
              success: true,
              extractedText: `[Document: ${fileName}]\n\nThis PDF document has been uploaded. Due to technical limitations, the raw text could not be automatically extracted. However, you can still ask questions about the document, and the AI will attempt to provide relevant responses based on typical investment report structures.\n\nPlease ask specific questions about:\n- Property details\n- Financial calculations\n- Investment metrics\n- Location analysis\n- Risk assessment`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const extractedText = aiResponse.choices?.[0]?.message?.content || "";

      console.log(`[report-qa] Extracted ${extractedText.length} characters`);

      return new Response(
        JSON.stringify({
          success: true,
          extractedText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle chat Q&A
    if (action === "chat") {
      console.log(`[report-qa] Processing chat question: ${question?.substring(0, 50)}...`);

      const systemPrompt = `You are an expert investment property analyst assistant. You have been provided with the content of an investment report. Your role is to:

1. Answer questions accurately based on the report content
2. Provide concise, clear summaries when asked
3. Highlight key financial metrics and investment insights
4. Format responses professionally for potential email use
5. If information is not in the report, clearly state that

When providing TLDRs or summaries:
- Keep them concise (3-5 key points)
- Focus on investment-relevant information
- Include key financial figures when available
- Highlight any notable risks or opportunities

Report Content:
${reportContent}`;

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
      const responseText = aiResponse.choices?.[0]?.message?.content || "I couldn't generate a response.";

      console.log(`[report-qa] Generated response: ${responseText.length} characters`);

      return new Response(
        JSON.stringify({ response: responseText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle PDF export
    if (action === "export-pdf") {
      console.log(`[report-qa] Generating PDF for: ${reportName}`);

      // Generate a simple PDF with the content
      // Using a basic PDF structure
      const cleanContent = content.replace(/[^\x00-\x7F]/g, ""); // Remove non-ASCII chars
      const timestamp = new Date().toLocaleString();
      
      // Create PDF content manually (simple approach)
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
${cleanContent.split('\n').slice(0, 50).map((line, i) => `0 -14 Td (${line.replace(/[()\\]/g, '\\$&').substring(0, 80)}) Tj`).join('\n')}
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

      // For now, return a data URL that can be downloaded
      // In production, you'd want to use a proper PDF library
      const base64Pdf = btoa(pdfContent);
      
      return new Response(
        JSON.stringify({
          success: true,
          pdfDataUrl: `data:application/pdf;base64,${base64Pdf}`,
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

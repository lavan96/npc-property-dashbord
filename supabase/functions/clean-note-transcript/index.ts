import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { transcript, noteType } = await req.json();
    
    if (!transcript) {
      throw new Error('No transcript provided');
    }

    console.log('[Clean Note Transcript] Processing transcript for note type:', noteType);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const systemPrompt = `You are a professional note-taking assistant. Your job is to clean up voice transcripts into polished, professional client notes.

Rules:
1. Fix grammar, punctuation, and sentence structure
2. Remove filler words (um, uh, like, you know, etc.)
3. Organize the content into clear, coherent sentences
4. Keep the original meaning and intent intact
5. Format as a professional note suitable for a CRM system
6. Keep it concise but comprehensive
7. If the transcript mentions specific dates, times, amounts, or names, preserve them exactly
8. Do not add information that wasn't in the original transcript
9. Return only the cleaned note text, no additional commentary

Note type context: ${noteType || 'general'}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please clean up this voice transcript into a professional note:\n\n"${transcript}"` }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Clean Note Transcript] OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const cleanedNote = result.choices?.[0]?.message?.content?.trim() || transcript;
    
    console.log('[Clean Note Transcript] Successfully cleaned transcript');

    return new Response(
      JSON.stringify({ cleanedNote }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Clean Note Transcript] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

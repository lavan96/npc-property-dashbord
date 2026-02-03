import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json();
    
    if (!audio) {
      console.error('[Voice to Text] No audio data provided');
      throw new Error('No audio data provided');
    }

    console.log('[Voice to Text] Processing audio, length:', audio.length);

    // Decode base64 to binary using standard atob
    let binaryAudio: Uint8Array;
    try {
      const binaryString = atob(audio);
      binaryAudio = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        binaryAudio[i] = binaryString.charCodeAt(i);
      }
      console.log('[Voice to Text] Decoded audio size:', binaryAudio.length, 'bytes');
    } catch (decodeError) {
      console.error('[Voice to Text] Base64 decode error:', decodeError);
      throw new Error('Invalid audio data format');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('[Voice to Text] OPENAI_API_KEY not configured');
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Prepare form data
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');

    console.log('[Voice to Text] Sending to OpenAI Whisper API...');

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
      console.error('[Voice to Text] OpenAI error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[Voice to Text] Transcription complete, text length:', result.text?.length || 0);

    return new Response(
      JSON.stringify({ text: result.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Voice to Text] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

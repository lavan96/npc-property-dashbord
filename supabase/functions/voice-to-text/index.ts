import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

/**
 * Decode base64 to Uint8Array - simple and reliable approach
 * Uses atob for the full string (works fine for audio files up to ~50MB)
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio, mimeType, fileName } = await req.json();
    
    if (!audio) {
      console.error('[Voice to Text] No audio data provided');
      throw new Error('No audio data provided');
    }

    console.log('[Voice to Text] Processing audio, base64 length:', audio.length);

    // Strip data URL prefix if present (e.g., "data:audio/webm;base64,...")
    let base64Data = audio;
    if (audio.includes(',')) {
      base64Data = audio.split(',')[1];
      console.log('[Voice to Text] Stripped data URL prefix, new length:', base64Data.length);
    }

    // Decode base64 to binary using simple atob approach
    let binaryAudio: Uint8Array;
    try {
      binaryAudio = decodeBase64ToUint8Array(base64Data);
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
    const contentType = (typeof mimeType === 'string' && mimeType.trim()) ? mimeType.trim() : 'audio/webm';
    const resolvedFileName = (typeof fileName === 'string' && fileName.trim())
      ? fileName.trim()
      : (contentType.includes('mp4') ? 'audio.mp4' : (contentType.includes('ogg') ? 'audio.ogg' : 'audio.webm'));

    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: contentType });
    formData.append('file', blob, resolvedFileName);
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

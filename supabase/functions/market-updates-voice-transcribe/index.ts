// Market Updates Q&A voice-to-text.
// Thin authenticated wrapper around Lovable AI Gateway's transcription endpoint.
// Accepts { audio_base64, mime_type } and returns { transcript }.
// No persistence — the transcript is inserted client-side into the Q&A composer.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: 'missing_lovable_api_key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const audioBase64: string | undefined = body?.audio_base64;
    const mimeType: string = body?.mime_type || 'audio/webm';

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'missing_audio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = base64ToBytes(audioBase64);
    if (bytes.length < 512) {
      return new Response(JSON.stringify({ error: 'audio_too_short' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ext = MIME_TO_EXT[mimeType.split(';')[0]] ?? 'webm';
    // Fallback chain — try modern transcribe model first, then whisper-1.
    const MODELS = ['openai/gpt-4o-mini-transcribe', 'openai/whisper-1'];
    let transcript = '';
    let lastStatus = 0;
    let lastDetails = '';
    let lastModel = '';
    for (const model of MODELS) {
      const form = new FormData();
      form.append('model', model);
      form.append('file', new Blob([bytes], { type: mimeType }), `recording.${ext}`);
      const upstream = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lovableKey}` },
        body: form,
      });
      lastStatus = upstream.status;
      lastModel = model;
      if (upstream.ok) {
        const data = await upstream.json().catch(() => ({}));
        transcript = String(data?.text ?? '').trim();
        break;
      }
      lastDetails = await upstream.text().catch(() => '');
      // Only fall back on 400/404/422 (bad model/audio); stop on auth/rate/credit issues.
      if (![400, 404, 422].includes(upstream.status)) break;
    }

    if (!transcript && lastStatus && lastStatus >= 400) {
      return new Response(JSON.stringify({
        error: 'transcription_failed',
        status: lastStatus,
        model: lastModel,
        details: lastDetails,
      }), {
        status: lastStatus,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ transcript, model: lastModel }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', details: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

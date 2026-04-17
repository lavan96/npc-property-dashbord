// Returns the status of native LLM API keys and the catalog of available models
// across both Native Integrations (direct provider keys) and Gateway APIs (Lovable AI Gateway).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nativeKeys = {
      openai: !!Deno.env.get('OPENAI_API_KEY'),
      anthropic: !!Deno.env.get('ANTHROPIC_API_KEY'),
      gemini: !!(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')),
      perplexity: !!Deno.env.get('PERPLEXITY_API_KEY'),
    };

    const gatewayKey = !!Deno.env.get('LOVABLE_API_KEY');

    return new Response(
      JSON.stringify({
        success: true,
        nativeKeys,
        gatewayKey,
        checkedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

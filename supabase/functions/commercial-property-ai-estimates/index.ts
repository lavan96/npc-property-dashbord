/**
 * commercial-property-ai-estimates
 * ---------------------------------------------------------------------------
 * Generates AI estimates for missing Commercial / Industrial calculator
 * assumptions using Lovable AI (gemini-2.5-flash).
 *
 *   Input  { domain, propertyId, address, state, assetSubtype,
 *            knownFields: Record<string, any>,
 *            missingFields: Array<{ key: string; label: string }> }
 *
 *   Output { success, estimates: Array<{
 *              key, value, confidence: 'low'|'medium'|'high', rationale
 *            }> }
 *
 * All estimates must be tagged 'AI Estimate' / unverified by the caller.
 */
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MissingField { key: string; label: string }
interface RequestBody {
  domain: 'commercial' | 'industrial';
  propertyId?: string;
  address?: string | null;
  state?: string | null;
  assetSubtype?: string | null;
  knownFields?: Record<string, unknown>;
  missingFields: MissingField[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated) return createUnauthorizedResponse(auth.error);

    const body = (await req.json()) as RequestBody;
    if (!body?.missingFields?.length) {
      return json({ success: true, estimates: [] });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return json({ success: false, error: 'LOVABLE_API_KEY not configured' }, 500);
    }

    const systemPrompt = `You are a senior Australian commercial & industrial property analyst.
You produce best-effort numeric/categorical ESTIMATES for missing property assumptions, based only on:
  - the property address, suburb, state
  - the asset domain (commercial vs industrial)
  - the asset sub-type
  - the already-known fields supplied
Rules:
  - Output JSON ONLY matching the supplied schema.
  - Use realistic AU market context (typical yields, rents, build years, areas, GST treatment).
  - If you cannot reasonably estimate a field, return value=null.
  - Never invent an address or a verified figure. Mark confidence 'low' when uncertain.
  - Numeric fields must be plain numbers (no currency symbols, no commas).
  - The caller will tag every value as 'AI Estimate / unverified'.`;

    const userPrompt = `Domain: ${body.domain}
Address: ${body.address ?? 'unknown'}
State: ${body.state ?? 'unknown'}
Asset sub-type: ${body.assetSubtype ?? 'unknown'}

Known fields (do NOT re-estimate these):
${JSON.stringify(body.knownFields ?? {}, null, 2)}

Estimate these missing fields:
${body.missingFields.map((f) => `  - ${f.key} (${f.label})`).join('\n')}

Return ONLY JSON of shape:
{ "estimates": [ { "key": "<key>", "value": <number|string|null>, "confidence": "low"|"medium"|"high", "rationale": "<one-line reason>" } ] }`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      if (aiResp.status === 429) return json({ success: false, error: 'Rate limited by AI gateway. Please retry shortly.' }, 429);
      if (aiResp.status === 402) return json({ success: false, error: 'AI credits exhausted. Please top up to continue.' }, 402);
      return json({ success: false, error: `AI gateway error ${aiResp.status}: ${text}` }, 500);
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? '{}';

    let parsed: { estimates?: Array<{ key: string; value: unknown; confidence?: string; rationale?: string }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ success: false, error: 'AI returned malformed JSON', raw: content }, 502);
    }

    const allowedKeys = new Set(body.missingFields.map((f) => f.key));
    const estimates = (parsed.estimates ?? [])
      .filter((e) => e && allowedKeys.has(e.key))
      .map((e) => ({
        key: e.key,
        value: e.value ?? null,
        confidence: (['low', 'medium', 'high'].includes(String(e.confidence)) ? e.confidence : 'low') as 'low' | 'medium' | 'high',
        rationale: typeof e.rationale === 'string' ? e.rationale.slice(0, 240) : undefined,
      }));

    return json({ success: true, estimates });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

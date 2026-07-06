// Market Updates Q&A — Phase 5: source-grounded, refuses when no citations exist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-session-token, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const REFUSAL = 'I do not have enough sourced market updates to answer that yet.';
const AI_MODEL = Deno.env.get('MARKET_AI_MODEL') || 'google/gemini-3-flash-preview';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface Ctx {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  source_published_at?: string | null;
  category?: string | null;
  segments?: string[] | null;
  ai_summary?: string | null;
  why_it_matters?: string | null;
  key_points?: string[] | null;
  citation_urls?: string[] | null;
}

function pickTerms(q: string): string[] {
  const stop = new Set(['what','when','where','which','with','about','into','this','that','have','from','been','will','would','should','could','their','there','than','then','they','them','are','the','and','for','was','how','why','who','you','your','our']);
  return Array.from(new Set(
    q.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3 && !stop.has(t))
  )).slice(0, 8);
}

function rankAndTrim(rows: Ctx[], terms: string[], limit = 8): Ctx[] {
  return rows
    .map(r => {
      const blob = `${r.title} ${r.ai_summary ?? ''} ${r.why_it_matters ?? ''} ${(r.key_points ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (blob.includes(t)) score += 1;
      return { r, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.r);
}

async function callAI(question: string, context: Ctx[]): Promise<{ answer: string; used_ids: string[]; confidence: number; limitations: string[] } | null> {
  if (!LOVABLE_API_KEY) return null;
  const contextBlock = context.map((c, i) => {
    const cites = Array.from(new Set([...(c.citation_urls ?? []), c.source_url].filter(Boolean)));
    return `[[${i + 1}]] id=${c.id}
Title: ${c.title}
Source: ${c.source_name} — ${c.source_published_at ?? 'date unknown'}
Category: ${c.category ?? 'n/a'} | Segments: ${(c.segments ?? []).join(', ') || 'n/a'}
Summary: ${c.ai_summary ?? ''}
Why it matters: ${c.why_it_matters ?? ''}
Key points: ${(c.key_points ?? []).join(' • ')}
Citations: ${cites.join(' ')}`;
  }).join('\n\n');

  const system = `You are the NPC Australian property-market intelligence assistant.
STRICT RULES:
1. Answer ONLY from the numbered CONTEXT items below. Never use outside knowledge, memory, or assumptions.
2. If the CONTEXT does not contain enough grounded evidence to answer, respond with EXACTLY: "${REFUSAL}" and set used_ids to [].
3. Cite the update ids you relied on in used_ids. Do not fabricate ids.
4. Never give personal financial, tax, legal or investment advice. Attribute claims to their source.
5. Keep the answer under 220 words, in plain Australian English, factual and specific.`;

  const user = `QUESTION: ${question}\n\nCONTEXT:\n${contextBlock}`;

  const body = {
    model: AI_MODEL,
    messages: [ { role: 'system', content: system }, { role: 'user', content: user } ],
    tools: [{
      type: 'function',
      function: {
        name: 'submit_market_answer',
        description: 'Return a source-grounded answer or refuse.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answer: { type: 'string' },
            used_ids: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number', minimum: 0, maximum: 100 },
            limitations: { type: 'array', items: { type: 'string' } },
          },
          required: ['answer', 'used_ids', 'confidence', 'limitations'],
        },
      },
    }],
    tool_choice: { type: 'function', function: { name: 'submit_market_answer' } },
  };

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.warn('[qa] AI gateway', res.status, await res.text()); return null; }
    const data = await res.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) return null;
    const parsed = JSON.parse(call.function.arguments);
    return {
      answer: String(parsed.answer ?? REFUSAL).trim(),
      used_ids: Array.isArray(parsed.used_ids) ? parsed.used_ids.map(String) : [],
      confidence: Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 50,
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map(String) : [],
    };
  } catch (e) {
    console.warn('[qa] AI call failed', (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('authorization');
  const cron = req.headers.get('x-cron-secret');
  if (!auth && cron !== Deno.env.get('MARKET_INGESTION_CRON_SECRET')) {
    return json({ error: 'Authenticated user required.' }, 401);
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    auth ? { global: { headers: { Authorization: auth } } } : {},
  );

  const payload = await req.json().catch(() => ({}));
  const question = String(payload?.question ?? '').trim();
  const updateIds: string[] = Array.isArray(payload?.updateIds) ? payload.updateIds : [];
  const segment: string | undefined = payload?.segment;

  if (question.length < 4) {
    return json({
      answer: REFUSAL, citations: [], source_update_ids: [], confidence_score: 0,
      limitations: ['A specific question is required.'],
    });
  }

  const terms = pickTerms(question);

  // Candidate retrieval — restrict to published, recent, and (if provided) explicit ids.
  let q = sb.from('market_updates')
    .select('id,title,source_name,source_url,source_published_at,category,segments,ai_summary,why_it_matters,key_points,citation_urls')
    .eq('status', 'published')
    .order('source_published_at', { ascending: false, nullsFirst: false })
    .limit(60);
  if (updateIds.length) q = q.in('id', updateIds);
  if (segment) q = q.contains('segments', [segment]);
  if (terms.length && !updateIds.length) {
    const or = terms.map(t => `title.ilike.%${t}%,ai_summary.ilike.%${t}%,why_it_matters.ilike.%${t}%`).join(',');
    q = q.or(or);
  }

  const { data, error } = await q;
  if (error) {
    console.warn('[qa] retrieval error', error.message);
    return json({ answer: REFUSAL, citations: [], source_update_ids: [], confidence_score: 0, limitations: ['Retrieval error.'] });
  }

  const context = rankAndTrim((data ?? []) as Ctx[], terms.length ? terms : pickTerms(question));
  if (!context.length) {
    return json({
      answer: REFUSAL, citations: [], source_update_ids: [], confidence_score: 0,
      limitations: ['No published source-backed update matched the question.'],
    });
  }

  const contextIds = new Set(context.map(c => c.id));
  const ai = await callAI(question, context);

  // Enforcement: must have used_ids ⊆ contextIds; otherwise refuse.
  let answer: string, used_ids: string[], confidence: number, limitations: string[];
  if (!ai || !ai.used_ids.length || ai.used_ids.some(id => !contextIds.has(id)) || ai.answer.length < 4) {
    // Fallback: deterministic extractive answer from retrieved context.
    answer = context.slice(0, 3).map(c => `• ${c.title} (${c.source_name}): ${c.ai_summary || c.why_it_matters || 'Limited sourced context.'}`).join('\n');
    used_ids = context.slice(0, 3).map(c => c.id);
    confidence = 45;
    limitations = ['Extractive fallback used because the AI response was ungrounded or unavailable.', 'Not financial, legal, tax or investment advice.'];
  } else {
    answer = ai.answer;
    used_ids = ai.used_ids.filter(id => contextIds.has(id));
    confidence = Math.max(0, Math.min(100, ai.confidence));
    limitations = ai.limitations.length ? ai.limitations : ['Answer limited to stored market update summaries and citations; not financial, legal, tax or investment advice.'];
  }

  const citations = Array.from(new Set(
    context.filter(c => used_ids.includes(c.id))
      .flatMap(c => [...(c.citation_urls ?? []), c.source_url].filter(Boolean))
  ));

  await sb.from('market_update_questions').insert({
    question, answer,
    source_update_ids: used_ids,
    citation_urls: citations,
    confidence_score: confidence,
  }).then(({ error: e }: any) => { if (e) console.warn('[qa] log insert', e.message); });

  return json({
    answer,
    citations,
    source_update_ids: used_ids,
    confidence_score: confidence,
    limitations,
  });
});

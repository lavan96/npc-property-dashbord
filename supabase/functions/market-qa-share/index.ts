// Phase 6 — Public share links for market Q&A answers.
// Actions: create, resolve (public), list-mine, revoke.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAuth } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-session-token',
};

function makeSlug(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 12);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'resolve';

    // Public resolve — no auth
    if (action === 'resolve') {
      const slug = String(body?.slug ?? '').trim();
      if (!slug) return json({ error: 'slug required' }, 400);
      const { data: share, error } = await sb
        .from('market_update_qa_shares')
        .select('id, question_id, expires_at, is_revoked, view_count')
        .eq('slug', slug)
        .maybeSingle();
      if (error || !share) return json({ error: 'not_found' }, 404);
      if (share.is_revoked) return json({ error: 'revoked' }, 410);
      if (share.expires_at && new Date(share.expires_at) < new Date()) return json({ error: 'expired' }, 410);
      const { data: question } = await sb
        .from('market_update_questions')
        .select('id, question, answer, used_ids, retrieved_ids, confidence, model, created_at, meta')
        .eq('id', share.question_id)
        .maybeSingle();
      if (!question) return json({ error: 'not_found' }, 404);
      // Load source updates for citations
      const ids: string[] = (question.used_ids ?? question.retrieved_ids ?? []) as string[];
      const { data: sources } = ids.length
        ? await sb.from('market_updates').select('id, title, summary, source_url, source_name, published_at, impact_level').in('id', ids)
        : { data: [] as any[] };
      // Increment view count (fire and forget)
      sb.from('market_update_qa_shares').update({
        view_count: (share.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      }).eq('id', share.id).then(() => {});
      return json({ share, question, sources: sources ?? [] });
    }

    // Authed actions
    const auth = await verifyAuth(sb, req.headers, body);
    if (auth.error || !auth.userId) return json({ error: 'unauthorized' }, 401);
    const userId = auth.userId as string;

    if (action === 'create') {
      const questionId = String(body?.question_id ?? '');
      if (!questionId) return json({ error: 'question_id required' }, 400);
      const expiresAt = body?.expires_at ? String(body.expires_at) : null;
      // Attempt up to 3 slug retries
      let slug = makeSlug();
      for (let i = 0; i < 3; i += 1) {
        const { data, error } = await sb
          .from('market_update_qa_shares')
          .insert({ question_id: questionId, slug, created_by: userId, expires_at: expiresAt })
          .select()
          .maybeSingle();
        if (!error && data) return json({ share: data });
        slug = makeSlug();
      }
      return json({ error: 'slug_collision' }, 500);
    }

    if (action === 'list-mine') {
      const { data, error } = await sb
        .from('market_update_qa_shares')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ shares: data ?? [] });
    }

    if (action === 'revoke') {
      const id = String(body?.id ?? '');
      const { error } = await sb.from('market_update_qa_shares').update({ is_revoked: true }).eq('id', id).eq('created_by', userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    return json({ error: String((err as Error).message) }, 500);
  }

  function json(payload: any, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

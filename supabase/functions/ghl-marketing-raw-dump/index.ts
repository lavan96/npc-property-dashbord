/**
 * GHL Marketing Raw Dump
 *
 * Pulls EVERY scrap of raw data we can get from the GHL public API for the
 * Sites-page assets (forms, surveys/quizzes, funnels, funnel pages) plus
 * workflows. Stores raw JSON, HTML, CSS and embed code into
 * `ghl_marketing_raw_dumps` so we can re-build everything manually in the new
 * GHL account from a complete reference dataset.
 *
 * Actions:
 *   - dump   : run a fresh pull from GHL (account = legacy by default)
 *   - list   : return summary rows for the UI
 *   - export : return all rows for client-side download
 *
 * Auth: superadmin only (via verifyAuth + role check). Service role bypass.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';
import { getGhlCredentials, validateGhlCredentials, buildGhlHeaders, type GhlAccount } from '../_shared/ghl-account.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

interface DumpRow {
  resource_type: 'form' | 'survey' | 'quiz' | 'funnel' | 'funnel_page' | 'workflow';
  ghl_id: string;
  location_id: string;
  name: string | null;
  parent_ghl_id: string | null;
  raw_payload: any;
  html_content: string | null;
  css_content: string | null;
  embed_code: string | null;
  full_url: string | null;
  fetch_status: 'ok' | 'partial' | 'error';
  fetch_error: string | null;
  endpoints_tried: { url: string; status: number; ok: boolean }[];
}

async function ghlGet(path: string, headers: Record<string, string>) {
  const url = `${GHL_API_BASE}${path}`;
  try {
    const res = await fetch(url, { method: 'GET', headers });
    let body: any = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
    return { url, status: res.status, ok: res.ok, body };
  } catch (e: any) {
    return { url, status: 0, ok: false, body: { error: e.message } };
  }
}

async function tryEndpoints(paths: string[], headers: Record<string, string>) {
  const tried: { url: string; status: number; ok: boolean }[] = [];
  let firstOk: any = null;
  for (const p of paths) {
    const r = await ghlGet(p, headers);
    tried.push({ url: r.url, status: r.status, ok: r.ok });
    if (r.ok && !firstOk) firstOk = r.body;
  }
  return { firstOk, tried };
}

function pickHtmlCss(payload: any): { html: string | null; css: string | null; embed: string | null } {
  if (!payload || typeof payload !== 'object') return { html: null, css: null, embed: null };
  const html =
    payload.html ?? payload.htmlContent ?? payload.pageHtml ?? payload.body ?? payload.content ??
    payload?.page?.html ?? payload?.data?.html ?? null;
  const css =
    payload.css ?? payload.cssContent ?? payload.styles ?? payload.stylesheet ??
    payload?.page?.css ?? payload?.data?.css ?? null;
  const embed =
    payload.embedCode ?? payload.embed_code ?? payload.embed ?? payload.iframeCode ??
    payload.embedUrl ?? payload.embed_url ?? null;
  return {
    html: typeof html === 'string' ? html : html ? JSON.stringify(html) : null,
    css: typeof css === 'string' ? css : css ? JSON.stringify(css) : null,
    embed: typeof embed === 'string' ? embed : embed ? JSON.stringify(embed) : null,
  };
}

async function dumpAll(supabase: any, account: GhlAccount): Promise<{
  inserted: number;
  errors: string[];
  breakdown: Record<string, number>;
}> {
  const creds = getGhlCredentials(account);
  const credErr = validateGhlCredentials(creds);
  if (credErr) throw new Error(credErr);

  const headers = buildGhlHeaders(creds.apiKey!);
  const locationId = creds.locationId!;
  const errors: string[] = [];
  const breakdown: Record<string, number> = { form: 0, survey: 0, quiz: 0, funnel: 0, funnel_page: 0, workflow: 0 };
  const rows: DumpRow[] = [];

  // ── FORMS ──
  try {
    const list = await ghlGet(`/forms/?locationId=${locationId}&limit=500`, headers);
    const items: any[] = list.body?.forms || list.body?.data || [];
    for (const f of items) {
      const id = f.id || f._id;
      // Try detail + submissions endpoints (read everything)
      const detail = await tryEndpoints(
        [`/forms/${id}?locationId=${locationId}`, `/forms/${id}`],
        headers,
      );
      const merged = { ...f, ...(detail.firstOk || {}) };
      const { html, css, embed } = pickHtmlCss(merged);
      rows.push({
        resource_type: 'form',
        ghl_id: id,
        location_id: locationId,
        name: merged.name || null,
        parent_ghl_id: null,
        raw_payload: merged,
        html_content: html,
        css_content: css,
        embed_code: embed,
        full_url: merged.url || merged.publicUrl || null,
        fetch_status: detail.firstOk ? 'ok' : 'partial',
        fetch_error: null,
        endpoints_tried: detail.tried,
      });
      breakdown.form++;
    }
  } catch (e: any) { errors.push(`forms: ${e.message}`); }

  // ── SURVEYS / QUIZZES ──
  try {
    const list = await ghlGet(`/surveys/?locationId=${locationId}&limit=500`, headers);
    const items: any[] = list.body?.surveys || list.body?.data || [];
    for (const s of items) {
      const id = s.id || s._id;
      const isQuiz = s.isQuiz === true || s.type === 'quiz';
      const detail = await tryEndpoints(
        [`/surveys/${id}?locationId=${locationId}`, `/surveys/${id}`],
        headers,
      );
      const merged = { ...s, ...(detail.firstOk || {}) };
      const { html, css, embed } = pickHtmlCss(merged);
      rows.push({
        resource_type: isQuiz ? 'quiz' : 'survey',
        ghl_id: id,
        location_id: locationId,
        name: merged.name || null,
        parent_ghl_id: null,
        raw_payload: merged,
        html_content: html,
        css_content: css,
        embed_code: embed,
        full_url: merged.url || merged.publicUrl || null,
        fetch_status: detail.firstOk ? 'ok' : 'partial',
        fetch_error: null,
        endpoints_tried: detail.tried,
      });
      breakdown[isQuiz ? 'quiz' : 'survey']++;
    }
  } catch (e: any) { errors.push(`surveys: ${e.message}`); }

  // ── FUNNELS + PAGES ──
  try {
    const list = await ghlGet(`/funnels/funnel/list?locationId=${locationId}`, headers);
    const funnels: any[] = list.body?.funnels || list.body?.data || [];
    for (const fn of funnels) {
      const fid = fn._id || fn.id;
      const detail = await tryEndpoints(
        [`/funnels/funnel/${fid}?locationId=${locationId}`, `/funnels/${fid}`],
        headers,
      );
      const fullFn = { ...fn, ...(detail.firstOk || {}) };
      rows.push({
        resource_type: 'funnel',
        ghl_id: fid,
        location_id: locationId,
        name: fullFn.name || null,
        parent_ghl_id: null,
        raw_payload: fullFn,
        html_content: null,
        css_content: null,
        embed_code: null,
        full_url: fullFn.domain ? `https://${fullFn.domain}` : null,
        fetch_status: detail.firstOk ? 'ok' : 'partial',
        fetch_error: null,
        endpoints_tried: detail.tried,
      });
      breakdown.funnel++;

      const pages: any[] = fullFn.steps || fullFn.pages || [];
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const pid = pg._id || pg.id;
        if (!pid) continue;
        // Try to grab full page builder data (html/css/elements)
        const pgDetail = await tryEndpoints(
          [
            `/funnels/page/${pid}?locationId=${locationId}`,
            `/funnels/page/${pid}`,
            `/funnels/funnel/${fid}/page/${pid}?locationId=${locationId}`,
            `/funnels/lookup/redirect?locationId=${locationId}&id=${pid}`,
          ],
          headers,
        );
        const fullPg = { ...pg, ...(pgDetail.firstOk || {}) };
        const { html, css, embed } = pickHtmlCss(fullPg);
        const slug = fullPg.path || fullPg.slug || fullPg.url || null;
        const pageUrl = fullPg.fullUrl || (fullFn.domain && slug ? `https://${fullFn.domain}/${slug}` : null);

        // If we got a public URL, also try to fetch the live HTML directly
        let liveHtml: string | null = null;
        if (!html && pageUrl) {
          try {
            const live = await fetch(pageUrl);
            if (live.ok) liveHtml = await live.text();
          } catch { /* ignore */ }
        }

        rows.push({
          resource_type: 'funnel_page',
          ghl_id: pid,
          location_id: locationId,
          name: fullPg.name || fullPg.stepName || `Page ${i + 1}`,
          parent_ghl_id: fid,
          raw_payload: fullPg,
          html_content: html || liveHtml,
          css_content: css,
          embed_code: embed,
          full_url: pageUrl,
          fetch_status: (html || liveHtml || pgDetail.firstOk) ? 'ok' : 'partial',
          fetch_error: null,
          endpoints_tried: pgDetail.tried,
        });
        breakdown.funnel_page++;
      }
    }
  } catch (e: any) { errors.push(`funnels: ${e.message}`); }

  // ── WORKFLOWS (metadata only — API limitation) ──
  try {
    const list = await ghlGet(`/workflows/?locationId=${locationId}`, headers);
    const items: any[] = list.body?.workflows || list.body?.data || [];
    for (const wf of items) {
      rows.push({
        resource_type: 'workflow',
        ghl_id: wf.id,
        location_id: locationId,
        name: wf.name || null,
        parent_ghl_id: null,
        raw_payload: wf,
        html_content: null,
        css_content: null,
        embed_code: null,
        full_url: null,
        fetch_status: 'partial', // GHL API exposes only id/name/status
        fetch_error: 'GHL public API exposes only metadata for workflows',
        endpoints_tried: [{ url: list.url, status: list.status, ok: list.ok }],
      });
      breakdown.workflow++;
    }
  } catch (e: any) { errors.push(`workflows: ${e.message}`); }

  // Upsert in batches
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map((r) => ({ ...r, last_fetched_at: new Date().toISOString() }));
    const { error } = await supabase
      .from('ghl_marketing_raw_dumps')
      .upsert(batch, { onConflict: 'resource_type,ghl_id' });
    if (error) errors.push(`upsert batch ${i}: ${error.message}`);
    else inserted += batch.length;
  }

  return { inserted, errors, breakdown };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) return createUnauthorizedResponse(authError || 'Auth required', corsHeaders);

    if (userId !== 'service_role') {
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId);
      const isSuper = (roles || []).some((r: any) => r.role === 'superadmin');
      if (!isSuper) return createForbiddenResponse('Superadmin access required', corsHeaders);
    }

    const action = body.action || 'list';
    const account: GhlAccount = body.account === 'new' ? 'new' : 'legacy';

    if (action === 'dump') {
      const result = await dumpAll(supabase, account);
      return new Response(JSON.stringify({ success: true, account, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'export') {
      const { data, error } = await supabase
        .from('ghl_marketing_raw_dumps')
        .select('*')
        .order('resource_type', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, count: data?.length || 0, rows: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // default: list (summary)
    const { data, error } = await supabase
      .from('ghl_marketing_raw_dumps')
      .select('id,resource_type,ghl_id,name,parent_ghl_id,full_url,fetch_status,fetch_error,last_fetched_at,html_content,css_content,embed_code')
      .order('resource_type', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    const summary = (data || []).map((r: any) => ({
      ...r,
      has_html: !!r.html_content,
      has_css: !!r.css_content,
      has_embed: !!r.embed_code,
      html_content: undefined,
      css_content: undefined,
      embed_code: undefined,
    }));
    const counts: Record<string, number> = {};
    for (const r of summary) counts[r.resource_type] = (counts[r.resource_type] || 0) + 1;
    return new Response(JSON.stringify({ success: true, counts, rows: summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[ghl-marketing-raw-dump] error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * render-template-pdf  (Phase 11)
 *
 * Accepts a pre-compiled HTML payload (from `renderTemplateToHtml`), forwards
 * to the WeasyPrint microservice with configurable PDF/A + tagged options,
 * uploads the resulting PDF to storage, records a row in
 * `public.template_render_jobs`, and returns a 24h signed URL.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-portal-session-token, x-finance-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PDF_BUCKET = 'investment-reports';
const MAX_HTML_BYTES = 25 * 1024 * 1024;
const WEASYPRINT_TIMEOUT_MS = 600_000;

type PdfVariant = 'pdf/a-2b' | 'pdf/a-3b' | 'pdf-1.7';
const ALLOWED_VARIANTS: PdfVariant[] = ['pdf/a-2b', 'pdf/a-3b', 'pdf-1.7'];

async function callWeasyPrint(
  html: string,
  variant: PdfVariant,
  tagged: boolean,
  optimizeImages: boolean,
): Promise<Uint8Array> {
  const serviceUrl = (Deno.env.get('WEASYPRINT_SERVICE_URL') || '').trim().replace(/\/$/, '');
  const serviceToken = (Deno.env.get('WEASYPRINT_SERVICE_TOKEN') || Deno.env.get('WEASYPRINT_API_KEY') || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!serviceUrl || !serviceToken) {
    throw new Error('WeasyPrint service not configured (set WEASYPRINT_SERVICE_URL + WEASYPRINT_SERVICE_TOKEN)');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEASYPRINT_TIMEOUT_MS);
  try {
    const res = await fetch(`${serviceUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
        Accept: 'application/pdf',
      },
      body: JSON.stringify({
        html,
        pdf_variant: variant,
        tagged,
        optimize_images: optimizeImages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WeasyPrint render failed (${res.status}): ${body.slice(0, 400)}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Best-effort identity capture
  let requestedBy: string | null = null;
  try {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) {
      const u = await supabase.auth.getUser(auth.replace('Bearer ', ''));
      requestedBy = u.data.user?.id ?? null;
    }
  } catch (_) {
    requestedBy = null;
  }

  let jobId: string | null = null;
  const started = Date.now();

  try {
    if (req.headers.get('content-length') && Number(req.headers.get('content-length')) > MAX_HTML_BYTES) {
      return new Response(JSON.stringify({ error: 'payload too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'invalid json' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const html: string = String(payload.html ?? '');
    if (!html.trim()) {
      return new Response(JSON.stringify({ error: 'html is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const fileName: string = String(payload.fileName || 'template-preview.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const templateId: string | null = payload.templateId ? String(payload.templateId) : null;
    const templateName: string | null = payload.templateName ? String(payload.templateName).slice(0, 200) : null;
    const mode: string = payload.mode === 'final' ? 'final' : 'preview';
    const variantRaw = String(payload.pdfVariant || 'pdf/a-2b').toLowerCase();
    const variant: PdfVariant = (ALLOWED_VARIANTS as string[]).includes(variantRaw)
      ? (variantRaw as PdfVariant)
      : 'pdf/a-2b';
    const tagged: boolean = payload.tagged !== false;
    const optimizeImages: boolean = payload.optimizeImages !== false;
    const themeId: string | null = payload.themeId ? String(payload.themeId).slice(0, 80) : null;
    const pageMasterId: string | null = payload.pageMasterId ? String(payload.pageMasterId).slice(0, 80) : null;
    const pageCount: number | null = Number.isFinite(payload.pageCount) ? Number(payload.pageCount) : null;
    const assetCount: number | null = Number.isFinite(payload.assetCount) ? Number(payload.assetCount) : null;

    // Pre-insert job row (status=running)
    const { data: jobRow, error: jobErr } = await supabase
      .from('template_render_jobs')
      .insert({
        template_id: templateId,
        template_name: templateName,
        requested_by: requestedBy,
        mode,
        pdf_variant: variant,
        tagged,
        theme_id: themeId,
        page_master_id: pageMasterId,
        page_count: pageCount,
        asset_count: assetCount,
        file_name: fileName,
        status: 'running',
        metadata: {
          optimize_images: optimizeImages,
          html_bytes: html.length,
        },
      })
      .select('id')
      .single();
    if (jobErr) {
      console.warn('[render-template-pdf] failed to insert job row:', jobErr.message);
    } else {
      jobId = jobRow.id as string;
    }

    const pdfBytes = await callWeasyPrint(html, variant, tagged, optimizeImages);

    const path = `template-builder/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${fileName}`;
    const { error: upErr } = await supabase.storage.from(PDF_BUCKET).upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
    if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24); // 24h
    if (signErr || !signed?.signedUrl) throw new Error(`sign failed: ${signErr?.message ?? 'no url'}`);

    const duration = Date.now() - started;
    if (jobId) {
      await supabase
        .from('template_render_jobs')
        .update({
          status: 'succeeded',
          storage_path: path,
          signed_url: signed.signedUrl,
          signed_url_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          bytes: pdfBytes.length,
          duration_ms: duration,
        })
        .eq('id', jobId);
    }

    return new Response(
      JSON.stringify({
        url: signed.signedUrl,
        fileName,
        mode,
        templateId,
        bytes: pdfBytes.length,
        jobId,
        pdfVariant: variant,
        tagged,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[render-template-pdf]', msg);
    if (jobId) {
      await supabase
        .from('template_render_jobs')
        .update({
          status: 'failed',
          error: msg.slice(0, 2000),
          duration_ms: Date.now() - started,
        })
        .eq('id', jobId);
    }
    return new Response(JSON.stringify({ error: msg, jobId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

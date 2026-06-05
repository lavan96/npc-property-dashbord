/**
 * render-template-pdf
 *
 * Compiles a `ReportTemplate` (from `public.report_templates`) + report data
 * into HTML, hands it to the WeasyPrint microservice, uploads the resulting
 * PDF to storage and returns a signed URL.
 *
 * This is the Phase-1 plumbing for the visual Template Builder → WeasyPrint
 * pipeline (Investment Compass pilot). The HTML is compiled client-side via
 * `src/lib/reportTemplate/htmlRenderer.ts`, but for server-driven generation
 * (e.g. the Compass fork) we replicate the compiler here to keep the edge
 * function dependency-light. For now we accept a pre-compiled `html` payload
 * from the caller — the dashboard's "Preview WeasyPrint output" button — and
 * a server-side compiler will be wired in Phase 5 when the Compass fork lands.
 *
 * Request:
 *   POST  (Authorization: Bearer <supabase-anon-or-user-jwt>)
 *   Body:
 *     {
 *       html: string,           // already-compiled HTML doc
 *       fileName?: string,      // defaults to "template-preview.pdf"
 *       templateId?: string,    // optional, recorded in metadata
 *       mode?: 'preview' | 'final',
 *     }
 *
 * Response: { url: string, fileName: string, mode: string }
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-session-token, x-finance-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PDF_BUCKET = 'generated-reports';
const MAX_HTML_BYTES = 25 * 1024 * 1024;
const WEASYPRINT_TIMEOUT_MS = 600_000;

async function callWeasyPrint(html: string): Promise<Uint8Array> {
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
      body: JSON.stringify({ html, pdf_variant: 'pdf/a-2b', tagged: true, optimize_images: true }),
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
    const mode: string = payload.mode === 'final' ? 'final' : 'preview';

    const pdfBytes = await callWeasyPrint(html);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    return new Response(
      JSON.stringify({ url: signed.signedUrl, fileName, mode, templateId, bytes: pdfBytes.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[render-template-pdf]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

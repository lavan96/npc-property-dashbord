// convert-to-pdf — turn an uploaded document into a PDF via the doc-convert
// (LibreOffice) microservice, so office/rtf/html/csv/markdown/etc. imports can
// run through the existing PDF reconstruction pipeline.
//
// Body: { filename, contentType?, dataBase64 }
//   → { kind:'pdf', dataBase64, contentType:'application/pdf' }
//   → { kind:'needs_service', guidance } when DOC_CONVERT_URL isn't configured
//   → { error } on failure
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const MAX_B64 = 34 * 1024 * 1024; // ~25 MB file

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, cors);

    const filename = String(body.filename || 'document');
    const dataBase64 = String(body.dataBase64 || '');
    if (!dataBase64) return json({ error: 'Missing file data' }, 400, cors);
    if (dataBase64.length > MAX_B64) return json({ error: 'File too large to convert (max ~25 MB) — export to PDF instead.' }, 400, cors);

    const base = Deno.env.get('DOC_CONVERT_URL');
    if (!base) {
      return json({
        kind: 'needs_service',
        guidance: 'Document conversion isn’t configured on the server. Deploy the doc-convert service and set DOC_CONVERT_URL, or export this file to PDF and import that.',
      }, 200, cors);
    }

    const key = Deno.env.get('DOC_CONVERT_KEY');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110000);
    let r: Response;
    try {
      r = await fetch(base.replace(/\/$/, '') + '/convert', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { 'x-convert-key': key } : {}) },
        body: JSON.stringify({ filename, dataBase64 }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      let msg = `Conversion failed (${r.status}).`;
      try { const j = JSON.parse(detail); if (j?.error) msg = j.error; } catch { /* keep default */ }
      return json({ error: msg }, 400, cors);
    }
    const j = await r.json().catch(() => null);
    if (!j?.dataBase64) return json({ error: 'Conversion produced no PDF.' }, 400, cors);
    return json({ kind: 'pdf', dataBase64: j.dataBase64, contentType: 'application/pdf' }, 200, cors);
  } catch (e) {
    return json({ error: (e as Error)?.message || 'Unexpected error' }, 500, cors);
  }
});

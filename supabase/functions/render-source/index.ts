// render-source — auth + SSRF guard in front of the headless render microservice
// (plan WS1 §3.2). Mirrors `import-from-url`: verifies the caller, re-applies the
// SSRF guard for URL renders, caps time, and proxies to RENDER_SOURCE_URL. Returns
// `{ raster, boxTree, pageWidthPx, pageHeightPx }`, or a clean 503 when the service
// is not configured (raw-codebase ingestion stays "pending" until deployed).
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Generous enough for C4 (zip) builds; static/HTML/JSX/URL renders return far sooner.
const RENDER_TIMEOUT_MS = 120000;
const MAX_DIM = 4000;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// SSRF guard (mirrors src/lib/reportTemplate/importUrl.isLikelyPrivateHost).
function isPrivateHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(10|127)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === '0.0.0.0' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

function assertFetchable(rawUrl: string): void {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed.');
  if (isPrivateHost(u.hostname)) throw new Error('Refusing to render a private/reserved host.');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, cors);

    const serviceUrl = (Deno.env.get('RENDER_SOURCE_URL') || '').replace(/\/$/, '');
    const serviceToken = Deno.env.get('RENDER_SOURCE_TOKEN') || '';
    if (!serviceUrl || !serviceToken) {
      return json(
        { error: 'Raw-codebase rendering is not configured on this deployment.', code: 'render_source_unconfigured' },
        503, cors,
      );
    }

    const html = typeof body.html === 'string' ? body.html : undefined;
    const css = typeof body.css === 'string' ? body.css : undefined;
    const url = typeof body.url === 'string' ? body.url : undefined;
    const jsx = typeof body.jsx === 'string' ? body.jsx : undefined;       // C3
    const entry = typeof body.entry === 'string' ? body.entry : undefined;  // C3 component name
    const zipBase64 = typeof body.zipBase64 === 'string' ? body.zipBase64 : undefined; // C4
    const sourceFilename = typeof body.sourceFilename === 'string' ? body.sourceFilename : undefined;
    if (!url && !jsx && !zipBase64 && (!html || !html.trim())) {
      return json({ error: 'Provide `html`, `url`, `jsx`, or `zipBase64`.' }, 400, cors);
    }
    if (url) {
      try { assertFetchable(url); } catch (e) { return json({ error: (e as Error).message }, 400, cors); }
    }

    const width = Math.min(MAX_DIM, Math.max(320, Number(body.width) || 1280));
    const height = Math.min(MAX_DIM, Math.max(320, Number(body.height) || 1600));
    const renderKind = zipBase64 ? 'zip' : jsx ? 'jsx' : url ? 'url' : 'html';
    console.info('[render-source] render request', {
      kind: renderKind,
      width,
      height,
      hasCss: Boolean(css),
      sourceFilename,
      zipBytes: zipBase64 ? Math.round((zipBase64.length * 3) / 4) : 0,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(`${serviceUrl}/render`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, css, url, jsx, entry, zipBase64, sourceFilename, width, height, fullPage: body.fullPage !== false }),
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError';
      console.warn('[render-source] upstream fetch failed', { kind: renderKind, aborted, message: String(e) });
      return json({ error: aborted ? 'Render timed out.' : `render-source unreachable: ${String(e)}` }, 502, cors);
    } finally {
      clearTimeout(timer);
    }

    const text = await upstream.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* wrap non-JSON below */ }
    if (!upstream.ok) {
      const errorPayload = payload && typeof payload === 'object'
        ? payload
        : { error: text || `render service returned HTTP ${upstream.status}`, code: 'render_source_upstream_error', status: upstream.status };
      console.warn('[render-source] upstream non-2xx', { kind: renderKind, status: upstream.status, sourceFilename });
      return json(errorPayload, upstream.status, cors);
    }
    if (!payload || typeof payload !== 'object') {
      console.warn('[render-source] upstream returned invalid JSON', { kind: renderKind, status: upstream.status, bytes: text.length });
      return json({ error: 'render-source returned invalid JSON.', code: 'render_source_invalid_json' }, 502, cors);
    }
    return json(payload, upstream.status, cors);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? String(e) }, 500, cors);
  }
});

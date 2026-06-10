// import-from-url — safely fetch a public document by link, server-side.
//
// The client normalises a share link (Google Drive/Docs/Slides/Sheets, Dropbox,
// OneDrive/SharePoint, generic) into a direct `fetchUrl` and posts it here.
// This function does the cross-origin fetch the browser can't, behind:
//   - auth (same session check as the rest of the app),
//   - SSRF guards (block private/reserved hosts on every redirect hop),
//   - size + time limits,
// and returns the bytes as base64 (or guidance when the link isn't a file).
// Figma links are exported via the Figma API when FIGMA_TOKEN is configured.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20000;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// SSRF guard (mirrors src/lib/reportTemplate/importUrl.isLikelyPrivateHost).
function isPrivateHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '::') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

function assertFetchable(rawUrl: string): URL {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed');
  if (isPrivateHost(u.hostname)) throw new Error('Refusing to fetch a private/internal address');
  return u;
}

function base64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function filenameFrom(url: URL, contentType: string): string {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
  const ext = contentType.includes('pdf') ? 'pdf'
    : contentType.includes('png') ? 'png'
    : contentType.includes('jpeg') ? 'jpg'
    : contentType.includes('webp') ? 'webp' : 'bin';
  return `import.${ext}`;
}

/** Fetch following redirects manually so every hop is SSRF-checked. */
async function safeFetch(startUrl: string): Promise<{ res: Response; finalUrl: URL }> {
  let current = assertFetchable(startUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'NPC-Importer/1.0', Accept: '*/*' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const loc = new URL(res.headers.get('location')!, current);
      current = assertFetchable(loc.toString());
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error('Too many redirects');
}

interface RenderImage { dataBase64: string; contentType: string }

/** Export every top-level Figma frame as its own PNG (needs FIGMA_TOKEN). */
async function figmaExportImages(key: string): Promise<RenderImage[] | null> {
  const token = Deno.env.get('FIGMA_TOKEN');
  if (!token || !key) return null;
  try {
    const fileRes = await fetch(`https://api.figma.com/v1/files/${key}?depth=2`, { headers: { 'X-Figma-Token': token } });
    if (!fileRes.ok) return null;
    const file = await fileRes.json();
    const pages: any[] = file?.document?.children ?? [];
    const frameTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION']);
    const ids: string[] = [];
    for (const pg of pages) {
      for (const node of (pg?.children ?? [])) {
        if (node?.id && frameTypes.has(node.type)) ids.push(node.id);
      }
    }
    const targetIds = (ids.length ? ids : pages.map((p) => p?.id).filter(Boolean)).slice(0, 60);
    if (!targetIds.length) return null;
    const imgRes = await fetch(`https://api.figma.com/v1/images/${key}?ids=${encodeURIComponent(targetIds.join(','))}&format=png&scale=2`, { headers: { 'X-Figma-Token': token } });
    if (!imgRes.ok) return null;
    const map = (await imgRes.json())?.images ?? {};
    const out: RenderImage[] = [];
    for (const id of targetIds) {
      const u: string | undefined = map[id];
      if (!u) continue;
      try {
        const { res } = await safeFetch(u);
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > MAX_BYTES) continue;
        out.push({ dataBase64: base64(buf), contentType: res.headers.get('content-type') || 'image/png' });
      } catch { /* skip frame */ }
    }
    return out.length ? out : null;
  } catch (_e) {
    return null;
  }
}

/** Best-effort slide selectors per provider (env-overridable, comma-separated). */
function selectorsFor(provider: string): string[] {
  const env = (k: string) => (Deno.env.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (provider === 'canva') {
    const e = env('RENDER_SELECTORS_CANVA');
    return e.length ? e : ['[data-slide]', '[aria-roledescription="slide"]', '[class*="slide" i]'];
  }
  if (provider === 'gamma') {
    const e = env('RENDER_SELECTORS_GAMMA');
    return e.length ? e : ['[data-card-id]', '[class*="card" i]', 'main section'];
  }
  return [];
}

/** Screenshot an interactive page (optionally split into slides) via the render service. */
async function renderImages(url: string, selectors: string[]): Promise<RenderImage[] | null> {
  const base = Deno.env.get('RENDER_SERVICE_URL');
  if (!base) return null;
  try {
    assertFetchable(url); // defence-in-depth before handing the URL off
  } catch {
    return null;
  }
  try {
    const key = Deno.env.get('RENDER_API_KEY');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75000);
    let r: Response;
    try {
      r = await fetch(base.replace(/\/$/, '') + '/render', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { 'x-render-key': key } : {}) },
        body: JSON.stringify({ url, width: 1280, scale: 2, waitMs: 3500, selectors }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const imgs: any[] = Array.isArray(j?.images) ? j.images : [];
    const out = imgs.filter((i) => i?.dataBase64).map((i) => ({ dataBase64: String(i.dataBase64), contentType: i.contentType || 'image/png' }));
    return out.length ? out : null;
  } catch (_e) {
    return null;
  }
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

    const provider: string = String(body.provider || 'generic');
    const fetchUrl: string = String(body.fetchUrl || body.url || '').trim();
    const resourceId: string = String(body.resourceId || '');
    const renderUrl: string = String(body.renderUrl || fetchUrl).trim();
    if (!fetchUrl) return json({ error: 'Missing url' }, 400, cors);

    // Figma: per-frame export (token) → headless render → guidance.
    if (provider === 'figma') {
      const figImgs = await figmaExportImages(resourceId);
      if (figImgs) return json({ kind: 'image', provider, images: figImgs, filename: 'figma.png' }, 200, cors);
      const rendered = await renderImages(renderUrl, []);
      if (rendered) return json({ kind: 'image', provider, images: rendered, filename: 'figma.png' }, 200, cors);
      return json({
        kind: 'needs_export', provider,
        guidance: 'This Figma link couldn’t be imported automatically. Set FIGMA_TOKEN (frame export) or RENDER_SERVICE_URL (page render), or use File → Export → PDF and paste that link. The file must be shared as “Anyone with the link”.',
      }, 200, cors);
    }

    // Canva / Gamma have no public file — render the public page, split into slides.
    if (provider === 'canva' || provider === 'gamma') {
      const rendered = await renderImages(renderUrl, selectorsFor(provider));
      if (rendered) return json({ kind: 'image', provider, images: rendered, filename: `${provider}.png` }, 200, cors);
      return json({
        kind: 'needs_export', provider,
        guidance: `${provider === 'canva' ? 'Canva' : 'Gamma'} has no public file link and page rendering isn’t configured. Export to PDF (or PNG) and paste that link, or drop the file.`,
      }, 200, cors);
    }

    let result: { res: Response; finalUrl: URL };
    try {
      result = await safeFetch(fetchUrl);
    } catch (e) {
      return json({ error: (e as Error).message || 'Fetch failed' }, 400, cors);
    }
    const { res, finalUrl } = result;
    if (!res.ok) {
      return json({ error: `Source returned ${res.status}. Make sure the link is set to “anyone with the link”.` }, 400, cors);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const lenHeader = Number(res.headers.get('content-length') || '0');
    if (lenHeader && lenHeader > MAX_BYTES) {
      return json({ error: `File too large (${Math.round(lenHeader / 1024 / 1024)} MB, max 30 MB).` }, 400, cors);
    }

    // A web page (not a file) — render it to an image if the service is configured.
    if (contentType.includes('text/html')) {
      const rendered = await renderImages(finalUrl.toString(), []);
      if (rendered) return json({ kind: 'image', provider, images: rendered, filename: 'page.png' }, 200, cors);
      return json({
        kind: 'needs_export', provider,
        finalUrl: finalUrl.toString(),
        guidance: 'The link returned a web page, not a file — it likely needs sign-in or isn’t publicly shared. Set sharing to “anyone with the link”, or export to PDF and paste that link.',
      }, 200, cors);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return json({ error: 'File too large (max 30 MB).' }, 400, cors);
    }

    const kind = contentType.includes('pdf') ? 'pdf'
      : contentType.startsWith('image/') ? 'image'
      : /\.pdf($|\?)/i.test(finalUrl.pathname) ? 'pdf'
      : /\.(png|jpe?g|webp|gif|bmp|avif)($|\?)/i.test(finalUrl.pathname) ? 'image'
      : 'file';

    return json({
      kind,
      provider,
      contentType: contentType || 'application/octet-stream',
      filename: filenameFrom(finalUrl, contentType),
      dataBase64: base64(buf),
      finalUrl: finalUrl.toString(),
    }, 200, cors);
  } catch (e) {
    return json({ error: (e as Error)?.message || 'Unexpected error' }, 500, cors);
  }
});

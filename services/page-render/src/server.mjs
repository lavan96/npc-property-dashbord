/**
 * page-render — a tiny headless-Chromium screenshot service.
 *
 * POST /render  { url, width?, scale?, waitMs?, maxHeight? }  → { dataBase64, contentType, width, height }
 * GET  /health  → { ok: true }
 *
 * It exists so "code-built" designs (Figma public embeds, Canva/Gamma public
 * views, any interactive page) can be screenshotted server-side and fed into the
 * importer's OCR-grounded reconstruct path. Deploy it next to the app (Cloud Run,
 * Fly, Render, a container host) and point the `import-from-url` edge function at
 * it via RENDER_SERVICE_URL + RENDER_API_KEY.
 *
 * Security: shared-secret auth (x-render-key), http(s)-only public navigation,
 * per-request route interception that aborts any sub-request to a private host,
 * downloads disabled, nav timeout, output height capped.
 */
import http from 'node:http';
import { chromium } from 'playwright';
import { assertPublicHttpUrl, isPrivateHost, parseOptions } from './security.mjs';

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.RENDER_API_KEY || '';
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 30000);
const MAX_BODY = 1_000_000;

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  }
  return browserPromise;
}

/** One capped-height capture of the whole page (the fallback / single mode). */
async function captureSingle(page, opts) {
  const scrollH = await page.evaluate(() => Math.max(
    document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, 900,
  )).catch(() => 900);
  const height = Math.min(scrollH, opts.maxHeight);
  await page.setViewportSize({ width: opts.width, height });
  await page.waitForTimeout(250);
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  return { dataBase64: buf.toString('base64'), width: opts.width, height };
}

/** Screenshot each slide-sized element matching the selectors → one image each. */
async function captureSegments(page, opts) {
  const vp = page.viewportSize() || { width: opts.width, height: 900 };
  const found = [];
  const seen = new Set();
  for (const sel of opts.selectors) {
    let handles = [];
    try { handles = await page.$$(sel); } catch { continue; }
    for (const h of handles) {
      if (found.length >= opts.maxSegments) break;
      const box = await h.boundingBox().catch(() => null);
      if (!box) continue;
      // Keep only slide-sized blocks (avoids matching tiny chrome/labels).
      if (box.width < vp.width * 0.4 || box.height < 140) continue;
      const key = `${Math.round(box.x)}|${Math.round(box.y)}|${Math.round(box.width)}|${Math.round(box.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await h.scrollIntoViewIfNeeded({ timeout: 3000 });
        const buf = await h.screenshot({ type: 'png' });
        found.push({ y: box.y, dataBase64: buf.toString('base64'), width: Math.round(box.width), height: Math.round(box.height) });
      } catch { /* skip this element */ }
    }
    if (found.length >= opts.maxSegments) break;
  }
  found.sort((a, b) => a.y - b.y); // reading order, top → bottom
  return found.map(({ y, ...rest }) => rest);
}

async function renderPage(rawUrl, opts) {
  const target = assertPublicHttpUrl(rawUrl);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: 900 },
    deviceScaleFactor: opts.scale,
    userAgent: 'NPC-Importer/1.0 (+headless-render)',
    acceptDownloads: false,
    bypassCSP: true,
  });
  // SSRF on every sub-request: only public http(s).
  await context.route('**/*', (route) => {
    try {
      const u = new URL(route.request().url());
      if ((u.protocol !== 'http:' && u.protocol !== 'https:') || isPrivateHost(u.hostname)) return route.abort();
      return route.continue();
    } catch { return route.abort(); }
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  try {
    try {
      await page.goto(target.toString(), { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    } catch {
      // Heavy SPAs may never reach networkidle — settle for DOM content.
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    }
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);

    // Slide/frame splitting: capture each matching element; else one page.
    if (opts.selectors.length) {
      const segs = await captureSegments(page, opts);
      if (segs.length >= 1) return { images: segs, mode: 'segments' };
    }
    return { images: [await captureSingle(page, opts)], mode: 'single' };
  } finally {
    await context.close().catch(() => {});
  }
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || !(req.url || '').startsWith('/render')) return send(res, 404, { error: 'Not found' });
  if (API_KEY && req.headers['x-render-key'] !== API_KEY) return send(res, 401, { error: 'Unauthorized' });

  let body = '';
  let aborted = false;
  req.on('data', (c) => {
    body += c;
    if (body.length > MAX_BODY) { aborted = true; req.destroy(); }
  });
  req.on('end', async () => {
    if (aborted) return;
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    if (!parsed.url) return send(res, 400, { error: 'Missing url' });
    let opts;
    try { opts = parseOptions(parsed); } catch (e) { return send(res, 400, { error: String(e?.message || e) }); }
    try {
      const { images, mode } = await renderPage(parsed.url, opts);
      return send(res, 200, { images, mode, contentType: 'image/png' });
    } catch (e) {
      return send(res, 400, { error: String(e?.message || e) });
    }
  });
});

server.listen(PORT, () => console.log(`[page-render] listening on :${PORT}`));

// Best-effort cleanup.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try { const b = await browserPromise; if (b) await b.close(); } catch { /* noop */ }
    process.exit(0);
  });
}

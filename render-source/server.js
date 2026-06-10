/**
 * render-source — headless render microservice (plan WS1 §3.2).
 *
 * Mirrors the weasyprint-service pattern (container + Bearer auth + /healthz).
 * Renders HTML/CSS (C1) or a live URL (C2) with Playwright/Chromium and returns
 * a screenshot + a DOM box tree (computed positions/styles in CSS px). The client
 * grounds that into a GroundedReference (`codeGrounding.ts`) and reconstructs it
 * through the existing `screenshot_to_block` pipeline.
 *
 *   POST /render
 *     Authorization: Bearer <RENDER_SOURCE_TOKEN>
 *     Body: { html?, css?, url?, width=1280, height=1600, fullPage=true }
 *     → { raster: "<base64 png>", boxTree: {...}, pageWidthPx, pageHeightPx }
 *   GET /healthz → 200 "ok"
 *
 * C3 (react/jsx) and C4 (repo/zip) build to HTML/a-served-URL upstream, then hit
 * this same endpoint — no protocol change here.
 */
const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json({ limit: process.env.MAX_BODY || '10mb' }));

const EXPECTED_TOKEN = (process.env.RENDER_SOURCE_TOKEN || '').trim().replace(/^"|"$/g, '');
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 20000);
const MAX_DIM = 4000;

function authOk(req) {
  if (!EXPECTED_TOKEN) return false; // fail closed
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return false;
  return h.slice(7).trim().replace(/^"|"$/g, '') === EXPECTED_TOKEN;
}

// SSRF guard — block private/reserved hosts (mirrors import-from-url).
function isPrivateHost(hostname) {
  const h = (hostname || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(10|127)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;            // link-local / metadata
  if (/^(100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(h)) return true; // CGNAT
  if (h === '0.0.0.0' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

function assertFetchable(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed.');
  if (isPrivateHost(u.hostname)) throw new Error('Refusing to render a private/reserved host.');
  return u;
}

// The DOM walk runs in the page; it has no access to Node scope.
function extractBoxTree() {
  const textBoxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    textBoxes.push({
      text,
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      width: r.width,
      height: r.height,
      fontSizePx: parseFloat(cs.fontSize) || r.height,
      fontWeight: Number(cs.fontWeight) || undefined,
      fontFamily: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim() || undefined,
      color: cs.color || undefined,
      italic: cs.fontStyle === 'italic' || undefined,
    });
  }
  const imageBoxes = Array.from(document.images)
    .map((img) => {
      const r = img.getBoundingClientRect();
      return { src: img.currentSrc || img.src, x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    })
    .filter((b) => b.width > 0 && b.height > 0 && b.src);

  return {
    pageWidthPx: Math.max(document.documentElement.scrollWidth, window.innerWidth),
    pageHeightPx: Math.max(document.documentElement.scrollHeight, window.innerHeight),
    textBoxes,
    imageBoxes,
    background: getComputedStyle(document.body).backgroundColor,
  };
}

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) browserPromise = chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return browserPromise;
}

app.get(['/health', '/healthz'], (_req, res) => res.type('text/plain').send('ok'));

app.post('/render', async (req, res) => {
  if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });

  const { html, css, url } = req.body || {};
  const width = Math.min(MAX_DIM, Math.max(320, Number(req.body?.width) || 1280));
  const height = Math.min(MAX_DIM, Math.max(320, Number(req.body?.height) || 1600));
  const fullPage = req.body?.fullPage !== false;

  if (!url && (typeof html !== 'string' || !html.trim())) {
    return res.status(400).json({ error: 'Provide `html` or `url`.' });
  }

  let context;
  try {
    if (url) assertFetchable(url);
    const browser = await getBrowser();
    context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, javaScriptEnabled: true });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle' });
    } else {
      const doc = css ? html.replace('</head>', `<style>${css}</style></head>`) : html;
      const full = /<html[\s>]/i.test(doc) ? doc : `<!doctype html><html><head><meta charset="utf-8"></head><body>${doc}</body></html>`;
      await page.setContent(full, { waitUntil: 'networkidle' });
    }

    const boxTree = await page.evaluate(extractBoxTree);
    const shot = await page.screenshot({ fullPage, type: 'png' });

    return res.json({
      raster: shot.toString('base64'),
      boxTree,
      pageWidthPx: boxTree.pageWidthPx,
      pageHeightPx: boxTree.pageHeightPx,
    });
  } catch (err) {
    return res.status(500).json({ error: `render_failed: ${err && err.message ? err.message : String(err)}` });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => console.log(`render-source listening on :${port}`));

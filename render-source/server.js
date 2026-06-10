/**
 * render-source — headless render microservice (plan WS1 §3.2).
 *
 * Renders to a screenshot + a DOM box tree (computed positions/styles in CSS px),
 * which the client grounds into a GroundedReference and reconstructs through the
 * existing `screenshot_to_block` pipeline. Supports all four code tiers:
 *
 *   C1 html/css   → { html, css? }            setContent
 *   C2 live url   → { url }                    goto (SSRF-guarded)
 *   C3 react/jsx  → { jsx, entry? }            Babel-standalone harness (React via CDN)
 *   C4 repo/zip   → { zipBase64, buildCmd? }   extract → (optional sandboxed build) → static serve
 *
 *   POST /render   Authorization: Bearer <RENDER_SOURCE_TOKEN>
 *   GET  /healthz  → 200 "ok"
 *
 * C4 build execution runs untrusted code; it is OFF unless RENDER_SOURCE_ALLOW_BUILD=1
 * (so the default safely serves static/exported zips only). Deploy build-enabled
 * instances on an isolated, egress-restricted sandbox.
 */
const express = require('express');
const { chromium } = require('playwright');
const AdmZip = require('adm-zip');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: process.env.MAX_BODY || '60mb' }));

const EXPECTED_TOKEN = (process.env.RENDER_SOURCE_TOKEN || '').trim().replace(/^"|"$/g, '');
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 20000);
const MAX_DIM = 4000;
const ALLOW_BUILD = process.env.RENDER_SOURCE_ALLOW_BUILD === '1';
const MAX_UNZIP_BYTES = Number(process.env.MAX_UNZIP_BYTES || 200 * 1024 * 1024);
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 180000);

// id → absolute static dir, served at /__build/:id for C4 renders.
const buildDirs = new Map();

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
  if (/^169\.254\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === '0.0.0.0' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

function assertFetchable(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed.');
  if (isPrivateHost(u.hostname)) throw new Error('Refusing to render a private/reserved host.');
  return u;
}

// ── C3: wrap a single-file React/JSX component in a self-mounting HTML harness ──
// React + Babel load from a CDN; imports are stripped (globals provided) and the
// default/`App` export is mounted. Handles the common single-component case.
function jsxToHarness(jsx, entryName) {
  let src = String(jsx || '');
  src = src.replace(/^\s*import\s+[^\n;]+;?\s*$/gm, '');            // drop imports
  src = src.replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/, 'window.__default = function $1');
  src = src.replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/, 'window.__default = class $1');
  src = src.replace(/export\s+default\s+/, 'window.__default = ');
  src = src.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 '); // drop named-export kw
  const pick = entryName
    ? `(typeof ${entryName} !== 'undefined' ? ${entryName} : window.__default)`
    : `(window.__default || (typeof App !== 'undefined' ? App : null))`;
  return `<!doctype html><html><head><meta charset="utf-8">
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
<style>body{margin:0}</style></head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
${src}
;(function(){
  try {
    var C = ${pick};
    var el = document.getElementById('root');
    if (!C) { el.innerHTML = '<pre>render-source: no default export or &lt;App/&gt; found</pre>'; return; }
    ReactDOM.createRoot(el).render(React.createElement(C));
  } catch (e) {
    document.getElementById('root').innerHTML = '<pre>render-source JSX error: ' + (e && e.message) + '</pre>';
  }
})();
</script></body></html>`;
}

// ── C4: extract a zip, optionally build, return a static dir to serve ──
function extractZip(b64, destRoot) {
  const zip = new AdmZip(Buffer.from(b64, 'base64'));
  let total = 0;
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    total += e.header.size;
    if (total > MAX_UNZIP_BYTES) throw new Error('zip too large when expanded');
    const out = path.resolve(destRoot, e.entryName);
    if (out !== destRoot && !out.startsWith(destRoot + path.sep)) throw new Error('unsafe zip entry path');
  }
  zip.extractAllTo(destRoot, true);
}

function findServeDir(root) {
  for (const d of ['dist', 'build', 'out', 'public']) {
    if (fs.existsSync(path.join(root, d, 'index.html'))) return path.join(root, d);
  }
  if (fs.existsSync(path.join(root, 'index.html'))) return root;
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    try { if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.html'))) return p; } catch { /* ignore */ }
  }
  return null;
}

function prepareZipServe(b64, id) {
  const root = path.join(os.tmpdir(), 'render-source', id);
  fs.mkdirSync(root, { recursive: true });
  extractZip(b64, root);
  let serveDir = findServeDir(root);
  if (!serveDir && ALLOW_BUILD && fs.existsSync(path.join(root, 'package.json'))) {
    execSync('npm install --no-audit --no-fund', { cwd: root, timeout: BUILD_TIMEOUT_MS, stdio: 'ignore' });
    try { execSync('npm run build', { cwd: root, timeout: BUILD_TIMEOUT_MS, stdio: 'ignore' }); } catch { /* build script may not exist */ }
    serveDir = findServeDir(root);
  }
  if (!serveDir) {
    throw new Error(ALLOW_BUILD
      ? 'No index.html found after build.'
      : 'No index.html found (static zip expected; set RENDER_SOURCE_ALLOW_BUILD=1 to build projects).');
  }
  buildDirs.set(id, serveDir);
  return { root };
}

// DOM walk — runs in the page; no Node scope.
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

const PORT = Number(process.env.PORT || 8080);

app.get(['/health', '/healthz'], (_req, res) => res.type('text/plain').send('ok'));

// Static host for C4 builds.
app.use('/__build/:id', (req, res, next) => {
  const dir = buildDirs.get(req.params.id);
  if (!dir) return res.status(404).end();
  return express.static(dir, { index: 'index.html' })(req, res, next);
});

app.post('/render', async (req, res) => {
  if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });

  const { html, css, url, jsx, entry, zipBase64 } = req.body || {};
  const width = Math.min(MAX_DIM, Math.max(320, Number(req.body?.width) || 1280));
  const height = Math.min(MAX_DIM, Math.max(320, Number(req.body?.height) || 1600));
  const fullPage = req.body?.fullPage !== false;

  if (!url && !jsx && !zipBase64 && (typeof html !== 'string' || !html.trim())) {
    return res.status(400).json({ error: 'Provide `html`, `url`, `jsx`, or `zipBase64`.' });
  }

  let context;
  let zipId;
  let zipPrep;
  try {
    if (url) assertFetchable(url);
    if (zipBase64) { zipId = crypto.randomUUID(); zipPrep = prepareZipServe(zipBase64, zipId); }

    const browser = await getBrowser();
    context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, javaScriptEnabled: true });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle' });
    } else if (zipBase64) {
      await page.goto(`http://127.0.0.1:${PORT}/__build/${zipId}/`, { waitUntil: 'networkidle' });
    } else if (jsx) {
      await page.setContent(jsxToHarness(jsx, entry), { waitUntil: 'networkidle' });
      await page.waitForFunction(
        () => { const r = document.getElementById('root'); return r && r.children.length > 0; },
        { timeout: 10000 },
      ).catch(() => { /* render anyway */ });
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
    if (zipId) buildDirs.delete(zipId);
    if (zipPrep) { try { fs.rmSync(zipPrep.root, { recursive: true, force: true }); } catch { /* ignore */ } }
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`render-source listening on :${PORT} (build ${ALLOW_BUILD ? 'enabled' : 'disabled'})`));

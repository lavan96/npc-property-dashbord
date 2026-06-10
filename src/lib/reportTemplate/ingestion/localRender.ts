/**
 * Local (in-browser) code rendering — the zero-infrastructure fallback for
 * `render-source`.
 *
 * The premium path renders code uploads in a headless-Chromium microservice
 * (real screenshot + DOM box tree). When that service is not configured
 * (`RENDER_SOURCE_URL`/`RENDER_SOURCE_TOKEN` secrets unset), every code import
 * failed with "Raw-codebase rendering is not configured on this deployment."
 *
 * This module renders the SAME inputs in a sandboxed iframe in the user's own
 * browser instead:
 *   C1 html/css   → composed document
 *   C3 jsx/tsx    → the same React+Babel+Tailwind harness the service uses
 *   C4 static zip → unpacked client-side, assets rewritten to data: URLs
 *   C2 live URL   → NOT possible client-side (cross-origin) — clear guidance
 *
 * The iframe runs with `sandbox="allow-scripts"` only (opaque origin: pasted
 * code cannot touch the app origin, storage, or cookies). A collector script
 * inside the frame measures the DOM (same extractBoxTree contract as the
 * service) and screenshots via html2canvas, then posts the payload to the
 * parent. Output shape matches the `render-source` response exactly, so the
 * downstream CDIR pipeline is unchanged.
 */
import type { CodeRenderInput } from './codeIngest';
import { listZipEntries, readZipEntry, type ZipEntry } from './makeImport';

// ─── pure helpers (unit-tested) ────────────────────────────────────────────────

/** Does an invoke result mean "the render service is not configured"? */
export function isRenderSourceUnconfigured(result: { data?: any; error?: { message?: string } | null }): boolean {
  if (result?.data?.code === 'render_source_unconfigured') return true;
  return /raw-codebase rendering is not configured/i.test(String(result?.error?.message ?? ''));
}

export const URL_NEEDS_SERVICE_GUIDANCE =
  'Rendering a live URL requires the render service, which is not configured on this deployment '
  + '(set the RENDER_SOURCE_URL and RENDER_SOURCE_TOKEN secrets and deploy the render-source container). '
  + 'Meanwhile you can paste the page’s HTML, upload the exported project ZIP, or import a PDF/screenshot of it.';

export const ZIP_NEEDS_BUILD_GUIDANCE =
  'This project ZIP has no prebuilt index.html, and building it requires the render service '
  + '(not configured on this deployment). Upload the built output (dist/build folder) as a ZIP instead.';

/** Resolve `ref` (e.g. "./img/a.png", "../x.css") against the directory of `fromPath`. */
export function resolveRelativePath(fromPath: string, ref: string): string {
  const clean = ref.replace(/^\.\//, '');
  const baseParts = fromPath.split('/').slice(0, -1);
  const parts = [...baseParts];
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

export function mimeForPath(path: string): string {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  return {
    html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
    json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
    ttf: 'font/ttf', otf: 'font/otf',
  }[ext] ?? 'application/octet-stream';
}

/** Pick the entry html of a static export (mirrors the service's findServeDir). */
export function pickZipIndexHtml(paths: string[]): string | null {
  const lower = paths.map((p) => p.toLowerCase());
  for (const dir of ['dist/', 'build/', 'out/', 'public/', '']) {
    const idx = lower.indexOf(`${dir}index.html`);
    if (idx >= 0) return paths[idx];
  }
  // Any index.html one level deep (project-name/index.html).
  const nested = lower.findIndex((p) => /^[^/]+\/index\.html$/.test(p));
  return nested >= 0 ? paths[nested] : null;
}

/** Rewrite url(...) references inside CSS through `urlFor(resolvedPath)`. */
export function rewriteCssUrls(css: string, fromPath: string, urlFor: (path: string) => string | null): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, ref) => {
    if (/^(data:|blob:|https?:|\/\/)/i.test(ref)) return full;
    const mapped = urlFor(resolveRelativePath(fromPath, ref));
    return mapped ? `url(${quote}${mapped}${quote})` : full;
  });
}

/** Rewrite src/href references in HTML through `urlFor(resolvedPath)`. */
export function rewriteHtmlAssetRefs(html: string, fromPath: string, urlFor: (path: string) => string | null): string {
  return html.replace(/(src|href)=(["'])([^"']+)\2/gi, (full, attr, quote, ref) => {
    if (/^(data:|blob:|https?:|\/\/|#|mailto:)/i.test(ref)) return full;
    const mapped = urlFor(resolveRelativePath(fromPath, ref.split(/[?#]/)[0]));
    return mapped ? `${attr}=${quote}${mapped}${quote}` : full;
  });
}

/** Unicode-safe base64 for embedding source in the harness. */
export function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

/** Compose a full HTML document from a fragment + optional CSS. */
export function buildHtmlDocument(html: string, css?: string): string {
  const doc = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  return css ? doc.replace(/<\/head>/i, `<style>${css}</style></head>`) : doc;
}

/**
 * Single-file React/JSX harness — client twin of the render-source service's
 * `jsxToHarness` (React + Babel `isTSX` transform + Tailwind CDN + hooks
 * globals + base64 source transport).
 */
export function buildJsxHarness(jsx: string, entryName?: string): string {
  let src = String(jsx || '');
  src = src.replace(/^\s*import\s+[^\n;]+;?\s*$/gm, '');
  src = src.replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/, 'window.__default = function $1');
  src = src.replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/, 'window.__default = class $1');
  src = src.replace(/export\s+default\s+/, 'window.__default = ');
  src = src.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');
  const pick = entryName
    ? `(typeof ${entryName} !== 'undefined' ? ${entryName} : window.__default)`
    : `(window.__default || (typeof App !== 'undefined' ? App : null))`;
  const mount = `
;(function(){
  try {
    var C = ${pick};
    var el = document.getElementById('root');
    if (!C) { el.innerHTML = '<pre>local-render: no default export or App component found</pre>'; return; }
    ReactDOM.createRoot(el).render(React.createElement(C));
  } catch (e) {
    document.getElementById('root').innerHTML = '<pre>local-render JSX error: ' + (e && e.message) + '</pre>';
  }
})();`;
  const sourceB64 = toBase64Utf8(src + mount);
  return `<!doctype html><html><head><meta charset="utf-8">
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0}</style></head><body><div id="root"></div>
<script>
(function(){
  var R = window.React || {};
  ['useState','useEffect','useRef','useCallback','useMemo','useReducer','useContext',
   'useLayoutEffect','useId','useTransition','useSyncExternalStore','useImperativeHandle',
   'Fragment','createContext','forwardRef','memo','createElement','cloneElement','Children'
  ].forEach(function(k){ if (R[k] !== undefined && window[k] === undefined) window[k] = R[k]; });
  try {
    var bytes = Uint8Array.from(atob('${sourceB64}'), function(c){ return c.charCodeAt(0); });
    var code = new TextDecoder().decode(bytes);
    var out = Babel.transform(code, {
      filename: 'component.tsx',
      presets: [['typescript', { isTSX: true, allExtensions: true }], 'react'],
    }).code;
    (new Function(out))();
  } catch (e) {
    document.getElementById('root').innerHTML = '<pre>local-render compile error: ' + (e && e.message) + '</pre>';
  }
})();
</script></body></html>`;
}

/**
 * The collector that runs INSIDE the sandboxed frame: waits for fonts/React,
 * measures the DOM (same box-tree contract as the render-source service),
 * screenshots with html2canvas, and posts the payload to the parent.
 */
export function buildCollectorScript(nonce: string, opts: { waitForRoot?: boolean } = {}): string {
  return `
<script src="https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<script>
(function(){
  var NONCE = ${JSON.stringify(nonce)};
  function post(payload){ parent.postMessage({ __localRender: NONCE, payload: payload }, '*'); }
  function postError(message){ parent.postMessage({ __localRender: NONCE, error: String(message || 'local render failed') }, '*'); }

  var TRANSPARENT = /^(transparent|rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\))$/i;
  function extractBoxTree() {
    var opacityCache = new Map();
    function effectiveOpacity(el){
      var node = el, acc = 1, pending = [];
      while (node && node !== document.documentElement) {
        if (opacityCache.has(node)) { acc = opacityCache.get(node); break; }
        pending.push(node);
        node = node.parentElement;
      }
      for (var i = pending.length - 1; i >= 0; i--) {
        var own = Number(getComputedStyle(pending[i]).opacity);
        acc *= isFinite(own) ? own : 1;
        opacityCache.set(pending[i], acc);
      }
      return acc;
    }
    function paintedTextColor(el, cs){
      function isT(v){ return !v || TRANSPARENT.test(v); }
      if (!isT(cs.color)) return cs.color;
      var fill = cs.webkitTextFillColor;
      if (fill && !isT(fill)) return fill;
      var node = el;
      while (node && node !== document.documentElement) {
        var ncs = getComputedStyle(node);
        var bgImage = ncs.backgroundImage || '';
        if (/gradient\\(/.test(bgImage)) {
          var stop = /(?:rgba?\\([^)]*\\)|#[0-9a-f]{3,8})/i.exec(bgImage);
          if (stop) return stop[0];
        }
        if (!isT(ncs.color)) return ncs.color;
        node = node.parentElement;
      }
      return undefined;
    }
    function radiusPx(cs, r){
      var raw = cs.borderTopLeftRadius || '0px';
      var v = parseFloat(raw) || 0;
      if (/%$/.test(raw.trim())) return Math.min(r.width, r.height) * (v / 100);
      return Math.min(v, Math.min(r.width, r.height) / 2);
    }
    function blurPx(cs){
      var m = /blur\\(\\s*([\\d.]+)px\\s*\\)/.exec(cs.filter || '');
      return m ? Number(m[1]) : undefined;
    }
    var textBoxes = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = (node.nodeValue || '').replace(/\\s+/g, ' ').trim();
      if (!text) continue;
      var el = node.parentElement;
      if (!el) continue;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      var opacity = effectiveOpacity(el);
      if (opacity < 0.02) continue;
      var range = document.createRange();
      range.selectNodeContents(node);
      var r = range.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      var fontSizePx = parseFloat(cs.fontSize) || r.height;
      textBoxes.push({
        text: text,
        x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height,
        fontSizePx: fontSizePx,
        lineHeightPx: cs.lineHeight && cs.lineHeight !== 'normal' ? parseFloat(cs.lineHeight) || undefined : undefined,
        fontWeight: Number(cs.fontWeight) || undefined,
        fontFamily: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim() || undefined,
        color: paintedTextColor(el, cs),
        italic: cs.fontStyle === 'italic' || undefined,
        letterSpacingPx: cs.letterSpacing && cs.letterSpacing !== 'normal' ? parseFloat(cs.letterSpacing) || undefined : undefined,
        textAlign: ['center', 'right', 'justify'].indexOf(cs.textAlign) >= 0 ? cs.textAlign : undefined,
        opacity: opacity < 0.996 ? Math.round(opacity * 1000) / 1000 : undefined,
      });
    }
    var shapeBoxes = [];
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length && shapeBoxes.length < 400; i++) {
      var sEl = all[i];
      if (sEl.tagName === 'IMG' || sEl.tagName === 'SCRIPT' || sEl.tagName === 'STYLE') continue;
      var scs = getComputedStyle(sEl);
      if (scs.visibility === 'hidden' || scs.display === 'none') continue;
      var sOpacity = effectiveOpacity(sEl);
      if (sOpacity < 0.02) continue;
      var bg = scs.backgroundColor || '';
      var bgImage = scs.backgroundImage && scs.backgroundImage !== 'none' ? scs.backgroundImage : '';
      var bw = parseFloat(scs.borderTopWidth) || 0;
      var borderColor = scs.borderTopColor || '';
      var hasBg = bg && !TRANSPARENT.test(bg);
      var hasBorder = bw > 0 && borderColor && !TRANSPARENT.test(borderColor) && scs.borderTopStyle !== 'none';
      var hasGradient = /gradient\\(/.test(bgImage);
      if (!hasBg && !hasBorder && !hasGradient) continue;
      var sr = sEl.getBoundingClientRect();
      if (sr.width < 4 || sr.height < 1) continue;
      shapeBoxes.push({
        x: sr.left + window.scrollX, y: sr.top + window.scrollY, width: sr.width, height: sr.height,
        backgroundColor: hasBg ? bg : undefined,
        gradient: hasGradient ? bgImage : undefined,
        borderColor: hasBorder ? borderColor : undefined,
        borderWidthPx: hasBorder ? bw : undefined,
        borderRadiusPx: radiusPx(scs, sr),
        blurPx: blurPx(scs),
        boxShadow: scs.boxShadow && scs.boxShadow !== 'none' ? scs.boxShadow : undefined,
        opacity: sOpacity < 0.996 ? Math.round(sOpacity * 1000) / 1000 : undefined,
        domOrder: i,
      });
    }
    var imageBoxes = [];
    for (var j = 0; j < document.images.length; j++) {
      var img = document.images[j];
      var ir = img.getBoundingClientRect();
      var srcUrl = img.currentSrc || img.src;
      if (ir.width > 0 && ir.height > 0 && srcUrl && !/^blob:/.test(srcUrl)) {
        imageBoxes.push({ src: srcUrl, x: ir.left + window.scrollX, y: ir.top + window.scrollY, width: ir.width, height: ir.height });
      }
    }
    var fonts = [], palette = [];
    function pushUnique(arr, v, cap){ if (v && arr.indexOf(v) < 0 && arr.length < cap) arr.push(v); }
    textBoxes.forEach(function(t){ pushUnique(fonts, t.fontFamily, 8); pushUnique(palette, t.color, 16); });
    shapeBoxes.forEach(function(s){ pushUnique(palette, s.backgroundColor, 16); pushUnique(palette, s.borderColor, 16); });
    return {
      pageWidthPx: Math.max(document.documentElement.scrollWidth, window.innerWidth),
      pageHeightPx: Math.max(document.documentElement.scrollHeight, window.innerHeight),
      textBoxes: textBoxes,
      shapeBoxes: shapeBoxes,
      imageBoxes: imageBoxes,
      background: getComputedStyle(document.body).backgroundColor,
      fonts: fonts,
      palette: palette,
    };
  }

  function waitForRoot(timeoutMs){
    return new Promise(function(resolve){
      ${opts.waitForRoot ? '' : 'return resolve();'}
      var started = Date.now();
      (function check(){
        var root = document.getElementById('root');
        if (root && root.children.length > 0) return resolve();
        if (Date.now() - started > timeoutMs) return resolve();
        setTimeout(check, 150);
      })();
    });
  }

  function settle(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  window.addEventListener('load', function(){
    Promise.resolve()
      .then(function(){ return waitForRoot(15000); })
      .then(function(){ return (document.fonts && document.fonts.ready) || Promise.resolve(); })
      .then(function(){ return settle(350); })
      .then(function(){
        var boxTree = extractBoxTree();
        var done = function(raster){
          post({ raster: raster, boxTree: boxTree, pageWidthPx: boxTree.pageWidthPx, pageHeightPx: boxTree.pageHeightPx });
        };
        if (typeof html2canvas !== 'function') return done(null);
        html2canvas(document.body, {
          useCORS: true,
          backgroundColor: null,
          width: boxTree.pageWidthPx,
          height: boxTree.pageHeightPx,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          scale: 1,
          logging: false,
        }).then(function(canvas){
          try { done(canvas.toDataURL('image/png')); }
          catch (e) { done(null); /* tainted canvas — box tree still drives the import */ }
        }).catch(function(){ done(null); });
      })
      .catch(function(e){ postError(e && e.message); });
  });
})();
</script>`;
}

/** Inject the collector before </body> (or append when no closing tag exists). */
export function injectCollector(doc: string, collector: string): string {
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${collector}</body>`) : doc + collector;
}

// ─── impure orchestration ──────────────────────────────────────────────────────

interface LocalRenderPayload {
  raster: string;
  boxTree: unknown;
  pageWidthPx: number;
  pageHeightPx: number;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Synthesize a flat raster when html2canvas could not produce one. */
function synthesizeRaster(width: number, height: number, background?: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(4000, Math.round(width)));
  canvas.height = Math.max(1, Math.min(8000, Math.round(height)));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = background && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/i.test(background) ? background : '#ffffff';
    try { ctx.fillRect(0, 0, canvas.width, canvas.height); } catch { /* invalid colour string */ }
  }
  return canvas.toDataURL('image/png');
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

async function buildZipDocument(zipBase64: string): Promise<{ doc: string }> {
  const bytes = b64ToBytes(zipBase64);
  const entries = listZipEntries(bytes);
  const byPath = new Map<string, ZipEntry>(entries.map((e) => [e.name, e]));
  const indexPath = pickZipIndexHtml(entries.map((e) => e.name));
  if (!indexPath) throw new Error(ZIP_NEEDS_BUILD_GUIDANCE);

  // Assets become data: URLs — the sandboxed frame is an OPAQUE origin, so
  // parent-minted blob: URLs (origin-bound) would be blocked inside it.
  const urlCache = new Map<string, string>();
  const makeUrl = async (path: string): Promise<string | null> => {
    if (urlCache.has(path)) return urlCache.get(path)!;
    const entry = byPath.get(path);
    if (!entry) return null;
    let data = await readZipEntry(bytes, entry);
    if (mimeForPath(path) === 'text/css') {
      // CSS may reference further assets; rewrite its url(...) refs first.
      let css = new TextDecoder().decode(data);
      const refs: string[] = [];
      css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _q, ref) => {
        if (!/^(data:|blob:|https?:|\/\/)/i.test(ref)) refs.push(resolveRelativePath(path, ref));
        return full;
      });
      for (const resolved of refs) await makeUrl(resolved);
      css = rewriteCssUrls(css, path, (p) => urlCache.get(p) ?? null);
      data = new TextEncoder().encode(css);
    }
    const url = `data:${mimeForPath(path)};base64,${bytesToB64(data)}`;
    urlCache.set(path, url);
    return url;
  };

  let html = new TextDecoder().decode(await readZipEntry(bytes, byPath.get(indexPath)!));
  // Resolve every referenced asset up-front (await-able), then rewrite.
  const refs: string[] = [];
  html.replace(/(src|href)=(["'])([^"']+)\2/gi, (full, _a, _q, ref) => {
    if (!/^(data:|blob:|https?:|\/\/|#|mailto:)/i.test(ref)) refs.push(resolveRelativePath(indexPath, ref.split(/[?#]/)[0]));
    return full;
  });
  for (const ref of refs) await makeUrl(ref);
  html = rewriteHtmlAssetRefs(html, indexPath, (p) => urlCache.get(p) ?? null);

  return { doc: html };
}

/**
 * Render a code input locally and return the same payload shape the
 * `render-source` edge function produces.
 */
export async function renderCodeLocally(input: CodeRenderInput): Promise<LocalRenderPayload> {
  if (typeof document === 'undefined') throw new Error('Local rendering requires a browser environment.');
  if (input.url) throw new Error(URL_NEEDS_SERVICE_GUIDANCE);

  let doc: string;
  let waitForRoot = false;
  if (input.zipBase64) {
    doc = (await buildZipDocument(input.zipBase64)).doc;
  } else if (input.jsx) {
    doc = buildJsxHarness(input.jsx, input.entry);
    waitForRoot = true;
  } else if (input.html) {
    doc = buildHtmlDocument(input.html, input.css);
  } else {
    throw new Error('Provide HTML, JSX, or a project zip to render locally.');
  }

  const nonce = crypto.randomUUID();
  doc = injectCollector(doc, buildCollectorScript(nonce, { waitForRoot }));

  const width = Math.max(320, Math.min(4000, input.width ?? 1280));
  const height = Math.max(320, Math.min(4000, input.height ?? 1600));
  const iframe = document.createElement('iframe');
  // allow-scripts WITHOUT allow-same-origin: the pasted code runs in an opaque
  // origin and cannot reach the app origin, its storage, or its cookies.
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${width}px;height:${height}px;border:0;visibility:visible;pointer-events:none;`;
  iframe.srcdoc = doc;

  const timeoutMs = input.zipBase64 || input.jsx ? 75_000 : 35_000;
  try {
    const payload = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Local rendering timed out. If this happens repeatedly, configure the render-source service for server-side rendering.'));
      }, timeoutMs);
      const onMessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || msg.__localRender !== nonce) return;
        cleanup();
        if (msg.error) reject(new Error(`Local rendering failed: ${msg.error}`));
        else resolve(msg.payload);
      };
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
      };
      window.addEventListener('message', onMessage);
      document.body.appendChild(iframe);
    });

    const boxTree: any = payload?.boxTree ?? { pageWidthPx: width, pageHeightPx: height, textBoxes: [] };
    const raster: string = payload?.raster
      || synthesizeRaster(boxTree.pageWidthPx ?? width, boxTree.pageHeightPx ?? height, boxTree.background);
    return {
      raster,
      boxTree,
      pageWidthPx: boxTree.pageWidthPx ?? width,
      pageHeightPx: boxTree.pageHeightPx ?? height,
    };
  } finally {
    iframe.remove();
  }
}

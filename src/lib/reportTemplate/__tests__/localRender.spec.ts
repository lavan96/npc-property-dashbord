/**
 * Local in-browser code rendering — the zero-infrastructure fallback for the
 * render-source microservice. Pure helpers under test; the iframe
 * orchestration itself is browser-only.
 */
import { describe, it, expect } from 'vitest';
import {
  isRenderSourceUnconfigured,
  resolveRelativePath,
  mimeForPath,
  pickZipIndexHtml,
  rewriteCssUrls,
  rewriteHtmlAssetRefs,
  buildHtmlDocument,
  buildJsxHarness,
  buildCollectorScript,
  injectCollector,
  toBase64Utf8,
  URL_NEEDS_SERVICE_GUIDANCE,
} from '../ingestion/localRender';

describe('isRenderSourceUnconfigured', () => {
  it('matches the structured code and the human message', () => {
    expect(isRenderSourceUnconfigured({ data: { code: 'render_source_unconfigured' }, error: null })).toBe(true);
    expect(isRenderSourceUnconfigured({ data: null, error: { message: 'Raw-codebase rendering is not configured on this deployment.' } })).toBe(true);
  });

  it('does not match other failures', () => {
    expect(isRenderSourceUnconfigured({ data: null, error: { message: 'Render timed out.' } })).toBe(false);
    expect(isRenderSourceUnconfigured({ data: { code: 'render_source_auth_misconfigured' }, error: null })).toBe(false);
    expect(isRenderSourceUnconfigured({ data: { raster: 'AAAA' }, error: null })).toBe(false);
  });
});

describe('resolveRelativePath', () => {
  it('resolves ./, ../ and bare refs against the source file directory', () => {
    expect(resolveRelativePath('dist/index.html', './assets/app.css')).toBe('dist/assets/app.css');
    expect(resolveRelativePath('dist/index.html', 'main.js')).toBe('dist/main.js');
    expect(resolveRelativePath('dist/css/app.css', '../img/logo.png')).toBe('dist/img/logo.png');
    expect(resolveRelativePath('index.html', 'styles.css')).toBe('styles.css');
  });
});

describe('pickZipIndexHtml', () => {
  it('prefers built output directories, then root, then one level deep', () => {
    expect(pickZipIndexHtml(['src/x.ts', 'dist/index.html', 'index.html'])).toBe('dist/index.html');
    expect(pickZipIndexHtml(['index.html', 'about.html'])).toBe('index.html');
    expect(pickZipIndexHtml(['my-site/index.html', 'my-site/app.css'])).toBe('my-site/index.html');
    expect(pickZipIndexHtml(['src/main.tsx', 'package.json'])).toBeNull();
  });
});

describe('asset reference rewriting', () => {
  const urls: Record<string, string> = {
    'assets/app.css': 'blob:css',
    'img/logo.png': 'blob:logo',
    'main.js': 'blob:js',
  };
  const urlFor = (p: string) => urls[p] ?? null;

  it('rewrites src/href in HTML, leaving absolute/data/anchor refs alone', () => {
    const html = '<link href="./assets/app.css"><script src="main.js"></script>'
      + '<img src="https://cdn.example/x.png"><a href="#top">top</a><img src="data:image/png;base64,AA">';
    const out = rewriteHtmlAssetRefs(html, 'index.html', urlFor);
    expect(out).toContain('href="blob:css"');
    expect(out).toContain('src="blob:js"');
    expect(out).toContain('https://cdn.example/x.png');
    expect(out).toContain('href="#top"');
    expect(out).toContain('data:image/png;base64,AA');
  });

  it('strips query/hash before resolving', () => {
    const out = rewriteHtmlAssetRefs('<script src="main.js?v=3"></script>', 'index.html', urlFor);
    expect(out).toContain('src="blob:js"');
  });

  it('rewrites url(...) refs in CSS relative to the CSS file', () => {
    const out = rewriteCssUrls("body{background:url('../img/logo.png')} .x{background:url(data:image/png;base64,AA)}", 'assets/app.css', urlFor);
    expect(out).toContain("url('blob:logo')");
    expect(out).toContain('url(data:image/png;base64,AA)');
  });
});

describe('document builders', () => {
  it('wraps fragments and injects css before </head>', () => {
    const doc = buildHtmlDocument('<h1>Hi</h1>', 'h1{color:red}');
    expect(doc).toMatch(/^<!doctype html>/i);
    expect(doc).toContain('<style>h1{color:red}</style></head>');
    const full = buildHtmlDocument('<html><head></head><body>x</body></html>');
    expect(full.match(/<html/gi)).toHaveLength(1);
  });

  it('builds the JSX harness with React/Babel/Tailwind + base64 source transport', () => {
    const harness = buildJsxHarness('export default function App(){ return <h1>Hello</h1>; }');
    expect(harness).toContain('cdn.tailwindcss.com');
    expect(harness).toContain('babel');
    expect(harness).toContain("isTSX: true");
    // Source travels base64-encoded — the raw JSX must not appear verbatim.
    expect(harness).not.toContain('return <h1>Hello</h1>');
    const b64 = toBase64Utf8('window.__default = function App(){ return <h1>Hello</h1>; }');
    expect(typeof b64).toBe('string');
  });

  it('round-trips unicode through toBase64Utf8', () => {
    const b64 = toBase64Utf8('Cloverton · 6 June — ✓');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe('Cloverton · 6 June — ✓');
  });

  it('injects the collector before </body> or appends when absent', () => {
    const collector = buildCollectorScript('nonce-1');
    expect(collector).toContain('html2canvas');
    expect(collector).toContain('nonce-1');
    const withBody = injectCollector('<html><body><p>x</p></body></html>', collector);
    expect(withBody.indexOf('html2canvas')).toBeLessThan(withBody.indexOf('</body>'));
    const noBody = injectCollector('<p>x</p>', collector);
    expect(noBody.endsWith('</script>')).toBe(true);
  });
});

describe('guidance', () => {
  it('URL rendering guidance names the missing configuration and the alternatives', () => {
    expect(URL_NEEDS_SERVICE_GUIDANCE).toMatch(/RENDER_SOURCE_URL/);
    expect(URL_NEEDS_SERVICE_GUIDANCE).toMatch(/ZIP|HTML/i);
  });
});

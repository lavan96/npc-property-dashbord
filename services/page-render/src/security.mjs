/**
 * Pure request validation + SSRF guard for the page-render service.
 * No Playwright here so it can be unit-tested with `node --test`.
 */

/** Block hostnames that resolve to local/private/reserved space. */
export function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '::') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 link-local / ULA
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;       // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                      // multicast / reserved
  }
  return false;
}

/** Validate a navigation target: http(s) only, public host. Throws on reject. */
export function assertPublicHttpUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed');
  if (isPrivateHost(u.hostname)) throw new Error('Refusing to load a private/internal address');
  return u;
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const clampNum = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Clamp render options into safe bounds. */
export function parseOptions(body) {
  const b = body || {};
  return {
    width: clampInt(b.width, 320, 2000, 1280),
    scale: clampNum(b.scale, 1, 3, 2),
    waitMs: clampInt(b.waitMs, 0, 15000, 3000),
    maxHeight: clampInt(b.maxHeight, 600, 20000, 12000),
  };
}

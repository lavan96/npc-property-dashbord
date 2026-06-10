/**
 * Pure helpers for the doc-convert (LibreOffice) service. No child_process here
 * so it can be unit-tested with `node --test`.
 */

// Formats LibreOffice can reliably turn into PDF.
const CONVERTIBLE = new Set([
  'doc', 'docx', 'odt', 'rtf', 'dot', 'dotx', 'wpd', 'fodt',
  'txt', 'csv', 'tsv', 'md',
  'html', 'htm', 'xhtml',
  'ppt', 'pptx', 'odp', 'pps', 'ppsx', 'fodp',
  'xls', 'xlsx', 'ods', 'xlsm', 'fods',
  'epub',
]);

/** Lower-cased extension (no dot) from a filename, or '' if none. */
export function extensionFor(filename) {
  const m = /\.([a-z0-9]+)\s*$/i.exec(String(filename || ''));
  return m ? m[1].toLowerCase() : '';
}

export function isConvertible(ext) {
  return CONVERTIBLE.has(String(ext || '').toLowerCase());
}

/**
 * A safe temp input filename — never uses the user's name in the path (avoids
 * traversal/injection); only a validated short extension is carried over.
 */
export function safeTempName(ext) {
  const e = /^[a-z0-9]{1,8}$/.test(String(ext || '')) ? String(ext).toLowerCase() : 'bin';
  return `in_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${e}`;
}

/** Validate a /convert request body. Returns { ok, ext } or { ok:false, error }. */
export function validateConvertBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Bad request' };
  if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) return { ok: false, error: 'Missing dataBase64' };
  const ext = extensionFor(body.filename);
  if (!ext) return { ok: false, error: 'Missing or unknown file extension' };
  if (!isConvertible(ext)) return { ok: false, error: `Unsupported format “.${ext}” — export to PDF instead` };
  return { ok: true, ext };
}

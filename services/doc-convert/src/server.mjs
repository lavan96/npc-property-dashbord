/**
 * doc-convert — a small LibreOffice-headless "anything → PDF" service.
 *
 * POST /convert  { filename, dataBase64 }  → { dataBase64, contentType: "application/pdf" }
 * GET  /health   → { ok: true }
 *
 * It exists so office docs, RTF, HTML, CSV, Markdown, etc. can be turned into a
 * PDF and run through the existing PDF reconstruction pipeline. Deploy it as its
 * own container (LibreOffice can't run in a Deno edge function) and point the
 * `convert-to-pdf` edge function at it via DOC_CONVERT_URL + DOC_CONVERT_KEY.
 *
 * Security: shared-secret auth; the user's filename is NEVER used in a path
 * (only a validated short extension); soffice is spawned with an argv array (no
 * shell); per-request temp dir + user profile; conversion timeout; body cap.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateConvertBody, safeTempName } from './lib.mjs';

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.DOC_CONVERT_KEY || '';
const SOFFICE = process.env.SOFFICE_BIN || 'soffice';
const CONVERT_TIMEOUT = Number(process.env.CONVERT_TIMEOUT_MS || 90000);
const MAX_BODY = 30 * 1024 * 1024;

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function convert(buf, ext) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'docconv-'));
  const profile = path.join(dir, 'profile');
  const inPath = path.join(dir, safeTempName(ext));
  try {
    await writeFile(inPath, buf);
    await new Promise((resolve, reject) => {
      const args = [
        '--headless', '--nologo', '--nofirststartwizard', '--norestore',
        `-env:UserInstallation=file://${profile}`,
        '--convert-to', 'pdf', '--outdir', dir, inPath,
      ];
      const proc = spawn(SOFFICE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d; });
      const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Conversion timed out')); }, CONVERT_TIMEOUT);
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`soffice exited ${code}: ${stderr.slice(0, 300)}`));
      });
    });
    const files = await readdir(dir);
    const pdf = files.find((f) => f.toLowerCase().endsWith('.pdf'));
    if (!pdf) throw new Error('No PDF was produced');
    return await readFile(path.join(dir, pdf));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || !(req.url || '').startsWith('/convert')) return send(res, 404, { error: 'Not found' });
  if (API_KEY && req.headers['x-convert-key'] !== API_KEY) return send(res, 401, { error: 'Unauthorized' });

  let body = '';
  let aborted = false;
  req.on('data', (c) => { body += c; if (body.length > MAX_BODY) { aborted = true; req.destroy(); } });
  req.on('end', async () => {
    if (aborted) return;
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    const v = validateConvertBody(parsed);
    if (!v.ok) return send(res, 400, { error: v.error });
    let buf;
    try { buf = Buffer.from(parsed.dataBase64, 'base64'); } catch { return send(res, 400, { error: 'Bad base64' }); }
    try {
      const pdf = await convert(buf, v.ext);
      return send(res, 200, { dataBase64: pdf.toString('base64'), contentType: 'application/pdf' });
    } catch (e) {
      return send(res, 400, { error: String(e?.message || e) });
    }
  });
});

server.listen(PORT, () => console.log(`[doc-convert] listening on :${PORT}`));

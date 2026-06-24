// pdf-parse-chunk-callback — per-chunk completion endpoint for the chunked
// Docling pipeline (Wave G). The sidecar's /parse-chunk background task POSTs
// here as each page-range chunk finishes (or fails).
//
// Responsibilities
//   - Authenticate via the shared service token.
//   - Update the matching `pdf_import_chunks` row.
//   - On success: when every chunk for the job is `succeeded`, trigger the
//     finalizer (downloads chunk artifacts, merges into final docling.json /
//     document.md / outline.json / rasters.json, flips job → succeeded).
//   - On failure: increment attempts and either re-dispatch, split the chunk
//     into smaller spans (page-level fallback at span=1), or mark fatal.
//   - On too many fatal chunks: flip job → recoverable_failed so an operator
//     (or stuck-job recovery) can intervene.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createTokenAuthCorsHeaders } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CALLBACK_TOKEN = Deno.env.get('PDF_PARSE_SERVICE_TOKEN') ?? '';
const PARSE_URL = (Deno.env.get('PDF_PARSE_SERVICE_URL') ?? '').replace(/\/$/, '');
const DIAGNOSTICS_BUCKET = 'pdf-import-diagnostics';
const DOCLING_PAGE_REBASE_VERSION = 'chunk-page-rebase-v1';

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient>;

interface ChunkRow {
  id: string;
  job_id: string;
  parent_chunk_id: string | null;
  chunk_index: number;
  page_start: number;
  page_end: number;
  status: string;
  attempts: number;
  max_attempts: number;
  artifact_paths: Record<string, unknown>;
}

async function appendJobAttempt(admin: Admin, jobId: string, entry: Record<string, unknown>) {
  const enriched = { ...entry, at: new Date().toISOString() };
  const { error } = await admin.rpc('append_pdf_import_attempt', {
    p_job_id: jobId,
    p_attempt: enriched,
  });
  if (!error) return;
  // Fallback: read-modify-write.
  const { data } = await admin.from('pdf_import_jobs').select('attempts').eq('id', jobId).maybeSingle();
  const attempts = Array.isArray((data as any)?.attempts) ? (data as any).attempts : [];
  await admin.from('pdf_import_jobs').update({ attempts: [...attempts, enriched] }).eq('id', jobId);
}

async function resignSourceUrl(admin: Admin, jobId: string): Promise<string | null> {
  const { data: job } = await admin
    .from('pdf_import_jobs')
    .select('plan_payload, request_payload')
    .eq('id', jobId)
    .maybeSingle();
  const plan = (job as any)?.plan_payload ?? {};
  const src = plan?.source ?? {};
  if (src.kind === 'storage' && src.bucket && src.path) {
    const { data, error } = await admin.storage.from(src.bucket).createSignedUrl(src.path, 1200);
    if (error || !data?.signedUrl) {
      console.error('[chunk-callback] re-sign failed', { jobId, error });
      return null;
    }
    return data.signedUrl;
  }
  if (src.kind === 'url' && typeof src.url === 'string') return src.url;
  return null;
}

async function dispatchChunk(admin: Admin, jobId: string, chunk: ChunkRow): Promise<void> {
  if (!PARSE_URL || !CALLBACK_TOKEN) {
    console.error('[chunk-callback] cannot dispatch — PARSE_URL/TOKEN missing');
    return;
  }
  const signedUrl = await resignSourceUrl(admin, jobId);
  if (!signedUrl) {
    await admin.from('pdf_import_chunks').update({
      status: 'fatal',
      error_code: 'source_fetch_error',
      error_text: 'source URL could not be re-signed',
      finished_at: new Date().toISOString(),
    }).eq('id', chunk.id);
    return;
  }
  const { data: job } = await admin
    .from('pdf_import_jobs')
    .select('mode, request_payload')
    .eq('id', jobId)
    .maybeSingle();
  const mode = (job as any)?.mode ?? 'semantic';
  const rp = ((job as any)?.request_payload ?? {}) as Record<string, unknown>;
  await admin.from('pdf_import_chunks').update({
    status: 'dispatched',
    attempts: (chunk.attempts ?? 0) + 1,
    dispatched_at: new Date().toISOString(),
    error_code: null,
    error_text: null,
  }).eq('id', chunk.id);

  const body = {
    job_id: jobId,
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    url: signedUrl,
    mode,
    callback_url: `${SUPABASE_URL}/functions/v1/pdf-parse-chunk-callback`,
    callback_token: CALLBACK_TOKEN,
    enable_picture_description: rp.description_tier !== 'off',
    include_doctags: true,
    include_markdown: rp.include_markdown !== false,
    redact_pii: Boolean(rp.redact_pii),
    raster_dpi: mode === 'pixel_perfect' || mode === 'pixel-perfect' ? 200 : 144,
    raster_format: 'png',
  };
  try {
    const res = await fetch(`${PARSE_URL}/parse-chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CALLBACK_TOKEN}`,
        'X-Request-Id': jobId,
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 202) {
      const text = await res.text().catch(() => '');
      console.error('[chunk-callback] re-dispatch non-202', { jobId, chunkId: chunk.id, status: res.status, text: text.slice(0, 300) });
      await admin.from('pdf_import_chunks').update({
        status: 'failed',
        error_code: `dispatch_http_${res.status}`,
        error_text: text.slice(0, 500),
      }).eq('id', chunk.id);
    }
  } catch (e) {
    console.error('[chunk-callback] re-dispatch exception', e);
    await admin.from('pdf_import_chunks').update({
      status: 'failed',
      error_code: 'dispatch_exception',
      error_text: String((e as Error)?.message ?? e).slice(0, 500),
    }).eq('id', chunk.id);
  }
}

async function nextChunkIndex(admin: Admin, jobId: string): Promise<number> {
  const { data } = await admin
    .from('pdf_import_chunks')
    .select('chunk_index')
    .eq('job_id', jobId)
    .order('chunk_index', { ascending: false })
    .limit(1);
  const max = Array.isArray(data) && data.length ? Number((data[0] as any).chunk_index) || 0 : 0;
  return max + 1;
}

/** Split a failing chunk into smaller spans and dispatch them. */
async function splitChunk(admin: Admin, jobId: string, chunk: ChunkRow): Promise<void> {
  const span = chunk.page_end - chunk.page_start + 1;
  if (span <= 1) {
    // Page-level fallback already failed — give up on this page.
    await admin.from('pdf_import_chunks').update({
      status: 'fatal',
      error_code: 'chunk_retry_exhausted',
      finished_at: new Date().toISOString(),
    }).eq('id', chunk.id);
    return;
  }
  // Split into halves (or single pages when span <= 5).
  const subSpan = span <= 5 ? 1 : Math.max(1, Math.floor(span / 2));
  const ranges: Array<[number, number]> = [];
  for (let s = chunk.page_start; s <= chunk.page_end; s += subSpan) {
    ranges.push([s, Math.min(chunk.page_end, s + subSpan - 1)]);
  }
  let nextIdx = await nextChunkIndex(admin, jobId);
  const newRows = ranges.map(([ps, pe]) => ({
    job_id: jobId,
    parent_chunk_id: chunk.id,
    chunk_index: nextIdx++,
    page_start: ps,
    page_end: pe,
    status: 'pending',
    max_attempts: chunk.max_attempts,
  }));
  const { data: inserted, error } = await admin
    .from('pdf_import_chunks')
    .insert(newRows)
    .select('id, job_id, parent_chunk_id, chunk_index, page_start, page_end, status, attempts, max_attempts, artifact_paths');
  if (error) {
    console.error('[chunk-callback] split insert failed', error);
    await admin.from('pdf_import_chunks').update({
      status: 'fatal',
      error_code: 'chunk_split_failed',
      error_text: error.message,
      finished_at: new Date().toISOString(),
    }).eq('id', chunk.id);
    return;
  }
  await admin.from('pdf_import_chunks').update({
    status: 'split',
    finished_at: new Date().toISOString(),
  }).eq('id', chunk.id);
  await appendJobAttempt(admin, jobId, {
    kind: 'split',
    parent_chunk_id: chunk.id,
    new_chunks: (inserted ?? []).length,
  });
  for (const row of inserted as ChunkRow[] ?? []) {
    await dispatchChunk(admin, jobId, row);
  }
}

async function downloadJson(admin: Admin, path: string): Promise<any | null> {
  const objectPath = path.startsWith(`${DIAGNOSTICS_BUCKET}/`) ? path.slice(DIAGNOSTICS_BUCKET.length + 1) : path;
  const { data, error } = await admin.storage.from(DIAGNOSTICS_BUCKET).download(objectPath);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function downloadText(admin: Admin, path: string): Promise<string | null> {
  const objectPath = path.startsWith(`${DIAGNOSTICS_BUCKET}/`) ? path.slice(DIAGNOSTICS_BUCKET.length + 1) : path;
  const { data, error } = await admin.storage.from(DIAGNOSTICS_BUCKET).download(objectPath);
  if (error || !data) return null;
  return await data.text();
}

async function uploadJson(admin: Admin, path: string, body: unknown): Promise<string | null> {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const { error } = await admin.storage.from(DIAGNOSTICS_BUCKET).upload(path, bytes, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) {
    console.error('[chunk-callback] upload json failed', { path, error });
    return null;
  }
  return path;
}

async function uploadText(admin: Admin, path: string, body: string, contentType: string): Promise<string | null> {
  const { error } = await admin.storage.from(DIAGNOSTICS_BUCKET).upload(path, new TextEncoder().encode(body), {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error('[chunk-callback] upload text failed', { path, error });
    return null;
  }
  return path;
}

/** Merge per-chunk Docling outputs into final artifacts and finalize the job. */
async function finalizeJob(admin: Admin, jobId: string): Promise<void> {
  const startedAt = Date.now();
  await admin.from('pdf_import_jobs').update({
    stage: 'finalizing',
    stage_started_at: new Date(startedAt).toISOString(),
  }).eq('id', jobId);

  const { data: chunkRows, error: chunkErr } = await admin
    .from('pdf_import_chunks')
    .select('id, chunk_index, page_start, page_end, status, artifact_paths, summary')
    .eq('job_id', jobId)
    .neq('status', 'split')
    .order('chunk_index', { ascending: true });
  if (chunkErr || !chunkRows) {
    console.error('[chunk-callback] finalize: chunk fetch failed', chunkErr);
    await admin.from('pdf_import_jobs').update({
      status: 'recoverable_failed',
      stage: 'failed',
      error_code: 'final_merge_failed',
      error_text: chunkErr?.message ?? 'no chunks',
      finished_at: new Date().toISOString(),
    }).eq('id', jobId);
    return;
  }

  // Sanity: every non-split chunk must be succeeded.
  const notDone = chunkRows.filter((c: any) => c.status !== 'succeeded');
  if (notDone.length > 0) {
    console.warn('[chunk-callback] finalize aborted — not all chunks succeeded', { jobId, notDone: notDone.length });
    return;
  }

  // Merge docling.json files in chunk order. Each chunk's pages start at 1
  // locally — we rebase to global page numbers using page_start.
  const mergedDoc: any = {
    schema_name: 'DoclingDocument',
    name: 'merged',
    texts: [],
    tables: [],
    pictures: [],
    pages: {},
  };
  const mergedOutline: any[] = [];
  const pageLanguages: Record<string, string> = {};
  const markdownParts: string[] = [];
  const doctagsParts: string[] = [];
  const rasterPages: any[] = [];
  const chunkRasterManifestPaths: string[] = [];
  const pageRasterPaths: string[] = [];
  const parentRasterManifestPages: any[] = [];
  const chunkExtractorLanes: string[] = [];
  const chunkLaneVersions: string[] = [];
  const chunkEffectiveModes: string[] = [];
  const chunkLanePolicies: any[] = [];
  let totalTextChars = 0;
  let totalOcrChars = 0;
  let totalTableCells = 0;
  let totalPictures = 0;
  let totalTables = 0;
  let totalTexts = 0;
  let pageCount = 0;
  let maxChunkPageEnd = 0;

  for (const c of chunkRows as any[]) {
    maxChunkPageEnd = Math.max(maxChunkPageEnd, Number(c.page_end ?? 0));
    const offset = c.page_start - 1;
    const ap = (c.artifact_paths ?? {}) as Record<string, any>;

    if (typeof ap.extractor_lane === 'string' && ap.extractor_lane.trim()) {
      chunkExtractorLanes.push(ap.extractor_lane.trim());
    }
    if (typeof ap.lane_enforcement_version === 'string' && ap.lane_enforcement_version.trim()) {
      chunkLaneVersions.push(ap.lane_enforcement_version.trim());
    }
    if (typeof ap.effective_mode === 'string' && ap.effective_mode.trim()) {
      chunkEffectiveModes.push(ap.effective_mode.trim());
    }
    if (ap.lane_policy && typeof ap.lane_policy === 'object') {
      chunkLanePolicies.push(ap.lane_policy);
    }

    if (ap.docling_path) {
      const dd = await downloadJson(admin, ap.docling_path);
      if (dd && typeof dd === 'object') {
        const rebaseProv = (node: any) => {
          if (!node) return;
          const provs = node?.prov;
          if (Array.isArray(provs)) {
            for (const p of provs) {
              if (typeof p?.page_no === 'number') p.page_no = p.page_no + offset;
            }
          }
        };
        for (const t of dd.texts ?? []) { rebaseProv(t); mergedDoc.texts.push(t); }
        for (const t of dd.tables ?? []) { rebaseProv(t); mergedDoc.tables.push(t); }
        for (const p of dd.pictures ?? []) { rebaseProv(p); mergedDoc.pictures.push(p); }
        const pages = dd.pages ?? {};
        for (const [k, v] of Object.entries(pages)) {
          const localNo = Number(k);
          const globalNo = localNo + offset;
          const pageValue = v && typeof v === 'object'
            ? { ...(v as Record<string, unknown>), page_no: globalNo }
            : v;
          (mergedDoc.pages as any)[String(globalNo)] = pageValue;
          if (globalNo > pageCount) pageCount = globalNo;
        }
      }
    }
    if (ap.outline_path) {
      const outlinePayload = await downloadJson(admin, ap.outline_path);
      const outline = outlinePayload?.outline ?? [];
      for (const entry of outline) {
        if (entry && typeof entry.page_no === 'number') entry.page_no = entry.page_no + offset;
        mergedOutline.push(entry);
      }
      const langs = outlinePayload?.page_languages ?? {};
      for (const [k, v] of Object.entries(langs)) {
        const globalNo = Number(k) + offset;
        pageLanguages[String(globalNo)] = String(v);
      }
    }
    if (ap.markdown_path) {
      const md = await downloadText(admin, ap.markdown_path);
      if (md) markdownParts.push(`<!-- pages ${c.page_start}-${c.page_end} -->\n${md}`);
    }
    if (ap.doctags_path) {
      const dt = await downloadText(admin, ap.doctags_path);
      if (dt) doctagsParts.push(`<!-- pages ${c.page_start}-${c.page_end} -->\n${dt}`);
    }
    if (ap.rasters_path) {
      const rj = await downloadJson(admin, ap.rasters_path);
      if (rj?.pages && Array.isArray(rj.pages)) {
        for (const p of rj.pages) {
          rasterPages.push({
            page_no: typeof p.global_page_no === 'number' ? p.global_page_no : (Number(p.page_no) + offset),
            width: p.width,
            height: p.height,
            image_base64: p.image_base64,
          });
        }
      }
    }

    if (ap.rasters_manifest_path) {
      chunkRasterManifestPaths.push(ap.rasters_manifest_path);
      const manifest = await downloadJson(admin, ap.rasters_manifest_path);
      if (manifest?.pages && Array.isArray(manifest.pages)) {
        for (const page of manifest.pages) {
          const localPageNo = Number(page.page_no ?? 0);
          const globalPageNo = typeof page.global_page_no === 'number'
            ? page.global_page_no
            : localPageNo + offset;

          if (typeof page.path === 'string' && page.path) {
            pageRasterPaths.push(page.path);
          }

          parentRasterManifestPages.push({
            page_no: globalPageNo,
            source_chunk_index: c.chunk_index,
            source_chunk_page_no: localPageNo || null,
            width: page.width ?? null,
            height: page.height ?? null,
            path: page.path ?? null,
            mime: page.mime ?? 'image/png',
            bytes: page.bytes ?? null,
          });
        }
      }
    }

    const chunkPageRasterPaths = Array.isArray((ap as any).page_raster_paths)
      ? ((ap as any).page_raster_paths as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    for (const path of chunkPageRasterPaths) {
      if (!pageRasterPaths.includes(path)) pageRasterPaths.push(path);
    }
    const s = (c.summary ?? {}) as any;
    totalTextChars += Number(s.text_chars ?? 0);
    totalOcrChars += Number(s.ocr_chars ?? 0);
    totalTableCells += Number(s.table_cell_count ?? 0);
    totalPictures += Number(s.picture_count ?? 0);
    totalTables += Number(s.table_count ?? 0);
    totalTexts += Number(s.text_block_count ?? 0);
  }

  const summary = {
    text_chars: totalTextChars,
    ocr_chars: totalOcrChars,
    table_count: totalTables,
    table_cell_count: totalTableCells,
    picture_count: totalPictures,
    text_block_count: totalTexts,
    chunked: true,
    chunk_count: chunkRows.length,
  };
  (mergedDoc as any).summary = summary;

  const doclingPath = await uploadJson(admin, `${jobId}/docling.json`, mergedDoc);
  const outlinePath = await uploadJson(admin, `${jobId}/outline.json`, { outline: mergedOutline, page_languages: pageLanguages });
  const markdownPath = markdownParts.length
    ? await uploadText(admin, `${jobId}/document.md`, markdownParts.join('\n\n'), 'text/markdown')
    : null;
  const doctagsPath = doctagsParts.length
    ? await uploadText(admin, `${jobId}/doctags.md`, doctagsParts.join('\n\n'), 'text/markdown')
    : null;
  const rastersPath = rasterPages.length
    ? await uploadJson(admin, `${jobId}/rasters.json`, { format: 'png', pages: rasterPages })
    : null;

  parentRasterManifestPages.sort((a, b) => Number(a.page_no ?? 0) - Number(b.page_no ?? 0));
  const rasterManifestMaxPage = parentRasterManifestPages.reduce((max, page) => {
    const pageNo = Number(page?.page_no ?? 0);
    return Number.isFinite(pageNo) ? Math.max(max, pageNo) : max;
  }, 0);
  const finalPageCount = Math.max(
    pageCount,
    maxChunkPageEnd,
    rasterManifestMaxPage,
    pageRasterPaths.length,
  );

  const rastersManifestPath = parentRasterManifestPages.length
    ? await uploadJson(admin, `${jobId}/rasters-manifest.json`, {
        version: 'phase3-raster-manifest-v1',
        source: 'chunk-merge',
        page_count: finalPageCount,
        pages: parentRasterManifestPages,
        chunk_raster_manifest_paths: chunkRasterManifestPaths,
      })
    : null;

  if (!doclingPath) {
    await admin.from('pdf_import_jobs').update({
      status: 'recoverable_failed',
      stage: 'failed',
      error_code: 'final_merge_failed',
      error_text: 'failed to upload merged docling.json',
      finished_at: new Date().toISOString(),
    }).eq('id', jobId);
    return;
  }

  const { data: existing } = await admin
    .from('pdf_import_jobs')
    .select('started_at, result_payload, mode, plan_payload')
    .eq('id', jobId)
    .maybeSingle();
  const startedJob = (existing as any)?.started_at ? new Date((existing as any).started_at).getTime() : startedAt;
  const finished = Date.now();
  const prior = ((existing as any)?.result_payload ?? {}) as Record<string, unknown>;
  const planPayload = ((existing as any)?.plan_payload ?? {}) as Record<string, unknown>;

  const parentExtractorLane = String(
    chunkExtractorLanes[0]
      ?? prior.extractor_lane
      ?? planPayload.selected_lane
      ?? planPayload.recommended_lane
      ?? 'unplanned'
  );

  const parentLaneEnforcementVersion = String(
    chunkLaneVersions[0]
      ?? prior.lane_enforcement_version
      ?? 'extractor-lane-policy-v1'
  );

  const parentEffectiveMode = String(
    chunkEffectiveModes[0]
      ?? prior.effective_mode
      ?? planPayload.dispatch_effective_mode
      ?? (existing as any)?.mode
      ?? 'semantic'
  );

  const parentLanePolicy = chunkLanePolicies[0]
    ?? prior.lane_policy
    ?? {
      lane: parentExtractorLane,
      version: parentLaneEnforcementVersion,
      requested_mode: String(planPayload.requested_mode ?? (existing as any)?.mode ?? 'semantic'),
    };

  await admin.from('pdf_import_jobs').update({
    status: 'succeeded',
    stage: 'parsed',
    page_count: finalPageCount,
    pages_total: finalPageCount,
    pages_completed: finalPageCount,
    diagnostics_path: doclingPath,
    callback_received_at: new Date(finished).toISOString(),
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - startedJob,
    result_payload: {
      ...prior,
      chunked: true,
      docling_path: doclingPath,
      outline_path: outlinePath,
      markdown_path: markdownPath,
      doctags_path: doctagsPath,
      rasters_path: rastersPath,
      legacy_rasters_path: rastersPath,
      rasters_manifest_path: rastersManifestPath,
      chunk_raster_manifest_paths: chunkRasterManifestPaths,
      page_raster_paths: pageRasterPaths,
      artifact_contract_version: 'raster-manifest-v1',
      docling_page_rebase_version: DOCLING_PAGE_REBASE_VERSION,
      extractor_lane: parentExtractorLane,
      lane_enforcement_version: parentLaneEnforcementVersion,
      effective_mode: parentEffectiveMode,
      lane_policy: parentLanePolicy,
      page_count: finalPageCount,
      summary: {
        ...summary,
        page_count: finalPageCount,
        docling_page_count: pageCount,
        raster_page_count: pageRasterPaths.length,
      },
    },
  }).eq('id', jobId);
  console.log('[chunk-callback] finalized', { jobId, pageCount: finalPageCount, doclingPageCount: pageCount, rasterPageCount: pageRasterPaths.length, chunks: chunkRows.length });
}

Deno.serve(async (req) => {
  const cors = createTokenAuthCorsHeaders();
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!CALLBACK_TOKEN || token !== CALLBACK_TOKEN) return json({ error: 'unauthorised' }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const operation = String((body as any).operation ?? '');
  const jobId = String((body as any).job_id ?? '');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (operation === 'finalize_job') {
    if (!jobId) return json({ error: 'job_id required' }, 400);
    await finalizeJob(admin, jobId);
    return json({ ok: true, finalized: true, job_id: jobId });
  }
  const chunkId = String((body as any).chunk_id ?? '');
  const chunkIndex = Number((body as any).chunk_index);
  if (!jobId || !chunkId) return json({ error: 'job_id + chunk_id required' }, 400);

  const { data: chunkRow } = await admin
    .from('pdf_import_chunks')
    .select('id, job_id, parent_chunk_id, chunk_index, page_start, page_end, status, attempts, max_attempts, artifact_paths')
    .eq('id', chunkId)
    .maybeSingle();
  if (!chunkRow) return json({ error: 'unknown chunk' }, 404);
  const chunk = chunkRow as ChunkRow;

  const status = (body as any).status === 'failed' ? 'failed' : 'succeeded';
  const now = new Date().toISOString();

  if (status === 'succeeded') {
    const artifacts = { ...(((body as any).artifact_paths ?? {}) as Record<string, unknown>) };
    const summary = ((body as any).summary ?? {}) as Record<string, unknown>;

    const extractorLane = String((body as any).extractor_lane ?? artifacts.extractor_lane ?? '').trim();
    const laneVersion = String((body as any).lane_enforcement_version ?? artifacts.lane_enforcement_version ?? '').trim();
    const effectiveMode = String((body as any).effective_mode ?? artifacts.effective_mode ?? '').trim();
    const lanePolicy = (body as any).lane_policy ?? artifacts.lane_policy ?? null;

    if (extractorLane) artifacts.extractor_lane = extractorLane;
    if (laneVersion) artifacts.lane_enforcement_version = laneVersion;
    if (effectiveMode) artifacts.effective_mode = effectiveMode;
    if (lanePolicy && typeof lanePolicy === 'object') artifacts.lane_policy = lanePolicy;

    await admin.from('pdf_import_chunks').update({
      status: 'succeeded',
      artifact_paths: artifacts,
      summary,
      finished_at: now,
      duration_ms: Number((body as any).duration_ms) || null,
      error_code: null,
      error_text: null,
    }).eq('id', chunkId);
    await appendJobAttempt(admin, jobId, {
      kind: 'chunk_succeeded',
      chunk_id: chunkId,
      chunk_index: chunkIndex,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
    });

    // Check if every chunk for the job is done; if so → finalize.
    const { data: remaining } = await admin
      .from('pdf_import_chunks')
      .select('id, status')
      .eq('job_id', jobId);
    const all = remaining as any[] ?? [];
    const stillRunning = all.some((c) => !['succeeded', 'fatal', 'split'].includes(c.status));
    const anyFatal = all.some((c) => c.status === 'fatal');
    const allDone = all.length > 0 && !stillRunning;
    if (allDone) {
      if (anyFatal) {
        await admin.from('pdf_import_jobs').update({
          status: 'recoverable_failed',
          stage: 'failed',
          error_code: 'chunk_retry_exhausted',
          error_text: 'one or more chunks gave up after page-level fallback',
          finished_at: now,
        }).eq('id', jobId);
      } else {
        await finalizeJob(admin, jobId);
      }
    }
    return json({ ok: true, finalized: allDone && !anyFatal });
  }

  // ---- Failure path: retry / split / mark fatal ----
  const errorCode = String((body as any).error_code ?? 'chunk_unhandled');
  const message = String((body as any).message ?? '').slice(0, 1000);
  const retryable = (body as any).retryable !== false;
  await admin.from('pdf_import_chunks').update({
    status: 'failed',
    error_code: errorCode,
    error_text: message,
    finished_at: now,
    duration_ms: Number((body as any).duration_ms) || null,
  }).eq('id', chunkId);
  await appendJobAttempt(admin, jobId, {
    kind: 'chunk_failed',
    chunk_id: chunkId,
    chunk_index: chunkIndex,
    error_code: errorCode,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
  });

  const fatalCodes = new Set(['chunk_out_of_range', 'invalid_pdf', 'pdf_too_large', 'callback_upload_not_configured']);
  const span = chunk.page_end - chunk.page_start + 1;

  if (!retryable && !fatalCodes.has(errorCode) && span > 1) {
    // Non-retryable but splittable — try smaller spans before giving up.
    await splitChunk(admin, jobId, chunk);
  } else if (fatalCodes.has(errorCode)) {
    await admin.from('pdf_import_chunks').update({
      status: 'fatal',
    }).eq('id', chunkId);
  } else if ((chunk.attempts ?? 0) + 1 < (chunk.max_attempts ?? 3)) {
    await dispatchChunk(admin, jobId, chunk);
  } else if (span > 1) {
    await splitChunk(admin, jobId, chunk);
  } else {
    await admin.from('pdf_import_chunks').update({
      status: 'fatal',
      error_code: 'chunk_retry_exhausted',
    }).eq('id', chunkId);
  }

  // Re-evaluate completion (a fatal might be the last outstanding chunk).
  const { data: remaining } = await admin
    .from('pdf_import_chunks')
    .select('id, status')
    .eq('job_id', jobId);
  const all = remaining as any[] ?? [];
  const stillRunning = all.some((c) => !['succeeded', 'fatal', 'split'].includes(c.status));
  if (!stillRunning && all.length > 0) {
    const anyFatal = all.some((c) => c.status === 'fatal');
    if (anyFatal) {
      await admin.from('pdf_import_jobs').update({
        status: 'recoverable_failed',
        stage: 'failed',
        error_code: 'chunk_retry_exhausted',
        error_text: 'one or more chunks failed after retry+split',
        finished_at: new Date().toISOString(),
      }).eq('id', jobId);
    } else {
      await finalizeJob(admin, jobId);
    }
  }
  return json({ ok: true });
});

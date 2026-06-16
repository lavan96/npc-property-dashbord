// Template PDF importer.
// Operations: create_import | upload_asset | finalize | resync | get_artifacts | record_review_decision | fail
//
// upload_asset accepts base64 PNG/JPG, stores in `template-import-assets`
// (creates the bucket on first use) and returns the public URL. finalize
// writes the assembled ReportTemplate JSON into `report_templates` via the
// service-role client (RLS-only table), and persists private CDIR/fidelity
// JSON artifacts in `template-import-artifacts` when supplied by the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verifyAuthOrNativeUser, createTokenAuthCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ASSET_BUCKET = 'template-import-assets';
const ARTIFACT_BUCKET = 'template-import-artifacts';

function logDbError(operation: string, error: { message?: string; details?: string | null; hint?: string | null; code?: string | null } | null) {
  if (!error) return;
  console.error(`[template-import-pdf] ${operation} failed`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

async function ensureAssetBucket(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.storage.getBucket(ASSET_BUCKET);
  if (data) {
    if (!data.public) {
      const { error } = await admin.storage.updateBucket(ASSET_BUCKET, {
        public: true,
        fileSizeLimit: 25 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });
      if (error) logDbError('ensure_asset_bucket.update_public', error);
    }
    return;
  }
  await admin.storage.createBucket(ASSET_BUCKET, {
    public: true,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
}

async function ensureArtifactBucket(admin: ReturnType<typeof createClient>) {
  const allowedMimeTypes = ['application/json', 'image/png', 'image/jpeg', 'image/webp'];
  const fileSizeLimit = 25 * 1024 * 1024;
  const { data } = await admin.storage.getBucket(ARTIFACT_BUCKET);
  if (data) {
    // Widen MIME allowlist in-place — Phase 5 added raster persistence.
    const current = (data as { allowed_mime_types?: string[] | null }).allowed_mime_types ?? [];
    const missing = allowedMimeTypes.some((m) => !current.includes(m));
    if (missing) {
      const { error } = await admin.storage.updateBucket(ARTIFACT_BUCKET, {
        public: false,
        fileSizeLimit,
        allowedMimeTypes,
      });
      if (error) logDbError('ensure_artifact_bucket.update_mime', error);
    }
    return;
  }
  await admin.storage.createBucket(ARTIFACT_BUCKET, {
    public: false,
    fileSizeLimit,
    allowedMimeTypes,
  });
}

function safeArtifactName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
}

async function uploadJsonArtifact(
  admin: ReturnType<typeof createClient>,
  importId: string,
  name: string,
  payload: unknown,
): Promise<string | null> {
  if (!payload) return null;
  await ensureArtifactBucket(admin);
  const path = `${importId}/${safeArtifactName(name)}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const { error } = await admin.storage
    .from(ARTIFACT_BUCKET)
    .upload(path, bytes, { contentType: 'application/json', upsert: true });
  if (error) {
    logDbError(`upload_json_artifact.${name}`, error);
    return null;
  }
  return path;
}


function importAssetSummary(asset: any) {
  if (!asset || typeof asset !== 'object' || !Array.isArray(asset.pages)) return null;
  return {
    fileId: typeof asset.fileId === 'string' ? asset.fileId : null,
    fileType: typeof asset.fileType === 'string' ? asset.fileType : null,
    pageCount: asset.pages.length,
    sourcePages: asset.pages.filter((page: any) => typeof page?.referenceImageUrl === 'string' && page.referenceImageUrl.length > 0).length,
    dimensions: asset.pages.slice(0, 10).map((page: any) => ({
      pageIndex: Number.isFinite(Number(page?.pageIndex)) ? Number(page.pageIndex) : null,
      width: Number.isFinite(Number(page?.width)) ? Number(page.width) : null,
      height: Number.isFinite(Number(page?.height)) ? Number(page.height) : null,
      dpiScale: Number.isFinite(Number(page?.dpiScale)) ? Number(page.dpiScale) : null,
    })),
  };
}

function fidelitySummary(report: any) {
  if (!report || typeof report !== 'object') return null;
  return {
    overallScore: report.overallScore ?? null,
    nativeCoverage: report.nativeCoverage ?? null,
    rasterFallbackCoverage: report.rasterFallbackCoverage ?? null,
    textAccuracy: report.textAccuracy ?? null,
    medianPositionDrift: report.medianPositionDrift ?? null,
    p95PositionDrift: report.p95PositionDrift ?? null,
    warningCount: Array.isArray(report.warnings) ? report.warnings.length : 0,
    pageCount: Array.isArray(report.pages) ? report.pages.length : null,
  };
}

async function buildImportArtifactMeta(admin: ReturnType<typeof createClient>, importId: string, body: any) {
  const cdirPath = await uploadJsonArtifact(admin, importId, 'cdir', body.cdir);
  const fidelityPath = await uploadJsonArtifact(admin, importId, 'cdir-fidelity', body.cdir_fidelity);
  const importAssetPath = await uploadJsonArtifact(admin, importId, 'import-asset', body.import_asset);
  const importManifestsPath = await uploadJsonArtifact(admin, importId, 'import-manifests', body.import_manifests);
  return {
    ...(body.meta && typeof body.meta === 'object' ? body.meta : {}),
    source_checksum: body.source_checksum ?? body.cdir?.source?.checksum ?? null,
    cdir_artifact_path: cdirPath,
    cdir_fidelity_artifact_path: fidelityPath,
    import_asset_artifact_path: importAssetPath,
    import_manifests_artifact_path: importManifestsPath,
    import_asset_summary: importAssetSummary(body.import_asset),
    cdir_fidelity_summary: fidelitySummary(body.cdir_fidelity),
  };
}


function validateReconstructedSchemaLite(raw: unknown): { ok: boolean; pageCount: number; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, pageCount: 0, errors: ['Schema must be an object.'] };
  }
  const schema = raw as any;
  const pages = Array.isArray(schema.pages) ? schema.pages : [];
  if (pages.length === 0) errors.push('Reconstruction produced no pages.');
  pages.forEach((page: any, index: number) => {
    if (!page || typeof page !== 'object') {
      errors.push(`Page ${index + 1} is not an object.`);
      return;
    }
    if (!page.id || !page.size || !Number.isFinite(Number(page.size.width)) || !Number.isFinite(Number(page.size.height))) {
      errors.push(`Page ${index + 1} is missing id or valid size.`);
    }
    if (!Array.isArray(page.blocks)) errors.push(`Page ${index + 1} is malformed (missing blocks).`);
  });
  return { ok: errors.length === 0, pageCount: pages.length, errors };
}

function schemaValidationErrorResponse(json: (body: unknown, status?: number) => Response, schema: unknown): Response | null {
  const validation = validateReconstructedSchemaLite(schema);
  if (validation.ok) return null;
  return json({
    error: 'schema_validation_failed',
    message: 'Reconstructed schema failed server-side validation.',
    validation,
  }, 400);
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readJsonArtifact(admin: ReturnType<typeof createClient>, path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(path);
  if (error) {
    logDbError(`read_json_artifact.${path}`, error);
    return null;
  }
  try {
    return JSON.parse(await data.text());
  } catch (e) {
    console.error(`[template-import-pdf] artifact parse failed`, { path, error: String((e as Error).message ?? e) });
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = createTokenAuthCorsHeaders();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const operation = body.operation as string;

    // Custom-auth verification (session token or custom HS256 JWT). The old
    // implementation used supabase.auth.getUser(), which can NEVER succeed for
    // this app's custom_users accounts — every authed operation 401'd.
    const auth = await verifyAuthOrNativeUser(admin, req, body);
    if (auth.error) return createUnauthorizedResponse(auth.error, cors);
    const authedUserId = auth.userId && auth.userId !== 'service_role' ? auth.userId : null;
    const userId = authedUserId ?? body.user_id ?? null;

    if (operation === 'create_import') {
      const { data, error } = await admin
        .from('template_imports')
        .insert({
          user_id: userId,
          status: 'processing',
          fidelity_mode: body.fidelity_mode ?? 'semantic',
          source_filename: body.source_filename ?? null,
          source_size_bytes: body.source_size_bytes ?? null,
          page_count: body.page_count ?? null,
          meta: body.meta ?? {},
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ record: data });
    }

    if (operation === 'upload_asset') {
      await ensureAssetBucket(admin);
      const importId = body.import_id as string;
      const kind = (body.kind ?? 'page') as string; // 'page' | 'image'
      const pageIndex = body.page_index ?? 0;
      const seq = body.seq ?? 0;
      const contentType = body.content_type ?? 'image/png';
      const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
      const path = `${importId}/${kind}-${pageIndex}-${seq}.${ext}`;
      const bytes = b64ToBytes(body.data_base64 as string);
      const { error: upErr } = await admin.storage
        .from(ASSET_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) return json({ error: upErr.message }, 400);
      const { data: pub } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
      return json({ url: pub.publicUrl, path });
    }

    if (operation === 'finalize') {
      const importId = body.import_id as string;
      const name = (body.name as string) ?? 'Imported template';
      const schema = body.schema;
      const validationError = schemaValidationErrorResponse(json, schema);
      if (validationError) return validationError;
      const pageCount = body.page_count ?? null;

      // Delegate to the `public.template_finalize` SECURITY DEFINER RPC, which
      // raises statement_timeout to 5min and writes the template row +
      // version snapshot + template_imports completion atomically. The default
      // 10s statement timeout cancels large hybrid/pixel-perfect schemas
      // (multi-page imports embed base64 page rasters) mid-INSERT.
      const artifactMeta = await buildImportArtifactMeta(admin, importId, body);
      // Use the v2 RPC which returns only id/name/version. The previous RPC
      // returned the entire report_templates row, forcing PostgREST to
      // re-serialize the (sometimes multi-MB) schema jsonb back to the
      // edge function — that round-trip is what was tripping the project's
      // default statement_timeout on hybrid/pixel imports.
      const { data: rpcRow, error: rpcErr } = await admin.rpc('template_finalize_v2', {
        p_import_id: importId,
        p_name: name,
        p_description: `Imported from ${body.source_filename ?? 'PDF'}`,
        p_schema: schema,
        p_page_count: pageCount,
        p_meta: artifactMeta ?? {},
      });
      if (rpcErr) {
        logDbError('finalize.rpc_template_finalize_v2', rpcErr);
        return json({ error: rpcErr.message, details: rpcErr.details, hint: rpcErr.hint, code: rpcErr.code }, 400);
      }
      const tpl = Array.isArray(rpcRow) ? rpcRow[0] : rpcRow;
      if (!tpl) return json({ error: 'Finalize returned no template row' }, 500);
      return json({ template: tpl });
    }

    if (operation === 'resync') {
      // Replace an existing template's schema (re-import revised PDF).
      // Bumps version and snapshots the previous schema.
      //
      // The snapshot + update + post-snapshot is delegated to the
      // `public.template_resync` SECURITY DEFINER function, which raises
      // statement_timeout to 5min so multi-page hybrid schemas with embedded
      // raster page refs don't get cancelled mid-save, and uses
      // ON CONFLICT DO NOTHING on the version snapshots so a partially-failed
      // previous attempt doesn't block a retry.
      const importId = body.import_id as string;
      const templateId = body.template_id as string;
      const schema = body.schema;
      const note = (body.note as string) || 'Re-synced from PDF';
      if (!templateId || !schema) return json({ error: 'template_id and schema required' }, 400);
      const validationError = schemaValidationErrorResponse(json, schema);
      if (validationError) return validationError;

      // v2 RPC returns only id/name/version. See finalize note above — the
      // legacy version returned the full row (including the multi-MB schema)
      // and PostgREST's re-serialization round-trip was timing out.
      const { data: rpcRow, error: rpcErr } = await admin.rpc('template_resync_v2', {
        p_template_id: templateId,
        p_schema: schema,
        p_note: note,
      });
      if (rpcErr) {
        logDbError('resync.rpc_template_resync_v2', rpcErr);
        return json({ error: rpcErr.message, details: rpcErr.details, hint: rpcErr.hint, code: rpcErr.code }, 400);
      }
      const tpl = Array.isArray(rpcRow) ? rpcRow[0] : rpcRow;
      if (!tpl) return json({ error: 'Template not found' }, 404);

      const artifactMeta = await buildImportArtifactMeta(admin, importId, body);
      await admin.from('template_imports').update({
        status: 'completed',
        created_template_id: templateId,
        page_count: body.page_count ?? null,
        meta: artifactMeta,
      }).eq('id', importId);

      return json({ template: tpl, version: tpl.version });
    }


    if (operation === 'get_artifacts') {
      const importId = body.import_id as string;
      if (!importId) return json({ error: 'import_id required' }, 400);
      if (!authedUserId && auth.userId !== 'service_role') return json({ error: 'unauthorized' }, 401);

      const { data: record, error: getErr } = await admin
        .from('template_imports')
        .select('id,user_id,status,created_template_id,page_count,source_filename,meta')
        .eq('id', importId)
        .single();
      if (getErr) return json({ error: getErr.message }, 404);
      if (record?.user_id && authedUserId && record.user_id !== authedUserId) return json({ error: 'forbidden' }, 403);

      const meta = ((record.meta && typeof record.meta === 'object') ? record.meta : {}) as any;
      const cdir = await readJsonArtifact(admin, meta.cdir_artifact_path);
      const cdirFidelity = await readJsonArtifact(admin, meta.cdir_fidelity_artifact_path);
      const importAsset = await readJsonArtifact(admin, meta.import_asset_artifact_path);
      const importManifests = await readJsonArtifact(admin, meta.import_manifests_artifact_path);
      return json({
        record,
        cdir,
        cdirFidelity,
        importAsset,
        importManifests,
        artifactPaths: {
          cdir: meta.cdir_artifact_path ?? null,
          cdirFidelity: meta.cdir_fidelity_artifact_path ?? null,
          importAsset: meta.import_asset_artifact_path ?? null,
          importManifests: meta.import_manifests_artifact_path ?? null,
        },
      });
    }

    if (operation === 'record_review_decision') {
      const importId = body.import_id as string;
      const decision = String(body.decision ?? '');
      const allowed = ['accept', 'accept_with_trace', 'retry', 'manual_edit'];
      if (!importId) return json({ error: 'import_id required' }, 400);
      if (!allowed.includes(decision)) return json({ error: 'invalid decision' }, 400);
      if (!authedUserId) return json({ error: 'unauthorized' }, 401);

      const { data: record, error: getErr } = await admin
        .from('template_imports')
        .select('id,user_id,meta')
        .eq('id', importId)
        .single();
      if (getErr) return json({ error: getErr.message }, 404);
      if (record?.user_id && record.user_id !== authedUserId) return json({ error: 'forbidden' }, 403);

      const currentMeta = ((record.meta && typeof record.meta === 'object') ? record.meta : {}) as any;
      const reviewDecision = {
        decision,
        note: body.note ? String(body.note).slice(0, 1000) : null,
        decided_at: new Date().toISOString(),
        decided_by: authedUserId,
      };
      const nextMeta = { ...currentMeta, import_review_decision: reviewDecision };
      const { data: updated, error: upErr } = await admin
        .from('template_imports')
        .update({ meta: nextMeta })
        .eq('id', importId)
        .select('id,meta')
        .single();
      if (upErr) return json({ error: upErr.message }, 400);
      return json({ record: updated, decision: reviewDecision });
    }

    if (operation === 'fail') {
      const importId = body.import_id as string;
      await admin.from('template_imports').update({
        status: 'failed',
        error: String(body.error ?? 'unknown'),
      }).eq('id', importId);
      return json({ ok: true });
    }

    // ---------- Phase 9: append arbitrary meta patch (provider audit trail) ----------
    if (operation === 'append_meta') {
      const importId = body.import_id as string;
      const patch = body.meta_patch;
      if (!importId || !patch || typeof patch !== 'object') {
        return json({ error: 'import_id and meta_patch required' }, 400);
      }
      const { data: rec, error: getErr } = await admin
        .from('template_imports')
        .select('id,user_id,meta')
        .eq('id', importId)
        .single();
      if (getErr) return json({ error: getErr.message }, 404);
      if (rec?.user_id && authedUserId && rec.user_id !== authedUserId && auth.userId !== 'service_role') {
        return json({ error: 'forbidden' }, 403);
      }
      const currentMeta = ((rec.meta && typeof rec.meta === 'object') ? rec.meta : {}) as any;
      const nextMeta = { ...currentMeta, ...patch };
      const { error: upErr } = await admin
        .from('template_imports')
        .update({ meta: nextMeta })
        .eq('id', importId);
      if (upErr) return json({ error: upErr.message }, 400);
      return json({ ok: true });
    }



    // ---------- Phase 5: Visual Import Quality persistence ----------
    if (operation === 'save_visual_quality') {
      const importId = body.import_id as string;
      const report = body.report;
      if (!importId || !report || typeof report !== 'object') {
        return json({ error: 'import_id and report are required' }, 400);
      }
      await ensureArtifactBucket(admin);

      const { data: record, error: getErr } = await admin
        .from('template_imports')
        .select('id,user_id,meta')
        .eq('id', importId)
        .single();
      if (getErr) return json({ error: getErr.message }, 404);
      if (record?.user_id && authedUserId && record.user_id !== authedUserId && auth.userId !== 'service_role') {
        return json({ error: 'forbidden' }, 403);
      }

      // Upload per-page rasters (any subset of source/generated/diff).
      const pages = Array.isArray(body.pages) ? body.pages : [];
      let uploaded = 0;
      for (const page of pages) {
        const pageNumber = Number(page?.page_number);
        if (!Number.isFinite(pageNumber)) continue;
        const padded = String(pageNumber).padStart(3, '0');
        for (const kind of ['source', 'generated', 'diff'] as const) {
          const b64 = page?.[`${kind}_b64`];
          if (typeof b64 !== 'string' || b64.length === 0) continue;
          const path = `${importId}/pages/page-${padded}-${kind}.png`;
          const { error: upErr } = await admin.storage
            .from(ARTIFACT_BUCKET)
            .upload(path, b64ToBytes(b64), { contentType: 'image/png', upsert: true });
          if (upErr) { logDbError(`save_visual_quality.page_${padded}_${kind}`, upErr); continue; }
          uploaded += 1;
        }
      }

      const summaryPath = `${importId}/visual-quality.json`;
      const summaryPayload = {
        ...report,
        artifactPaths: {
          summary: summaryPath,
          sourceRasters: `${importId}/pages`,
          generatedRasters: `${importId}/pages`,
          diffRasters: `${importId}/pages`,
        },
      };
      const { error: sumErr } = await admin.storage
        .from(ARTIFACT_BUCKET)
        .upload(summaryPath, new TextEncoder().encode(JSON.stringify(summaryPayload)), {
          contentType: 'application/json',
          upsert: true,
        });
      if (sumErr) {
        logDbError('save_visual_quality.summary', sumErr);
        return json({ error: sumErr.message }, 400);
      }

      const currentMeta = ((record.meta && typeof record.meta === 'object') ? record.meta : {}) as any;
      const nextMeta = {
        ...currentMeta,
        visual_quality_artifact_path: summaryPath,
        visual_quality_summary: {
          overallScore: report.overallScore ?? null,
          pageCount: Array.isArray(report.pages) ? report.pages.length : 0,
          manualReviewRequired: !!report.manualReviewRequired,
          finalMode: report.finalMode ?? null,
          repairPassesApplied: report.repairPassesApplied ?? 0,
          generatedAt: report.generatedAt ?? new Date().toISOString(),
        },
      };
      const { error: upMetaErr } = await admin
        .from('template_imports')
        .update({ meta: nextMeta })
        .eq('id', importId);
      if (upMetaErr) logDbError('save_visual_quality.update_meta', upMetaErr);

      return json({ ok: true, summary_path: summaryPath, uploaded_count: uploaded });
    }

    if (operation === 'get_visual_quality') {
      const importId = body.import_id as string;
      if (!importId) return json({ error: 'import_id required' }, 400);

      const { data: record, error: getErr } = await admin
        .from('template_imports')
        .select('id,user_id,meta')
        .eq('id', importId)
        .single();
      if (getErr) return json({ error: getErr.message }, 404);
      if (record?.user_id && authedUserId && record.user_id !== authedUserId && auth.userId !== 'service_role') {
        return json({ error: 'forbidden' }, 403);
      }

      const meta = ((record.meta && typeof record.meta === 'object') ? record.meta : {}) as any;
      const summaryPath = meta.visual_quality_artifact_path as string | null | undefined;
      if (!summaryPath) return json(null);

      const report = await readJsonArtifact(admin, summaryPath);
      if (!report) return json(null);

      const pageNumbers: number[] = Array.isArray(report.pages)
        ? report.pages
            .map((p: any) => Number(p?.pageNumber))
            .filter((n: number) => Number.isFinite(n))
        : [];
      const signed: Record<string, string> = {};
      for (const pageNumber of pageNumbers) {
        const padded = String(pageNumber).padStart(3, '0');
        for (const kind of ['source', 'generated', 'diff'] as const) {
          const path = `${importId}/pages/page-${padded}-${kind}.png`;
          const { data: s } = await admin.storage
            .from(ARTIFACT_BUCKET)
            .createSignedUrl(path, 3600);
          if (s?.signedUrl) signed[`${pageNumber}:${kind}`] = s.signedUrl;
        }
      }

      return json({
        importId,
        report,
        artifactPaths: {
          summary: summaryPath,
          sourceRasters: `${importId}/pages`,
          generatedRasters: `${importId}/pages`,
          diffRasters: `${importId}/pages`,
        },
        signedUrls: signed,
      });
    }

    // ---------- Phase 8: Diagnostics — list visual-quality reports ----------
    if (operation === 'list_visual_quality') {
      const limit = Math.min(Number(body.limit) || 50, 200);
      const onlyWithReport = body.only_with_report !== false;
      const manualReviewOnly = !!body.manual_review_only;
      const minScore = Number.isFinite(Number(body.min_score)) ? Number(body.min_score) : null;
      const maxScore = Number.isFinite(Number(body.max_score)) ? Number(body.max_score) : null;
      const finalMode = typeof body.final_mode === 'string' ? body.final_mode : null;

      let query = admin
        .from('template_imports')
        .select('id,user_id,status,fidelity_mode,source_filename,page_count,created_at,meta,error')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (authedUserId && auth.userId !== 'service_role') {
        query = query.eq('user_id', authedUserId);
      }
      const { data: rows, error: listErr } = await query;
      if (listErr) return json({ error: listErr.message }, 500);

      const enriched = (rows ?? []).map((row: any) => {
        const meta = (row.meta && typeof row.meta === 'object') ? row.meta : {};
        const vq = (meta.visual_quality_summary && typeof meta.visual_quality_summary === 'object')
          ? meta.visual_quality_summary
          : null;
        return {
          id: row.id,
          user_id: row.user_id,
          status: row.status,
          fidelity_mode: row.fidelity_mode,
          source_filename: row.source_filename,
          page_count: row.page_count,
          created_at: row.created_at,
          error: row.error ?? null,
          visual_quality_artifact_path: meta.visual_quality_artifact_path ?? null,
          visual_quality: vq,
          cdir_fidelity_summary: meta.cdir_fidelity_summary ?? null,
        };
      });

      const filtered = enriched.filter((r) => {
        if (onlyWithReport && !r.visual_quality) return false;
        if (manualReviewOnly && !r.visual_quality?.manualReviewRequired) return false;
        if (finalMode && r.visual_quality?.finalMode !== finalMode) return false;
        const score = r.visual_quality?.overallScore;
        if (minScore !== null && (typeof score !== 'number' || score < minScore)) return false;
        if (maxScore !== null && (typeof score !== 'number' || score > maxScore)) return false;
        return true;
      });

      const scoreList = filtered
        .map((r) => r.visual_quality?.overallScore)
        .filter((n: any): n is number => typeof n === 'number');
      const avgScore = scoreList.length
        ? scoreList.reduce((a, b) => a + b, 0) / scoreList.length
        : null;
      const stats = {
        total: filtered.length,
        with_report: filtered.filter((r) => !!r.visual_quality).length,
        manual_review: filtered.filter((r) => r.visual_quality?.manualReviewRequired).length,
        avg_score: avgScore,
        repair_passes_total: filtered.reduce(
          (sum, r) => sum + (Number(r.visual_quality?.repairPassesApplied) || 0),
          0,
        ),
        by_final_mode: filtered.reduce<Record<string, number>>((acc, r) => {
          const mode = r.visual_quality?.finalMode ?? 'unknown';
          acc[mode] = (acc[mode] ?? 0) + 1;
          return acc;
        }, {}),
      };

      return json({ rows: filtered, stats });
    }

    return json({ error: 'unknown operation' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

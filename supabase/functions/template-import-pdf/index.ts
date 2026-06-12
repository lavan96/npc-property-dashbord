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
  const { data } = await admin.storage.getBucket(ARTIFACT_BUCKET);
  if (data) return;
  await admin.storage.createBucket(ARTIFACT_BUCKET, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ['application/json'],
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

    return json({ error: 'unknown operation' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { verifyAuth, createUnauthorizedResponse, createForbiddenResponse, createCorsHeaders } from '../_shared/auth.ts';
import { isSuperadmin, logSecurityEvent } from '../_shared/auth_v2.ts';
import { checkPermission, checkModuleView } from '../_shared/permissions.ts';
import { authorizeObjectAccess, authorizedBindingsForList, createStorageBinding, deleteStorageBinding, rollbackStorageObject, BUCKET_SENSITIVITY } from '../_shared/storageAuthz.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Per-bucket security policy (Security Remediation Phase 3 / STOR-001).
// - operations: the only operations this proxy will perform on the bucket
// - permissionTable: table name mapped through the module permission matrix
//   for write/delete gating (superadmins bypass inside checkPermission)
// - superadminDelete: delete additionally requires superadmin
// - publicUrl is ONLY available for explicitly public buckets
interface BucketPolicy {
  operations: string[];
  permissionTable?: string;
  /**
   * Module key required to READ (download/list/signedUrl/publicUrl) from this
   * bucket. Reads previously had no authorization — any authenticated user
   * could pull any object in an allowed bucket. When set, non-internal reads
   * require can_view on this module (superadmin/service bypass; unregistered
   * module stays open for legacy compatibility). Low-sensitivity/public buckets
   * (branding-assets, report-templates, investment-reports) intentionally omit
   * it so their asset reads stay broadly available.
   */
  readModuleKey?: string;
  superadminDelete?: boolean;
  allowPublicUrl?: boolean;
  /** SVG allowed only on staff-managed asset buckets (branding/templates) */
  allowSvg?: boolean;
  maxUploadBytes: number;
}

const DEFAULT_MAX_UPLOAD = 25 * 1024 * 1024; // 25 MB binary

const BUCKET_POLICIES: Record<string, BucketPolicy> = {
  'client-files':         { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], permissionTable: 'client_files', readModuleKey: 'clients', maxUploadBytes: DEFAULT_MAX_UPLOAD },
  'client-documents':     { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], permissionTable: 'client_files', readModuleKey: 'clients', maxUploadBytes: DEFAULT_MAX_UPLOAD },
  'vownet-forms':         { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], permissionTable: 'client_files', readModuleKey: 'clients', maxUploadBytes: DEFAULT_MAX_UPLOAD },
  // investment-reports is PRIVATE (STOR-005). Report PDFs and hero/visual
  // assets are served via short-lived signed URLs (report pipeline + hero
  // functions sign from storage_path); publicUrl is no longer offered.
  'investment-reports':   { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], superadminDelete: true, maxUploadBytes: DEFAULT_MAX_UPLOAD },
  'quantitative-reports': { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], readModuleKey: 'reports', superadminDelete: true, maxUploadBytes: DEFAULT_MAX_UPLOAD },
  // report-templates is a public bucket whose asset URLs are embedded in
  // rendered templates; publicUrl remains available (no client PII stored).
  'report-templates':     { operations: ['upload', 'download', 'delete', 'signedUrl', 'list', 'publicUrl'], permissionTable: 'report_templates', allowPublicUrl: true, allowSvg: true, maxUploadBytes: 50 * 1024 * 1024 },
  'branding-assets':      { operations: ['upload', 'download', 'delete', 'signedUrl', 'list', 'publicUrl'], superadminDelete: true, allowPublicUrl: true, allowSvg: true, maxUploadBytes: 10 * 1024 * 1024 },
  'qa_exports':           { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], readModuleKey: 'report_qa', superadminDelete: true, maxUploadBytes: DEFAULT_MAX_UPLOAD },
  'email-attachments':    { operations: ['upload', 'download', 'delete', 'signedUrl', 'list'], permissionTable: 'email_copilot_emails', readModuleKey: 'email_copilot', maxUploadBytes: DEFAULT_MAX_UPLOAD },
};

// Content types that may execute in a browser or shell — rejected on upload.
const FORBIDDEN_CONTENT_TYPES = new Set([
  'text/html', 'application/xhtml+xml', 'image/svg+xml',
  'text/javascript', 'application/javascript', 'application/x-javascript',
  'application/x-msdownload', 'application/x-msdos-program',
  'application/x-sh', 'application/x-bat', 'application/hta',
]);
const FORBIDDEN_EXTENSIONS = /\.(html?|xhtml|svg|js|mjs|exe|dll|bat|cmd|sh|ps1|hta|scr|com|jar)$/i;

const MAX_SIGNED_URL_TTL = 900; // 15 minutes

/**
 * Validate a caller-supplied object path. The proxy still accepts full paths
 * for compatibility, but traversal / absolute / control-character input is
 * rejected outright.
 */
function isSafePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return false;
  if (path.startsWith('/') || path.includes('\\')) return false;
  if (path.includes('..')) return false;
  // Reject percent-encoded separators/traversal and control characters
  if (/%2e|%2f|%5c/i.test(path)) return false;
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  return true;
}

function jsonResponse(body: Record<string, unknown>, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();

    const {
      operation,  // 'upload', 'download', 'delete', 'signedUrl', 'list', 'publicUrl'
      bucket,
      path,
      file_data,      // Base64 encoded file content for upload
      content_type,   // MIME type for upload
      expires_in,     // Seconds for signed URL
      upsert,         // Boolean for upload
      // WP-06 Phase B — binding metadata (upload) / list scope
      resource_type,
      resource_id,
      client_id: bindingClientId,
      owner_user_id: bindingOwnerUserId,
      list_client_id,
      list_owner_user_id,
    } = body;

    // Validate authentication (JWT first, then session token)
    const sessionResult = await verifyAuth(supabase, req.headers, body);
    if (sessionResult.error) {
      console.log(`[Secure Storage] Auth failed: ${sessionResult.error}`);
      return createUnauthorizedResponse(sessionResult.error, corsHeaders);
    }
    const actorId = sessionResult.userId!;
    const isInternal = sessionResult.authMethod === 'service_role';

    console.log(`[Secure Storage] User ${sessionResult.username || actorId} - ${operation} on ${bucket}/${typeof path === 'string' ? path : '[multi]'}`);

    // Validate bucket against the policy map (deny by default)
    const policy = bucket ? BUCKET_POLICIES[bucket] : undefined;
    if (!policy) {
      return jsonResponse({ success: false, error: 'Invalid bucket' }, corsHeaders, 400);
    }

    // Validate operation against the bucket policy (deny by default)
    if (typeof operation !== 'string' || !policy.operations.includes(operation)) {
      await logSecurityEvent(supabase, {
        action: `storage.${operation}`, decision: 'deny', reason_code: 'operation_not_allowed',
        actor_type: isInternal ? 'internal_service' : 'human', actor_id: actorId,
        target_type: 'bucket', target_id: bucket,
      });
      return jsonResponse({ success: false, error: 'Operation not permitted for this bucket' }, corsHeaders, 403);
    }

    // Validate paths for every operation that takes one
    const rawPaths: unknown[] = operation === 'delete' && Array.isArray(path) ? path : path !== undefined && path !== null && path !== '' ? [path] : [];
    for (const p of rawPaths) {
      if (!isSafePath(p)) {
        await logSecurityEvent(supabase, {
          action: `storage.${operation}`, decision: 'deny', reason_code: 'unsafe_path',
          actor_type: isInternal ? 'internal_service' : 'human', actor_id: actorId,
          target_type: 'bucket', target_id: bucket,
        });
        return jsonResponse({ success: false, error: 'Invalid path' }, corsHeaders, 400);
      }
    }

    // Permission gating for mutating operations (internal service calls bypass)
    if (!isInternal && (operation === 'upload' || operation === 'delete')) {
      if (operation === 'delete' && policy.superadminDelete) {
        if (!(await isSuperadmin(supabase, actorId))) {
          await logSecurityEvent(supabase, {
            action: 'storage.delete', decision: 'deny', reason_code: 'superadmin_required',
            actor_type: 'human', actor_id: actorId, target_type: 'bucket', target_id: bucket,
          });
          return createForbiddenResponse('Delete on this bucket requires superadmin', corsHeaders);
        }
      } else if (policy.permissionTable) {
        const permOp = operation === 'delete' ? 'delete' : 'create';
        const perm = await checkPermission(supabase, actorId, policy.permissionTable, permOp, sessionResult.authMethod);
        if (!perm.allowed) {
          await logSecurityEvent(supabase, {
            action: `storage.${operation}`, decision: 'deny', reason_code: 'module_permission_denied',
            actor_type: 'human', actor_id: actorId, target_type: 'bucket', target_id: bucket,
          });
          return createForbiddenResponse(perm.reason || 'Permission denied', corsHeaders);
        }
      }
    }

    // Read-side authorization (EC-5): download/list/signedUrl/publicUrl were
    // previously unauthorized beyond "is authenticated". Require can_view on the
    // bucket's governing module so a caller without that module cannot read its
    // objects. (Object-level ownership — tying a specific path to the caller's
    // client assignment / report ownership — is the deeper follow-up; this
    // closes the any-authenticated-staff read hole.)
    if (!isInternal && policy.readModuleKey &&
        (operation === 'download' || operation === 'list' || operation === 'signedUrl' || operation === 'publicUrl')) {
      const readPerm = await checkModuleView(supabase, actorId, policy.readModuleKey, sessionResult.authMethod);
      if (!readPerm.allowed) {
        await logSecurityEvent(supabase, {
          action: `storage.${operation}`, decision: 'deny', reason_code: 'read_permission_denied',
          actor_type: 'human', actor_id: actorId, target_type: 'bucket', target_id: bucket,
        });
        return createForbiddenResponse(readPerm.reason || 'Read permission denied', corsHeaders);
      }
    }


    // WP-06 object-level authorization: for sensitive buckets, resolve the
    // storage_object_bindings ledger and deny (as 404) when the caller is not
    // tied to the bound resource. Legacy paths without a binding fall through
    // to the existing per-bucket module gate above (see LEGACY_FALLBACK_BUCKETS).
    const sensitivity = BUCKET_SENSITIVITY[bucket];
    const isObjectOp =
      operation === 'download' || operation === 'signedUrl' ||
      operation === 'delete'   || operation === 'publicUrl';
    if (!isInternal && sensitivity && sensitivity !== 'public_asset' && isObjectOp) {
      const targets: string[] = operation === 'delete' && Array.isArray(path)
        ? path.filter((p): p is string => typeof p === 'string')
        : (typeof path === 'string' && path ? [path] : []);
      const superadmin = await isSuperadmin(supabase, actorId);
      for (const p of targets) {
        const authz = await authorizeObjectAccess(supabase, bucket, p, {
          actorId, isSuperadmin: superadmin, isInternalService: false, authMethod: sessionResult.authMethod,
        });
        if (!authz.allowed) {
          await logSecurityEvent(supabase, {
            action: `storage.${operation}`, decision: 'deny',
            reason_code: authz.reason || 'object_authz_denied',
            actor_type: 'human', actor_id: actorId,
            target_type: 'storage_object', target_id: `${bucket}/${p}`,
          });
          // Return 404 to avoid enumerating object existence.
          return jsonResponse({ success: false, error: 'Not found' }, corsHeaders, 404);
        }
        if (authz.legacyFallback) {
          await logSecurityEvent(supabase, {
            action: `storage.${operation}`, decision: 'allow',
            reason_code: 'legacy_fallback_no_binding',
            actor_type: 'human', actor_id: actorId,
            target_type: 'storage_object', target_id: `${bucket}/${p}`,
          });
        }
      }
    }

    // Handle operations
    switch (operation) {
      case 'upload': {
        if (!path || !file_data || typeof file_data !== 'string') {
          return jsonResponse({ success: false, error: 'Missing path or file_data' }, corsHeaders, 400);
        }

        // Enforce size cap BEFORE decoding (base64 is ~4/3 of binary size)
        const approxBytes = Math.floor(file_data.length * 3 / 4);
        if (approxBytes > policy.maxUploadBytes) {
          await logSecurityEvent(supabase, {
            action: 'storage.upload', decision: 'deny', reason_code: 'size_limit',
            actor_type: isInternal ? 'internal_service' : 'human', actor_id: actorId,
            target_type: 'bucket', target_id: bucket, metadata: { approxBytes },
          });
          return jsonResponse({ success: false, error: 'File exceeds size limit for this bucket' }, corsHeaders, 413);
        }

        // Block browser-executable / active content on all buckets
        const declaredType = (content_type || 'application/octet-stream').toLowerCase().split(';')[0].trim();
        const svgAttempt = declaredType === 'image/svg+xml' || /\.svg$/i.test(path);
        const blocked = svgAttempt
          ? !policy.allowSvg
          : (FORBIDDEN_CONTENT_TYPES.has(declaredType) || FORBIDDEN_EXTENSIONS.test(path));
        if (blocked) {
          await logSecurityEvent(supabase, {
            action: 'storage.upload', decision: 'deny', reason_code: 'forbidden_content_type',
            actor_type: isInternal ? 'internal_service' : 'human', actor_id: actorId,
            target_type: 'bucket', target_id: bucket, metadata: { declaredType },
          });
          return jsonResponse({ success: false, error: 'This file type is not permitted' }, corsHeaders, 415);
        }

        const fileBytes = base64Decode(file_data);

        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, fileBytes, {
            contentType: content_type || 'application/octet-stream',
            upsert: upsert || false
          });

        if (error) {
          console.error(`[Secure Storage] Upload error:`, error);
          return jsonResponse({ success: false, error: 'Upload failed' }, corsHeaders, 500);
        }

        console.log(`[Secure Storage] Uploaded: ${bucket}/${path}`);
        return jsonResponse({ success: true, data: { path: data.path, fullPath: data.fullPath } }, corsHeaders);
      }

      case 'download': {
        if (!path) {
          return jsonResponse({ success: false, error: 'Missing path' }, corsHeaders, 400);
        }

        const { data, error } = await supabase.storage
          .from(bucket)
          .download(path);

        if (error) {
          console.error(`[Secure Storage] Download error:`, error);
          return jsonResponse({ success: false, error: 'Download failed' }, corsHeaders, 500);
        }

        // Convert blob to base64 for transport — chunked to avoid call stack overflow on large files
        const arrayBuffer = await data.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const CHUNK = 8192;
        let binaryStr = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binaryStr += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
        }
        const base64 = btoa(binaryStr);

        console.log(`[Secure Storage] Downloaded: ${bucket}/${path}`);
        return jsonResponse({
          success: true,
          data: { content: base64, contentType: data.type, size: data.size }
        }, corsHeaders);
      }

      case 'delete': {
        if (!path) {
          return jsonResponse({ success: false, error: 'Missing path' }, corsHeaders, 400);
        }

        const paths = (Array.isArray(path) ? path : [path]) as string[];

        const { error } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (error) {
          console.error(`[Secure Storage] Delete error:`, error);
          return jsonResponse({ success: false, error: 'Delete failed' }, corsHeaders, 500);
        }

        // WP-06: clean up bindings for the deleted objects (best-effort).
        for (const p of paths) {
          await deleteStorageBinding(supabase, bucket, p);
        }

        await logSecurityEvent(supabase, {
          action: 'storage.delete', decision: 'allow',
          actor_type: isInternal ? 'internal_service' : 'human', actor_id: actorId,
          target_type: 'bucket', target_id: bucket, metadata: { count: paths.length },
        });
        console.log(`[Secure Storage] Deleted: ${bucket}/${paths.join(', ')}`);
        return jsonResponse({ success: true, data: { deleted: paths } }, corsHeaders);
      }

      case 'signedUrl': {
        if (!path) {
          return jsonResponse({ success: false, error: 'Missing path' }, corsHeaders, 400);
        }

        // Cap TTL: short-lived URLs limit leak impact (STOR-004)
        const requestedTtl = Number(expires_in) || 3600;
        const ttl = Math.min(Math.max(requestedTtl, 60), MAX_SIGNED_URL_TTL);

        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, ttl);

        if (error) {
          console.error(`[Secure Storage] Signed URL error:`, error);
          return jsonResponse({ success: false, error: 'Could not create signed URL' }, corsHeaders, 500);
        }

        console.log(`[Secure Storage] Created signed URL: ${bucket}/${path} (ttl=${ttl}s)`);
        return jsonResponse({ success: true, data: { signedUrl: data.signedUrl } }, corsHeaders);
      }

      case 'list': {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(typeof path === 'string' ? path : '', {
            limit: 100,
            offset: 0
          });

        if (error) {
          console.error(`[Secure Storage] List error:`, error);
          return jsonResponse({ success: false, error: 'List failed' }, corsHeaders, 500);
        }

        console.log(`[Secure Storage] Listed: ${bucket}/${path || ''} (${data?.length || 0} items)`);
        return jsonResponse({ success: true, data: { files: data } }, corsHeaders);
      }

      case 'publicUrl': {
        // Policy-gated: only buckets explicitly marked public (branding assets)
        if (!policy.allowPublicUrl) {
          return createForbiddenResponse('Public URLs are not available for this bucket', corsHeaders);
        }
        if (!path) {
          return jsonResponse({ success: false, error: 'Missing path' }, corsHeaders, 400);
        }

        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);

        console.log(`[Secure Storage] Public URL: ${bucket}/${path}`);
        return jsonResponse({ success: true, data: { publicUrl: data.publicUrl } }, corsHeaders);
      }

      default:
        return jsonResponse({ success: false, error: 'Unknown operation' }, corsHeaders, 400);
    }

  } catch (error) {
    console.error('[Secure Storage] Error:', error);
    // Generic public error; details stay in server logs (ERR-001)
    return jsonResponse({ success: false, error: 'Internal error' }, corsHeaders, 500);
  }
});

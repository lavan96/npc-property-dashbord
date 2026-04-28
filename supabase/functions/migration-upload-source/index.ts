/**
 * Migration Upload Source
 *
 * Stages CSV/XLSX-derived records (already parsed in the browser) for the
 * GHL contacts/opportunities migration workers to consume in place of live
 * GHL pagination. Returns an `upload_id` the dashboard then injects into
 * the migration dispatch payload.
 *
 * Superadmin only. Service role bypass also accepted.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {
  verifyAuth,
  createCorsHeaders,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../_shared/auth.ts';

const VALID_DOMAINS = ['contacts', 'opportunities'] as const;
type Domain = typeof VALID_DOMAINS[number];

const MAX_RECORDS = 50_000; // hard ceiling to protect the JSONB column

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));

    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError || !userId) {
      return createUnauthorizedResponse(authError || 'Authentication required', corsHeaders);
    }

    if (userId !== 'service_role') {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      const isSuperadmin = (roleRows || []).some((r: any) => r.role === 'superadmin');
      if (!isSuperadmin) {
        return createForbiddenResponse('Superadmin access required', corsHeaders);
      }
    }

    const action = String(body.action || 'create');

    // ── List recent uploads ──────────────────────────────────────────
    if (action === 'list') {
      const domain = String(body.domain || '');
      let q = supabase
        .from('migration_uploaded_sources')
        .select('id, domain, file_name, row_count, notes, uploaded_by, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (VALID_DOMAINS.includes(domain as Domain)) q = q.eq('domain', domain);
      const { data, error } = await q;
      if (error) {
        return jsonError(corsHeaders, `List failed: ${error.message}`, 500);
      }
      return jsonOk(corsHeaders, { uploads: data || [] });
    }

    // ── Delete an upload ─────────────────────────────────────────────
    if (action === 'delete') {
      const id = String(body.upload_id || '');
      if (!id) return jsonError(corsHeaders, 'upload_id required', 400);
      const { error } = await supabase
        .from('migration_uploaded_sources')
        .delete()
        .eq('id', id);
      if (error) return jsonError(corsHeaders, `Delete failed: ${error.message}`, 500);
      return jsonOk(corsHeaders, { deleted: id });
    }

    // ── Default: create a new upload from parsed records ────────────
    const domain = String(body.domain || '') as Domain;
    if (!VALID_DOMAINS.includes(domain)) {
      return jsonError(corsHeaders, `domain must be one of: ${VALID_DOMAINS.join(', ')}`, 400);
    }

    const records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return jsonError(corsHeaders, 'records (non-empty array) required', 400);
    }
    if (records.length > MAX_RECORDS) {
      return jsonError(
        corsHeaders,
        `Too many records: ${records.length}. Hard cap is ${MAX_RECORDS}. Split the file and upload in batches.`,
        400,
      );
    }

    const fileName = body.file_name ? String(body.file_name).slice(0, 240) : null;
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;

    const { data: row, error: insertErr } = await supabase
      .from('migration_uploaded_sources')
      .insert({
        domain,
        file_name: fileName,
        row_count: records.length,
        records,
        uploaded_by: userId === 'service_role' ? null : userId,
        notes,
      })
      .select('id, domain, file_name, row_count, created_at')
      .single();

    if (insertErr) {
      console.error('[migration-upload-source] insert failed:', insertErr.message);
      return jsonError(corsHeaders, `Insert failed: ${insertErr.message}`, 500);
    }

    console.log(`[migration-upload-source] upload ${row.id} domain=${domain} rows=${row.row_count}`);

    return jsonOk(corsHeaders, { upload: row });
  } catch (err: any) {
    console.error('[migration-upload-source] unexpected error:', err);
    return jsonError(corsHeaders, err?.message || 'Unexpected error', 500);
  }
});

function jsonOk(corsHeaders: Record<string, string>, payload: any) {
  return new Response(JSON.stringify({ success: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(corsHeaders: Record<string, string>, error: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

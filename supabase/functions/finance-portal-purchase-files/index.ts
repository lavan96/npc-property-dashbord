/**
 * Finance Portal — Purchase Files (Deal Rooms)
 * Operations: list_files, get_file, create_file, update_file, archive_file,
 *             list_critical_dates, upsert_critical_date, delete_critical_date,
 *             list_history
 *
 * All requests carry a finance-portal session token. Access is gated by:
 *   1. Valid session on finance_portal_users
 *   2. The portal user must have an assignment to the client (finance_portal_client_assignments)
 *   3. Permission key 'purchase_files' { view, edit, delete } resolved via OR-merge of
 *      global_permissions and assignment.permissions (matches existing finance-portal-client-data)
 */
import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PURCHASE_FILE_COLUMNS = [
  'title','purchase_type','status','finance_status','property_address','property_suburb',
  'property_state','property_postcode','purchase_price','deposit_amount','max_approved_budget',
  'lender','estimated_rent_weekly','client_contribution','settlement_date','finance_clause_date',
  'assigned_finance_user_id','assigned_team_user_id','risk_level','notes',
];

const CRITICAL_DATE_COLUMNS = ['date_type','due_date','status','notes','completed_at'];

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractToken(headers: Headers, body?: any): string | null {
  return headers.get('x-finance-session-token')
    || body?.finance_session_token
    || headers.get('x-session-token')
    || body?.session_token
    || null;
}

function mergePermissions(global: any, perClient: any) {
  const out: Record<string, { view: boolean; edit: boolean; delete: boolean }> = {};
  const keys = new Set<string>([
    ...Object.keys(global && typeof global === 'object' ? global : {}),
    ...Object.keys(perClient && typeof perClient === 'object' ? perClient : {}),
  ]);
  for (const k of keys) {
    const g = (global && global[k]) || {};
    const p = (perClient && perClient[k]) || {};
    out[k] = {
      view: !!(g.view || p.view),
      edit: !!(g.edit || p.edit),
      delete: !!(g.delete || p.delete),
    };
  }
  return out;
}

function pickAllowed(payload: any, allowed: string[]) {
  const out: Record<string, any> = {};
  if (!payload || typeof payload !== 'object') return out;
  for (const k of allowed) if (k in payload) out[k] = payload[k];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const sessionToken = extractToken(req.headers, body);
    if (!sessionToken) return jsonResponse({ error: 'Session token required' }, 401);

    const { data: portalUser, error: puErr } = await supabase
      .from('finance_portal_users')
      .select('id, email, is_active, revoked_at, session_expires_at, global_permissions')
      .eq('session_token', sessionToken)
      .maybeSingle();

    if (puErr || !portalUser || !portalUser.is_active || portalUser.revoked_at) {
      return jsonResponse({ error: 'Invalid session' }, 401);
    }
    if (!portalUser.session_expires_at || new Date(portalUser.session_expires_at) < new Date()) {
      return jsonResponse({ error: 'Session expired' }, 401);
    }

    const { operation } = body;
    if (!operation) return jsonResponse({ error: 'operation required' }, 400);

    // Helper: resolve permissions for a given client_id; returns null if not assigned.
    // Default-allow purchase_files (view+edit) when the matrix doesn't mention it yet,
    // so existing finance partner assignments work immediately.
    async function getEffectivePermissions(clientId: string) {
      const { data: assignment } = await supabase
        .from('finance_portal_client_assignments')
        .select('permissions')
        .eq('finance_portal_user_id', portalUser.id)
        .eq('client_id', clientId)
        .maybeSingle();
      if (!assignment) return null;
      const merged = mergePermissions(portalUser.global_permissions, assignment.permissions);
      const globalHas = portalUser.global_permissions && (portalUser.global_permissions as any).purchase_files;
      const clientHas = assignment.permissions && (assignment.permissions as any).purchase_files;
      if (!globalHas && !clientHas) {
        merged.purchase_files = { view: true, edit: true, delete: false };
      }
      return merged;
    }

    // Helper: resolve client_id for a purchase_file_id
    async function getClientForFile(fileId: string): Promise<string | null> {
      const { data } = await supabase
        .from('purchase_files')
        .select('client_id')
        .eq('id', fileId)
        .maybeSingle();
      return data?.client_id || null;
    }

    // ─── List all purchase files visible to this partner ───
    if (operation === 'list_files') {
      const { data: assignments } = await supabase
        .from('finance_portal_client_assignments')
        .select('client_id, permissions')
        .eq('finance_portal_user_id', portalUser.id);

      const allowedClientIds = (assignments || [])
        .filter(a => {
          const perms = mergePermissions(portalUser.global_permissions, a.permissions);
          return perms.purchase_files?.view;
        })
        .map(a => a.client_id);

      if (allowedClientIds.length === 0) return jsonResponse({ files: [] });

      const { data: files, error } = await supabase
        .from('purchase_files')
        .select(`
          *,
          clients!inner(id, primary_first_name, primary_surname, primary_email),
          purchase_file_critical_dates(id, date_type, due_date, status)
        `)
        .in('client_id', allowedClientIds)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ files });
    }

    // ─── Get one file ───
    if (operation === 'get_file') {
      const fileId = body.file_id;
      if (!fileId) return jsonResponse({ error: 'file_id required' }, 400);
      const clientId = await getClientForFile(fileId);
      if (!clientId) return jsonResponse({ error: 'Not found' }, 404);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.view) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data: file, error } = await supabase
        .from('purchase_files')
        .select(`
          *,
          clients!inner(id, primary_first_name, primary_surname, primary_email, primary_mobile),
          purchase_file_critical_dates(*),
          purchase_file_status_history(*)
        `)
        .eq('id', fileId)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ file });
    }

    // ─── Create file ───
    if (operation === 'create_file') {
      const clientId = body.client_id;
      const payload = body.payload || {};
      if (!clientId) return jsonResponse({ error: 'client_id required' }, 400);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.edit) return jsonResponse({ error: 'Forbidden' }, 403);

      const insert = pickAllowed(payload, PURCHASE_FILE_COLUMNS);
      if (!insert.title) return jsonResponse({ error: 'title required' }, 400);

      const { data: created, error } = await supabase
        .from('purchase_files')
        .insert({
          ...insert,
          client_id: clientId,
          assigned_finance_user_id: insert.assigned_finance_user_id || portalUser.id,
          created_by: portalUser.id,
        })
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ file: created });
    }

    // ─── Update file ───
    if (operation === 'update_file') {
      const fileId = body.file_id;
      const payload = body.payload || {};
      if (!fileId) return jsonResponse({ error: 'file_id required' }, 400);
      const clientId = await getClientForFile(fileId);
      if (!clientId) return jsonResponse({ error: 'Not found' }, 404);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.edit) return jsonResponse({ error: 'Forbidden' }, 403);

      const update = pickAllowed(payload, PURCHASE_FILE_COLUMNS);
      const { data: updated, error } = await supabase
        .from('purchase_files')
        .update(update)
        .eq('id', fileId)
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ file: updated });
    }

    // ─── Archive ───
    if (operation === 'archive_file') {
      const fileId = body.file_id;
      if (!fileId) return jsonResponse({ error: 'file_id required' }, 400);
      const clientId = await getClientForFile(fileId);
      if (!clientId) return jsonResponse({ error: 'Not found' }, 404);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.delete) return jsonResponse({ error: 'Forbidden' }, 403);
      const { error } = await supabase
        .from('purchase_files')
        .update({ archived_at: new Date().toISOString(), status: 'cancelled' })
        .eq('id', fileId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // ─── Critical dates ───
    if (operation === 'upsert_critical_date') {
      const fileId = body.file_id;
      const payload = body.payload || {};
      if (!fileId) return jsonResponse({ error: 'file_id required' }, 400);
      const clientId = await getClientForFile(fileId);
      if (!clientId) return jsonResponse({ error: 'Not found' }, 404);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.edit) return jsonResponse({ error: 'Forbidden' }, 403);

      const row = pickAllowed(payload, CRITICAL_DATE_COLUMNS);
      if (payload.id) {
        const { data, error } = await supabase
          .from('purchase_file_critical_dates')
          .update(row)
          .eq('id', payload.id)
          .eq('purchase_file_id', fileId)
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ date: data });
      }
      const { data, error } = await supabase
        .from('purchase_file_critical_dates')
        .insert({ ...row, purchase_file_id: fileId })
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ date: data });
    }

    if (operation === 'delete_critical_date') {
      const fileId = body.file_id;
      const dateId = body.date_id;
      if (!fileId || !dateId) return jsonResponse({ error: 'file_id and date_id required' }, 400);
      const clientId = await getClientForFile(fileId);
      if (!clientId) return jsonResponse({ error: 'Not found' }, 404);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.edit) return jsonResponse({ error: 'Forbidden' }, 403);
      const { error } = await supabase
        .from('purchase_file_critical_dates')
        .delete()
        .eq('id', dateId)
        .eq('purchase_file_id', fileId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (operation === 'list_files_for_client') {
      const clientId = body.client_id;
      if (!clientId) return jsonResponse({ error: 'client_id required' }, 400);
      const perms = await getEffectivePermissions(clientId);
      if (!perms?.purchase_files?.view) return jsonResponse({ error: 'Forbidden' }, 403);
      const { data, error } = await supabase
        .from('purchase_files')
        .select('*, purchase_file_critical_dates(id, date_type, due_date, status)')
        .eq('client_id', clientId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ files: data });
    }

    return jsonResponse({ error: `Unknown operation: ${operation}` }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Unexpected error' }, 500);
  }
});

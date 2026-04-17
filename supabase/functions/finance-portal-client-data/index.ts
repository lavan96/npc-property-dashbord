/**
 * Finance Portal Client Data Edge Function
 * Session-validated, permission-enforced CRUD proxy for finance portal users.
 *
 * Auth: Validates `x-finance-session-token` (or body.finance_session_token) against
 *       finance_portal_users.session_token. Enforces session expiry & active status.
 *
 * Permission model: Each operation includes `client_id` and `table` (one of:
 *   properties, income, expenses, assets, liabilities, employment, notes, contacts).
 *   The function loads the user's permissions matrix for that client from
 *   finance_portal_client_assignments and checks view/edit/delete before proceeding.
 *
 * Operations:
 *   - list_clients:       Lists assigned clients with summary info
 *   - get_client:         Loads a single client (must be assigned)
 *   - get_client_data:    Loads all sub-table data the user can VIEW for a client
 *   - create:             Insert into a sub-table (requires edit)
 *   - update:             Update a record by id (requires edit)
 *   - delete:             Delete a record by id (requires delete)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { createCorsHeaders } from "../_shared/auth.ts";

const TABLE_MAP: Record<string, string> = {
  properties: 'client_properties',
  income: 'client_income',
  expenses: 'client_expenses',
  assets: 'client_assets',
  liabilities: 'client_liabilities',
  employment: 'client_employment',
  notes: 'client_notes',
  contacts: 'client_additional_contacts',
};

type PermKey = keyof typeof TABLE_MAP;
type PermAction = 'view' | 'edit' | 'delete';

function extractSessionToken(headers: Headers, body?: any): string | null {
  return (
    headers.get('x-finance-session-token') ||
    body?.finance_session_token ||
    headers.get('x-session-token') ||
    body?.session_token ||
    null
  );
}

function jsonResponse(payload: any, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function checkPermission(
  permissions: any,
  table: string,
  action: PermAction,
): boolean {
  if (!permissions || typeof permissions !== 'object') return false;
  const tablePerms = permissions[table];
  if (!tablePerms || typeof tablePerms !== 'object') return false;
  return tablePerms[action] === true;
}

async function logActivity(
  supabase: any,
  financeUserId: string,
  clientId: string | null,
  action: string,
  metadata: Record<string, any> = {},
) {
  try {
    await supabase.from('finance_portal_activity_log').insert({
      finance_user_id: financeUserId,
      client_id: clientId,
      action,
      metadata,
    });
  } catch (e) {
    console.error('Activity log failed:', e);
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sessionToken = extractSessionToken(req.headers, body);

    if (!sessionToken) {
      return jsonResponse({ error: 'Session token is required' }, 401, corsHeaders);
    }

    // Validate session
    const { data: portalUser, error: userErr } = await supabase
      .from('finance_portal_users')
      .select('id, email, is_active, revoked_at, session_expires_at, finance_contact_id')
      .eq('session_token', sessionToken)
      .maybeSingle();

    if (userErr || !portalUser || !portalUser.is_active || portalUser.revoked_at) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401, corsHeaders);
    }
    if (!portalUser.session_expires_at || new Date(portalUser.session_expires_at) < new Date()) {
      return jsonResponse({ error: 'Session expired' }, 401, corsHeaders);
    }

    const financeUserId = portalUser.id;
    const { operation, client_id, table, record_id, data } = body;

    // ── list_clients: Return summary list of assigned clients ──
    if (operation === 'list_clients') {
      const { data: assignments, error: aErr } = await supabase
        .from('finance_portal_client_assignments')
        .select('client_id, permissions, assigned_at, auto_linked, auto_link_source')
        .eq('finance_user_id', financeUserId);

      if (aErr) throw aErr;
      if (!assignments || assignments.length === 0) {
        return jsonResponse({ clients: [] }, 200, corsHeaders);
      }

      const clientIds = assignments.map((a: any) => a.client_id);
      const { data: clients, error: cErr } = await supabase
        .from('clients')
        .select('id, first_name, surname, email, mobile, status, dealflow_status, current_address, created_at, updated_at')
        .in('id', clientIds);

      if (cErr) throw cErr;

      const permsByClient = new Map(assignments.map((a: any) => [a.client_id, a]));
      const merged = (clients || []).map((c: any) => {
        const a = permsByClient.get(c.id) as any;
        return {
          ...c,
          full_name: `${c.first_name || ''} ${c.surname || ''}`.trim(),
          permissions: a?.permissions ?? null,
          assigned_at: a?.assigned_at ?? null,
          auto_linked: a?.auto_linked ?? false,
          auto_link_source: a?.auto_link_source ?? null,
        };
      });

      // Sort alphabetically by full name
      merged.sort((x: any, y: any) => x.full_name.localeCompare(y.full_name));

      return jsonResponse({ clients: merged }, 200, corsHeaders);
    }

    // For all other operations, client_id is required and must be assigned
    if (!client_id) {
      return jsonResponse({ error: 'client_id is required' }, 400, corsHeaders);
    }

    const { data: assignment, error: assignErr } = await supabase
      .from('finance_portal_client_assignments')
      .select('id, permissions')
      .eq('finance_user_id', financeUserId)
      .eq('client_id', client_id)
      .maybeSingle();

    if (assignErr || !assignment) {
      return jsonResponse({ error: 'You do not have access to this client' }, 403, corsHeaders);
    }
    const permissions = assignment.permissions;

    // ── get_client: Single client basic info ──
    if (operation === 'get_client') {
      const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .maybeSingle();
      if (error || !client) return jsonResponse({ error: 'Client not found' }, 404, corsHeaders);
      return jsonResponse({ client, permissions }, 200, corsHeaders);
    }

    // ── get_client_data: All sub-table data the user can VIEW ──
    if (operation === 'get_client_data') {
      const result: Record<string, any[]> = {};
      for (const key of Object.keys(TABLE_MAP) as PermKey[]) {
        if (!checkPermission(permissions, key, 'view')) {
          result[key] = [];
          continue;
        }
        const dbTable = TABLE_MAP[key];
        const { data: rows, error } = await supabase
          .from(dbTable)
          .select('*')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false });
        if (error) {
          console.error(`Failed to load ${dbTable}:`, error);
          result[key] = [];
        } else {
          result[key] = rows || [];
        }
      }
      return jsonResponse({ data: result, permissions }, 200, corsHeaders);
    }

    // CRUD operations require `table` to be one of the 8 permitted keys
    if (!table || !(table in TABLE_MAP)) {
      return jsonResponse({ error: 'Invalid or missing table' }, 400, corsHeaders);
    }
    const dbTable = TABLE_MAP[table as PermKey];

    // ── create ──
    if (operation === 'create') {
      if (!checkPermission(permissions, table, 'edit')) {
        return jsonResponse({ error: 'You do not have edit permission on this table' }, 403, corsHeaders);
      }
      if (!data || typeof data !== 'object') {
        return jsonResponse({ error: 'data is required' }, 400, corsHeaders);
      }
      const insertPayload = { ...data, client_id };
      // Strip server-managed fields
      delete (insertPayload as any).id;
      delete (insertPayload as any).created_at;
      delete (insertPayload as any).updated_at;

      const { data: inserted, error } = await supabase
        .from(dbTable)
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error(`Insert into ${dbTable} failed:`, error);
        return jsonResponse({ error: error.message }, 400, corsHeaders);
      }
      await logActivity(supabase, financeUserId, client_id, 'create', { table, record_id: inserted.id });
      return jsonResponse({ record: inserted }, 200, corsHeaders);
    }

    // ── update ──
    if (operation === 'update') {
      if (!checkPermission(permissions, table, 'edit')) {
        return jsonResponse({ error: 'You do not have edit permission on this table' }, 403, corsHeaders);
      }
      if (!record_id || !data) {
        return jsonResponse({ error: 'record_id and data are required' }, 400, corsHeaders);
      }
      // Verify record belongs to client
      const { data: existing, error: chkErr } = await supabase
        .from(dbTable)
        .select('id, client_id')
        .eq('id', record_id)
        .maybeSingle();
      if (chkErr || !existing || existing.client_id !== client_id) {
        return jsonResponse({ error: 'Record not found for this client' }, 404, corsHeaders);
      }

      const updatePayload = { ...data };
      delete (updatePayload as any).id;
      delete (updatePayload as any).client_id;
      delete (updatePayload as any).created_at;

      const { data: updated, error } = await supabase
        .from(dbTable)
        .update(updatePayload)
        .eq('id', record_id)
        .select()
        .single();

      if (error) {
        console.error(`Update ${dbTable} failed:`, error);
        return jsonResponse({ error: error.message }, 400, corsHeaders);
      }
      await logActivity(supabase, financeUserId, client_id, 'update', { table, record_id });
      return jsonResponse({ record: updated }, 200, corsHeaders);
    }

    // ── delete ──
    if (operation === 'delete') {
      if (!checkPermission(permissions, table, 'delete')) {
        return jsonResponse({ error: 'You do not have delete permission on this table' }, 403, corsHeaders);
      }
      if (!record_id) {
        return jsonResponse({ error: 'record_id is required' }, 400, corsHeaders);
      }
      const { data: existing, error: chkErr } = await supabase
        .from(dbTable)
        .select('id, client_id')
        .eq('id', record_id)
        .maybeSingle();
      if (chkErr || !existing || existing.client_id !== client_id) {
        return jsonResponse({ error: 'Record not found for this client' }, 404, corsHeaders);
      }
      const { error } = await supabase.from(dbTable).delete().eq('id', record_id);
      if (error) {
        return jsonResponse({ error: error.message }, 400, corsHeaders);
      }
      await logActivity(supabase, financeUserId, client_id, 'delete', { table, record_id });
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    return jsonResponse({ error: `Unknown operation: ${operation}` }, 400, corsHeaders);
  } catch (error: any) {
    console.error('finance-portal-client-data error:', error);
    return jsonResponse({ error: error.message || 'Internal server error' }, 500, corsHeaders);
  }
});

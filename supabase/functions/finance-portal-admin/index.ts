/**
 * Finance Portal Admin Edge Function
 * Internal admin operations for managing finance portal users, assignments,
 * permission matrices, default templates, and activity logs.
 *
 * Operations:
 *  - list_users:                List all finance contacts with portal status
 *  - list_clients:              List all clients (for assignment picker)
 *  - get_assignments:           Get all client assignments for a finance user
 *  - upsert_assignment:         Create/update an assignment + permissions matrix
 *  - delete_assignment:         Remove a client from a finance user
 *  - bulk_assign:               Auto-link clients to a user (multiple sources)
 *  - get_default_permissions:   Read configurable default template
 *  - update_default_permissions: Save the default template
 *  - get_activity_log:          Paged activity feed
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { createCorsHeaders, verifyAuth } from "../_shared/auth.ts";

const PERMISSION_TABLES = [
  'properties', 'income', 'expenses', 'assets',
  'liabilities', 'employment', 'notes', 'contacts'
] as const;

const EMPTY_PERMISSIONS = PERMISSION_TABLES.reduce((acc, t) => {
  acc[t] = { view: false, edit: false, delete: false };
  return acc;
}, {} as Record<string, { view: boolean; edit: boolean; delete: boolean }>);

function normalizePermissions(input: any): Record<string, { view: boolean; edit: boolean; delete: boolean }> {
  const out = JSON.parse(JSON.stringify(EMPTY_PERMISSIONS));
  if (!input || typeof input !== 'object') return out;
  for (const t of PERMISSION_TABLES) {
    const p = input[t];
    if (p && typeof p === 'object') {
      out[t] = {
        view: !!p.view,
        edit: !!p.edit,
        delete: !!p.delete,
      };
    }
  }
  return out;
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
    const { operation } = body;

    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const adminUserId = auth.userId === 'service_role' ? null : auth.userId;

    // ── list_users: finance contacts joined with portal status ──
    if (operation === 'list_users') {
      const { data: contacts, error: cErr } = await supabase
        .from('finance_agent_contacts')
        .select('id, name, email, company, contact_type, is_active, is_default, notes, created_at')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (cErr) throw cErr;

      const { data: portalUsers, error: pErr } = await supabase
        .from('finance_portal_users')
        .select('id, finance_contact_id, email, is_active, invite_sent_at, invite_accepted_at, invite_token_expires_at, last_login_at, revoked_at, has_accepted_terms, has_completed_onboarding, created_at');

      if (pErr) throw pErr;

      const portalByContact = new Map(
        (portalUsers || []).map((u: any) => [u.finance_contact_id, u])
      );

      const records = (contacts || []).map((c: any) => {
        const pu = portalByContact.get(c.id) as any;
        let status: string = 'no_access';
        if (pu) {
          if (pu.revoked_at) status = 'revoked';
          else if (!pu.invite_accepted_at && pu.invite_token_expires_at && new Date(pu.invite_token_expires_at) > new Date()) status = 'invited';
          else if (!pu.invite_accepted_at) status = 'invite_expired';
          else if (pu.is_active) status = 'active';
          else status = 'inactive';
        }
        return { ...c, portal_user: pu || null, status };
      });

      return new Response(
        JSON.stringify({ success: true, records }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── list_clients: minimal list for assignment picker ──
    if (operation === 'list_clients') {
      const search = (body.search || '').toString().trim();
      let query = supabase
        .from('clients')
        .select('id, primary_contact_name, secondary_contact_name, primary_contact_email, primary_contact_phone, finance_contact_id, status, created_at')
        .order('primary_contact_name', { ascending: true })
        .limit(500);

      if (search) {
        query = query.or(
          `primary_contact_name.ilike.%${search}%,secondary_contact_name.ilike.%${search}%,primary_contact_email.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, records: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_assignments for a finance user ──
    if (operation === 'get_assignments') {
      const { finance_user_id } = body;
      if (!finance_user_id) {
        return new Response(
          JSON.stringify({ error: 'finance_user_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: assignments, error: aErr } = await supabase
        .from('finance_portal_client_assignments')
        .select('id, client_id, permissions, auto_linked, auto_link_source, assigned_at, assigned_by, updated_at')
        .eq('finance_user_id', finance_user_id);

      if (aErr) throw aErr;

      const clientIds = (assignments || []).map((a: any) => a.client_id);
      let clientsMap = new Map<string, any>();
      if (clientIds.length) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, primary_contact_name, secondary_contact_name, primary_contact_email, status, finance_contact_id')
          .in('id', clientIds);
        clientsMap = new Map((clients || []).map((c: any) => [c.id, c]));
      }

      const records = (assignments || []).map((a: any) => ({
        ...a,
        client: clientsMap.get(a.client_id) || null,
      }));

      return new Response(
        JSON.stringify({ success: true, records }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── upsert_assignment ──
    if (operation === 'upsert_assignment') {
      const { finance_user_id, client_id, permissions, auto_link_source } = body;
      if (!finance_user_id || !client_id) {
        return new Response(
          JSON.stringify({ error: 'finance_user_id and client_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const normalized = normalizePermissions(permissions);

      const { data: upserted, error: uErr } = await supabase
        .from('finance_portal_client_assignments')
        .upsert(
          {
            finance_user_id,
            client_id,
            permissions: normalized,
            auto_linked: !!auto_link_source,
            auto_link_source: auto_link_source || null,
            assigned_by: adminUserId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'finance_user_id,client_id' }
        )
        .select('id')
        .maybeSingle();

      if (uErr) throw uErr;

      await supabase.from('finance_portal_activity_log').insert({
        finance_user_id,
        client_id,
        actor_user_id: adminUserId,
        actor_type: 'admin',
        action: 'assignment_upserted',
        entity_type: 'finance_portal_client_assignment',
        entity_id: upserted?.id || null,
        metadata: { permissions: normalized, auto_link_source: auto_link_source || null },
      });

      return new Response(
        JSON.stringify({ success: true, id: upserted?.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── delete_assignment ──
    if (operation === 'delete_assignment') {
      const { assignment_id } = body;
      if (!assignment_id) {
        return new Response(
          JSON.stringify({ error: 'assignment_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existing } = await supabase
        .from('finance_portal_client_assignments')
        .select('id, finance_user_id, client_id')
        .eq('id', assignment_id)
        .maybeSingle();

      const { error: dErr } = await supabase
        .from('finance_portal_client_assignments')
        .delete()
        .eq('id', assignment_id);

      if (dErr) throw dErr;

      if (existing) {
        await supabase.from('finance_portal_activity_log').insert({
          finance_user_id: existing.finance_user_id,
          client_id: existing.client_id,
          actor_user_id: adminUserId,
          actor_type: 'admin',
          action: 'assignment_removed',
          entity_type: 'finance_portal_client_assignment',
          entity_id: existing.id,
        });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── bulk_assign: auto-link by source (assigned_contact, deal_pipeline, both) ──
    if (operation === 'bulk_assign') {
      const { finance_user_id, source } = body;
      if (!finance_user_id) {
        return new Response(
          JSON.stringify({ error: 'finance_user_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const sourceMode = source === 'deal_pipeline' || source === 'assigned_contact' || source === 'both' ? source : 'both';

      // Resolve the finance contact id of the portal user
      const { data: pUser } = await supabase
        .from('finance_portal_users')
        .select('finance_contact_id')
        .eq('id', finance_user_id)
        .maybeSingle();

      if (!pUser) {
        return new Response(
          JSON.stringify({ error: 'Finance portal user not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Default template
      const { data: defaults } = await supabase
        .from('finance_portal_default_permissions')
        .select('permissions')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const defaultPerms = normalizePermissions(defaults?.permissions);

      const candidateClients = new Set<string>();
      const sourceMap = new Map<string, string>();

      if (sourceMode === 'assigned_contact' || sourceMode === 'both') {
        const { data: rows } = await supabase
          .from('clients')
          .select('id')
          .eq('finance_contact_id', pUser.finance_contact_id);
        for (const r of rows || []) {
          candidateClients.add(r.id);
          sourceMap.set(r.id, 'assigned_contact');
        }
      }

      if (sourceMode === 'deal_pipeline' || sourceMode === 'both') {
        const { data: deals } = await supabase
          .from('client_deals')
          .select('client_id, finance_contact_id')
          .eq('finance_contact_id', pUser.finance_contact_id);
        for (const d of deals || []) {
          if (!d.client_id) continue;
          candidateClients.add(d.client_id);
          const prev = sourceMap.get(d.client_id);
          sourceMap.set(d.client_id, prev && prev !== 'deal_pipeline' ? 'both' : 'deal_pipeline');
        }
      }

      let created = 0;
      for (const clientId of candidateClients) {
        const { data: existing } = await supabase
          .from('finance_portal_client_assignments')
          .select('id')
          .eq('finance_user_id', finance_user_id)
          .eq('client_id', clientId)
          .maybeSingle();

        if (existing) continue;

        const { error: insErr } = await supabase
          .from('finance_portal_client_assignments')
          .insert({
            finance_user_id,
            client_id: clientId,
            permissions: defaultPerms,
            auto_linked: true,
            auto_link_source: sourceMap.get(clientId) || sourceMode,
            assigned_by: adminUserId,
          });
        if (!insErr) created++;
      }

      await supabase.from('finance_portal_activity_log').insert({
        finance_user_id,
        actor_user_id: adminUserId,
        actor_type: 'admin',
        action: 'bulk_auto_linked',
        entity_type: 'finance_portal_user',
        entity_id: finance_user_id,
        metadata: { source: sourceMode, created },
      });

      return new Response(
        JSON.stringify({ success: true, created, total_candidates: candidateClients.size }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_default_permissions ──
    if (operation === 'get_default_permissions') {
      const { data, error } = await supabase
        .from('finance_portal_default_permissions')
        .select('id, permissions, updated_at, updated_by')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return new Response(
        JSON.stringify({
          success: true,
          record: data || { permissions: EMPTY_PERMISSIONS, updated_at: null, updated_by: null },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── update_default_permissions ──
    if (operation === 'update_default_permissions') {
      const { permissions } = body;
      const normalized = normalizePermissions(permissions);

      const { data: existing } = await supabase
        .from('finance_portal_default_permissions')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('finance_portal_default_permissions')
          .update({
            permissions: normalized,
            updated_by: adminUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('finance_portal_default_permissions')
          .insert({ permissions: normalized, updated_by: adminUserId });
        if (error) throw error;
      }

      await supabase.from('finance_portal_activity_log').insert({
        actor_user_id: adminUserId,
        actor_type: 'admin',
        action: 'default_permissions_updated',
        entity_type: 'finance_portal_default_permissions',
        metadata: { permissions: normalized },
      });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_activity_log ──
    if (operation === 'get_activity_log') {
      const { finance_user_id, limit } = body;
      let q = supabase
        .from('finance_portal_activity_log')
        .select('id, finance_user_id, client_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata, ip_address, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit || 100, 500));

      if (finance_user_id) q = q.eq('finance_user_id', finance_user_id);

      const { data, error } = await q;
      if (error) throw error;
      return new Response(
        JSON.stringify({ success: true, records: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown operation: ${operation}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[finance-portal-admin] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

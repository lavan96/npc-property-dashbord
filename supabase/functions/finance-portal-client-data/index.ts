/**
 * Finance Portal Client Data — secure mediation layer
 * Permission-gated CRUD for the 8 sub-tables (+ document, BC, notification, message ops added in Phase 5).
 *
 * All requests carry a finance portal session token (header or body). The function:
 *   1. Validates the session against finance_portal_users
 *   2. Resolves the client_id and looks up the assignment
 *   3. Enforces the per-client permission matrix for the requested operation/table
 *   4. Performs the action with the service role
 *   5. Audits to finance_portal_activity_log
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { buildProvenance, logClientActivity } from "../_shared/client-data-provenance.ts";
import { buildNoteDedupeKey, createSyncEvent, resolveSyncConflict, sha256Text, SYNC_CONFLICT_WINDOW_MS } from "../_shared/client-sync.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TABLE_MAP: Record<string, string> = {
  properties: 'client_properties',
  income: 'client_income',
  expenses: 'client_expenses',
  assets: 'client_assets',
  liabilities: 'client_liabilities',
  employment: 'client_employment',
  notes: 'client_notes',
  contacts: 'client_additional_contacts',
  address_history: 'client_address_history',
};

function extractToken(headers: Headers, body?: any): string | null {
  return headers.get('x-finance-session-token')
    || body?.finance_session_token
    || headers.get('x-session-token')
    || body?.session_token
    || null;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function prepareFinanceNotePayload(supabase: any, clientId: string, payload: Record<string, any>, portalUser: any) {
  const now = new Date().toISOString();
  const content = String(payload.content || '');
  const noteType = String(payload.note_type || 'general');
  const contentHash = await sha256Text(`${noteType}:${content}`);
  const dedupeKey = buildNoteDedupeKey({ clientId, noteType, content });
  const windowStart = new Date(Date.now() - SYNC_CONFLICT_WINDOW_MS).toISOString();

  const { data: existing } = await supabase
    .from('client_notes')
    .select('id, source_surface, created_at, updated_at, version_group_id, version_number, content_hash')
    .eq('client_id', clientId)
    .eq('dedupe_key', dedupeKey)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isDuplicate = !!existing?.content_hash && existing.content_hash === contentHash;
  const resolution = isDuplicate
    ? {
        status: 'duplicate' as const,
        versionGroupId: existing?.version_group_id || crypto.randomUUID(),
        versionNumber: existing?.version_number || 1,
        supersedesEntityId: null,
        conflictReason: 'Identical note already exists from a recent sync window',
        shouldSupersedeExisting: false,
      }
    : resolveSyncConflict({ existing, incomingSurface: 'finance_portal', incomingTimestamp: now });

  const provenance = buildProvenance({
    sourceSurface: 'finance_portal',
    sourceActorType: 'finance_user',
    sourceActorName: portalUser.email ?? null,
    sourceReference: portalUser.id ?? null,
    sourceDetails: { finance_contact_id: portalUser.finance_contact_id ?? null, updated_via: 'finance-portal-client-data' },
  });

  return {
    payload: {
      ...payload,
      ...provenance,
      content_hash: contentHash,
      dedupe_key: dedupeKey,
      sync_status: resolution.status,
      last_synced_at: now,
      last_sync_error: resolution.status === 'conflict' || resolution.status === 'duplicate' ? resolution.conflictReason : null,
      version_group_id: resolution.versionGroupId,
      version_number: resolution.versionNumber,
      supersedes_note_id: resolution.supersedesEntityId,
      source_details: {
        ...(provenance.source_details || {}),
        content_hash: contentHash,
        dedupe_key: dedupeKey,
        sync_conflict_reason: resolution.conflictReason,
      },
    },
    syncMeta: {
      syncStatus: resolution.status,
      dedupeKey,
      contentHash,
      versionGroupId: resolution.versionGroupId,
      versionNumber: resolution.versionNumber,
      supersedesEntityId: resolution.supersedesEntityId,
      conflictReason: resolution.conflictReason,
      shouldSupersedeExisting: resolution.shouldSupersedeExisting,
      existingId: existing?.id || null,
    },
  };
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

    // 1. Validate session
    const { data: portalUser, error: puErr } = await supabase
      .from('finance_portal_users')
      .select('id, finance_contact_id, email, is_active, revoked_at, session_expires_at')
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

    // ── list_assigned_clients ──
    if (operation === 'list_assigned_clients') {
      const { data: assignments, error: aErr } = await supabase
        .from('finance_portal_client_assignments')
        .select('id, client_id, permissions, assigned_at')
        .eq('finance_user_id', portalUser.id);
      if (aErr) throw aErr;

      const clientIds = (assignments || []).map((a: any) => a.client_id);
      if (clientIds.length === 0) {
        return jsonResponse({ success: true, records: [] });
      }

      const { data: clients } = await supabase
        .from('clients')
        .select('id, primary_first_name, primary_surname, secondary_first_name, secondary_surname, primary_email, primary_mobile, deal_status, created_at')
        .in('id', clientIds);

      const cMap = new Map((clients || []).map((c: any) => {
        const primary_contact_name = [c.primary_first_name, c.primary_surname].filter(Boolean).join(' ').trim() || null;
        const secondary_contact_name = [c.secondary_first_name, c.secondary_surname].filter(Boolean).join(' ').trim() || null;
        return [c.id, {
          id: c.id,
          primary_contact_name,
          secondary_contact_name,
          primary_contact_email: c.primary_email,
          primary_contact_phone: c.primary_mobile,
          status: c.deal_status,
          created_at: c.created_at,
        }];
      }));
      const records = (assignments || []).map((a: any) => ({
        assignment_id: a.id,
        client_id: a.client_id,
        permissions: a.permissions,
        assigned_at: a.assigned_at,
        client: cMap.get(a.client_id) || null,
      }));

      return jsonResponse({ success: true, records });
    }

    // For all client-scoped operations, require client_id and check assignment
    const { client_id } = body;
    if (!client_id) return jsonResponse({ error: 'client_id required' }, 400);

    const { data: assignment, error: assignErr } = await supabase
      .from('finance_portal_client_assignments')
      .select('id, permissions')
      .eq('finance_user_id', portalUser.id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (assignErr || !assignment) {
      return jsonResponse({ error: 'You are not assigned to this client' }, 403);
    }

    const permissions = (assignment.permissions || {}) as Record<string, { view: boolean; edit: boolean; delete: boolean }>;

    const audit = async (action: string, tableKey: string | null, entityId: string | null, metadata: any = {}) => {
      try {
        await supabase.from('finance_portal_activity_log').insert({
          finance_user_id: portalUser.id,
          client_id,
          actor_user_id: null,
          actor_type: 'finance_partner',
          action,
          entity_type: tableKey ? `client_${tableKey}` : null,
          entity_id: entityId,
          metadata: { ...metadata, table_key: tableKey, finance_email: portalUser.email },
        });
      } catch (e) {
        console.error('[finance-portal-client-data] audit failed', e);
      }
    };

    // ── get_client_summary ──
    if (operation === 'get_client_summary') {
      const { data: c } = await supabase
        .from('clients')
        .select('id, primary_first_name, primary_surname, secondary_first_name, secondary_surname, primary_email, primary_mobile, current_address, deal_status, created_at')
        .eq('id', client_id)
        .maybeSingle();
      const client = c ? {
        id: c.id,
        primary_contact_name: [c.primary_first_name, c.primary_surname].filter(Boolean).join(' ').trim() || null,
        secondary_contact_name: [c.secondary_first_name, c.secondary_surname].filter(Boolean).join(' ').trim() || null,
        primary_contact_email: c.primary_email,
        primary_contact_phone: c.primary_mobile,
        primary_address: c.current_address,
        status: c.deal_status,
        created_at: c.created_at,
      } : null;
      await audit('view_client_summary', null, client_id);
      return jsonResponse({ success: true, client, permissions });
    }

    // ── list_records ──
    if (operation === 'list_records') {
      const { table_key } = body;
      const dbTable = TABLE_MAP[table_key];
      if (!dbTable) return jsonResponse({ error: 'Unknown table' }, 400);
      if (!permissions[table_key]?.view) return jsonResponse({ error: 'No view permission for ' + table_key }, 403);

      const { data, error } = await supabase
        .from(dbTable)
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      await audit('list_records', table_key, null, { count: data?.length || 0 });
      return jsonResponse({ success: true, records: data || [], permission: permissions[table_key] });
    }

    // ── create_record ──
    if (operation === 'create_record') {
      const { table_key, payload } = body;
      const dbTable = TABLE_MAP[table_key];
      if (!dbTable) return jsonResponse({ error: 'Unknown table' }, 400);
      if (!permissions[table_key]?.edit) return jsonResponse({ error: 'No edit permission for ' + table_key }, 403);

      let insert = { ...(payload || {}), client_id };
      let syncMeta: any = null;
      if (dbTable === 'client_notes') {
        const prepared = await prepareFinanceNotePayload(supabase, client_id, insert, portalUser);
        insert = { ...prepared.payload, client_id };
        syncMeta = prepared.syncMeta;
      }
      const { data, error } = await supabase.from(dbTable).insert(insert).select().maybeSingle();
      if (error) throw error;

      if (dbTable === 'client_notes' && data) {
        if (syncMeta?.shouldSupersedeExisting && syncMeta.existingId) {
          await supabase
            .from('client_notes')
            .update({
              sync_status: 'superseded',
              last_synced_at: new Date().toISOString(),
              last_sync_error: syncMeta.conflictReason,
              supersedes_note_id: data.id,
            })
            .eq('id', syncMeta.existingId)
            .eq('client_id', client_id);
        }

        await logClientActivity(supabase, {
          clientId: client_id,
          activityType: 'note_added',
          title: 'Note added from finance portal',
          description: typeof data.content === 'string' ? data.content.slice(0, 160) : null,
          metadata: {
            note_id: data.id,
            note_type: data.note_type,
            sync_status: data.sync_status,
            conflict_reason: data.last_sync_error || null,
          },
          provenance: {
            sourceSurface: 'finance_portal',
            sourceActorType: 'finance_user',
            sourceActorName: portalUser.email ?? null,
            sourceReference: portalUser.id ?? null,
            sourceDetails: { note_id: data.id },
          },
        });

        await createSyncEvent(supabase, {
          clientId: client_id,
          entityId: data.id,
          entityTable: 'client_notes',
          entityType: 'note',
          sourceSurface: 'finance_portal',
          sourceActorType: 'finance_user',
          sourceActorName: portalUser.email ?? null,
          sourceReference: portalUser.id ?? null,
          sourceDetails: { note_type: data.note_type, operation: 'create' },
          syncStatus: syncMeta?.syncStatus || data.sync_status || 'synced',
          dedupeKey: syncMeta?.dedupeKey || data.dedupe_key || null,
          contentHash: syncMeta?.contentHash || data.content_hash || null,
          propagatedTo: ['internal_dashboard', 'client_portal'],
          versionGroupId: syncMeta?.versionGroupId || data.version_group_id || null,
          versionNumber: syncMeta?.versionNumber || data.version_number || 1,
          supersedesEntityId: syncMeta?.supersedesEntityId || data.supersedes_note_id || null,
          conflictReason: syncMeta?.conflictReason || data.last_sync_error || null,
        });
      }

      await audit('create_record', table_key, data?.id || null, { fields: Object.keys(payload || {}) });
      return jsonResponse({ success: true, record: data });
    }

    // ── update_record ──
    if (operation === 'update_record') {
      const { table_key, record_id, payload } = body;
      const dbTable = TABLE_MAP[table_key];
      if (!dbTable) return jsonResponse({ error: 'Unknown table' }, 400);
      if (!record_id) return jsonResponse({ error: 'record_id required' }, 400);
      if (!permissions[table_key]?.edit) return jsonResponse({ error: 'No edit permission for ' + table_key }, 403);

      const updates = { ...(payload || {}) };
      delete updates.id;
      delete updates.client_id;

      if (dbTable === 'client_notes') {
        const provenance = buildProvenance({
          sourceSurface: 'finance_portal',
          sourceActorType: 'finance_user',
          sourceActorName: portalUser.email ?? null,
          sourceReference: portalUser.id ?? null,
          sourceDetails: { finance_contact_id: portalUser.finance_contact_id ?? null, updated_via: 'finance-portal-client-data' },
        });
        Object.assign(updates, provenance, {
          content_hash: await sha256Text(`${String(updates.note_type || 'general')}:${String(updates.content || '')}`),
          dedupe_key: buildNoteDedupeKey({ clientId: client_id, noteType: String(updates.note_type || 'general'), content: String(updates.content || '') }),
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
        });
      }

      const { data, error } = await supabase
        .from(dbTable)
        .update(updates)
        .eq('id', record_id)
        .eq('client_id', client_id)
        .select()
        .maybeSingle();
      if (error) throw error;

      if (dbTable === 'client_notes' && data) {
        await logClientActivity(supabase, {
          clientId: client_id,
          activityType: 'note_updated',
          title: 'Note updated from finance portal',
          description: typeof data.content === 'string' ? data.content.slice(0, 160) : null,
          metadata: {
            note_id: data.id,
            note_type: data.note_type,
            sync_status: data.sync_status,
          },
          provenance: {
            sourceSurface: 'finance_portal',
            sourceActorType: 'finance_user',
            sourceActorName: portalUser.email ?? null,
            sourceReference: portalUser.id ?? null,
            sourceDetails: { note_id: data.id },
          },
        });

        await createSyncEvent(supabase, {
          clientId: client_id,
          entityId: data.id,
          entityTable: 'client_notes',
          entityType: 'note',
          sourceSurface: 'finance_portal',
          sourceActorType: 'finance_user',
          sourceActorName: portalUser.email ?? null,
          sourceReference: portalUser.id ?? null,
          sourceDetails: { note_type: data.note_type, operation: 'update' },
          syncStatus: data.sync_status || 'synced',
          dedupeKey: data.dedupe_key || null,
          contentHash: data.content_hash || null,
          propagatedTo: ['internal_dashboard', 'client_portal'],
          versionGroupId: data.version_group_id || null,
          versionNumber: data.version_number || 1,
          supersedesEntityId: data.supersedes_note_id || null,
          conflictReason: data.last_sync_error || null,
        });
      }

      await audit('update_record', table_key, record_id, { fields: Object.keys(updates) });
      return jsonResponse({ success: true, record: data });
    }

    // ── get_borrowing_capacity ──
    // Read-only view of latest BC assessment + history. Gated by a virtual `borrowing_capacity` permission key
    // (defaults to view=true if assignment exists and key is missing, mirroring `documents`).
    if (operation === 'get_borrowing_capacity') {
      const bcPerm = permissions.borrowing_capacity;
      const canView = bcPerm ? !!bcPerm.view : true;
      if (!canView) return jsonResponse({ error: 'No view permission for borrowing_capacity' }, 403);

      const { data: assessments, error: bcErr } = await supabase
        .from('borrowing_capacity_assessments')
        .select('id, borrowing_capacity, serviceability_band, monthly_surplus, dti_ratio, stress_tested_capacity, gross_annual_income, shaded_annual_income, living_expenses_monthly, existing_commitments_monthly, interest_rate_used, buffer_rate, assessment_rate, loan_term_years, proposed_loan_amount, proposed_lvr, lmi_amount, net_purchase_capacity, recommendations, warnings, created_at')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .limit(12);
      if (bcErr) throw bcErr;

      const list = assessments || [];
      await audit('view_borrowing_capacity', null, client_id, { count: list.length });
      return jsonResponse({
        success: true,
        latest: list[0] || null,
        history: list,
        permission: { view: canView, edit: false, delete: false },
      });
    }

    // ── delete_record ──
    if (operation === 'delete_record') {
      const { table_key, record_id } = body;
      const dbTable = TABLE_MAP[table_key];
      if (!dbTable) return jsonResponse({ error: 'Unknown table' }, 400);
      if (!record_id) return jsonResponse({ error: 'record_id required' }, 400);
      if (!permissions[table_key]?.delete) return jsonResponse({ error: 'No delete permission for ' + table_key }, 403);

      const { error } = await supabase
        .from(dbTable)
        .delete()
        .eq('id', record_id)
        .eq('client_id', client_id);
      if (error) throw error;
      await audit('delete_record', table_key, record_id);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown operation: ${operation}` }, 400);
  } catch (e: any) {
    console.error('[finance-portal-client-data] error', e);
    return jsonResponse({ error: 'Internal server error', details: e?.message }, 500);
  }
});

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
import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import { buildProvenance, logClientActivity } from "../_shared/client-data-provenance.ts";
import { buildNoteDedupeKey, createSyncEvent, resolveSyncConflict, sha256Text, SYNC_CONFLICT_WINDOW_MS } from "../_shared/client-sync.ts";

const CREATE_CLIENT_PERMISSION_TABLES = [
  'properties', 'income', 'expenses', 'assets', 'liabilities', 'employment', 'address_history', 'notes', 'contacts', 'documents', 'borrowing_capacity', 'messages',
] as const;

const EMPTY_ASSIGNMENT_PERMISSIONS = CREATE_CLIENT_PERMISSION_TABLES.reduce((acc, key) => {
  acc[key] = { view: false, edit: false, delete: false };
  return acc;
}, {} as Record<string, { view: boolean; edit: boolean; delete: boolean }>);

function normalizeAssignmentPermissions(input: any) {
  const out = JSON.parse(JSON.stringify(EMPTY_ASSIGNMENT_PERMISSIONS));
  if (!input || typeof input !== 'object') return out;
  for (const key of CREATE_CLIENT_PERMISSION_TABLES) {
    const permission = input[key];
    if (permission && typeof permission === 'object') {
      out[key] = {
        view: !!permission.view,
        edit: !!permission.edit,
        delete: !!permission.delete,
      };
    }
  }
  return out;
}

function extractPrimaryName(payload: Record<string, any>) {
  return [payload.primary_first_name, payload.primary_surname].filter(Boolean).join(' ').trim() || 'New client';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TABLE_MAP: Record<string, string> = {
  properties: 'client_properties',
  income: 'client_income_sources',
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

// client_income_sources stores annual amounts plus the raw input/frequency used
// for UI conversion. The finance portal form captures the gross annual figure
// directly, so default the conversion fields and required columns here.
function normalizeIncomeSourceFields(input: Record<string, any>) {
  const out = { ...input };
  // Coerce empty strings → null/0 so NOT NULL columns get a usable value.
  const grossRaw = out.gross_annual_amount;
  const gross = grossRaw === '' || grossRaw == null ? 0 : Number(grossRaw) || 0;
  out.gross_annual_amount = gross;
  if (out.input_frequency == null || out.input_frequency === '') out.input_frequency = 'annual';
  if (out.input_amount == null || out.input_amount === '') out.input_amount = gross;
  if (out.source_category == null || out.source_category === '') out.source_category = 'employment';
  if (out.source_type == null || out.source_type === '') out.source_type = 'payg_fulltime';
  if (out.contact_type == null || out.contact_type === '') out.contact_type = 'primary';
  if (out.is_active == null) out.is_active = true;
  if (out.default_shading_rate == null) out.default_shading_rate = 1.0;
  if (out.display_order == null) out.display_order = 0;
  // Coerce optional numeric fields from '' → null so PG numeric cast doesn't fail.
  for (const k of ['bonus','commission','overtime_essential','overtime_non_essential','allowance','other_taxable_income','custom_shading_rate']) {
    if (out[k] === '') out[k] = null;
    else if (out[k] != null) out[k] = Number(out[k]) || 0;
  }
  return out;
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
      visibility: 'shared',
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
      .select('id, finance_contact_id, email, is_active, revoked_at, session_expires_at, global_permissions')
      .eq('session_token', sessionToken)
      .maybeSingle();

    // OR-merge helper: global baseline OR per-client matrix. Either side may be null.
    const mergePermissions = (
      global: any,
      perClient: any,
    ): Record<string, { view: boolean; edit: boolean; delete: boolean }> => {
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
    };

    if (puErr || !portalUser || !portalUser.is_active || portalUser.revoked_at) {
      return jsonResponse({ error: 'Invalid session' }, 401);
    }
    if (!portalUser.session_expires_at || new Date(portalUser.session_expires_at) < new Date()) {
      return jsonResponse({ error: 'Session expired' }, 401);
    }

    const { operation } = body;
    if (!operation) return jsonResponse({ error: 'operation required' }, 400);

    if (operation === 'create_client') {
      const payload = body?.payload;
      if (!payload || typeof payload !== 'object') return jsonResponse({ error: 'payload required' }, 400);

      const primary_first_name = String(payload.primary_first_name || '').trim();
      const primary_surname = String(payload.primary_surname || '').trim();
      if (!primary_first_name || !primary_surname) {
        return jsonResponse({ error: 'Primary first name and surname are required' }, 400);
      }

      const { data: defaultPermsRow } = await supabase
        .from('finance_portal_default_permissions')
        .select('permissions')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const assignmentPermissions = normalizeAssignmentPermissions(defaultPermsRow?.permissions);
      const provenance = buildProvenance({
        sourceSurface: 'finance_portal',
        sourceActorType: 'finance_user',
        sourceActorName: portalUser.email ?? null,
        sourceReference: portalUser.id ?? null,
        sourceDetails: {
          finance_contact_id: portalUser.finance_contact_id ?? null,
          created_via: 'finance-portal-client-data',
          intake_method: body?.intake_method || 'manual',
          ingestion_file_name: body?.ingestion_file_name || null,
        },
      });

      // NOTE: `clients` table has no source_surface/source_actor_* columns — provenance is
      // recorded via lead_source + activity log instead. Spreading `provenance` here used to
      // crash the insert with "column source_surface … does not exist" (Phase 2 #12 fix).
      const clientInsert = {
        primary_first_name,
        primary_surname,
        primary_email: String(payload.primary_email || '').trim() || null,
        primary_mobile: String(payload.primary_mobile || '').trim() || null,
        secondary_first_name: String(payload.secondary_first_name || '').trim() || null,
        secondary_surname: String(payload.secondary_surname || '').trim() || null,
        current_address: String(payload.current_address || '').trim() || null,
        country: String(payload.country || '').trim() || 'Australia',
        deal_status: String(payload.deal_status || '').trim() || 'lead',
        total_portfolio_value: Number(payload.total_portfolio_value || 0),
        total_debt: Number(payload.total_debt || 0),
        total_monthly_income: Number(payload.total_monthly_income || 0),
        total_monthly_expenditure: Number(payload.total_monthly_expenditure || 0),
        total_monthly_rental_income: Number(payload.total_monthly_rental_income || 0),
        net_monthly_cash_flow: Number(payload.net_monthly_cash_flow || 0),
        finance_contact_id: portalUser.finance_contact_id || null,
        ghl_sync_status: 'pending',
        lead_source: 'finance_portal',
        lead_source_detail: `finance_partner:${portalUser.email ?? portalUser.id}`,
      };


      const { data: createdClient, error: clientError } = await supabase
        .from('clients')
        .insert(clientInsert)
        .select('*')
        .single();
      if (clientError) throw clientError;

      const { error: assignmentError } = await supabase
        .from('finance_portal_client_assignments')
        .upsert({
          finance_user_id: portalUser.id,
          client_id: createdClient.id,
          permissions: assignmentPermissions,
          auto_linked: true,
          auto_link_source: 'finance_portal_created',
          assigned_by: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'finance_user_id,client_id' });
      if (assignmentError) {
        // Roll back the just-created client so a failed assignment doesn't leave an
        // orphaned client with no finance-portal assignment (invisible to the partner,
        // and unusable as a target for new purchase files).
        await supabase.from('clients').delete().eq('id', createdClient.id);
        throw assignmentError;
      }

      await logClientActivity(supabase, {
        clientId: createdClient.id,
        activityType: 'client_created',
        title: 'Client created from finance portal',
        description: `Created by finance partner ${portalUser.email ?? 'Unknown finance partner'}`,
        metadata: {
          intake_method: body?.intake_method || 'manual',
          ingestion_file_name: body?.ingestion_file_name || null,
          sync_to_ghl: body?.sync_to_ghl !== false,
        },
        provenance: {
          sourceSurface: 'finance_portal',
          sourceActorType: 'finance_user',
          sourceActorName: portalUser.email ?? null,
          sourceReference: portalUser.id ?? null,
          sourceDetails: { finance_contact_id: portalUser.finance_contact_id ?? null },
        },
      });

      await auditClientCreation(supabase, {
        portalUser,
        clientId: createdClient.id,
        clientName: extractPrimaryName(createdClient),
        intakeMethod: body?.intake_method || 'manual',
        ingestionFileName: body?.ingestion_file_name || null,
      });

      let ghlSync: { success: boolean; error?: string | null } = { success: false, error: null };
      if (body?.sync_to_ghl !== false) {
        try {
          const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-client-to-ghl`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              clientId: createdClient.id,
              source: 'finance_portal',
              sourceActorId: portalUser.id,
            }),
          });

          const syncData = await response.json().catch(() => ({}));
          if (!response.ok || !syncData?.success) {
            ghlSync = { success: false, error: syncData?.error || `HTTP ${response.status}` };
          } else {
            ghlSync = { success: true, error: null };
          }
        } catch (error) {
          ghlSync = { success: false, error: error instanceof Error ? error.message : 'Failed to sync client to GHL' };
        }
      }

      return jsonResponse({
        success: true,
        client: createdClient,
        assignment_permissions: assignmentPermissions,
        ghl_sync: ghlSync,
      });
    }

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

      // Phase 4: active purchase-file rollup per client
      const { data: purchaseFiles } = await supabase
        .from('purchase_files')
        .select(`
          id, client_id, title, status, finance_status, lender,
          max_approved_budget, risk_level, settlement_date, finance_clause_date, updated_at,
          purchase_file_critical_dates(id, date_type, due_date, status)
        `)
        .in('client_id', clientIds)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });

      const pfByClient = new Map<string, any[]>();
      for (const f of purchaseFiles || []) {
        const list = pfByClient.get(f.client_id) || [];
        list.push(f);
        pfByClient.set(f.client_id, list);
      }

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
      const records = (assignments || []).map((a: any) => {
        const files = pfByClient.get(a.client_id) || [];
        const active = files[0] || null;
        let next_deadline: { date_type: string; due_date: string } | null = null;
        if (active) {
          const upcoming = (active.purchase_file_critical_dates || [])
            .filter((d: any) => d.due_date && d.status !== 'completed')
            .sort((x: any, y: any) => (x.due_date || '').localeCompare(y.due_date || ''))[0];
          if (upcoming) next_deadline = { date_type: upcoming.date_type, due_date: upcoming.due_date };
          else if (active.finance_clause_date) next_deadline = { date_type: 'finance_clause', due_date: active.finance_clause_date };
          else if (active.settlement_date) next_deadline = { date_type: 'settlement', due_date: active.settlement_date };
        }
        return {
          assignment_id: a.id,
          client_id: a.client_id,
          permissions: mergePermissions(portalUser.global_permissions, a.permissions),
          assigned_at: a.assigned_at,
          client: cMap.get(a.client_id) || null,
          active_purchase_file: active ? {
            id: active.id,
            title: active.title,
            status: active.status,
            finance_status: active.finance_status,
            lender: active.lender,
            max_approved_budget: active.max_approved_budget,
            risk_level: active.risk_level,
            updated_at: active.updated_at,
          } : null,
          purchase_file_count: files.length,
          next_deadline,
        };
      });

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

    const permissions = mergePermissions(portalUser.global_permissions, assignment.permissions);

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

    async function auditClientCreation(
      sb: any,
      input: { portalUser: any; clientId: string; clientName: string; intakeMethod: string; ingestionFileName?: string | null }
    ) {
      try {
        await sb.from('finance_portal_activity_log').insert({
          finance_user_id: input.portalUser.id,
          client_id: input.clientId,
          actor_user_id: null,
          actor_type: 'finance_partner',
          action: 'client_created',
          entity_type: 'client',
          entity_id: input.clientId,
          metadata: {
            finance_email: input.portalUser.email,
            client_name: input.clientName,
            intake_method: input.intakeMethod,
            ingestion_file_name: input.ingestionFileName || null,
          },
        });
      } catch (error) {
        console.error('[finance-portal-client-data] client creation audit failed', error);
      }
    }

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

      let listQuery = supabase
        .from(dbTable)
        .select('*')
        .eq('client_id', client_id);
      // Finance portal must never see internal-only notes
      if (dbTable === 'client_notes') listQuery = listQuery.eq('visibility', 'shared');
      const { data, error } = await listQuery.order('created_at', { ascending: false });
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
      if (dbTable === 'client_income_sources') insert = normalizeIncomeSourceFields(insert);
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

      let updates = { ...(payload || {}) };
      delete updates.id;
      delete updates.client_id;

      if (dbTable === 'client_income_sources' && 'gross_annual_amount' in updates) {
        // Keep the raw input fields aligned with the edited annual figure.
        updates = normalizeIncomeSourceFields(updates);
      }

      if (dbTable === 'client_notes') {
        const provenance = buildProvenance({
          sourceSurface: 'finance_portal',
          sourceActorType: 'finance_user',
          sourceActorName: portalUser.email ?? null,
          sourceReference: portalUser.id ?? null,
          sourceDetails: { finance_contact_id: portalUser.finance_contact_id ?? null, updated_via: 'finance-portal-client-data' },
        });
        Object.assign(updates, provenance, {
          visibility: 'shared',
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

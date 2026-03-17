import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { createCorsHeaders } from "../_shared/auth.ts"

/**
 * Portal-specific data management Edge Function
 * Allows portal users to update their own client data.
 * All operations are scoped to the authenticated portal user's client_id.
 * 
 * Allowed tables and operations are strictly whitelisted.
 */

// Only these tables can be modified by portal users
const ALLOWED_TABLES = [
  'clients',
  'client_properties',
  'client_employment',
  'client_income_sources',
  'client_expenses',
  'client_portal_messages',
  'client_portal_notifications',
  'client_portal_report_requests',
] as const;

// Fields that portal users are NOT allowed to modify on the clients table
const PROTECTED_CLIENT_FIELDS = [
  'id', 'created_at', 'created_by', 'is_active', 'is_favorite',
  'deal_status', 'pipeline_status', 'pipeline_notes', 'pipeline_updated_at',
  'current_pipeline_id', 'current_stage_id', 'opportunity_status',
  'ghl_contact_id', 'ghl_opportunity_id', 'ghl_sync_status', 'ghl_last_synced_at',
  'borrowing_capacity', 'total_portfolio_value', 'total_monthly_income',
  'total_monthly_expenditure', 'total_monthly_rental_income', 'total_debt',
  'net_monthly_cash_flow', 'equity_release', 'proposed_rental_income',
  'first_deal_closed_at', 'last_note_at', 'last_review_date', 'next_review_due',
  'review_frequency', 'notes',
];

type AllowedTable = typeof ALLOWED_TABLES[number];

function extractPortalToken(headers: Headers, body?: any): string | null {
  const headerToken = headers.get('x-portal-session-token');
  if (headerToken) return headerToken;
  if (body?.portal_session_token) return body.portal_session_token;
  const sessionHeader = headers.get('x-session-token');
  if (sessionHeader) return sessionHeader;
  if (body?.session_token) return body.session_token;
  return null;
}

function sanitizeClientData(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  for (const field of PROTECTED_CLIENT_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const sessionToken = extractPortalToken(req.headers, body);

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .select(`
        *,
        client_portal_users:user_id (id, client_id, email, status)
      `)
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session?.client_portal_users || session.client_portal_users.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = session.client_portal_users.client_id;
    const { operation, table, data: payload, id } = body;

    // Validate table
    if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
      return new Response(
        JSON.stringify({ error: `Table '${table}' is not allowed`, success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate operation
    if (!['update', 'insert', 'bulk_mark_read'].includes(operation)) {
      return new Response(
        JSON.stringify({ error: `Operation '${operation}' is not allowed for portal users`, success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Bulk mark notifications as read
    if (operation === 'bulk_mark_read') {
      if (table !== 'client_portal_notifications') {
        return new Response(
          JSON.stringify({ error: 'bulk_mark_read only allowed for notifications', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const notificationIds: string[] = payload?.notification_ids || [];
      if (notificationIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: { updated: 0 } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: result, error } = await supabase
        .from('client_portal_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .in('id', notificationIds)
        .eq('is_read', false)
        .select('id');

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message, success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { updated: result?.length || 0 } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert operation (messages and report requests)
    if (operation === 'insert') {
      const insertableTables = ['client_portal_messages', 'client_portal_report_requests'];
      if (!insertableTables.includes(table)) {
        return new Response(
          JSON.stringify({ error: `Insert not allowed for table '${table}'`, success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (table === 'client_portal_report_requests') {
        // Validate request_type
        const validTypes = ['portfolio_review', 'borrowing_capacity', 'investment_property'];
        if (!payload?.request_type || !validTypes.includes(payload.request_type)) {
          return new Response(
            JSON.stringify({ error: 'Invalid request_type', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const insertData = {
          client_id: clientId,
          portal_user_id: session.client_portal_users.id,
          request_type: payload.request_type,
          property_address: payload.property_address || null,
          client_property_id: payload.client_property_id || null,
          notes: payload.notes || null,
          status: 'pending',
          created_at: new Date().toISOString(),
        };

        const { data: result, error } = await supabase
          .from('client_portal_report_requests')
          .insert(insertData)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message, success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create a notification for the internal team
        try {
          await supabase.from('notifications').insert({
            type: 'report_request',
            title: `New Report Request: ${payload.request_type.replace(/_/g, ' ')}`,
            message: `A client has requested a ${payload.request_type.replace(/_/g, ' ')} report.${payload.property_address ? ' Property: ' + payload.property_address : ''}`,
            metadata: { request_id: result.id, client_id: clientId, request_type: payload.request_type },
          });
        } catch (notifErr) {
          console.error('Failed to create internal notification:', notifErr);
        }

        // Create portal notification confirming request submission
        try {
          const typeLabel = payload.request_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          await supabase.from('client_portal_notifications').insert({
            client_id: clientId,
            title: 'Report Request Submitted',
            message: `Your ${typeLabel} request has been submitted. Our team will review it shortly.${payload.property_address ? ' Property: ' + payload.property_address : ''}`,
            type: 'success',
            category: 'document',
            action_url: '/client/reports',
          });
        } catch (notifErr) {
          console.error('Failed to create portal notification:', notifErr);
        }

        return new Response(
          JSON.stringify({ success: true, data: result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Messages insert (existing logic)
      const insertData = {
        ...payload,
        client_id: clientId,
        portal_user_id: session.client_portal_users.id,
        sender_type: 'client',
        created_at: new Date().toISOString(),
      };
      delete insertData.id;

      const { data: result, error } = await supabase
        .from('client_portal_messages')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message, success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (operation === 'update') {
      if (!id && table !== 'clients') {
        return new Response(
          JSON.stringify({ error: 'ID required for update', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let sanitizedPayload = { ...payload };

      if (table === 'clients') {
        // Update client record directly — sanitize protected fields
        sanitizedPayload = sanitizeClientData(sanitizedPayload);
        sanitizedPayload.updated_at = new Date().toISOString();

        const { data: result, error } = await supabase
          .from('clients')
          .update(sanitizedPayload)
          .eq('id', clientId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message, success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // For related tables, verify the record belongs to this client
        const { data: existing } = await supabase
          .from(table)
          .select('client_id')
          .eq('id', id)
          .single();

        if (!existing || existing.client_id !== clientId) {
          return new Response(
            JSON.stringify({ error: 'Record not found or access denied', success: false }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Remove client_id and id from payload to prevent tampering
        delete sanitizedPayload.client_id;
        delete sanitizedPayload.id;
        sanitizedPayload.updated_at = new Date().toISOString();

        const { data: result, error } = await supabase
          .from(table)
          .update(sanitizedPayload)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message, success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Unknown operation', success: false }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Portal manage error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

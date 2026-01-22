import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifySession, extractSessionToken, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

interface RequestBody {
  // Single report fetch
  reportId?: string;
  
  // Multiple reports fetch
  reportIds?: string[];
  
  // List mode options
  listMode?: boolean;
  listOptions?: {
    select?: string;
    status?: string | string[];
    isArchived?: boolean;
    isClientReport?: boolean | null; // null means no filter
    clientPropertyId?: string;
    clientPropertyIds?: string[];
    orderBy?: string;
    orderAsc?: boolean;
    limit?: number;
    createdAfter?: string; // ISO date string
  };
  
  session_token?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const sessionToken = extractSessionToken(req.headers, body);

    // Validate session
    const { error: authError, userId } = await verifySession(supabase, sessionToken);
    if (authError) {
      console.log('Auth failed for get-investment-reports:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`Authenticated user ${userId} requesting investment reports`);

    const { reportId, reportIds, listMode, listOptions = {} } = body;

    // Single report fetch
    if (reportId) {
      const { data: report, error: reportError } = await supabase
        .from('investment_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError) {
        console.error('Error fetching investment report:', reportError);
        return new Response(
          JSON.stringify({ error: 'Report not found', details: reportError.message }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Multiple reports fetch by IDs
    if (reportIds && reportIds.length > 0) {
      const { data: reports, error: reportsError } = await supabase
        .from('investment_reports')
        .select('*')
        .in('id', reportIds);

      if (reportsError) {
        console.error('Error fetching investment reports:', reportsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch reports', details: reportsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, reports, count: reports?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // List mode - fetch reports with filters
    if (listMode || !reportId) {
      const {
        select = 'id, property_address, property_listing_id, created_at, current_version, report_scope, report_tier, parent_report_id, status, is_archived, manual_overrides, financial_calculations, investment_score',
        status,
        isArchived,
        isClientReport,
        clientPropertyId,
        clientPropertyIds,
        orderBy = 'created_at',
        orderAsc = false,
        limit = 100,
        createdAfter
      } = listOptions;

      let query = supabase
        .from('investment_reports')
        .select(select);

      // Apply status filter
      if (status) {
        if (Array.isArray(status)) {
          query = query.in('status', status);
        } else {
          query = query.eq('status', status);
        }
      }

      // Apply archived filter
      if (typeof isArchived === 'boolean') {
        query = query.eq('is_archived', isArchived);
      }

      // Apply client report filter
      if (isClientReport === true) {
        query = query.eq('is_client_report', true);
      } else if (isClientReport === false) {
        query = query.or('is_client_report.is.null,is_client_report.eq.false');
      }

      // Apply client property filter
      if (clientPropertyId) {
        query = query.eq('client_property_id', clientPropertyId);
      } else if (clientPropertyIds && clientPropertyIds.length > 0) {
        query = query.in('client_property_id', clientPropertyIds);
      }

      // Apply date filter
      if (createdAfter) {
        query = query.gte('created_at', createdAfter);
      }

      // Apply ordering
      query = query.order(orderBy, { ascending: orderAsc });

      // Apply limit
      if (limit) {
        query = query.limit(limit);
      }

      const { data: reports, error: reportsError } = await query;

      if (reportsError) {
        console.error('Error fetching investment reports list:', reportsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch reports', details: reportsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, reports, count: reports?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request - provide reportId, reportIds, or use listMode' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-investment-reports:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

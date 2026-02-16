import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse } from '../_shared/auth.ts';

// Dynamic CORS headers for credential-based requests
function createCorsHeaders(origin: string | null): Record<string, string> {
  // Support Lovable preview + published domains for credentialed requests
  const allowedOrigin = origin && (
    origin === 'https://command-centre.npcservices.com.au' ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com') ||
    origin.includes('localhost')
  )
    ? origin 
    : 'https://command-centre.npcservices.com.au';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface RequestBody {
  action: 'insert' | 'update' | 'delete' | 'archive' | 'unarchive' | 'bulkDelete' | 'getVersion';
  reportId?: string;
  reportIds?: string[];
  data?: Record<string, any>;
  session_token?: string;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();

    // Validate authentication (JWT first, then session token)
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('Auth failed for manage-investment-reports:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`Authenticated user ${userId} managing investment reports - action: ${body.action}`);

    const { action, reportId, reportIds, data } = body;

    switch (action) {
      case 'insert': {
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'Data is required for insert' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: report, error: insertError } = await supabase
          .from('investment_reports')
          .insert(data)
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting investment report:', insertError);
          return new Response(
            JSON.stringify({ error: 'Failed to create report', details: insertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, report }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        if (!reportId || !data) {
          return new Response(
            JSON.stringify({ error: 'reportId and data are required for update' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: report, error: updateError } = await supabase
          .from('investment_reports')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', reportId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating investment report:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update report', details: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, report }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!reportId) {
          return new Response(
            JSON.stringify({ error: 'reportId is required for delete' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: deleteError } = await supabase
          .from('investment_reports')
          .delete()
          .eq('id', reportId);

        if (deleteError) {
          console.error('Error deleting investment report:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to delete report', details: deleteError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, deleted: reportId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'bulkDelete': {
        if (!reportIds || reportIds.length === 0) {
          return new Response(
            JSON.stringify({ error: 'reportIds are required for bulkDelete' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Also support status-based bulk delete
        const statusFilter = data?.statusFilter;
        
        let query = supabase.from('investment_reports').delete();
        
        if (statusFilter && Array.isArray(statusFilter)) {
          query = query.in('status', statusFilter);
        } else if (reportIds.length > 0) {
          query = query.in('id', reportIds);
        }

        const { data: deleted, error: bulkDeleteError } = await query.select('id');

        if (bulkDeleteError) {
          console.error('Error bulk deleting investment reports:', bulkDeleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to bulk delete reports', details: bulkDeleteError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, deletedCount: deleted?.length || 0, deleted }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'archive': {
        if (!reportId) {
          return new Response(
            JSON.stringify({ error: 'reportId is required for archive' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: report, error: archiveError } = await supabase
          .from('investment_reports')
          .update({ is_archived: true, updated_at: new Date().toISOString() })
          .eq('id', reportId)
          .select()
          .single();

        if (archiveError) {
          console.error('Error archiving investment report:', archiveError);
          return new Response(
            JSON.stringify({ error: 'Failed to archive report', details: archiveError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, report }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'unarchive': {
        if (!reportId) {
          return new Response(
            JSON.stringify({ error: 'reportId is required for unarchive' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: report, error: unarchiveError } = await supabase
          .from('investment_reports')
          .update({ is_archived: false, updated_at: new Date().toISOString() })
          .eq('id', reportId)
          .select()
          .single();

        if (unarchiveError) {
          console.error('Error unarchiving investment report:', unarchiveError);
          return new Response(
            JSON.stringify({ error: 'Failed to unarchive report', details: unarchiveError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, report }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getVersion': {
        if (!reportId) {
          return new Response(
            JSON.stringify({ error: 'reportId is required for getVersion' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const versionNumber = data?.versionNumber;
        if (!versionNumber) {
          return new Response(
            JSON.stringify({ error: 'versionNumber is required for getVersion' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Fetching version ${versionNumber} for report ${reportId}`);

        const { data: version, error: versionError } = await supabase
          .from('report_versions')
          .select('*')
          .eq('report_id', reportId)
          .eq('version_number', versionNumber)
          .single();

        if (versionError) {
          console.error('Error fetching version:', versionError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch version', details: versionError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!version) {
          return new Response(
            JSON.stringify({ error: 'Version not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, version }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('Error in manage-investment-reports:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
